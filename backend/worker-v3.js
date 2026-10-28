import baseWorker from "./worker-v2.js";
import { deriveOperatorId } from "./memory.js";
import {
  generateCloudVoice,
  generateXttsAudio,
  getVoiceRouterStatus
} from "./voice-router.js";
import {
  getLatestTelemetry,
  ingestTelemetry,
  telemetryHealth
} from "./telemetry.js";
import {
  chooseProviderOrder,
  withSmartProviderOrder
} from "./smart-router.js";

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json; charset=utf-8"
  };
}

function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: corsHeaders()
  });
}

async function readJsonBody(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function validVoiceText(body) {
  return String(body?.text || "").replace(/\s+/g, " ").trim();
}

function requestWithJsonBody(request, body) {
  const headers = new Headers(request.headers);
  headers.set("Content-Type", "application/json");
  return new Request(request.url, {
    method: request.method,
    headers,
    body: JSON.stringify(body),
    redirect: request.redirect
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    if (url.pathname === "/api/telemetry/ingest" && request.method === "POST") {
      const body = await readJsonBody(request);
      const operatorId = await deriveOperatorId(body?.memoryKey);
      const result = await ingestTelemetry(env, {
        operatorId,
        source: body?.source || "web",
        snapshot: body?.snapshot || {}
      });
      return json(result, result?.ok === false ? 400 : 200);
    }

    if (url.pathname === "/api/telemetry/latest" && request.method === "POST") {
      const body = await readJsonBody(request);
      const operatorId = await deriveOperatorId(body?.memoryKey);
      if (!operatorId) return json({ ok: false, error: "Identidade ausente." }, 401);
      const latest = await getLatestTelemetry(env, operatorId);
      return json({ ok: true, latest });
    }

    if (url.pathname === "/api/voice" && request.method === "POST") {
      const body = await readJsonBody(request);
      const text = validVoiceText(body);

      if (!text) return json({ error: "Texto vazio." }, 400);
      if (text.length > 3000) {
        return json({ error: "Texto muito longo para gerar voz." }, 413);
      }

      const startedAt = Date.now();
      const result = await generateCloudVoice(env, text);

      if (result.audioBase64) {
        return json({
          audioBase64: result.audioBase64,
          audioMimeType: result.audioMimeType,
          voice: {
            provider: result.provider,
            providerLabel: result.providerLabel,
            voice: result.voice,
            attempts: result.attempts,
            elapsedMs: Date.now() - startedAt
          }
        });
      }

      return json({
        error: "Nenhum provedor de voz em nuvem conseguiu gerar áudio.",
        voice: {
          provider: null,
          attempts: result.attempts,
          nextFallback: "browser-tts",
          elapsedMs: Date.now() - startedAt
        }
      }, 503);
    }

    if (url.pathname === "/api/voice/xtts" && request.method === "POST") {
      const body = await readJsonBody(request);
      const text = validVoiceText(body);

      if (!text) return json({ error: "Texto vazio." }, 400);
      if (text.length > 3000) {
        return json({ error: "Texto muito longo para XTTS v2." }, 413);
      }

      try {
        const result = await generateXttsAudio(env, text);
        return json({
          audioBase64: result.audioBase64,
          audioMimeType: result.audioMimeType,
          voice: {
            provider: result.provider,
            providerLabel: result.providerLabel
          }
        });
      } catch (error) {
        return json({
          error: "XTTS v2 indisponível.",
          details: error?.message || String(error)
        }, 503);
      }
    }

    if (url.pathname === "/api/health" && request.method === "GET") {
      const response = await baseWorker.fetch(request, env, ctx);
      if (!response.ok) return response;
      const fallbackResponse = response.clone();

      try {
        const [data, telemetry] = await Promise.all([
          response.json(),
          telemetryHealth(env)
        ]);
        return json({
          ...data,
          telemetry,
          proactiveEngine: Boolean(telemetry?.ready),
          smartRouting: true,
          voiceRouter: getVoiceRouterStatus(env),
          voiceOrder: [
            "ElevenLabs",
            "Google Neural2",
            "Google WaveNet",
            "Browser TTS",
            "XTTS v2"
          ]
        });
      } catch {
        return fallbackResponse;
      }
    }

    if (url.pathname === "/api/ai" && request.method === "POST") {
      const requestStartedAt = Date.now();
      let forwardedRequest = request;
      let routedEnv = env;
      let routing = null;

      try {
        const body = await request.clone().json();
        const operatorId = await deriveOperatorId(body?.memoryKey);
        let telemetry = body?.telemetry || {};

        if (operatorId) {
          const latest = await getLatestTelemetry(env, operatorId);
          if (latest?.snapshot) {
            telemetry = {
              ...telemetry,
              central: latest.snapshot,
              centralCapturedAt: latest.createdAt || null
            };
          }
        }

        routing = chooseProviderOrder(env, body?.message, telemetry);
        routedEnv = withSmartProviderOrder(env, routing);
        forwardedRequest = requestWithJsonBody(request, {
          ...body,
          telemetry
        });
      } catch {}

      const response = await baseWorker.fetch(forwardedRequest, routedEnv, ctx);
      if (!response.ok) return response;
      const fallbackResponse = response.clone();

      try {
        const data = await response.json();
        if (!data?.text) return json({ ...data, smartRouting: routing });

        if (data.audioBase64) {
          return json({
            ...data,
            smartRouting: routing,
            voice: {
              provider: "elevenlabs",
              providerLabel: "ElevenLabs",
              source: "base-worker",
              nextFallback: null
            }
          });
        }

        const voiceStartedAt = Date.now();
        const voice = await generateCloudVoice(env, data.text, { skipEleven: true });

        if (voice.audioBase64) {
          return json({
            ...data,
            smartRouting: routing,
            audioBase64: voice.audioBase64,
            audioMimeType: voice.audioMimeType,
            voice: {
              provider: voice.provider,
              providerLabel: voice.providerLabel,
              voice: voice.voice,
              attempts: voice.attempts,
              nextFallback: null
            },
            performance: {
              ...(data.performance || {}),
              fallbackVoiceMs: Date.now() - voiceStartedAt,
              totalMs: Date.now() - requestStartedAt
            }
          });
        }

        return json({
          ...data,
          smartRouting: routing,
          voice: {
            provider: null,
            providerLabel: null,
            attempts: voice.attempts,
            nextFallback: "browser-tts"
          },
          performance: {
            ...(data.performance || {}),
            fallbackVoiceMs: Date.now() - voiceStartedAt,
            totalMs: Date.now() - requestStartedAt
          }
        });
      } catch (error) {
        console.error("[ULTRON VOICE] Falha ao enriquecer resposta:", error);
        return fallbackResponse;
      }
    }

    return baseWorker.fetch(request, env, ctx);
  }
};
