import {CameraController} from "./modules/camera.js";
import {MotionSensor} from "./modules/motion.js";
import {loadPreferences} from "./modules/storage.js";
import {addLog,clock} from "./modules/system.js";
import API_CONFIG from "./config.js";

const $=id=>document.getElementById(id);
const video=$("webcam"), canvas=$("motion-canvas"), output=$("output-box");
const btnCamera=$("btn-camera"), btnStop=$("btn-stop-camera");
const screenModal=$("screen-modal"), closeScreen=$("btn-close-screen");
const sensitivity=$("sensitivity"), cooldown=$("cooldown");
const prefs=loadPreferences();
let motionEvents=0, startTime=Date.now(), fpsFrames=0, lastFps=Date.now();
let currentMotion=0, lastMotionAt=Date.now(), voiceBusy=false;
const API_BASE=String(API_CONFIG?.backendUrl||"").replace(/\/$/,"");
const apiUrl=path=>`${API_BASE}${path}`;

const emotionDefinitions={
  feliz:{label:"FELIZ",symbol:"😊"}, triste:{label:"TRISTE",symbol:"😢"}, normal:{label:"NORMAL",symbol:"😐"},
  inquieto:{label:"INQUIETO",symbol:"⚡"}, pensativo:{label:"PENSATIVO",symbol:"🧠"}, estressado:{label:"ESTRESSADO",symbol:"🔥"}
};

function showScreen(){
  screenModal.classList.add("open"); screenModal.setAttribute("aria-hidden","false");
}
function hideScreen(){
  screenModal.classList.remove("open"); screenModal.setAttribute("aria-hidden","true");
}

const camera=new CameraController(video,(state)=>{
  if(state==="active"){
    $("camera-state").textContent="ONLINE"; $("camera-state").style.color="var(--green)";
    $("permission-state").textContent="GRANTED"; $("telemetry-camera").textContent="ON";
    $("vision-module").textContent="ACTIVE"; $("vision-module").className="green";
    $("system-mode").textContent="MONITORING"; btnCamera.textContent="TELA ATIVA"; btnStop.disabled=false;
    $("camera-resolution").textContent=`${video.videoWidth}×${video.videoHeight}`;
    sensor.start(); addLog(output,"Sensor óptico calibrado. Monitoramento iniciado.");
  } else {
    $("camera-state").textContent="STANDBY"; $("camera-state").style.color="";
    $("telemetry-camera").textContent="OFF"; $("vision-module").textContent="STANDBY"; $("vision-module").className="";
    $("system-mode").textContent="STANDBY"; btnCamera.textContent="MOSTRAR TELA"; btnStop.disabled=true;
    sensor.stop(); $("motion-tag").textContent="STANDBY"; currentMotion=0; updateEmotion(0);
  }
});

const sensor=new MotionSensor(video,canvas,(level)=>{
  motionEvents++; $("motion-events").textContent=motionEvents;
  lastMotionAt=Date.now();
  $("motion-tag").textContent=`MOVIMENTO ${Math.round(level)}%`;
  $("motion-tag").style.color="var(--red)"; $("motion-tag").style.borderColor="#ef444466";
  addLog(output,`Evento de movimento detectado (${Math.round(level)}%).`,"alert");
  setTimeout(()=>{$("motion-tag").textContent="MONITORANDO";$("motion-tag").style.color="";$("motion-tag").style.borderColor=""},900);
},level=>{
  currentMotion=level;
  $("motion-value").textContent=`${Math.round(level)}%`;
  $("reaction-motion").textContent=`${Math.round(level)}%`;
  fpsFrames++;
  if(Date.now()-lastFps>1000){$("fps").textContent=`${fpsFrames} FPS`;fpsFrames=0;lastFps=Date.now();}
  updateEmotion(level);
});
sensor.threshold=Number(sensitivity.value);
sensor.cooldown=Number(cooldown.value)*1000;

function updateEmotion(level){
  const idleSeconds=(Date.now()-lastMotionAt)/1000;
  let key="normal", confidence=58, activity="BAIXA";
  if(level>=75){key="estressado";confidence=Math.min(96,70+Math.round(level*.25));activity="MUITO ALTA";}
  else if(level>=45){key="inquieto";confidence=Math.min(92,62+Math.round(level*.25));activity="ALTA";}
  else if(level>=20){key="feliz";confidence=55+Math.round(level*.35);activity="MODERADA";}
  else if(idleSeconds>25){key="pensativo";confidence=55;activity="MUITO BAIXA";}
  else if(idleSeconds>12){key="triste";confidence=52;activity="BAIXA";}
  const d=emotionDefinitions[key];
  $("emotion-symbol").textContent=d.symbol; $("emotion-state").textContent=d.label; $("emotion-confidence").textContent=`Confiança estimada: ${confidence}%`;
  $("reaction-activity").textContent=activity;
  Object.keys(emotionDefinitions).forEach(k=>{$("emotion-"+k).textContent=k===key?`${confidence}%`:"—";});
}

async function activateCamera(){
  try{
    showScreen();
    if(!window.isSecureContext) addLog(output,"AVISO: câmera exige HTTPS ou localhost.","alert");
    await camera.start();
  }catch(e){
    hideScreen(); $("permission-state").textContent="BLOCKED";
    addLog(output,`Falha de câmera: ${e.message}`,"alert");
  }
}
btnCamera.addEventListener("click",activateCamera);
btnStop.addEventListener("click",()=>{camera.stop();hideScreen();addLog(output,"Câmera desligada pelo operador.");});
closeScreen.addEventListener("click",hideScreen);
screenModal.addEventListener("click",e=>{if(e.target===screenModal)hideScreen();});

sensitivity.addEventListener("input",()=>{sensor.threshold=Number(sensitivity.value);$("sensitivity-out").textContent=sensitivity.value;$("threshold-value").textContent=sensitivity.value;});
cooldown.addEventListener("input",()=>{sensor.cooldown=Number(cooldown.value)*1000;$("cooldown-out").textContent=`${cooldown.value}s`;});

$("btn-send").addEventListener("click",execute);
$("command-input").addEventListener("keydown",e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();execute();}});
document.querySelectorAll("[data-command]").forEach(b=>b.addEventListener("click",()=>handleQuick(b.dataset.command)));

document.querySelectorAll("[data-emotion]").forEach(b=>b.addEventListener("click",()=>{
  const key=b.dataset.emotion, d=emotionDefinitions[key];
  $("emotion-symbol").textContent=d.symbol; $("emotion-state").textContent=d.label; $("emotion-confidence").textContent="Modo manual do operador";
  addLog(output,`Estado emocional manual selecionado: ${d.label}.`);
}));

async function execute(){
 const input=$("command-input"), cmd=input.value.trim(); if(!cmd)return;
 addLog(output,`OPERATOR: ${cmd}`); input.value="";
 const low=cmd.toLowerCase();
 if(low.includes("mostrar tela")||low.includes("câmera")||low.includes("camera")) { await activateCamera(); return; }
 if(low.includes("status")) { handleQuick("status"); return; }
 if(low.includes("varredura")||low.includes("scan")) { handleQuick("scan"); return; }
 await askGemini(cmd);
}

async function askGemini(cmd){
 const thinking=document.createElement("p");
 thinking.textContent="> ULTRON CORE: processando com Gemini...";
 thinking.dataset.thinking="true"; output.appendChild(thinking); output.scrollTop=output.scrollHeight;
 try{
   const response=await fetch(apiUrl("/api/ai"),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({message:cmd,telemetry:{motion:Math.round(currentMotion),emotion:$("emotion-state").textContent,activity:$("reaction-activity").textContent}})});
   const data = await response.json();
thinking.remove();

if (!response.ok) {
  throw new Error(
    data.details ||
    data.error ||
    `Erro HTTP ${response.status}`
  );
}

addLog(output, `GEMINI: ${data.text}`);
   if(data.audioBase64) playVoice(data.audioBase64,data.audioMimeType||"audio/mpeg");
 }catch(e){thinking.remove();addLog(output,`GEMINI ERROR: ${e.message}`,"alert");}
}

async function testVoice(){
 if (voiceBusy) return;

 voiceBusy = true;
 addLog(output, "Solicitando teste de voz ElevenLabs...");

 try {
   const response = await fetch(apiUrl("/api/voice"), {
     method: "POST",
     headers: {
       "Content-Type": "application/json"
     },
     body: JSON.stringify({
       text: "ULTRON online. Sistema de voz operacional."
     })
   });

   const data = await response.json();

   if (!response.ok) {
     throw new Error(
       data.details ||
       data.error ||
       `Erro HTTP ${response.status}`
     );
   }

   playVoice(
     data.audioBase64,
     data.audioMimeType || "audio/mpeg"
   );

   addLog(output, "ElevenLabs: voz reproduzida.");

 } catch (e) {
   addLog(output, `ELEVENLABS ERROR: ${e.message}`, "alert");

 } finally {
   voiceBusy = false;
 }
}

async function loadHealth(){
 try{
  const r=await fetch(apiUrl("/api/health")); const d=await r.json();
  $("gemini-module").textContent=d.gemini?"ONLINE":"API OFF"; $("gemini-module").className=d.gemini?"green":"";
  $("voice-module").textContent=d.elevenlabs?"ONLINE":"API OFF"; $("voice-module").className=d.elevenlabs?"green":"";
  $("bridge-module").textContent=d.deviceBridge?"READY":"API WAIT";
  $("vitals-status").textContent=d.deviceBridge?"CONECTADO":"AGUARDANDO";
 }catch{ $("gemini-module").textContent="BACKEND OFF"; $("voice-module").textContent="BACKEND OFF"; }
}

function handleQuick(cmd){
 if(cmd==="clear"){output.innerHTML="";return;}
 if(cmd==="voice"){testVoice();return;}
 if(cmd==="camera"){addLog(output,"Camera API: "+(navigator.mediaDevices?"DISPONÍVEL":"INDISPONÍVEL"));return;}
 if(cmd==="status"){addLog(output,`Sistema ONLINE | câmera ${camera.stream?"ATIVA":"inativa"} | eventos ${motionEvents} | Gemini conectado ao backend | ElevenLabs ${$("voice-module").textContent}`);return;}
 if(cmd==="scan"){addLog(output,"Iniciando varredura local...");setTimeout(()=>addLog(output,"Varredura concluída. Núcleo local operacional."),800);}
}
function updateBars(){const holder=$("activity-bars");holder.innerHTML="";for(let i=0;i<70;i++){const b=document.createElement("i");b.className="bar";b.style.height=`${3+Math.random()*42}px`;b.style.animationDelay=`${Math.random()*1.2}s`;holder.appendChild(b);}}
setInterval(()=>{
 $("clock").textContent=clock();
 const s=Math.floor((Date.now()-startTime)/1000),h=String(Math.floor(s/3600)).padStart(2,"0"),m=String(Math.floor(s%3600/60)).padStart(2,"0"),sec=String(s%60).padStart(2,"0");
 $("uptime").textContent=`${h}:${m}:${sec}`;
 updateEmotion(currentMotion);
},1000);
updateBars(); $("storage-state").textContent="READY"; $("connection-state").textContent=navigator.onLine?"ONLINE":"OFFLINE";
window.addEventListener("online",()=>$("connection-state").textContent="ONLINE"); window.addEventListener("offline",()=>$("connection-state").textContent="OFFLINE");
if(prefs.cameraAccepted)addLog(output,"Preferência local: câmera já autorizada anteriormente. A visualização permanece oculta até o operador solicitar.");
loadHealth(); updateEmotion(0);
