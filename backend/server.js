import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GoogleGenAI } from "@google/genai";

const __filename=fileURLToPath(import.meta.url);
const __dirname=path.dirname(__filename);
const app=express();
const PORT=Number(process.env.PORT||3000);

const geminiConfigured=Boolean(process.env.GEMINI_API_KEY);
const elevenLabsConfigured=Boolean(process.env.ELEVENLABS_API_KEY&&process.env.ELEVENLABS_VOICE_ID);
const deviceBridgeConfigured=Boolean(process.env.DEVICE_BRIDGE_URL);

if(!geminiConfigured){console.warn("AVISO: GEMINI_API_KEY não configurada. /api/ai ficará indisponível.");}
const ai=geminiConfigured?new GoogleGenAI({apiKey:process.env.GEMINI_API_KEY}):null;

app.use(cors());
app.use(express.json({limit:"1mb"}));

const SYSTEM_INSTRUCTION=`
Você é o núcleo conversacional do sistema ULTRON AI.
Responda em português do Brasil, de forma objetiva, técnica e clara.
Você é um assistente de software. Não alegue controlar dispositivos ou executar ações que não tenham sido realmente conectadas ao backend.
Quando receber telemetria emocional, trate-a como estimativa heurística local, não como diagnóstico médico ou psicológico.
Quando receber dados biométricos, não invente valores ausentes.
`;

app.post("/api/ai",async(req,res)=>{
 try{
  if(!ai)return res.status(503).json({error:"Gemini não configurado no backend. Configure GEMINI_API_KEY no .env."});
  const message=String(req.body?.message||"").trim();
  if(!message)return res.status(400).json({error:"Mensagem vazia."});
  if(message.length>8000)return res.status(413).json({error:"Mensagem muito longa."});
  const telemetry=req.body?.telemetry||{};
  const prompt=`Mensagem do operador:\n${message}\n\nTelemetria local disponível:\n${JSON.stringify(telemetry)}`;
  const interaction=await ai.interactions.create({
   model:process.env.GEMINI_MODEL||"gemini-3.8-flash",
   system_instruction:SYSTEM_INSTRUCTION,
   input:prompt,
   generation_config:{thinking_level:"low"}
  });
  const text=interaction.output_text||"O Gemini não retornou texto.";
  let audioBase64=null,audioMimeType=null;
  if(elevenLabsConfigured&&process.env.ELEVENLABS_AUTOSPEAK!=="false"){
    try{
      const audio=await elevenLabsTTS(text);
      audioBase64=audio.base64; audioMimeType=audio.mimeType;
    }catch(error){console.error("ElevenLabs TTS error:",error.message);}
  }
  return res.json({text,interactionId:interaction.id||null,audioBase64,audioMimeType});
 }catch(error){
  console.error("Gemini error:",error);
  return res.status(500).json({error:"Falha ao consultar o Gemini.",detail:process.env.NODE_ENV==="development"?error.message:undefined});
 }
});

async function elevenLabsTTS(text){
 const voiceId=process.env.ELEVENLABS_VOICE_ID;
 const modelId=process.env.ELEVENLABS_MODEL||"eleven_multilingual_v2";
 const response=await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`,{
  method:"POST",
  headers:{"xi-api-key":process.env.ELEVENLABS_API_KEY,"Content-Type":"application/json"},
  body:JSON.stringify({text,model_id:modelId})
 });
 if(!response.ok){const detail=await response.text();throw new Error(`HTTP ${response.status}: ${detail.slice(0,500)}`);}
 const buffer=Buffer.from(await response.arrayBuffer());
 return {base64:buffer.toString("base64"),mimeType:"audio/mpeg"};
}

app.post("/api/voice",async(req,res)=>{
 try{
  if(!elevenLabsConfigured)return res.status(503).json({error:"ElevenLabs não configurado. Defina ELEVENLABS_API_KEY e ELEVENLABS_VOICE_ID no .env."});
  const text=String(req.body?.text||"").trim();
  if(!text)return res.status(400).json({error:"Texto vazio."});
  if(text.length>3000)return res.status(413).json({error:"Texto muito longo para teste de voz."});
  const audio=await elevenLabsTTS(text);
  res.json({audioBase64:audio.base64,audioMimeType:audio.mimeType});
 }catch(error){console.error("ElevenLabs error:",error);res.status(500).json({error:"Falha ao gerar voz ElevenLabs.",detail:process.env.NODE_ENV==="development"?error.message:undefined});}
});

app.get("/api/health",(_req,res)=>{
 res.json({status:"online",service:"ultron-ai-backend",gemini:geminiConfigured,elevenlabs:elevenLabsConfigured,deviceBridge:deviceBridgeConfigured});
});

if(deviceBridgeConfigured){
 app.get("/api/vitals",async(_req,res)=>{
  try{const r=await fetch(process.env.DEVICE_BRIDGE_URL);if(!r.ok)throw new Error(`bridge ${r.status}`);res.json(await r.json());}
  catch(error){res.status(502).json({error:"Falha ao consultar device bridge.",detail:error.message});}
 });
}

const publicRoot=path.resolve(__dirname,"..");
app.use(express.static(publicRoot));
app.get("/{*splat}",(_req,res)=>res.sendFile(path.join(publicRoot,"index.html")));
app.listen(PORT,()=>console.log(`ULTRON AI online: http://localhost:${PORT}`));
