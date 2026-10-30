import { ensureBridgeSchema } from "./device-bridge.js";

let eventSchemaReady = false;

const ALLOWED_EVENT_TYPES = new Set([
  "speech.transcript",
  "microphone.status",
  "camera.status",
  "camera.webrtc.answer",
  "camera.webrtc.ice"
]);

function safeJson(value, fallback = {}) {
  try {
    return JSON.stringify(value ?? fallback).slice(0, 12000);
  } catch {
    return JSON.stringify(fallback);
  }
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(String(value || ""))
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function ensureEventSchema(env) {
  if (eventSchemaReady) return true;
  if (!(await ensureBridgeSchema(env))) return false;

  await env.ULTRON_DB.prepare(
    `CREATE TABLE IF NOT EXISTS device_events (
      id TEXT PRIMARY KEY,
      device_id TEXT NOT NULL,
      operator_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      payload_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      consumed_at TEXT
    )`
  ).run();

  await env.ULTRON_DB.prepare(
    `CREATE INDEX IF NOT EXISTS idx_device_events_operator_pending
      ON device_events(operator_id, consumed_at, created_at)`
  ).run();

  eventSchemaReady = true;
  return true;
}

async function authenticateDevice(env, deviceId, deviceSecret) {
  const id = String(deviceId || "").trim();
  const secret = String(deviceSecret || "").trim();

  if (!id || secret.length < 32 || !(await ensureEventSchema(env))) {
    return null;
  }

  const row = await env.ULTRON_DB.prepare(
    `SELECT d.id,
            d.operator_id AS operatorId,
            d.device_type AS deviceType,
            d.device_name AS deviceName,
            c.auth_hash AS authHash
       FROM devices d
       JOIN device_credentials c ON c.device_id = d.id
      WHERE d.id = ? AND d.status = 'active'
      LIMIT 1`
  )
    .bind(id)
    .first();

  if (!row) return null;

  const suppliedHash = await sha256Hex(secret);
  return suppliedHash === row.authHash ? row : null;
}

function sanitizePayload(eventType, payload) {
  const source = payload && typeof payload === "object" ? payload : {};

  if (eventType === "speech.transcript") {
    const text = String(source.text || "").trim().slice(0, 1000);
    if (!text) return null;

    return {
      text,
      source: String(source.source || "android").slice(0, 40),
      confidence: Number.isFinite(Number(source.confidence))
        ? Math.max(0, Math.min(1, Number(source.confidence)))
        : null
    };
  }

  if (eventType === "microphone.status" || eventType === "camera.status") {
    return {
      state: String(source.state || "unknown").slice(0, 40),
      detail: String(source.detail || "").slice(0, 300),
      sessionId: String(source.sessionId || "").slice(0, 100)
    };
  }

  if (eventType === "camera.webrtc.answer") {
    const sdp = String(source.sdp || "").trim().slice(0, 10000);
    if (!sdp) return null;
    return {
      type: "answer",
      sdp,
      sessionId: String(source.sessionId || "").slice(0, 100)
    };
  }

  if (eventType === "camera.webrtc.ice") {
    const candidate = String(source.candidate || "").trim().slice(0, 2400);
    if (!candidate) return null;
    return {
      candidate,
      sdpMid: source.sdpMid == null ? null : String(source.sdpMid).slice(0, 120),
      sdpMLineIndex: Math.max(0, Math.min(64, Number(source.sdpMLineIndex) || 0)),
      sessionId: String(source.sessionId || "").slice(0, 100)
    };
  }

  return null;
}

export async function submitDeviceEvent(
  env,
  { deviceId, deviceSecret, eventType, payload = {} } = {}
) {
  const normalizedType = String(eventType || "").trim();

  if (!ALLOWED_EVENT_TYPES.has(normalizedType)) {
    return { ok: false, error: "Tipo de evento não autorizado." };
  }

  const device = await authenticateDevice(env, deviceId, deviceSecret);
  if (!device) {
    return { ok: false, error: "Credencial do dispositivo inválida." };
  }

  const sanitized = sanitizePayload(normalizedType, payload);
  if (!sanitized) {
    return { ok: false, error: "Payload de evento inválido." };
  }

  const eventId = crypto.randomUUID();

  await env.ULTRON_DB.prepare(
    `INSERT INTO device_events
      (id, device_id, operator_id, event_type, payload_json, created_at)
     VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`
  )
    .bind(
      eventId,
      device.id,
      device.operatorId,
      normalizedType,
      safeJson(sanitized)
    )
    .run();

  await env.ULTRON_DB.prepare(
    `UPDATE devices SET last_seen_at = CURRENT_TIMESTAMP WHERE id = ?`
  ).bind(device.id).run();

  await env.ULTRON_DB.prepare(
    `DELETE FROM device_events
      WHERE created_at < datetime('now', '-1 day')`
  ).run();

  return { ok: true, eventId };
}

async function pollEventsByChannel(env, { operatorId, limit = 20, channel = "microphone" } = {}) {
  if (!operatorId || !(await ensureEventSchema(env))) {
    return { ok: false, error: "Identidade do operador ausente ou bridge indisponível." };
  }

  const safeLimit = Math.max(1, Math.min(50, Number(limit) || 20));
  const cameraChannel = channel === "camera";
  const typeFilter = cameraChannel
    ? `e.event_type IN ('camera.status', 'camera.webrtc.answer', 'camera.webrtc.ice')`
    : `e.event_type IN ('speech.transcript', 'microphone.status')`;

  const result = await env.ULTRON_DB.prepare(
    `SELECT e.id,
            e.device_id AS deviceId,
            e.event_type AS eventType,
            e.payload_json AS payloadJson,
            e.created_at AS createdAt,
            d.device_name AS deviceName
       FROM device_events e
       LEFT JOIN devices d ON d.id = e.device_id
      WHERE e.operator_id = ?
        AND e.consumed_at IS NULL
        AND ${typeFilter}
      ORDER BY e.created_at ASC
      LIMIT ?`
  )
    .bind(operatorId, safeLimit)
    .all();

  const events = result?.results || [];

  if (events.length) {
    await env.ULTRON_DB.batch(
      events.map((item) =>
        env.ULTRON_DB.prepare(
          `UPDATE device_events
              SET consumed_at = CURRENT_TIMESTAMP
            WHERE id = ? AND consumed_at IS NULL`
        ).bind(item.id)
      )
    );
  }

  return {
    ok: true,
    channel: cameraChannel ? "camera" : "microphone",
    events: events.map((item) => ({
      id: item.id,
      deviceId: item.deviceId,
      deviceName: item.deviceName || "Mobile Bridge",
      eventType: item.eventType,
      payload: (() => {
        try {
          return JSON.parse(item.payloadJson || "{}");
        } catch {
          return {};
        }
      })(),
      createdAt: item.createdAt
    }))
  };
}

export async function pollOperatorEvents(
  env,
  { operatorId, limit = 20 } = {}
) {
  return pollEventsByChannel(env, { operatorId, limit, channel: "microphone" });
}

export async function pollOperatorCameraEvents(
  env,
  { operatorId, limit = 20 } = {}
) {
  return pollEventsByChannel(env, { operatorId, limit, channel: "camera" });
}
