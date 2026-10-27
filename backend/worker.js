import {
  ProviderGatewayError,
  generateWithProviders,
  getProviderStatus
} from "./providers.js";
import {
  deriveOperatorId,
  loadMemoryContext,
  memoryHealth,
  normalizeConversationId,
  saveExchange
} from "./memory.js";
import {
  bridgeHealth,
  claimPairing,
  completeCommand,
  enqueueCommand,
  listDevices,
  pollCommands,
  startPairing
} from "./device-bridge.js";

function createCorsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json; charset=utf-8"
  };
}

function jsonResult(result, headers, failureStatus = 400) {
  return Response.json(result, {
    status: result?.ok === false ? failureStatus : 200,
    headers
  });
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

function buildMemoryAwareMessage(message, memoryContext) {
  if (!memoryContext) return message;

  return [
    "CONTEXTO INTERNO DE MEMÓRIA DO ULTRON:",
    "Use este contexto apenas para compreender referências, preferências e continuidade da conversa.",
    "Não diga que recebeu um bloco de memória e não invente informações ausentes.",
    "",
    memoryContext,
    "",
    "MENSAGEM ATUAL DO OPERADOR:",
    message
  ].join("\n");
}

async function generateElevenLabsAudio(env, text) {
  const voiceId = env.ELEVENLABS_VOICE_ID;
  const modelId = env.ELEVENLABS_MODEL || "eleven_flash_v2_5";
  const outputFormat = env.ELEVENLABS_OUTPUT_FORMAT || "mp3_22050_32";

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

    if (url.pathname === "/api/health" && request.method === "GET") {
      const providers = getProviderStatus(env, env.AI);
      const [memory, bridge] = await Promise.all([
        memoryHealth(env),
        bridgeHealth(env)
      ]);

      return Response.json(
        {
          status: "online",
          service: "ultron-ai-cloudflare-worker",
          aiGateway: true,
          providers,
          providerOrder: String(
            env.AI_PROVIDER_ORDER ||
              "groq,gemini,cloudflare,openrouter,cohere"
          )
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean),
          elevenlabs: Boolean(
            env.ELEVENLABS_API_KEY && env.ELEVENLABS_VOICE_ID
          ),
          memory,
          memoryVersion: "1.2",
          deviceBridge: Boolean(bridge?.ready),
          bridge,
          message:
            "ULTRON Cloudflare Worker funcionando com gateway multi-IA, memória e Device Bridge."
        },
        { headers: corsHeaders }
      );
    }

    if (url.pathname === "/api/devices/pair/start" && request.method === "POST") {
      try {
        const body = await request.json();
        const operatorId = await deriveOperatorId(body?.memoryKey);
        const result = await startPairing(env, {
          operatorId,
          deviceType: body?.deviceType,
          deviceName: body?.deviceName
        });
        return jsonResult(result, corsHeaders, 400);
      } catch (error) {
        return jsonResult({ ok: false, error: error?.message || String(error) }, corsHeaders, 500);
      }
    }

    if (url.pathname === "/api/devices/pair/claim" && request.method === "POST") {
      try {
        const body = await request.json();
        const result = await claimPairing(env, body || {});
        return jsonResult(result, corsHeaders, 400);
      } catch (error) {
        return jsonResult({ ok: false, error: error?.message || String(error) }, corsHeaders, 500);
      }
    }

    if (url.pathname === "/api/devices/list" && request.method === "POST") {
      try {
        const body = await request.json();
        const operatorId = await deriveOperatorId(body?.memoryKey);
        if (!operatorId) {
          return jsonResult({ ok: false, error: "Identidade do operador ausente." }, corsHeaders, 401);
        }
        const devices = await listDevices(env, operatorId);
        return jsonResult({ ok: true, devices }, corsHeaders);
      } catch (error) {
        return jsonResult({ ok: false, error: error?.message || String(error) }, corsHeaders, 500);
      }
    }

    if (url.pathname === "/api/devices/command" && request.method === "POST") {
      try {
        const body = await request.json();
        const operatorId = await deriveOperatorId(body?.memoryKey);
        const result = await enqueueCommand(env, {
          operatorId,
          deviceId: body?.deviceId,
          command: body?.command,
          payload: body?.payload || {}
        });
        return jsonResult(result, corsHeaders, 400);
      } catch (error) {
        return jsonResult({ ok: false, error: error?.message || String(error) }, corsHeaders, 500);
      }
    }

    if (url.pathname === "/api/bridge/poll" && request.method === "POST") {
      try {
        const body = await request.json();
        const result = await pollCommands(env, {
          deviceId: body?.deviceId,
          deviceSecret: body?.deviceSecret
        });
        return jsonResult(result, corsHeaders, 401);
      } catch (error) {
        return jsonResult({ ok: false, error: error?.message || String(error) }, corsHeaders, 500);
      }
    }

    if (url.pathname === "/api/bridge/result" && request.method === "POST") {
      try {
        const body = await request.json();
        const result = await completeCommand(env, {
          deviceId: body?.deviceId,
          deviceSecret: body?.deviceSecret,
          commandId: body?.commandId,
          status: body?.status,
          result: body?.result || {}
        });
        return jsonResult(result, corsHeaders, 401);
      } catch (error) {
        return jsonResult({ ok: false, error: error?.message || String(error) }, corsHeaders, 500);
      }
    }

    if (url.pathname === "/api/ai" && request.method === "POST") {
      try {
        const requestStartedAt = Date.now();
        const body = await request.json();
        const message = String(body?.message || "").trim();
        const telemetry = body?.telemetry || {};
        const conversationId = normalizeConversationId(body?.conversationId);
        const operatorId = await deriveOperatorId(body?.memoryKey);

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

        const memoryState = await loadMemoryContext(env, {
          operatorId,
          conversationId
        });

        const aiMessage = buildMemoryAwareMessage(message, memoryState.context);

        const aiStartedAt = Date.now();
        const aiResult = await generateWithProviders(
          env,
          aiMessage,
          telemetry,
          { aiBinding: env.AI }
        );
        const aiMs = Date.now() - aiStartedAt;

        const memoryPromise =
          memoryState.active && operatorId && conversationId
            ? saveExchange(env, {
                operatorId,
                conversationId,
                userMessage: message,
                assistantMessage: aiResult.text,
                provider: aiResult.provider,
                model: aiResult.model
              })
            : Promise.resolve({
                saved: false,
                explicitMemorySaved: false
              });

        const autoSpeakEnabled = env.ELEVENLABS_AUTOSPEAK !== "false";

        const voiceStartedAt = Date.now();
        const voicePromise =
          autoSpeakEnabled && env.ELEVENLABS_API_KEY && env.ELEVENLABS_VOICE_ID
            ? generateElevenLabsAudio(env, aiResult.text)
                .then((audio) => ({
                  audio,
                  voiceMs: Date.now() - voiceStartedAt
                }))
                .catch((error) => {
                  console.error(
                    "[ULTRON AI] ElevenLabs falhou:",
                    error?.message || error
                  );
                  return {
                    audio: null,
                    voiceMs: Date.now() - voiceStartedAt
                  };
                })
            : Promise.resolve({ audio: null, voiceMs: 0 });

        const [memoryWrite, voiceResult] = await Promise.all([
          memoryPromise,
          voicePromise
        ]);

        const audioBase64 = voiceResult.audio?.audioBase64 || null;
        const audioMimeType = voiceResult.audio?.audioMimeType || null;

        return Response.json(
          {
            text: aiResult.text,
            provider: aiResult.provider,
            providerLabel: aiResult.providerLabel,
            model: aiResult.model,
            attempts: aiResult.attempts,
            memory: {
              active: memoryState.active,
              identityReceived: Boolean(operatorId && conversationId),
              recalledMessages: memoryState.recalledMessages || 0,
              recalledMemories: memoryState.recalledMemories || 0,
              saved: Boolean(memoryWrite?.saved),
              explicitMemorySaved: Boolean(memoryWrite?.explicitMemorySaved),
              error: memoryState.error || memoryWrite?.error || null
            },
            performance: {
              aiMs,
              voiceMs: voiceResult.voiceMs,
              totalMs: Date.now() - requestStartedAt,
              parallelPostProcessing: true
            },
            audioBase64,
            audioMimeType
          },
          { headers: corsHeaders }
        );
      } catch (error) {
        console.error("[ULTRON AI] Gateway falhou:", error);

        const attempts =
          error instanceof ProviderGatewayError ? error.attempts : [];

        return Response.json(
          {
            error: "Nenhum provedor de IA conseguiu responder.",
            details: error?.message || String(error),
            attempts
          },
          { status: 503, headers: corsHeaders }
        );
      }
    }

    if (url.pathname === "/api/voice" && request.method === "POST") {
      try {
        if (!env.ELEVENLABS_API_KEY || !env.ELEVENLABS_VOICE_ID) {
          return Response.json(
            { error: "ElevenLabs não configurado no Worker." },
            { status: 503, headers: corsHeaders }
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
            { error: "Texto muito longo para gerar voz." },
            { status: 413, headers: corsHeaders }
          );
        }

        const audio = await generateElevenLabsAudio(env, text);
        return Response.json(audio, { headers: corsHeaders });
      } catch (error) {
        console.error("[ULTRON AI] ElevenLabs falhou:", error);

        return Response.json(
          {
            error: "Falha ao gerar voz ElevenLabs.",
            details: error?.message || String(error)
          },
          { status: 500, headers: corsHeaders }
        );
      }
    }

    return Response.json(
      {
        error: "Rota não encontrada.",
        routes: [
          "GET /api/health",
          "POST /api/ai",
          "POST /api/voice",
          "POST /api/devices/pair/start",
          "POST /api/devices/pair/claim",
          "POST /api/devices/list",
          "POST /api/devices/command",
          "POST /api/bridge/poll",
          "POST /api/bridge/result"
        ]
      },
      { status: 404, headers: corsHeaders }
    );
  }
};
