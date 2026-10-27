import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ProviderGatewayError,
  generateWithProviders,
  getProviderStatus
} from "./providers.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = Number(process.env.PORT || 3000);

const elevenLabsConfigured = Boolean(
  process.env.ELEVENLABS_API_KEY &&
    process.env.ELEVENLABS_VOICE_ID
);
const deviceBridgeConfigured = Boolean(
  process.env.DEVICE_BRIDGE_URL
);

app.use(cors());
app.use(express.json({ limit: "1mb" }));

async function elevenLabsTTS(text) {
  const voiceId = process.env.ELEVENLABS_VOICE_ID;
  const modelId =
    process.env.ELEVENLABS_MODEL || "eleven_flash_v2_5";
  const outputFormat =
    process.env.ELEVENLABS_OUTPUT_FORMAT || "mp3_22050_32";

  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=${encodeURIComponent(outputFormat)}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": process.env.ELEVENLABS_API_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        text,
        model_id: modelId
      })
    }
  );

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(
      `HTTP ${response.status}: ${detail.slice(0, 500)}`
    );
  }

  const buffer = Buffer.from(
    await response.arrayBuffer()
  );

  return {
    base64: buffer.toString("base64"),
    mimeType: "audio/mpeg"
  };
}

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

    let audioBase64 = null;
    let audioMimeType = null;

    if (
      elevenLabsConfigured &&
      process.env.ELEVENLABS_AUTOSPEAK !== "false"
    ) {
      try {
        const audio = await elevenLabsTTS(aiResult.text);
        audioBase64 = audio.base64;
        audioMimeType = audio.mimeType;
      } catch (error) {
        console.error(
          "[ULTRON AI] ElevenLabs TTS:",
          error.message
        );
      }
    }

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

app.post("/api/voice", async (req, res) => {
  try {
    if (!elevenLabsConfigured) {
      return res.status(503).json({
        error:
          "ElevenLabs não configurado. Defina ELEVENLABS_API_KEY e ELEVENLABS_VOICE_ID no .env."
      });
    }

    const text = String(
      req.body?.text || ""
    ).trim();

    if (!text) {
      return res.status(400).json({
        error: "Texto vazio."
      });
    }

    if (text.length > 3000) {
      return res.status(413).json({
        error:
          "Texto muito longo para teste de voz."
      });
    }

    const audio = await elevenLabsTTS(text);

    res.json({
      audioBase64: audio.base64,
      audioMimeType: audio.mimeType
    });
  } catch (error) {
    console.error(
      "[ULTRON AI] ElevenLabs:",
      error
    );

    res.status(500).json({
      error:
        "Falha ao gerar voz ElevenLabs.",
      detail:
        process.env.NODE_ENV === "development"
          ? error.message
          : undefined
    });
  }
});

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
    elevenlabs: elevenLabsConfigured,
    deviceBridge: deviceBridgeConfigured
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

app.listen(PORT, () =>
  console.log(
    `ULTRON AI online: http://localhost:${PORT}`
  )
);
