import { ensureBridgeSchema } from "./device-bridge.js";
import { enqueueControlCommand, validateControlCommand } from "./device-control-v2.js";

let schemaReady = false;

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS device_automations (
    id TEXT PRIMARY KEY,
    operator_id TEXT NOT NULL,
    name TEXT NOT NULL,
    device_id TEXT,
    device_type TEXT,
    command TEXT NOT NULL,
    payload_json TEXT NOT NULL DEFAULT '{}',
    schedule_kind TEXT NOT NULL,
    schedule_json TEXT NOT NULL DEFAULT '{}',
    enabled INTEGER NOT NULL DEFAULT 1,
    next_run_at TEXT,
    last_run_at TEXT,
    last_status TEXT,
    last_command_id TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_device_automations_due
    ON device_automations(enabled, next_run_at)`,
  `CREATE INDEX IF NOT EXISTS idx_device_automations_operator
    ON device_automations(operator_id, created_at DESC)`,
  `CREATE TABLE IF NOT EXISTS automation_runs (
    id TEXT PRIMARY KEY,
    automation_id TEXT NOT NULL,
    operator_id TEXT NOT NULL,
    command_id TEXT,
    status TEXT NOT NULL,
    detail_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (automation_id) REFERENCES device_automations(id) ON DELETE CASCADE
  )`
];

function safeJson(value, fallback = {}) {
  try { return JSON.stringify(value ?? fallback); } catch { return JSON.stringify(fallback); }
}

async function ensureSchema(env) {
  if (schemaReady) return true;
  if (!(await ensureBridgeSchema(env))) return false;
  for (const statement of SCHEMA) await env.ULTRON_DB.prepare(statement).run();
  schemaReady = true;
  return true;
}

function parseJson(value, fallback = {}) {
  try { return JSON.parse(value || JSON.stringify(fallback)); } catch { return fallback; }
}

function iso(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function computeInitialNextRun(kind, schedule = {}) {
  const now = new Date();
  if (kind === "once") return iso(schedule.runAt);
  if (kind === "interval") {
    const minutes = Math.max(1, Math.min(43200, Number(schedule.intervalMinutes || 1)));
    return new Date(now.getTime() + minutes * 60000).toISOString();
  }
  if (kind === "daily") {
    const match = String(schedule.time || "").match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return null;
    const hour = Math.max(0, Math.min(23, Number(match[1])));
    const minute = Math.max(0, Math.min(59, Number(match[2])));
    const offsetMinutes = Number(schedule.timezoneOffsetMinutes || 0);
    const localNow = new Date(now.getTime() - offsetMinutes * 60000);
    const localTarget = new Date(localNow);
    localTarget.setUTCHours(hour, minute, 0, 0);
    if (localTarget.getTime() <= localNow.getTime()) localTarget.setUTCDate(localTarget.getUTCDate() + 1);
    return new Date(localTarget.getTime() + offsetMinutes * 60000).toISOString();
  }
  return null;
}

function computeNextAfterRun(kind, schedule = {}, previousNext = null) {
  if (kind === "once") return null;
  if (kind === "interval") {
    const minutes = Math.max(1, Math.min(43200, Number(schedule.intervalMinutes || 1)));
    const base = previousNext ? new Date(previousNext) : new Date();
    let next = new Date(base.getTime() + minutes * 60000);
    const now = Date.now();
    while (next.getTime() <= now) next = new Date(next.getTime() + minutes * 60000);
    return next.toISOString();
  }
  if (kind === "daily") return computeInitialNextRun("daily", schedule);
  return null;
}

export async function createAutomation(env, {
  operatorId,
  name = "Automação Ultron",
  deviceId = "",
  deviceType = "",
  command,
  payload = {},
  scheduleKind,
  schedule = {},
  enabled = true
} = {}) {
  if (!operatorId || !(await ensureSchema(env))) return { ok: false, error: "Automação indisponível." };
  const validation = validateControlCommand(command, payload);
  if (!validation.ok) return validation;
  const kind = ["once", "interval", "daily"].includes(String(scheduleKind)) ? String(scheduleKind) : "";
  if (!kind) return { ok: false, error: "Tipo de agendamento inválido." };
  const nextRunAt = computeInitialNextRun(kind, schedule);
  if (!nextRunAt) return { ok: false, error: "Horário da automação inválido." };
  const id = crypto.randomUUID();
  await env.ULTRON_DB.prepare(
    `INSERT INTO device_automations
      (id, operator_id, name, device_id, device_type, command, payload_json,
       schedule_kind, schedule_json, enabled, next_run_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
  ).bind(
    id,
    operatorId,
    String(name || "Automação Ultron").slice(0, 120),
    deviceId || null,
    deviceType || null,
    validation.command,
    safeJson(payload),
    kind,
    safeJson(schedule),
    enabled ? 1 : 0,
    nextRunAt
  ).run();
  return { ok: true, id, nextRunAt, enabled: Boolean(enabled), scheduleKind: kind };
}

export async function listAutomations(env, operatorId) {
  if (!operatorId || !(await ensureSchema(env))) return [];
  const rows = await env.ULTRON_DB.prepare(
    `SELECT id, name, device_id AS deviceId, device_type AS deviceType, command,
            payload_json AS payloadJson, schedule_kind AS scheduleKind,
            schedule_json AS scheduleJson, enabled, next_run_at AS nextRunAt,
            last_run_at AS lastRunAt, last_status AS lastStatus,
            last_command_id AS lastCommandId, created_at AS createdAt
       FROM device_automations
      WHERE operator_id = ?
      ORDER BY created_at DESC`
  ).bind(operatorId).all();
  return (rows?.results || []).map((row) => ({
    id: row.id,
    name: row.name,
    deviceId: row.deviceId,
    deviceType: row.deviceType,
    command: row.command,
    payload: parseJson(row.payloadJson),
    scheduleKind: row.scheduleKind,
    schedule: parseJson(row.scheduleJson),
    enabled: Boolean(row.enabled),
    nextRunAt: row.nextRunAt,
    lastRunAt: row.lastRunAt,
    lastStatus: row.lastStatus,
    lastCommandId: row.lastCommandId,
    createdAt: row.createdAt
  }));
}

export async function setAutomationEnabled(env, operatorId, id, enabled) {
  if (!operatorId || !id || !(await ensureSchema(env))) return { ok: false, error: "Automação inválida." };
  const result = await env.ULTRON_DB.prepare(
    `UPDATE device_automations
        SET enabled = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND operator_id = ?`
  ).bind(enabled ? 1 : 0, id, operatorId).run();
  return { ok: Boolean(result?.meta?.changes), enabled: Boolean(enabled) };
}

export async function deleteAutomation(env, operatorId, id) {
  if (!operatorId || !id || !(await ensureSchema(env))) return { ok: false, error: "Automação inválida." };
  const result = await env.ULTRON_DB.prepare(
    `DELETE FROM device_automations WHERE id = ? AND operator_id = ?`
  ).bind(id, operatorId).run();
  return { ok: Boolean(result?.meta?.changes) };
}

async function dispatchAutomation(env, row, { nextRunAt = undefined, disableAfterRun = false } = {}) {
  const payload = parseJson(row.payload_json);
  const result = await enqueueControlCommand(env, {
    operatorId: row.operator_id,
    deviceId: row.device_id || "",
    deviceType: row.device_type || "",
    command: row.command,
    payload
  });
  const runId = crypto.randomUUID();
  await env.ULTRON_DB.prepare(
    `INSERT INTO automation_runs
      (id, automation_id, operator_id, command_id, status, detail_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`
  ).bind(runId, row.id, row.operator_id, result?.commandId || null, result?.ok ? "queued" : "failed", safeJson(result)).run();

  if (nextRunAt !== undefined) {
    await env.ULTRON_DB.prepare(
      `UPDATE device_automations
          SET last_run_at = CURRENT_TIMESTAMP,
              last_status = ?,
              last_command_id = ?,
              next_run_at = ?,
              enabled = CASE WHEN ? = 1 THEN 0 ELSE enabled END,
              updated_at = CURRENT_TIMESTAMP
        WHERE id = ?`
    ).bind(result?.ok ? "queued" : "failed", result?.commandId || null, nextRunAt, disableAfterRun ? 1 : 0, row.id).run();
  } else {
    await env.ULTRON_DB.prepare(
      `UPDATE device_automations
          SET last_run_at = CURRENT_TIMESTAMP,
              last_status = ?,
              last_command_id = ?,
              updated_at = CURRENT_TIMESTAMP
        WHERE id = ?`
    ).bind(result?.ok ? "queued" : "failed", result?.commandId || null, row.id).run();
  }

  return { automationId: row.id, runId, ...result, nextRunAt: nextRunAt === undefined ? row.next_run_at : nextRunAt };
}

async function claimDueAutomation(env, row) {
  const schedule = parseJson(row.schedule_json);
  const nextRunAt = computeNextAfterRun(row.schedule_kind, schedule, row.next_run_at);
  const disableAfterRun = row.schedule_kind === "once";

  const claimed = await env.ULTRON_DB.prepare(
    `UPDATE device_automations
        SET next_run_at = ?,
            enabled = CASE WHEN ? = 1 THEN 0 ELSE enabled END,
            last_status = 'dispatching',
            updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
        AND operator_id = ?
        AND enabled = 1
        AND next_run_at = ?
        AND datetime(next_run_at) <= CURRENT_TIMESTAMP`
  ).bind(nextRunAt, disableAfterRun ? 1 : 0, row.id, row.operator_id, row.next_run_at).run();

  if (!claimed?.meta?.changes) return null;
  return { nextRunAt, disableAfterRun };
}

export async function runAutomationNow(env, operatorId, id) {
  if (!operatorId || !id || !(await ensureSchema(env))) return { ok: false, error: "Automação inválida." };
  const row = await env.ULTRON_DB.prepare(
    `SELECT * FROM device_automations WHERE id = ? AND operator_id = ? LIMIT 1`
  ).bind(id, operatorId).first();
  if (!row) return { ok: false, error: "Automação não encontrada." };
  return dispatchAutomation(env, row);
}

export async function processDueAutomations(env, { limit = 30 } = {}) {
  if (!(await ensureSchema(env))) return { ok: false, processed: 0 };
  const rows = await env.ULTRON_DB.prepare(
    `SELECT * FROM device_automations
      WHERE enabled = 1
        AND next_run_at IS NOT NULL
        AND datetime(next_run_at) <= CURRENT_TIMESTAMP
      ORDER BY next_run_at ASC
      LIMIT ?`
  ).bind(Math.max(1, Math.min(100, Number(limit || 30)))).all();

  const results = [];
  for (const row of rows?.results || []) {
    try {
      const claim = await claimDueAutomation(env, row);
      if (!claim) continue;
      results.push(await dispatchAutomation(env, row, claim));
    } catch (error) {
      results.push({ automationId: row.id, ok: false, error: error?.message || String(error) });
    }
  }
  return { ok: true, processed: results.length, results };
}

export function automationHealth() {
  return {
    ready: true,
    version: "1.1",
    persistent: true,
    scheduler: "cloudflare-cron-1m",
    schedules: ["once", "interval", "daily"],
    runNow: true,
    duplicateDispatchGuard: true
  };
}
