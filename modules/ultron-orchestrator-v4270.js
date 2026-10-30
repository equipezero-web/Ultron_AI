import API_CONFIG from "../config.js";

const API_BASE = String(API_CONFIG?.backendUrl || "").replace(/\/$/, "");
const output = document.getElementById("output-box");
const input = document.getElementById("command-input");
const sendButton = document.getElementById("btn-send");

const state = {
  ready: true,
  busy: false,
  activeRunId: null,
  lastRunId: null,
  lastRoute: null,
  lastResult: null,
  lastUnifiedState: null,
  processed: 0,
  failed: 0,
  proactiveRecoveries: 0
};

let queue = Promise.resolve();
const proactiveCooldown = new Map();

function normalize(text) {
  return String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function log(message, alert = false) {
  if (!output) return;
  const line = document.createElement("p");
  if (alert) line.className = "alert";
  const time = new Date().toLocaleTimeString("pt-BR", { hour12: false });
  line.textContent = `> [${time}] [ORCH] ${message}`;
  output.appendChild(line);
  output.scrollTop = output.scrollHeight;
}

function memoryKey() {
  return window.ULTRON_MEMORY?.getMemoryKey?.() || null;
}

async function post(path, payload = {}, { silent = false } = {}) {
  if (!API_BASE) throw new Error("Backend não configurado.");
  const response = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({ memoryKey: memoryKey(), ...payload })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.ok === false) {
    const error = new Error(data?.error || `HTTP ${response.status}`);
    error.data = data;
    if (!silent) throw error;
    return null;
  }
  return data;
}

function localRunId() {
  return `local-${crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
}

async function beginRun(message) {
  let telemetry = null;
  try { telemetry = await window.ULTRON_TELEMETRY?.snapshot?.({ event: "orchestrator-start" }); } catch {}
  try {
    const result = await post("/api/orchestrator/start", { message, telemetry: telemetry || {} });
    if (result?.plan?.complex) {
      log(`PLANO ${String(result.plan.intent || "general").toUpperCase()} // ${result.plan.steps?.length || 0} etapas.`);
    }
    return result;
  } catch (error) {
    log(`D1 indisponível para histórico; execução continuará localmente (${error.message}).`, true);
    return { ok: true, runId: localRunId(), localOnly: true, plan: null };
  }
}

async function recordStep(run, stepKey, module, status, detail = {}) {
  if (!run?.runId || run.localOnly) return;
  try {
    await post("/api/orchestrator/step", {
      runId: run.runId,
      stepKey,
      module,
      status,
      detail
    }, { silent: true });
  } catch {}
}

async function finishRun(run, status, route, result = {}) {
  if (!run?.runId || run.localOnly) return;
  try {
    await post("/api/orchestrator/finish", {
      runId: run.runId,
      status,
      route,
      result: sanitizeResult(result)
    }, { silent: true });
  } catch {}
}

function sanitizeResult(result) {
  if (result == null) return {};
  if (result instanceof Error) return { error: result.message };
  try {
    const clone = JSON.parse(JSON.stringify(result));
    const text = JSON.stringify(clone);
    if (text.length <= 12000) return clone;
    return { summary: text.slice(0, 11000), truncated: true };
  } catch {
    return { value: String(result).slice(0, 2000) };
  }
}

function splitCompound(message) {
  const parts = String(message || "")
    .split(/\s+(?:e\s+depois|depois|em\s+seguida)\s+|\s*;\s*/i)
    .map((item) => item.trim())
    .filter(Boolean);
  return parts.length > 1 ? parts.slice(0, 6) : [String(message || "").trim()];
}

function isAutomationList(text) {
  return /\b(listar|liste|mostrar|mostre)\b.*\bautomac/.test(normalize(text));
}

function isHistoryIntent(text) {
  const n = normalize(text);
  return /\b(historico|atividade|execucoes|ultimos comandos|ultimas execucoes)\b/.test(n) &&
    /\b(ultron|sistema|orquestr|historico|atividade|execucoes)\b/.test(n);
}

function isCameraActivation(text) {
  const n = normalize(text);
  return /\b(camera|sensor|optical|sensor visual)\b/.test(n) &&
    /\b(ativar|ative|ligar|ligue|abrir|abra|mostrar|mostre|conectar|conecte)\b/.test(n);
}

function isCenter3d(text) {
  const n = normalize(text);
  return /\b(centralizar|centralize|resetar|resete|reset)\b/.test(n) &&
    /\b(3d|esfera|neural|holograma|holografica)\b/.test(n);
}

function isStatusIntent(text) {
  const n = normalize(text);
  return /^(status|status do sistema|status do ultron|como esta o sistema|estado do sistema)$/.test(n);
}

async function waitForRuntime(test, timeoutMs = 5000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const value = test();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 80));
  }
  return test();
}

async function showHistory() {
  const result = await post("/api/orchestrator/history", { limit: 10 });
  const runs = result?.runs || [];
  if (!runs.length) {
    log("Nenhuma execução registrada ainda.");
    return { ok: true, runs };
  }
  log(`ATIVIDADE RECENTE // ${runs.length} execução(ões):`);
  for (const run of runs) {
    log(`${String(run.status || "-").toUpperCase()} // ${run.route || run.intent || "core"} // ${String(run.message || "").slice(0, 90)}`);
  }
  return { ok: true, runs };
}

async function routeSingle(command, run, index = 0) {
  const prefix = `step-${index + 1}`;
  const devices = await waitForRuntime(() => window.ULTRON_DEVICES, 2500);
  const vision = await waitForRuntime(() => window.ULTRON_VISION_ROUTER, 2500);
  const core = await waitForRuntime(() => window.ULTRON_CORE, 3500);

  if (isHistoryIntent(command)) {
    await recordStep(run, prefix, "orchestrator-history", "running", { command });
    const result = await showHistory();
    await recordStep(run, prefix, "orchestrator-history", "completed", { count: result.runs?.length || 0 });
    return { route: "orchestrator-history", ok: true, result };
  }

  const deviceIntent = devices?.parseDeviceIntent?.(command) || null;
  if (deviceIntent || isAutomationList(command)) {
    await recordStep(run, prefix, "device-control", "running", {
      command: deviceIntent?.command || "automations.list",
      deviceType: deviceIntent?.deviceType || null
    });
    const result = await devices.routeNaturalLanguage(command, deviceIntent);
    const waiting = Boolean(result?.needsConfirmation);
    const ok = result?.ok !== false;
    await recordStep(
      run,
      prefix,
      "device-control",
      waiting ? "waiting-confirmation" : (ok ? "completed" : "failed"),
      { verified: result?.verified === true, status: result?.commandStatus || null }
    );
    return {
      route: "device-control",
      ok,
      waitingConfirmation: waiting,
      result
    };
  }

  if (vision?.isVisualAnalysisCommand?.(command)) {
    await recordStep(run, prefix, "vision", "running", { command });
    const result = await vision.run(command);
    const ok = Boolean(result?.text);
    await recordStep(run, prefix, "vision", ok ? "completed" : "failed", {
      provider: result?.provider || null,
      model: result?.model || null
    });
    return { route: "vision", ok, result };
  }

  if (isCameraActivation(command)) {
    await recordStep(run, prefix, "optical-sensor", "running", { command });
    const result = await core?.activateCamera?.({ openPreview: true, fromOrchestrator: true });
    const active = Boolean(window.ULTRON_MOBILE_CAMERA?.state?.active || window.ULTRON_CAMERA_CONTROLLER?.isActive?.());
    await recordStep(run, prefix, "optical-sensor", active ? "completed" : "failed", { active });
    return { route: "optical-sensor", ok: active, result: result || { active } };
  }

  if (isCenter3d(command)) {
    await recordStep(run, prefix, "neural-3d", "running", { command });
    window.ULTRON_NEURAL_3D?.reset?.();
    await recordStep(run, prefix, "neural-3d", "completed", { centered: true });
    log("NEURAL 3D // esfera centralizada em 0°.");
    return { route: "neural-3d", ok: true, result: { centered: true } };
  }

  if (isStatusIntent(command)) {
    await recordStep(run, prefix, "system-status", "running", { command });
    const result = await core?.status?.();
    await recordStep(run, prefix, "system-status", "completed", result || {});
    return { route: "system-status", ok: true, result };
  }

  await recordStep(run, prefix, "ai-core", "running", { command });
  if (!core?.ask) throw new Error("ULTRON CORE ainda não ficou disponível.");
  const result = await core.ask(command, { fromOrchestrator: true });
  const ok = result?.ok !== false && Boolean(result?.text || result?.provider || result?.success);
  await recordStep(run, prefix, "ai-core", ok ? "completed" : "failed", {
    provider: result?.providerLabel || result?.provider || null,
    smartRouting: result?.smartRouting?.class || null
  });
  return { route: "ai-core", ok, result };
}

async function executeMessage(message, source = "terminal") {
  const clean = String(message || "").trim();
  if (!clean) return null;

  state.busy = true;
  document.getElementById("system-mode")?.replaceChildren(document.createTextNode("ORCHESTRATING"));
  log(`INPUT ${source.toUpperCase()} // ${clean}`);
  const run = await beginRun(clean);
  state.activeRunId = run.runId;
  state.lastRunId = run.runId;

  const parts = splitCompound(clean);
  if (parts.length > 1) log(`COMANDO COMPOSTO // ${parts.length} etapas em sequência.`);

  const results = [];
  let finalRoute = null;
  let finalStatus = "completed";

  try {
    for (let i = 0; i < parts.length; i += 1) {
      const part = parts[i];
      if (parts.length > 1) log(`ETAPA ${i + 1}/${parts.length} // ${part}`);
      const routed = await routeSingle(part, run, i);
      results.push(routed);
      finalRoute = finalRoute || routed.route;
      if (routed.waitingConfirmation) {
        finalStatus = "waiting-confirmation";
        break;
      }
      if (!routed.ok) {
        finalStatus = "failed";
        break;
      }
    }

    state.processed += 1;
    if (finalStatus === "failed") state.failed += 1;
    state.lastRoute = finalRoute;
    state.lastResult = results.at(-1) || null;
    await finishRun(run, finalStatus, parts.length > 1 ? "multi-step" : finalRoute, {
      source,
      stepCount: results.length,
      routes: results.map((item) => item.route),
      results: results.map((item) => ({ route: item.route, ok: item.ok, waitingConfirmation: Boolean(item.waitingConfirmation) }))
    });
    await window.ULTRON_TELEMETRY?.push?.({
      event: "orchestration-complete",
      orchestration: {
        runId: run.runId,
        status: finalStatus,
        route: parts.length > 1 ? "multi-step" : finalRoute,
        steps: results.length
      }
    });
    log(`FINAL // ${finalStatus.toUpperCase()} // ${parts.length > 1 ? "MULTI-STEP" : (finalRoute || "CORE")}.`, finalStatus === "failed");
    return { ok: finalStatus !== "failed", status: finalStatus, runId: run.runId, results };
  } catch (error) {
    state.failed += 1;
    state.lastResult = { error: error.message };
    await recordStep(run, "fatal", finalRoute || "orchestrator", "failed", { error: error.message });
    await finishRun(run, "failed", finalRoute || "orchestrator", { error: error.message });
    log(`FALHA // ${error.message}`, true);
    return { ok: false, status: "failed", runId: run.runId, error };
  } finally {
    state.busy = false;
    state.activeRunId = null;
    const mode = document.getElementById("system-mode");
    if (mode && mode.textContent === "ORCHESTRATING") mode.textContent = "STANDBY";
  }
}

function enqueue(message, source = "terminal") {
  queue = queue
    .catch(() => null)
    .then(() => executeMessage(message, source));
  return queue;
}

function intercept(event, source = "terminal") {
  const command = String(input?.value || "").trim();
  if (!command) return false;
  event?.preventDefault?.();
  event?.stopImmediatePropagation?.();
  if (input) input.value = "";
  enqueue(command, source);
  return true;
}

async function refreshUnifiedState() {
  try {
    const result = await post("/api/orchestrator/state", {}, { silent: true });
    if (result) state.lastUnifiedState = result;
    return result;
  } catch {
    return null;
  }
}

async function safeSelfHeal(alert) {
  const code = String(alert?.code || "");
  if (!code) return;
  const previous = proactiveCooldown.get(code) || 0;
  if (Date.now() - previous < 60_000) return;
  proactiveCooldown.set(code, Date.now());

  let attempted = false;
  if (code === "memory-degraded") {
    attempted = true;
    await window.ULTRON_MEMORY?.refreshMemoryHealth?.();
  } else if (code === "bridge-degraded") {
    attempted = true;
    await window.ULTRON_DEVICES?.refreshBridgeState?.();
  } else if (code === "browser-offline") {
    // Não há ação segura capaz de restaurar a rede; apenas manter o diagnóstico.
    attempted = false;
  }

  if (attempted) {
    state.proactiveRecoveries += 1;
    log(`SELF-HEAL // ${code} // revalidação automática executada.`);
    await window.ULTRON_TELEMETRY?.push?.({ event: "orchestrator-self-heal", code });
  }
}

function injectActivityButton() {
  const actions = document.querySelector(".quick-actions");
  if (!actions || document.getElementById("btn-orchestrator-activity")) return;
  const button = document.createElement("button");
  button.id = "btn-orchestrator-activity";
  button.textContent = "ATIVIDADE";
  button.addEventListener("click", () => enqueue("mostrar histórico do Ultron", "quick-action"));
  actions.appendChild(button);
}

sendButton?.addEventListener("click", (event) => intercept(event, "terminal"), true);
input?.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" || event.shiftKey) return;
  intercept(event, "terminal");
}, true);

window.addEventListener("ultron:proactive-alert", (event) => safeSelfHeal(event.detail || {}));
window.addEventListener("online", () => {
  window.ULTRON_MEMORY?.refreshMemoryHealth?.();
  window.ULTRON_DEVICES?.refreshBridgeState?.();
  refreshUnifiedState();
});
window.addEventListener("ultron:voice-command", (event) => {
  const command = String(event?.detail?.command || event?.detail?.text || "").trim();
  if (command) enqueue(command, "voice-event");
});

window.ULTRON_ORCHESTRATOR = {
  version: "4.27.0",
  execute: enqueue,
  history: showHistory,
  refreshState: refreshUnifiedState,
  get state() { return { ...state }; }
};

injectActivityButton();
setTimeout(refreshUnifiedState, 3500);
setInterval(refreshUnifiedState, 30000);
log("TOTAL INTEGRATION CORE v4.27.0 // READY.");
