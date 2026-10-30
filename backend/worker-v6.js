import baseWorker from "./worker-v5.js";
import { deriveOperatorId } from "./memory.js";
import { listDevices } from "./device-bridge.js";
import { commandHistory } from "./device-control-v2.js";
import { listAutomations } from "./automation-engine.js";
import { getLatestTelemetry } from "./telemetry.js";
import {
  finishOrchestration,
  orchestrationHealth,
  orchestrationRunDetail,
  recentOrchestrations,
  recordOrchestrationStep,
  startOrchestration
} from "./orchestration-engine.js";

const BACKEND_VERSION = "4.27.0";

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

function missingOperator() {
  return json({ ok: false, error: "Identidade do operador ausente." }, 401);
}

async function unifiedState(env, operatorId) {
  const [telemetry, devices, automations, commands, runs] = await Promise.all([
    getLatestTelemetry(env, operatorId),
    listDevices(env, operatorId),
    listAutomations(env, operatorId),
    commandHistory(env, operatorId, 12),
    recentOrchestrations(env, operatorId, 10)
  ]);

  const now = Date.now();
  const deviceState = (devices || []).map((device) => {
    const lastSeen = Date.parse(device?.lastSeenAt || "") || 0;
    return {
      id: device.id,
      deviceType: device.deviceType,
      deviceName: device.deviceName,
      status: device.status,
      lastSeenAt: device.lastSeenAt || null,
      online: Boolean(lastSeen && now - lastSeen <= 45_000),
      capabilities: Array.isArray(device.capabilities) ? device.capabilities : []
    };
  });

  return {
    ok: true,
    capturedAt: new Date().toISOString(),
    telemetry,
    devices: deviceState,
    automations: (automations || []).slice(0, 20),
    recentCommands: commands || [],
    recentRuns: runs || []
  };
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    if (url.pathname === "/api/health" && request.method === "GET") {
      const response = await baseWorker.fetch(request, env, ctx);
      if (!response.ok) return response;
      const fallback = response.clone();
      try {
        const data = await response.json();
        return json({
          ...data,
          backendVersion: BACKEND_VERSION,
          totalIntegration: true,
          orchestration: orchestrationHealth(),
          proactiveMode: {
            enabled: true,
            safeSelfHeal: true,
            activeDeviceActionsRequireIntent: true,
            destructiveActionsBlockedWithoutPolicy: true
          }
        });
      } catch {
        return fallback;
      }
    }

    if (url.pathname === "/api/orchestrator/start" && request.method === "POST") {
      const body = await bodyOf(request);
      const operatorId = await operatorFrom(body);
      if (!operatorId) return missingOperator();
      let telemetry = body?.telemetry || {};
      const latest = await getLatestTelemetry(env, operatorId);
      if (latest?.snapshot) {
        telemetry = {
          ...latest.snapshot,
          ...telemetry,
          centralCapturedAt: latest.createdAt || null
        };
      }
      const result = await startOrchestration(env, {
        operatorId,
        message: body?.message,
        telemetry
      });
      return json(result, result?.ok === false ? 400 : 200);
    }

    if (url.pathname === "/api/orchestrator/step" && request.method === "POST") {
      const body = await bodyOf(request);
      const operatorId = await operatorFrom(body);
      if (!operatorId) return missingOperator();
      const result = await recordOrchestrationStep(env, {
        operatorId,
        runId: body?.runId,
        stepKey: body?.stepKey,
        module: body?.module,
        status: body?.status,
        detail: body?.detail || {}
      });
      return json(result, result?.ok === false ? 400 : 200);
    }

    if (url.pathname === "/api/orchestrator/finish" && request.method === "POST") {
      const body = await bodyOf(request);
      const operatorId = await operatorFrom(body);
      if (!operatorId) return missingOperator();
      const result = await finishOrchestration(env, {
        operatorId,
        runId: body?.runId,
        status: body?.status,
        route: body?.route,
        result: body?.result || {}
      });
      return json(result, result?.ok === false ? 404 : 200);
    }

    if (url.pathname === "/api/orchestrator/history" && request.method === "POST") {
      const body = await bodyOf(request);
      const operatorId = await operatorFrom(body);
      if (!operatorId) return missingOperator();
      const runs = await recentOrchestrations(env, operatorId, body?.limit);
      return json({ ok: true, runs });
    }

    if (url.pathname === "/api/orchestrator/run" && request.method === "POST") {
      const body = await bodyOf(request);
      const operatorId = await operatorFrom(body);
      if (!operatorId) return missingOperator();
      const run = await orchestrationRunDetail(env, operatorId, body?.runId);
      return json(run ? { ok: true, run } : { ok: false, error: "Execução não encontrada." }, run ? 200 : 404);
    }

    if (url.pathname === "/api/orchestrator/state" && request.method === "POST") {
      const body = await bodyOf(request);
      const operatorId = await operatorFrom(body);
      if (!operatorId) return missingOperator();
      return json(await unifiedState(env, operatorId));
    }

    return baseWorker.fetch(request, env, ctx);
  },

  async scheduled(controller, env, ctx) {
    if (typeof baseWorker.scheduled === "function") {
      return baseWorker.scheduled(controller, env, ctx);
    }
  }
};
