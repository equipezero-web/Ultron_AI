import {
  ProviderGatewayError,
  generateWithProviders,
  getProviderStatus
} from "./providers.js";

function createCorsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json; charset=utf-8"
  };
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 8192;
  let binary = "";

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

async function generateElevenLabsAudio(env, text) {
  const voiceId = env.ELEVENLABS_VOICE_ID;
  const modelId =
    env.ELEVENLABS_MODEL || "eleven_flash_v2_5";
  const outputFormat =
    env.ELEVENLABS_OUTPUT_FORMAT || "mp3_22050_32";

  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=${encodeURIComponent(outputFormat)}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": env.ELEVENLABS_API_KEY,
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
      `ElevenLabs retornou HTTP ${response.status}: ${detail.slice(0, 300)}`
    );
  }

  const audioBuffer = await response.arrayBuffer();

  return {
    audioBase64: arrayBufferToBase64(audioBuffer),
    audioMimeType: "audio/mpeg"
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const corsHeaders = createCorsHeaders();

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders
      });
    }

    if (
      url.pathname === "/api/health" &&
      request.method === "GET"
    ) {
      const providers = getProviderStatus(env, env.AI);

      return Response.json(
        {
          status: "online",
          service: "ultron-ai-cloudflare-worker",
          aiGateway: true,
          providers,
          providerOrder: String(
            env.AI_PROVIDER_ORDER ||
              "gemini,groq,openrouter,cloudflare,cohere"
          )
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean),
          elevenlabs: Boolean(
            env.ELEVENLABS_API_KEY &&
              env.ELEVENLABS_VOICE_ID
          ),
          deviceBridge: Boolean(env.DEVICE_BRIDGE_URL),
          message:
            "ULTRON Cloudflare Worker funcionando com gateway multi-IA."
        },
        {
          headers: corsHeaders
        }
      );
    }

    if (
      url.pathname === "/api/ai" &&
      request.method === "POST"
    ) {
      try {
        const body = await request.json();
        const message = String(body?.message || "").trim();
        const telemetry = body?.telemetry || {};

        if (!message) {
          return Response.json(
            { error: "Mensagem vazia." },
            { status: 400, headers: corsHeaders }
          );
        }

        if (message.length > 8000) {
          return Response.json(
            { error: "Mensagem muito longa." },
            { status: 413, headers: corsHeaders }
          );
        }

        const aiResult = await generateWithProviders(
          env,
          message,
          telemetry,
          { aiBinding: env.AI }
        );

        let audioBase64 = null;
        let audioMimeType = null;

        const autoSpeakEnabled =
          env.ELEVENLABS_AUTOSPEAK !== "false";

        if (
          autoSpeakEnabled &&
          env.ELEVENLABS_API_KEY &&
          env.ELEVENLABS_VOICE_ID
        ) {
          try {
            const audio = await generateElevenLabsAudio(
              env,
              aiResult.text
            );

            audioBase64 = audio.audioBase64;
            audioMimeType = audio.audioMimeType;
          } catch (error) {
            console.error(
              "[ULTRON AI] ElevenLabs falhou:",
              error?.message || error
            );
          }
        }

        return Response.json(
          {
            text: aiResult.text,
            provider: aiResult.provider,
            providerLabel: aiResult.providerLabel,
            model: aiResult.model,
            attempts: aiResult.attempts,
            audioBase64,
            audioMimeType
          },
          {
            headers: corsHeaders
          }
        );
      } catch (error) {
        console.error("[ULTRON AI] Gateway falhou:", error);

        const attempts =
          error instanceof ProviderGatewayError
            ? error.attempts
            : [];

        return Response.json(
          {
            error:
              "Nenhum provedor de IA conseguiu responder.",
            details:
              error?.message || String(error),
            attempts
          },
          {
            status: 503,
            headers: corsHeaders
          }
        );
      }
    }

    if (
      url.pathname === "/api/voice" &&
      request.method === "POST"
    ) {
      try {
        if (
          !env.ELEVENLABS_API_KEY ||
          !env.ELEVENLABS_VOICE_ID
        ) {
          return Response.json(
            {
              error:
                "ElevenLabs não configurado no Worker."
            },
            {
              status: 503,
              headers: corsHeaders
            }
          );
        }

        const body = await request.json();
        const text = String(body?.text || "").trim();

        if (!text) {
          return Response.json(
            { error: "Texto vazio." },
            { status: 400, headers: corsHeaders }
          );
        }

        if (text.length > 3000) {
          return Response.json(
            {
              error:
                "Texto muito longo para gerar voz."
            },
            {
              status: 413,
              headers: corsHeaders
            }
          );
        }

        const audio = await generateElevenLabsAudio(env, text);

        return Response.json(audio, {
          headers: corsHeaders
        });
      } catch (error) {
        console.error(
          "[ULTRON AI] ElevenLabs falhou:",
          error
        );

        return Response.json(
          {
            error:
              "Falha ao gerar voz ElevenLabs.",
            details:
              error?.message || String(error)
          },
          {
            status: 500,
            headers: corsHeaders
          }
        );
      }
    }

    return Response.json(
      {
        error: "Rota não encontrada.",
        routes: [
          "GET /api/health",
          "POST /api/ai",
          "POST /api/voice"
        ]
      },
      {
        status: 404,
        headers: corsHeaders
      }
    );
  }
};
