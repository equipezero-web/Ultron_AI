const PAIRING_TTL_MINUTES = 10;
const MAX_PENDING_COMMANDS = 12;
const MAX_BRIDGE_JSON_CHARS = 131072;

let bridgeSchemaReady = false;
let bridgeSchemaError = null;

const BRIDGE_SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS devices (
    id TEXT PRIMARY KEY,
    operator_id TEXT NOT NULL,
    device_type TEXT NOT NULL,
    device_name TEXT,
    public_key TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    last_seen_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_devices_operator
    ON devices(operator_id, created_at DESC)`,
  `CREATE TABLE IF NOT EXISTS pairing_sessions (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    operator_id TEXT NOT NULL,
    device_type TEXT NOT NULL,
    device_name TEXT,
    expires_at TEXT NOT NULL,
    claimed_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_pairing_sessions_code
    ON pairing_sessions(code, expires_at)`,
  `CREATE TABLE IF NOT EXISTS device_credentials (
    device_id TEXT PRIMARY KEY,
    auth_hash TEXT NOT NULL,
    platform TEXT,
    capabilities_json TEXT NOT NULL DEFAULT '[]',
    paired_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS device_commands (
    id TEXT PRIMARY KEY,
    device_id TEXT NOT NULL,
    operator_id TEXT NOT NULL,
    command TEXT NOT NULL,
    payload_json TEXT NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'pending',
    result_json TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    claimed_at TEXT,
    completed_at TEXT,
    FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS idx_device_commands_pending
    ON device_commands(device_id, status, created_at)`
];

const ALLOWED_COMMANDS = new Set([
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
  "tv.cast"
]);

function compactError(error) {
  return String(error?.message || error || "erro desconhecido")
    .replace(/\s+/g, " ")
    .slice(0, 220);
}

function hasDatabase(env) {
  return Boolean(env?.ULTRON_DB && typeof env.ULTRON_DB.prepare === "function");
}

function normalizeDeviceType(value) {
  const type = String(value || "").trim().toLowerCase();
  return ["mobile", "tv", "desktop", "other"].includes(type) ? type : "other";
}

function safeName(value, fallback = "Dispositivo Ultron") {
  const name = String(value || "").trim().slice(0, 80);
  return name || fallback;
}

function safeJson(value, fallback = {}, maxChars = MAX_BRIDGE_JSON_CHARS) {
  try {
    const json = JSON.stringify(value ?? fallback);
    if (json.length <= maxChars) return json;
    const fallbackJson = JSON.stringify(fallback);
    return fallbackJson.length <= maxChars ? fallbackJson : "{}";
  } catch {
    return JSON.stringify(fallback);
  }
}

function randomPairingCode() {
  const data = new Uint32Array(1);
  crypto.getRandomValues(data);
  return String(100000 + (data[0] % 900000));
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

export async function ensureBridgeSchema(env) {
  if (!hasDatabase(env)) return false;
  if (bridgeSchemaReady) return true;

  bridgeSchemaError = null;

  for (let index = 0; index < BRIDGE_SCHEMA_STATEMENTS.length; index += 1) {
    try {
      await env.ULTRON_DB.prepare(BRIDGE_SCHEMA_STATEMENTS[index]).run();
    } catch (error) {
      bridgeSchemaError = `Etapa ${index + 1}/${BRIDGE_SCHEMA_STATEMENTS.length}: ${compactError(error)}`;
      console.error("[ULTRON BRIDGE] Falha ao inicializar schema:", bridgeSchemaError);
      return false;
    }
  }

  bridgeSchemaReady = true;
  return true;
}

export async function bridgeHealth(env) {
  if (!hasDatabase(env)) {
    return { configured: false, ready: false, engine: "D1" };
  }

  const ready = await ensureBridgeSchema(env);
  return {
    configured: true,
    ready,
    engine: "D1",
    error: ready ? null : bridgeSchemaError
  };
}

export async function startPairing(env, { operatorId, deviceType, deviceName } = {}) {
  if (!operatorId || !(await ensureBridgeSchema(env))) {
    return { ok: false, error: "Bridge indisponível ou identidade ausente." };
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const id = crypto.randomUUID();
    const code = randomPairingCode();

    try {
      await env.ULTRON_DB.prepare(
        `INSERT INTO pairing_sessions
          (id, code, operator_id, device_type, device_name, expires_at, created_at)
         VALUES (?, ?, ?, ?, ?, datetime('now', ?), CURRENT_TIMESTAMP)`
      )
        .bind(
          id,
          code,
          operatorId,
          normalizeDeviceType(deviceType),
          safeName(deviceName, "Novo dispositivo"),
          `+${PAIRING_TTL_MINUTES} minutes`
        )
        .run();

      return {
        ok: true,
        pairingId: id,
        code,
        expiresInSeconds: PAIRING_TTL_MINUTES * 60
      };
    } catch (error) {
      if (attempt === 4) {
        return { ok: false, error: compactError(error) };
      }
    }
  }

  return { ok: false, error: "Não foi possível gerar código de pareamento." };
}

export async function claimPairing(
  env,
  { code, deviceName, deviceType, deviceSecret, capabilities = [], platform = "" } = {}
) {
  const normalizedCode = String(code || "").replace(/\D/g, "");
  const secret = String(deviceSecret || "").trim();

  if (!/^\d{6}$/.test(normalizedCode)) {
    return { ok: false, error: "Código de pareamento inválido." };
  }
  if (secret.length < 32) {
    return { ok: false, error: "Credencial do dispositivo inválida." };
  }
  if (!(await ensureBridgeSchema(env))) {
    return { ok: false, error: bridgeSchemaError || "Bridge indisponível." };
  }

  const pairing = await env.ULTRON_DB.prepare(
    `SELECT id, operator_id, device_type, device_name
       FROM pairing_sessions
      WHERE code = ?
        AND claimed_at IS NULL
        AND expires_at > CURRENT_TIMESTAMP
      LIMIT 1`
  )
    .bind(normalizedCode)
    .first();

  if (!pairing) {
    return { ok: false, error: "Código expirado, já utilizado ou inexistente." };
  }

  const deviceId = crypto.randomUUID();
  const authHash = await sha256Hex(secret);
  const finalType = normalizeDeviceType(deviceType || pairing.device_type);
  const finalName = safeName(deviceName || pairing.device_name);

  try {
    await env.ULTRON_DB.batch([
      env.ULTRON_DB.prepare(
        `INSERT INTO devices
          (id, operator_id, device_type, device_name, status, last_seen_at, created_at)
         VALUES (?, ?, ?, ?, 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
      ).bind(deviceId, pairing.operator_id, finalType, finalName),
      env.ULTRON_DB.prepare(
        `INSERT INTO device_credentials
          (device_id, auth_hash, platform, capabilities_json, paired_at)
         VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`
      ).bind(
        deviceId,
        authHash,
        String(platform || "").slice(0, 120),
        safeJson(Array.isArray(capabilities) ? capabilities.slice(0, 60) : [])
      ),
      env.ULTRON_DB.prepare(
        `UPDATE pairing_sessions
            SET claimed_at = CURRENT_TIMESTAMP
          WHERE id = ? AND claimed_at IS NULL`
      ).bind(pairing.id)
    ]);

    return {
      ok: true,
      deviceId,
      deviceType: finalType,
      deviceName: finalName
    };
  } catch (error) {
    return { ok: false, error: compactError(error) };
  }
}

export async function listDevices(env, operatorId) {
  if (!operatorId || !(await ensureBridgeSchema(env))) return [];

  const result = await env.ULTRON_DB.prepare(
    `SELECT d.id, d.device_type AS deviceType, d.device_name AS deviceName,
            d.status, d.last_seen_at AS lastSeenAt, d.created_at AS createdAt,
            c.platform, c.capabilities_json AS capabilitiesJson
       FROM devices d
       LEFT JOIN device_credentials c ON c.device_id = d.id
      WHERE d.operator_id = ?
      ORDER BY d.created_at DESC`
  )
    .bind(operatorId)
    .all();

  return (result?.results || []).map((item) => ({
    id: item.id,
    deviceType: item.deviceType,
    deviceName: item.deviceName,
    status: item.status,
    lastSeenAt: item.lastSeenAt,
    createdAt: item.createdAt,
    platform: item.platform,
    capabilities: (() => {
      try { return JSON.parse(item.capabilitiesJson || "[]"); } catch { return []; }
    })()
  }));
}

export async function enqueueCommand(
  env,
  { operatorId, deviceId, command, payload = {} } = {}
) {
  const normalizedCommand = String(command || "").trim();
  if (!ALLOWED_COMMANDS.has(normalizedCommand)) {
    return { ok: false, error: "Comando não autorizado pelo Ultron Bridge." };
  }
  if (!operatorId || !deviceId || !(await ensureBridgeSchema(env))) {
    return { ok: false, error: "Dispositivo ou identidade inválidos." };
  }

  const device = await env.ULTRON_DB.prepare(
    `SELECT id, device_type FROM devices
      WHERE id = ? AND operator_id = ? AND status = 'active'`
  )
    .bind(deviceId, operatorId)
    .first();

  if (!device) {
    return { ok: false, error: "Dispositivo não encontrado ou não autorizado." };
  }

  if (normalizedCommand.startsWith("tv.") && device.device_type !== "tv" && device.device_type !== "mobile") {
    return { ok: false, error: "Este dispositivo não pode receber comandos de TV." };
  }

  const payloadJson = safeJson(payload);
  if (payloadJson === "{}" && payload && typeof payload === "object" && Object.keys(payload).length) {
    return { ok: false, error: "Payload do comando excede o limite seguro." };
  }

  const commandId = crypto.randomUUID();
  await env.ULTRON_DB.prepare(
    `INSERT INTO device_commands
      (id, device_id, operator_id, command, payload_json, status, created_at)
     VALUES (?, ?, ?, ?, ?, 'pending', CURRENT_TIMESTAMP)`
  )
    .bind(commandId, deviceId, operatorId, normalizedCommand, payloadJson)
    .run();

  return { ok: true, commandId, status: "pending" };
}

async function authenticateDevice(env, deviceId, deviceSecret) {
  const id = String(deviceId || "").trim();
  const secret = String(deviceSecret || "").trim();
  if (!id || secret.length < 32 || !(await ensureBridgeSchema(env))) return null;

  const row = await env.ULTRON_DB.prepare(
    `SELECT d.id, d.operator_id AS operatorId, d.device_type AS deviceType,
            d.device_name AS deviceName, d.status, c.auth_hash AS authHash
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

export async function pollCommands(env, { deviceId, deviceSecret } = {}) {
  const device = await authenticateDevice(env, deviceId, deviceSecret);
  if (!device) return { ok: false, error: "Credencial do dispositivo inválida." };

  await env.ULTRON_DB.prepare(
    `UPDATE devices SET last_seen_at = CURRENT_TIMESTAMP WHERE id = ?`
  ).bind(device.id).run();

  const result = await env.ULTRON_DB.prepare(
    `SELECT id, command, payload_json AS payloadJson, created_at AS createdAt
       FROM device_commands
      WHERE device_id = ? AND status = 'pending'
      ORDER BY created_at ASC
      LIMIT ?`
  )
    .bind(device.id, MAX_PENDING_COMMANDS)
    .all();

  const commands = result?.results || [];
  if (commands.length) {
    await env.ULTRON_DB.batch(
      commands.map((item) =>
        env.ULTRON_DB.prepare(
          `UPDATE device_commands
              SET status = 'claimed', claimed_at = CURRENT_TIMESTAMP
            WHERE id = ? AND status = 'pending'`
        ).bind(item.id)
      )
    );
  }

  return {
    ok: true,
    device: {
      id: device.id,
      deviceType: device.deviceType,
      deviceName: device.deviceName
    },
    commands: commands.map((item) => ({
      id: item.id,
      command: item.command,
      payload: (() => {
        try { return JSON.parse(item.payloadJson || "{}"); } catch { return {}; }
      })(),
      createdAt: item.createdAt
    }))
  };
}

export async function completeCommand(
  env,
  { deviceId, deviceSecret, commandId, status = "completed", result = {} } = {}
) {
  const device = await authenticateDevice(env, deviceId, deviceSecret);
  if (!device) return { ok: false, error: "Credencial do dispositivo inválida." };

  const finalStatus = ["completed", "failed"].includes(status) ? status : "failed";
  const update = await env.ULTRON_DB.prepare(
    `UPDATE device_commands
        SET status = ?, result_json = ?, completed_at = CURRENT_TIMESTAMP
      WHERE id = ? AND device_id = ? AND status IN ('pending', 'claimed')`
  )
    .bind(finalStatus, safeJson(result), commandId, device.id)
    .run();

  return {
    ok: Boolean(update?.meta?.changes),
    status: finalStatus
  };
}
