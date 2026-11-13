import { ensureBridgeSchema, listDevices } from "./device-bridge.js";

export const CONTROL_COMMANDS = new Set([
  "device.status",
  "notification.push",
  "app.open",
  "tv.status",
  "tv.power.on",
  "tv.power.off",
  "tv.power.toggle",
  "tv.volume.get",
  "tv.volume.set",
  "tv.volume.up",
  "tv.volume.down",
  "tv.mute.toggle",
  "tv.media.play",
  "tv.media.pause",
  "tv.media.stop",
  "tv.media.seek",
  "tv.channel.up",
  "tv.channel.down",
  "tv.input",
  "tv.inputs.list",
  "tv.launch",
  "tv.apps.list",
  "tv.toast",
  "tv.cast",
  "desktop.status",
  "desktop.app.open",
  "desktop.open.url",
  "desktop.volume.up",
  "desktop.volume.down",
  "desktop.volume.mute",
  "desktop.media.play_pause",
  "desktop.media.next",
  "desktop.media.previous",
  "desktop.lock",
  "desktop.sleep",
  "desktop.restart",
  "desktop.shutdown"
]);

const SENSITIVE_COMMANDS = new Set([
  "desktop.sleep",
  "desktop.restart",
  "desktop.shutdown"
]);

const ONLINE_MAX_AGE_MS = 45_000;

function safeJson(value, fallback = {}) {
  try {
    const text = JSON.stringify(value ?? fallback);
    return text.length <= 131072 ? text : JSON.stringify(fallback);
  } catch {
    return JSON.stringify(fallback);
  }
}

function onlineAge(device) {
  const at = Date.parse(/Z$|[+-]\d\d:?\d\d$/.test(String(device?.lastSeenAt || "")) ? device.lastSeenAt : String(device?.lastSeenAt || "").replace(" ", "T") + "Z") || 0;
  return at ? Date.now() - at : Number.POSITIVE_INFINITY;
}

function expectedType(command) {
  if (String(command).startsWith("desktop.")) return "desktop";
  if (String(command).startsWith("tv.")) return "mobile";
  return "mobile";
}

export function isCompatibleDeviceForCommand(command, deviceType) {
  return String(deviceType || "").trim().toLowerCase() === expectedType(command);
}

function scoreDevice(device, type) {
  let score = 0;
  if (device?.status === "active") score += 100;
  if (device?.deviceType === type) score += 80;
  if (onlineAge(device) <= ONLINE_MAX_AGE_MS) score += 60;
  if (Array.isArray(device?.capabilities)) {
    if (type === "desktop" && device.capabilities.some((item) => String(item).startsWith("desktop."))) score += 30;
    if (type === "mobile" && device.capabilities.some((item) => String(item).startsWith("tv."))) score += 20;
  }
  return score;
}

export function validateControlCommand(command, payload = {}) {
  const normalized = String(command || "").trim();
  if (!CONTROL_COMMANDS.has(normalized)) {
    return { ok: false, error: "Comando não permitido pelo Device Control v2." };
  }
  if (SENSITIVE_COMMANDS.has(normalized) && payload?.confirm !== true) {
    return {
      ok: false,
      needsConfirmation: true,
      error: "Este comando exige confirmação explícita do operador."
    };
  }
  return { ok: true, command: normalized };
}

export async function resolveTargetDevice(env, operatorId, { deviceId = "", deviceType = "", command = "" } = {}) {
  const devices = await listDevices(env, operatorId);
  const requestedType = String(deviceType || expectedType(command)).trim().toLowerCase();
  // Never allow deviceType or an explicit device ID to override the command's
  // required bridge type (TV commands are executed by the Android bridge).
  if (!isCompatibleDeviceForCommand(command, requestedType)) return null;

  if (deviceId) {
    const exact = devices.find((device) => device.id === deviceId && isCompatibleDeviceForCommand(command, device.deviceType) && device.status === "active" && onlineAge(device) <= ONLINE_MAX_AGE_MS);
    if (!exact) return null;
    return exact;
  }

  return [...devices]
    .filter((device) => device.status === "active" && onlineAge(device) <= ONLINE_MAX_AGE_MS)
    .filter((device) => device.deviceType === requestedType && isCompatibleDeviceForCommand(command, device.deviceType))
    .sort((a, b) => scoreDevice(b, requestedType) - scoreDevice(a, requestedType) || onlineAge(a) - onlineAge(b))[0] || null;
}

export async function enqueueControlCommand(env, {
  operatorId,
  deviceId = "",
  deviceType = "",
  command,
  payload = {}
} = {}) {
  if (!operatorId || !(await ensureBridgeSchema(env))) {
    return { ok: false, error: "Device Bridge indisponível ou identidade ausente." };
  }

  const validation = validateControlCommand(command, payload);
  if (!validation.ok) return validation;

  const device = await resolveTargetDevice(env, operatorId, {
    deviceId,
    deviceType,
    command: validation.command
  });
  if (!device) {
    return {
      ok: false,
      error: expectedType(validation.command) === "desktop"
        ? "Desktop Bridge não encontrado. Inicie o Ultron Local Core e pareie este computador."
        : "Mobile Bridge não encontrado para executar este comando."
    };
  }

  // Do not queue commands for stale/offline devices. TV commands require an online mobile bridge.
  const commandId = crypto.randomUUID();
  await env.ULTRON_DB.prepare(
    `INSERT INTO device_commands
      (id, device_id, operator_id, command, payload_json, status, created_at)
     VALUES (?, ?, ?, ?, ?, 'pending', CURRENT_TIMESTAMP)`
  )
    .bind(commandId, device.id, operatorId, validation.command, safeJson(payload))
    .run();

  return {
    ok: true,
    commandId,
    status: "pending",
    device: {
      id: device.id,
      deviceType: device.deviceType,
      deviceName: device.deviceName,
      online: onlineAge(device) <= ONLINE_MAX_AGE_MS
    },
    command: validation.command,
    expiresInSeconds: 300
  };
}

export async function getCommandStatus(env, operatorId, commandId) {
  if (!operatorId || !commandId || !(await ensureBridgeSchema(env))) {
    return { ok: false, error: "Identidade ou comando inválido." };
  }

  const row = await env.ULTRON_DB.prepare(
    `SELECT c.id, c.command, c.status, c.result_json AS resultJson,
            c.created_at AS createdAt, c.claimed_at AS claimedAt,
            c.completed_at AS completedAt,
            d.device_type AS deviceType, d.device_name AS deviceName
       FROM device_commands c
       JOIN devices d ON d.id = c.device_id
      WHERE c.id = ? AND c.operator_id = ?
      LIMIT 1`
  ).bind(commandId, operatorId).first();

  if (!row) return { ok: false, error: "Comando não encontrado." };
  let result = null;
  try { result = row.resultJson ? JSON.parse(row.resultJson) : null; } catch { result = null; }

  return {
    ok: true,
    command: {
      id: row.id,
      command: row.command,
      status: row.status,
      result,
      createdAt: row.createdAt,
      claimedAt: row.claimedAt,
      completedAt: row.completedAt,
      deviceType: row.deviceType,
      deviceName: row.deviceName
    }
  };
}

// Cancel only commands which have not been claimed by a device. Once claimed
// the remote software/hardware may already be acting; never promise reversal.
export async function cancelQueuedControlCommand(env, operatorId, commandId) {
  if (!operatorId || !/^[0-9a-f-]{36}$/i.test(String(commandId || "")) || !(await ensureBridgeSchema(env))) {
    return { ok: false, error: "Identidade ou comando inválido." };
  }
  const update = await env.ULTRON_DB.prepare(
    `UPDATE device_commands
        SET status = 'cancelled', completed_at = CURRENT_TIMESTAMP
      WHERE id = ? AND operator_id = ? AND status = 'pending'`
  ).bind(commandId, operatorId).run();
  if (update?.meta?.changes) return { ok: true, status: "cancelled", cancelledBeforeDelivery: true };
  const current = await env.ULTRON_DB.prepare(
    `SELECT status FROM device_commands WHERE id = ? AND operator_id = ? LIMIT 1`
  ).bind(commandId, operatorId).first();
  if (!current) return {ok: false, status: "not-found", error: "Comando não encontrado para este operador."};
  if (current.status === "cancelled") return {ok: true, status: "cancelled", cancelledBeforeDelivery: true};
  return {
    ok: false,
    status: current.status,
    cancelledBeforeDelivery: false,
    error: "O dispositivo já recebeu ou concluiu o comando; não é possível garantir a interrupção."
  };
}

export async function commandHistory(env, operatorId, limit = 20) {
  if (!operatorId || !(await ensureBridgeSchema(env))) return [];
  const safeLimit = Math.max(1, Math.min(50, Number(limit || 20)));
  const rows = await env.ULTRON_DB.prepare(
    `SELECT c.id, c.command, c.status, c.created_at AS createdAt,
            c.completed_at AS completedAt,
            d.device_type AS deviceType, d.device_name AS deviceName
       FROM device_commands c
       JOIN devices d ON d.id = c.device_id
      WHERE c.operator_id = ?
      ORDER BY c.created_at DESC
      LIMIT ?`
  ).bind(operatorId, safeLimit).all();
  return rows?.results || [];
}

export function deviceControlHealth() {
  return {
    ready: true,
    version: "2.0",
    tv: true,
    mobile: true,
    desktop: true,
    commandStatus: true,
    sensitiveConfirmation: true,
    commandCount: CONTROL_COMMANDS.size
  };
}
