import "dotenv/config";
import express from "express";
import cors from "cors";
import {allowLocalOrigin,createLocalApiGuard,requireSafeLocalBind} from "./local-api-guard.js";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ProviderGatewayError,
  generateWithProviders,
  getProviderStatus
} from "./providers.js";
import { analyzeVisualFrame } from "./vision-analysis.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = Number(process.env.PORT || 3000);

const deviceBridgeConfigured = Boolean(process.env.DEVICE_BRIDGE_URL);
const localBind=requireSafeLocalBind(process.env.ULTRON_LOCAL_HOST,
  process.env.ULTRON_LOCAL_API_TOKEN);
const originExtra=process.env.ULTRON_LOCAL_ALLOWED_ORIGINS||"";

// The Node server is a local developer fallback. Reject origins that would
// otherwise spend provider API keys through another webpage or a malicious LAN
// host. Production continues to use the canonical Cloudflare Worker.
app.use(createLocalApiGuard({
  originExtra,networkExposed:localBind.networkExposed,
  networkToken:process.env.ULTRON_LOCAL_API_TOKEN
}));
app.use(cors({
  origin(origin,callback){
    return callback(null,origin&&allowLocalOrigin(origin,{extra:originExtra})?origin:false);
  },
  methods:["GET","POST","OPTIONS"],
  allowedHeaders:["Content-Type","Authorization"],
  credentials:false,
  maxAge:600
}));
app.use(express.json({limit:"8mb"}));

app.post("/api/ai", async (req, res) => {
  try {
    const message = String(
      req.body?.message || ""
    ).trim();

    if (!message) {
      return res.status(400).json({
        error: "Mensagem vazia."
      });
    }

    if (message.length > 8000) {
      return res.status(413).json({
        error: "Mensagem muito longa."
      });
    }

    const telemetry = req.body?.telemetry || {};
    const aiResult = await generateWithProviders(
      process.env,
      message,
      telemetry
    );

    // Text-only JARVIS on local backend: no audio generation.
    const audioBase64=null, audioMimeType=null;

    return res.json({
      text: aiResult.text,
      provider: aiResult.provider,
      providerLabel: aiResult.providerLabel,
      model: aiResult.model,
      attempts: aiResult.attempts,
      audioBase64,
      audioMimeType
    });
  } catch (error) {
    console.error("[ULTRON AI] Gateway:", error);

    return res.status(
      error instanceof ProviderGatewayError
        ? 503
        : 500
    ).json({
      error:
        "Nenhum provedor de IA conseguiu responder.",
      detail:
        process.env.NODE_ENV === "development"
          ? error.message
          : undefined,
      attempts:
        error instanceof ProviderGatewayError
          ? error.attempts
          : []
    });
  }
});

app.post("/api/vision/analyze", async (req, res) => {
  try {
    const result = await analyzeVisualFrame(process.env, {
      imageBase64: req.body?.imageBase64,
      mimeType: req.body?.mimeType,
      prompt: req.body?.prompt
    });

    return res.status(result?.ok === false ? 400 : 200).json(result);
  } catch (error) {
    console.error("[ULTRON VISION] Local backend:", error);
    return res.status(500).json({
      ok: false,
      error: "Falha inesperada na análise visual.",
      detail:
        process.env.NODE_ENV === "development"
          ? error.message
          : undefined
    });
  }
});

// Voice and microphone functions remain unavailable during maintenance.
app.post("/api/voice",(_req,res)=>res.status(503).json({
  ok:false,error:"voice-operator-maintenance",
  message:"Voz do J.A.R.V.I.S. desativada pelo operador."
}));

app.get("/api/health", (_req, res) => {
  res.json({
    status: "online",
    service: "ultron-ai-backend",
    aiGateway: true,
    providers: getProviderStatus(process.env),
    providerOrder: String(
      process.env.AI_PROVIDER_ORDER ||
        "gemini,groq,openrouter,cloudflare,cohere"
    )
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
    elevenlabs: false,
    voiceEnabled: false,
    voiceMaintenance: {mode:"text-only",inputEnabled:false,outputEnabled:false},
    localNodeBackend: true,
    deviceBridge: deviceBridgeConfigured,
    visualAnalysis: Boolean(process.env.GEMINI_API_KEY)
  });
});

if (deviceBridgeConfigured) {
  app.get("/api/vitals", async (_req, res) => {
    try {
      const response = await fetch(
        process.env.DEVICE_BRIDGE_URL
      );

      if (!response.ok) {
        throw new Error(
          `bridge ${response.status}`
        );
      }

      res.json(await response.json());
    } catch (error) {
      res.status(502).json({
        error:
          "Falha ao consultar device bridge.",
        detail: error.message
      });
    }
  });
}

const publicRoot = path.resolve(__dirname, "..");
app.use(express.static(publicRoot));
app.get("/{*splat}", (_req, res) =>
  res.sendFile(path.join(publicRoot, "index.html"))
);

app.listen(PORT,localBind.host,() =>
  console.log(`ULTRON AI local online: http://${localBind.host}:${PORT} (rate-limited; voice off)`)
);
