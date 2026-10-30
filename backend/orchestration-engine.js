import { buildOperationalPlan } from "./planner.js";

let schemaReady = false;
let schemaError = null;

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS orchestration_runs (
    id TEXT PRIMARY KEY,
    operator_id TEXT NOT NULL,
    message TEXT NOT NULL,
    intent TEXT,
    route TEXT,
    status TEXT NOT NULL DEFAULT 'running',
    plan_json TEXT NOT NULL DEFAULT '{}',
    result_json TEXT,
    started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at TEXT,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_orchestration_runs_operator
    ON orchestration_runs(operator_id, started_at DESC)`,
  `CREATE TABLE IF NOT EXISTS orchestration_steps (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    operator_id TEXT NOT NULL,
    step_key TEXT NOT NULL,
    module TEXT NOT NULL,
    status TEXT NOT NULL,
    detail_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at TEXT,
    FOREIGN KEY (run_id) REFERENCES orchestration_runs(id) ON DELETE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS idx_orchestration_steps_run
    ON orchestration_steps(run_id, created_at ASC)`
];

function compactError(error) {
  return String(error?.message || error || "erro desconhecido")
    .replace(/\s+/g, " ")
    .slice(0, 300);
}

function hasDb(env) {
  return Boolean(env?.ULTRON_DB && typeof env.ULTRON_DB.prepare === "function");
}

function safeJson(value, fallback = {}) {
  try {
    const text = JSON.stringify(value ?? fallback);
    return text.length <= 48000 ? text : JSON.stringify(fallback);
  } catch {
    return JSON.stringify(fallback);
  }
}

function parseJson(value, fallback = {}) {
  try { return JSON.parse(value || JSON.stringify(fallback)); } catch { return fallback; }
}

export async function ensureOrchestrationSchema(env) {
  if (!hasDb(env)) return false;
  if (schemaReady) return true;
  schemaError = null;
  for (let i = 0; i < SCHEMA.length; i += 1) {
    try {
      await env.ULTRON_DB.prepare(SCHEMA[i]).run();
    } catch (error) {
      schemaError = `Etapa ${i + 1}/${SCHEMA.length}: ${compactError(error)}`;
      console.error("[ULTRON ORCHESTRATOR] schema:", schemaError);
      return false;
    }
  }
  schemaReady = true;
  return true;
}

export async function startOrchestration(env, {
  operatorId,
  message,
  telemetry = {}
} = {}) {
  if (!operatorId || !(await ensureOrchestrationSchema(env))) {
    return { ok: false, error: schemaError || "Orquestrador indisponível." };
  }
  const cleanMessage = String(message || "").replace(/\s+/g, " ").trim().slice(0, 4000);
  if (!cleanMessage) return { ok: false, error: "Comando vazio." };

  const plan = buildOperationalPlan(cleanMessage, telemetry || {});
  const id = crypto.randomUUID();
  await env.ULTRON_DB.prepare(
    `INSERT INTO orchestration_runs
      (id, operator_id, message, intent, status, plan_json, started_at, updated_at)
     VALUES (?, ?, ?, ?, 'running', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
  ).bind(id, operatorId, cleanMessage, plan?.intent || "general", safeJson(plan)).run();

  return {
    ok: true,
    runId: id,
    status: "running",
    plan,
    startedAt: new Date().toISOString()
  };
}

export async function recordOrchestrationStep(env, {
  operatorId,
  runId,
  stepKey = "step",
  module = "core",
  status = "running",
  detail = {}
} = {}) {
  if (!operatorId || !runId || !(await ensureOrchestrationSchema(env))) {
    return { ok: false, error: "Execução de orquestração inválida." };
  }
  const allowed = new Set(["queued", "running", "completed", "failed", "skipped", "waiting-confirmation"]);
  const cleanStatus = allowed.has(String(status)) ? String(status) : "running";
  const id = crypto.randomUUID();
  await env.ULTRON_DB.batch([
    env.ULTRON_DB.prepare(
      `INSERT INTO orchestration_steps
        (id, run_id, operator_id, step_key, module, status, detail_json, created_at, completed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP,
         CASE WHEN ? IN ('completed','failed','skipped','waiting-confirmation') THEN CURRENT_TIMESTAMP ELSE NULL END)`
    ).bind(
      id,
      runId,
      operatorId,
      String(stepKey || "step").slice(0, 80),
      String(module || "core").slice(0, 80),
      cleanStatus,
      safeJson(detail),
      cleanStatus
    ),
    env.ULTRON_DB.prepare(
      `UPDATE orchestration_runs
          SET route = COALESCE(route, ?), updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND operator_id = ?`
    ).bind(String(module || "core").slice(0, 80), runId, operatorId)
  ]);
  return { ok: true, stepId: id, status: cleanStatus };
}

export async function finishOrchestration(env, {
  operatorId,
  runId,
  status = "completed",
  route = null,
  result = {}
} = {}) {
  if (!operatorId || !runId || !(await ensureOrchestrationSchema(env))) {
    return { ok: false, error: "Execução de orquestração inválida." };
  }
  const finalStatus = ["completed", "failed", "waiting-confirmation", "cancelled"].includes(String(status))
    ? String(status)
    : "completed";
  const update = await env.ULTRON_DB.prepare(
    `UPDATE orchestration_runs
        SET status = ?, route = COALESCE(?, route), result_json = ?,
            completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND operator_id = ?`
  ).bind(finalStatus, route, safeJson(result), runId, operatorId).run();
  return { ok: Boolean(update?.meta?.changes), runId, status: finalStatus };
}

export async function recentOrchestrations(env, operatorId, limit = 12) {
  if (!operatorId || !(await ensureOrchestrationSchema(env))) return [];
  const safeLimit = Math.max(1, Math.min(30, Number(limit || 12)));
  const rows = await env.ULTRON_DB.prepare(
    `SELECT id, message, intent, route, status, plan_json AS planJson,
            result_json AS resultJson, started_at AS startedAt,
            completed_at AS completedAt
       FROM orchestration_runs
      WHERE operator_id = ?
      ORDER BY started_at DESC
      LIMIT ?`
  ).bind(operatorId, safeLimit).all();

  return (rows?.results || []).map((row) => ({
    id: row.id,
    message: row.message,
    intent: row.intent,
    route: row.route,
    status: row.status,
    plan: parseJson(row.planJson),
    result: parseJson(row.resultJson, null),
    startedAt: row.startedAt,
    completedAt: row.completedAt
  }));
}

export async function orchestrationRunDetail(env, operatorId, runId) {
  if (!operatorId || !runId || !(await ensureOrchestrationSchema(env))) return null;
  const run = await env.ULTRON_DB.prepare(
    `SELECT id, message, intent, route, status, plan_json AS planJson,
            result_json AS resultJson, started_at AS startedAt, completed_at AS completedAt
       FROM orchestration_runs WHERE id = ? AND operator_id = ? LIMIT 1`
  ).bind(runId, operatorId).first();
  if (!run) return null;
  const steps = await env.ULTRON_DB.prepare(
    `SELECT step_key AS stepKey, module, status, detail_json AS detailJson,
            created_at AS createdAt, completed_at AS completedAt
       FROM orchestration_steps
      WHERE run_id = ? AND operator_id = ? ORDER BY created_at ASC`
  ).bind(runId, operatorId).all();
  return {
    id: run.id,
    message: run.message,
    intent: run.intent,
    route: run.route,
    status: run.status,
    plan: parseJson(run.planJson),
    result: parseJson(run.resultJson, null),
    startedAt: run.startedAt,
    completedAt: run.completedAt,
    steps: (steps?.results || []).map((item) => ({
      stepKey: item.stepKey,
      module: item.module,
      status: item.status,
      detail: parseJson(item.detailJson),
      createdAt: item.createdAt,
      completedAt: item.completedAt
    }))
  };
}

export function orchestrationHealth() {
  return {
    ready: true,
    version: "1.0",
    persistentRuns: true,
    persistentSteps: true,
    plannerIntegrated: true,
    resultVerification: true,
    multiStep: true,
    safetyPolicy: "observe-auto/active-confirm/destructive-block"
  };
}
