import baseWorker from "./worker-v4.js";
import { deriveOperatorId } from "./memory.js";
import {
  commandHistory,
  deviceControlHealth,
  enqueueControlCommand,
  getCommandStatus
} from "./device-control-v2.js";
import {
  automationHealth,
  createAutomation,
  deleteAutomation,
  listAutomations,
  processDueAutomations,
  runAutomationNow,
  setAutomationEnabled
} from "./automation-engine.js";

const BACKEND_VERSION = "4.26.0";

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json; charset=utf-8"
  };
}

function json(data, status = 200) {
  return Response.json(data, { status, headers: corsHeaders() });
}

async function bodyOf(request) {
  try { return await request.json(); } catch { return {}; }
}

async function operatorFrom(body) {
  return deriveOperatorId(body?.memoryKey);
}

function requireOperator(operatorId) {
  return operatorId ? null : json({ ok: false, error: "Identidade do operador ausente." }, 401);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders() });

    if (url.pathname === "/api/health" && request.method === "GET") {
      const response = await baseWorker.fetch(request, env, ctx);
      if (!response.ok) return response;
      const fallback = response.clone();
      try {
        const data = await response.json();
        return json({
          ...data,
          backendVersion: BACKEND_VERSION,
          deviceControl: deviceControlHealth(),
          automations: automationHealth()
        });
      } catch {
        return fallback;
      }
    }

    if (url.pathname === "/api/control/command" && request.method === "POST") {
      const body = await bodyOf(request);
      const operatorId = await operatorFrom(body);
      const missing = requireOperator(operatorId);
      if (missing) return missing;
      const result = await enqueueControlCommand(env, {
        operatorId,
        deviceId: body?.deviceId,
        deviceType: body?.deviceType,
        command: body?.command,
        payload: body?.payload || {}
      });
      return json(result, result?.ok === false ? (result?.needsConfirmation ? 409 : 400) : 200);
    }

    if (url.pathname === "/api/control/status" && request.method === "POST") {
      const body = await bodyOf(request);
      const operatorId = await operatorFrom(body);
      const missing = requireOperator(operatorId);
      if (missing) return missing;
      const result = await getCommandStatus(env, operatorId, body?.commandId);
      return json(result, result?.ok === false ? 404 : 200);
    }

    if (url.pathname === "/api/control/history" && request.method === "POST") {
      const body = await bodyOf(request);
      const operatorId = await operatorFrom(body);
      const missing = requireOperator(operatorId);
      if (missing) return missing;
      const history = await commandHistory(env, operatorId, body?.limit);
      return json({ ok: true, history });
    }

    if (url.pathname === "/api/automations/create" && request.method === "POST") {
      const body = await bodyOf(request);
      const operatorId = await operatorFrom(body);
      const missing = requireOperator(operatorId);
      if (missing) return missing;
      const result = await createAutomation(env, {
        operatorId,
        name: body?.name,
        deviceId: body?.deviceId,
        deviceType: body?.deviceType,
        command: body?.command,
        payload: body?.payload || {},
        scheduleKind: body?.scheduleKind,
        schedule: body?.schedule || {},
        enabled: body?.enabled !== false
      });
      return json(result, result?.ok === false ? (result?.needsConfirmation ? 409 : 400) : 200);
    }

    if (url.pathname === "/api/automations/list" && request.method === "POST") {
      const body = await bodyOf(request);
      const operatorId = await operatorFrom(body);
      const missing = requireOperator(operatorId);
      if (missing) return missing;
      const automations = await listAutomations(env, operatorId);
      return json({ ok: true, automations });
    }

    if (url.pathname === "/api/automations/toggle" && request.method === "POST") {
      const body = await bodyOf(request);
      const operatorId = await operatorFrom(body);
      const missing = requireOperator(operatorId);
      if (missing) return missing;
      const result = await setAutomationEnabled(env, operatorId, body?.id, Boolean(body?.enabled));
      return json(result, result?.ok === false ? 404 : 200);
    }

    if (url.pathname === "/api/automations/delete" && request.method === "POST") {
      const body = await bodyOf(request);
      const operatorId = await operatorFrom(body);
      const missing = requireOperator(operatorId);
      if (missing) return missing;
      const result = await deleteAutomation(env, operatorId, body?.id);
      return json(result, result?.ok === false ? 404 : 200);
    }

    if (url.pathname === "/api/automations/run" && request.method === "POST") {
      const body = await bodyOf(request);
      const operatorId = await operatorFrom(body);
      const missing = requireOperator(operatorId);
      if (missing) return missing;
      const result = await runAutomationNow(env, operatorId, body?.id);
      return json(result, result?.ok === false ? 400 : 200);
    }

    return baseWorker.fetch(request, env, ctx);
  },

  async scheduled(controller, env, ctx) {
    ctx.waitUntil(processDueAutomations(env, { limit: 50 }));
  }
};
