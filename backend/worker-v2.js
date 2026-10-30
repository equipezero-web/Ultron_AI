import baseWorker from "./worker.js";
import { deriveOperatorId } from "./memory.js";
import {
  pollOperatorCameraEvents,
  pollOperatorEvents,
  submitDeviceEvent
} from "./microphone-bridge.js";

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

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const corsHeaders = createCorsHeaders();

    if (url.pathname === "/api/bridge/event" && request.method === "POST") {
      try {
        const body = await request.json();
        const result = await submitDeviceEvent(env, {
          deviceId: body?.deviceId,
          deviceSecret: body?.deviceSecret,
          eventType: body?.eventType,
          payload: body?.payload || {}
        });
        return jsonResult(result, corsHeaders, 401);
      } catch (error) {
        return jsonResult(
          { ok: false, error: error?.message || String(error) },
          corsHeaders,
          500
        );
      }
    }

    if (
      url.pathname === "/api/devices/events/poll" &&
      request.method === "POST"
    ) {
      try {
        const body = await request.json();
        const operatorId = await deriveOperatorId(body?.memoryKey);

        if (!operatorId) {
          return jsonResult(
            { ok: false, error: "Identidade do operador ausente." },
            corsHeaders,
            401
          );
        }

        const channel = String(body?.channel || "microphone").trim().toLowerCase();
        const result = channel === "camera"
          ? await pollOperatorCameraEvents(env, {
              operatorId,
              limit: body?.limit
            })
          : await pollOperatorEvents(env, {
              operatorId,
              limit: body?.limit
            });

        return jsonResult(result, corsHeaders, 400);
      } catch (error) {
        return jsonResult(
          { ok: false, error: error?.message || String(error) },
          corsHeaders,
          500
        );
      }
    }

    return baseWorker.fetch(request, env, ctx);
  }
};
