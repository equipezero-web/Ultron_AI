const SYSTEM_INSTRUCTION = `
Você é o núcleo conversacional do sistema ULTRON AI.

Responda sempre em português do Brasil.
Seja objetivo, técnico, claro e útil.
Você é um assistente de software.
Não alegue controlar dispositivos, câmeras, sensores ou ações que não estejam realmente conectados ao backend.
Telemetria emocional é apenas uma estimativa local de interface; nunca trate como diagnóstico médico, psicológico ou biométrico.
Não invente dados que não foram recebidos.
`;

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

async function generateGeminiText(env, message, telemetry) {
  const prompt = [
    `Mensagem do operador:`,
    message,
    ``,
    `Telemetria local disponível:`,
    JSON.stringify(telemetry || {})
  ].join("\n");

  const model = env.GEMINI_MODEL || "gemini-3.8-flash";

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": env.GEMINI_API_KEY
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [
            {
              text: SYSTEM_INSTRUCTION
            }
          ]
        },
        contents: [
          {
            role: "user",
            parts: [
              {
                text: prompt
              }
            ]
          }
        ]
      })
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data?.error?.message ||
      `Gemini retornou HTTP ${response.status}.`
    );
  }

  const text = data?.candidates?.[0]?.content?.parts
    ?.map((part) => part.text || "")
    .join("")
    .trim();

  if (!text) {
    throw new Error("A Gemini não retornou texto.");
  }

  return text;
}

async function generateElevenLabsAudio(env, text) {
  const voiceId = env.ELEVENLABS_VOICE_ID;
  const modelId = env.ELEVENLABS_MODEL || "eleven_multilingual_v2";

  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`,
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

  return {
    audioBase64: arrayBufferToBase64(await response.arrayBuffer()),
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

    if (url.pathname === "/api/health" && request.method === "GET") {
      return Response.json(
        {
          status: "online",
          service: "ultron-ai-cloudflare-worker",
          gemini: Boolean(env.GEMINI_API_KEY),
          elevenlabs: Boolean(
            env.ELEVENLABS_API_KEY &&
            env.ELEVENLABS_VOICE_ID
          ),
          deviceBridge: Boolean(env.DEVICE_BRIDGE_URL),
          message: "ULTRON Cloudflare Worker funcionando."
        },
        {
          headers: corsHeaders
        }
      );
    }

    if (url.pathname === "/api/ai" && request.method === "POST") {
      try {
        if (!env.GEMINI_API_KEY) {
          return Response.json(
            {
              error: "Gemini não configurado no Worker."
            },
            {
              status: 503,
              headers: corsHeaders
            }
          );
        }

        const body = await request.json();
        const message = String(body?.message || "").trim();
        const telemetry = body?.telemetry || {};

        if (!message) {
          return Response.json(
            {
              error: "Mensagem vazia."
            },
            {
              status: 400,
              headers: corsHeaders
            }
          );
        }

        if (message.length > 8000) {
          return Response.json(
            {
              error: "Mensagem muito longa."
            },
            {
              status: 413,
              headers: corsHeaders
            }
          );
        }

        const text = await generateGeminiText(
          env,
          message,
          telemetry
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
            const audio = await generateElevenLabsAudio(env, text);

            audioBase64 = audio.audioBase64;
            audioMimeType = audio.audioMimeType;
          } catch (error) {
            console.error(
              "Erro de voz ElevenLabs:",
              error.message
            );
          }
        }

        return Response.json(
          {
            text,
            audioBase64,
            audioMimeType
          },
          {
            headers: corsHeaders
          }
        );

      } catch (error) {
        console.error("Erro Gemini:", error);

        return Response.json(
          {
            error: "Falha ao consultar o Gemini.",
            details: error?.message || String(error)
          },
          {
            status: 500,
            headers: corsHeaders
          }
        );
      }
    }

    if (url.pathname === "/api/voice" && request.method === "POST") {
      try {
        if (
          !env.ELEVENLABS_API_KEY ||
          !env.ELEVENLABS_VOICE_ID
        ) {
          return Response.json(
            {
              error: "ElevenLabs não configurado no Worker."
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
            {
              error: "Texto vazio."
            },
            {
              status: 400,
              headers: corsHeaders
            }
          );
        }

        if (text.length > 3000) {
          return Response.json(
            {
              error: "Texto muito longo para gerar voz."
            },
            {
              status: 413,
              headers: corsHeaders
            }
          );
        }

        const audio = await generateElevenLabsAudio(env, text);

        return Response.json(
          audio,
          {
            headers: corsHeaders
          }
        );

      } catch (error) {
        console.error("Erro ElevenLabs:", error);

        return Response.json(
          {
            error: "Falha ao gerar voz ElevenLabs.",
            details: error?.message || String(error)
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
