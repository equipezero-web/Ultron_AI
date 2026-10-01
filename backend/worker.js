const SYSTEM_INSTRUCTION = `
Você é o núcleo conversacional do sistema ULTRON AI.

Responda sempre em português do Brasil.
Seja objetivo, técnico, claro e útil.
Fale de forma curta, natural e direta.
Em perguntas simples, responda em uma ou duas frases.
Evite cumprimentos longos, introduções, listas desnecessárias e repetições.
Só dê respostas detalhadas quando o operador pedir detalhes.

Você é um assistente de software.
Não alegue controlar dispositivos, câmeras, sensores ou ações que não estejam realmente conectados ao backend.
Telemetria emocional é apenas uma estimativa local de interface; nunca trate como diagnóstico médico, psicológico ou biométrico.
Não invente dados que não foram recebidos.
`;

class ApiError extends Error {
  constructor(message, status = 500, retryAfterSeconds = null) {
    super(message);

    this.name = "ApiError";
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

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
    const chunk = bytes.subarray(
      index,
      index + chunkSize
    );

    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

function wait(milliseconds) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function getRetryAfterSeconds(message) {
  const match = String(message || "").match(
    /retry in\s+([\d.]+)\s*s/i
  );

  if (!match) {
    return null;
  }

  return Math.ceil(Number(match[1]));
}

function getGeminiErrorMessage(data, status) {
  return (
    data?.error?.message ||
    `Gemini retornou HTTP ${status}.`
  );
}

async function generateGeminiText(env, message, telemetry) {
  const prompt = [
    "Mensagem do operador:",
    message,
    "",
    "Telemetria local disponível:",
    JSON.stringify(telemetry || {})
  ].join("\n");

  const model = env.GEMINI_MODEL || "gemini-3.8-flash";

  /*
    Apenas duas tentativas para erros 5xx temporários.
    Erros 429 de cota não são repetidos automaticamente.
  */
  const maxAttempts = 2;
  let lastError = null;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
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
            ],

            /*
              Limita a resposta para o Gemini responder
              mais rápido e gerar menos texto para a voz.
            */
            generationConfig: {
              temperature: 0.45,
              maxOutputTokens: 120
            }
          })
        }
      );

      const data = await response.json();

      if (response.ok) {
        const text = data?.candidates?.[0]?.content?.parts
          ?.map((part) => part.text || "")
          .join("")
          .trim();

        if (!text) {
          throw new ApiError(
            "A Gemini não retornou texto.",
            502
          );
        }

        return text;
      }

      const errorMessage = getGeminiErrorMessage(
        data,
        response.status
      );

      /*
        Limite de uso/cota.
        Não fazer nova chamada automaticamente.
      */
      if (response.status === 429) {
        throw new ApiError(
          errorMessage,
          429,
          getRetryAfterSeconds(errorMessage)
        );
      }

      /*
        Erros 4xx geralmente são chave, modelo,
        permissão ou requisição inválida.
      */
      if (
        response.status >= 400 &&
        response.status < 500
      ) {
        throw new ApiError(
          errorMessage,
          response.status
        );
      }

      /*
        Erros 5xx normalmente são temporários.
      */
      lastError = new ApiError(
        errorMessage,
        response.status
      );

    } catch (error) {
      /*
        Não repetir 429 nem outros 4xx.
      */
      if (
        error instanceof ApiError &&
        error.status >= 400 &&
        error.status < 500
      ) {
        throw error;
      }

      lastError = error;
    }

    const isLastAttempt = attempt === maxAttempts - 1;

    if (!isLastAttempt) {
      /*
        Pequena espera antes de tentar novamente
        em caso de indisponibilidade temporária.
      */
      const delay =
        1200 + Math.floor(Math.random() * 500);

      await wait(delay);
    }
  }

  throw new ApiError(
    `Gemini temporariamente indisponível. ${
      lastError?.message || ""
    }`,
    503
  );
}

async function generateElevenLabsAudio(env, text) {
  const voiceId = env.ELEVENLABS_VOICE_ID;

  /*
    Modelo focado em baixa latência.
    Pode ser sobrescrito pela variável do Cloudflare.
  */
  const modelId =
    env.ELEVENLABS_MODEL || "eleven_flash_v2_5";

  /*
    MP3 menor para enviar e reproduzir mais rápido.
    Pode ser sobrescrito pela variável do Cloudflare.
  */
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

    throw new ApiError(
      `ElevenLabs retornou HTTP ${response.status}: ${detail.slice(0, 300)}`,
      response.status
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
      return Response.json(
        {
          status: "online",
          service: "ultron-ai-cloudflare-worker",

          gemini: Boolean(env.GEMINI_API_KEY),

          elevenlabs: Boolean(
            env.ELEVENLABS_API_KEY &&
            env.ELEVENLABS_VOICE_ID
          ),

          deviceBridge: Boolean(
            env.DEVICE_BRIDGE_URL
          ),

          message:
            "ULTRON Cloudflare Worker funcionando."
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
        if (!env.GEMINI_API_KEY) {
          throw new ApiError(
            "Gemini não configurado no Worker.",
            503
          );
        }

        const body = await request.json();

        const message = String(
          body?.message || ""
        ).trim();

        const telemetry = body?.telemetry || {};

        if (!message) {
          throw new ApiError(
            "Mensagem vazia.",
            400
          );
        }

        if (message.length > 8000) {
          throw new ApiError(
            "Mensagem muito longa.",
            413
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

        /*
          Mantém a voz automática funcionando.
          Se a ElevenLabs falhar, o texto Gemini
          ainda será devolvido ao site.
        */
        if (
          autoSpeakEnabled &&
          env.ELEVENLABS_API_KEY &&
          env.ELEVENLABS_VOICE_ID
        ) {
          try {
            const audio = await generateElevenLabsAudio(
              env,
              text
            );

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

        const status =
          error instanceof ApiError
            ? error.status
            : 500;

        const retryAfterSeconds =
          error instanceof ApiError
            ? error.retryAfterSeconds
            : null;

        const responseHeaders = {
          ...corsHeaders
        };

        if (retryAfterSeconds) {
          responseHeaders["Retry-After"] =
            String(retryAfterSeconds);
        }

        return Response.json(
          {
            error: "Falha ao consultar o Gemini.",

            details:
              error?.message || String(error),

            retryAfterSeconds
          },
          {
            status,
            headers: responseHeaders
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
          throw new ApiError(
            "ElevenLabs não configurado no Worker.",
            503
          );
        }

        const body = await request.json();

        const text = String(
          body?.text || ""
        ).trim();

        if (!text) {
          throw new ApiError(
            "Texto vazio.",
            400
          );
        }

        if (text.length > 3000) {
          throw new ApiError(
            "Texto muito longo para gerar voz.",
            413
          );
        }

        const audio = await generateElevenLabsAudio(
          env,
          text
        );

        return Response.json(
          audio,
          {
            headers: corsHeaders
          }
        );

      } catch (error) {
        console.error(
          "Erro ElevenLabs:",
          error
        );

        const status =
          error instanceof ApiError
            ? error.status
            : 500;

        return Response.json(
          {
            error:
              "Falha ao gerar voz ElevenLabs.",

            details:
              error?.message || String(error)
          },
          {
            status,
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
