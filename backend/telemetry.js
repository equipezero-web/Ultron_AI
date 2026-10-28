let telemetrySchemaReady = false;
let telemetrySchemaError = null;

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS telemetry_snapshots (
    id TEXT PRIMARY KEY,
    operator_id TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'web',
    payload_json TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_telemetry_operator_created
    ON telemetry_snapshots(operator_id, created_at DESC)`,
  `CREATE TABLE IF NOT EXISTS proactive_alerts (
    id TEXT PRIMARY KEY,
    operator_id TEXT NOT NULL,
    code TEXT NOT NULL,
    severity TEXT NOT NULL,
    message TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_proactive_alerts_operator_created
    ON proactive_alerts(operator_id, created_at DESC)`
];

function compactError(error) {
  return String(error?.message || error || "erro desconhecido")
    .replace(/\s+/g, " ")
    .slice(0, 220);
}

function hasDb(env) {
  return Boolean(env?.ULTRON_DB && typeof env.ULTRON_DB.prepare === "function");
}

async function ensureSchema(env) {
  if (!hasDb(env)) return false;
  if (telemetrySchemaReady) return true;

  telemetrySchemaError = null;
  for (let i = 0; i < SCHEMA.length; i += 1) {
    try {
      await env.ULTRON_DB.prepare(SCHEMA[i]).run();
    } catch (error) {
      telemetrySchemaError = `Etapa ${i + 1}/${SCHEMA.length}: ${compactError(error)}`;
      console.error("[ULTRON TELEMETRY] schema:", telemetrySchemaError);
      return false;
    }
  }

  telemetrySchemaReady = true;
  return true;
}

function safeSnapshot(value) {
  const snapshot = value && typeof value === "object" ? value : {};
  const raw = JSON.stringify(snapshot);
  if (raw.length > 24000) {
    throw new Error("Snapshot de telemetria excede o limite permitido.");
  }
  return snapshot;
}

function evaluateAlerts(snapshot) {
  const alerts = [];
  const push = (code, severity, message) => alerts.push({ code, severity, message });

  if (snapshot?.connection?.online === false) {
    push("browser-offline", "warning", "A conexão do navegador ficou offline.");
  }

  const memoryState = String(snapshot?.modules?.memory || "").toUpperCase();
  if (["ERROR", "BACKEND OFF", "INACTIVE", "WRITE ERROR"].includes(memoryState)) {
    push("memory-degraded", "warning", `A memória do Ultron está degradada (${memoryState}).`);
  }

  const remoteMicState = String(snapshot?.microphone?.remoteState || "").toLowerCase();
  if (remoteMicState === "blocked") {
    push("remote-mic-blocked", "warning", "O microfone remoto do celular está bloqueado.");
  }

  const voiceState = String(snapshot?.modules?.voice || "").toUpperCase();
  if (["ERROR", "OFFLINE", "UNAVAILABLE"].includes(voiceState)) {
    push("voice-degraded", "info", `A saída de voz principal está indisponível (${voiceState}).`);
  }

  const bridgeState = String(snapshot?.modules?.bridge || "").toUpperCase();
  if (["ERROR", "OFFLINE"].includes(bridgeState)) {
    push("bridge-degraded", "warning", `O Device Bridge está indisponível (${bridgeState}).`);
  }

  return alerts;
}

async function shouldEmitAlert(env, operatorId, code, cooldownMinutes = 10) {
  const row = await env.ULTRON_DB.prepare(
    `SELECT created_at FROM proactive_alerts
     WHERE operator_id = ? AND code = ?
     ORDER BY created_at DESC LIMIT 1`
  ).bind(operatorId, code).first();

  if (!row?.created_at) return true;
  const previous = Date.parse(`${row.created_at}Z`) || Date.parse(row.created_at) || 0;
  return Date.now() - previous >= cooldownMinutes * 60 * 1000;
}

export async function telemetryHealth(env) {
  if (!hasDb(env)) {
    return { configured: false, ready: false, engine: "D1" };
  }
  const ready = await ensureSchema(env);
  return {
    configured: true,
    ready,
    engine: "D1",
    error: ready ? null : telemetrySchemaError
  };
}

export async function ingestTelemetry(env, { operatorId, source = "web", snapshot } = {}) {
  if (!operatorId) return { ok: false, error: "Identidade do operador ausente." };
  if (!(await ensureSchema(env))) {
    return { ok: false, error: telemetrySchemaError || "Telemetria indisponível." };
  }

  let clean;
  try {
    clean = safeSnapshot(snapshot);
  } catch (error) {
    return { ok: false, error: compactError(error) };
  }

  const id = crypto.randomUUID();
  const payloadJson = JSON.stringify(clean);
  const candidateAlerts = evaluateAlerts(clean);
  const emittedAlerts = [];

  try {
    await env.ULTRON_DB.prepare(
      `INSERT INTO telemetry_snapshots (id, operator_id, source, payload_json, created_at)
       VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`
    ).bind(id, operatorId, String(source || "web").slice(0, 30), payloadJson).run();

    for (const alert of candidateAlerts) {
      if (!(await shouldEmitAlert(env, operatorId, alert.code))) continue;
      await env.ULTRON_DB.prepare(
        `INSERT INTO proactive_alerts (id, operator_id, code, severity, message, created_at)
         VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`
      ).bind(
        crypto.randomUUID(),
        operatorId,
        alert.code,
        alert.severity,
        alert.message
      ).run();
      emittedAlerts.push(alert);
    }

    // Mantém o banco enxuto por operador.
    await env.ULTRON_DB.prepare(
      `DELETE FROM telemetry_snapshots
       WHERE operator_id = ? AND id NOT IN (
         SELECT id FROM telemetry_snapshots
         WHERE operator_id = ?
         ORDER BY created_at DESC LIMIT 240
       )`
    ).bind(operatorId, operatorId).run();

    return {
      ok: true,
      telemetryId: id,
      alerts: emittedAlerts,
      receivedAt: new Date().toISOString()
    };
  } catch (error) {
    return { ok: false, error: compactError(error) };
  }
}

export async function getLatestTelemetry(env, operatorId) {
  if (!operatorId || !(await ensureSchema(env))) return null;
  const row = await env.ULTRON_DB.prepare(
    `SELECT payload_json AS payloadJson, source, created_at AS createdAt
     FROM telemetry_snapshots
     WHERE operator_id = ?
     ORDER BY created_at DESC LIMIT 1`
  ).bind(operatorId).first();

  if (!row) return null;
  let snapshot = {};
  try { snapshot = JSON.parse(row.payloadJson || "{}"); } catch {}
  return { snapshot, source: row.source, createdAt: row.createdAt };
}
