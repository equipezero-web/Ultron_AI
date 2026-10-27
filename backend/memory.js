const MAX_CONTEXT_CHARS = 14000;
const DEFAULT_RECENT_MESSAGES = 24;
const DEFAULT_MEMORIES = 10;

let schemaReady = false;
let schemaError = null;

const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    operator_id TEXT NOT NULL,
    title TEXT,
    summary TEXT NOT NULL DEFAULT '',
    message_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_conversations_operator_updated
    ON conversations(operator_id, updated_at DESC)`,
  `CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    operator_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    provider TEXT,
    model TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS idx_messages_conversation_created
    ON messages(conversation_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_messages_operator_created
    ON messages(operator_id, created_at DESC)`,
  `CREATE TABLE IF NOT EXISTS memories (
    id TEXT PRIMARY KEY,
    operator_id TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'general',
    content TEXT NOT NULL,
    importance INTEGER NOT NULL DEFAULT 50 CHECK (importance BETWEEN 0 AND 100),
    source_message_id TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_used_at TEXT,
    use_count INTEGER NOT NULL DEFAULT 0,
    UNIQUE(operator_id, content),
    FOREIGN KEY (source_message_id) REFERENCES messages(id) ON DELETE SET NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_memories_operator_importance
    ON memories(operator_id, importance DESC, updated_at DESC)`,
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
  `CREATE TABLE IF NOT EXISTS monitors (
    id TEXT PRIMARY KEY,
    operator_id TEXT NOT NULL,
    title TEXT NOT NULL,
    monitor_type TEXT NOT NULL,
    target TEXT NOT NULL,
    config_json TEXT NOT NULL DEFAULT '{}',
    enabled INTEGER NOT NULL DEFAULT 1,
    last_checked_at TEXT,
    last_status TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_monitors_operator_enabled
    ON monitors(operator_id, enabled, updated_at DESC)`
];

function clip(value, max = 2200) {
  const text = String(value || "").trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function compactError(error) {
  return String(error?.message || error || "erro desconhecido")
    .replace(/\s+/g, " ")
    .slice(0, 220);
}

export function hasMemoryDatabase(env) {
  return Boolean(env?.ULTRON_DB && typeof env.ULTRON_DB.prepare === "function");
}

export async function ensureMemorySchema(env) {
  if (!hasMemoryDatabase(env)) return false;
  if (schemaReady) return true;

  schemaError = null;

  for (let index = 0; index < SCHEMA_STATEMENTS.length; index += 1) {
    try {
      await env.ULTRON_DB.exec(SCHEMA_STATEMENTS[index]);
    } catch (error) {
      schemaError = `Etapa ${index + 1}/${SCHEMA_STATEMENTS.length}: ${compactError(error)}`;
      console.error("[ULTRON MEMORY] Falha ao inicializar schema D1:", schemaError);
      return false;
    }
  }

  schemaReady = true;
  return true;
}

export async function deriveOperatorId(memoryKey) {
  const key = String(memoryKey || "").trim();
  if (key.length < 32) return null;

  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(key)
  );

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function normalizeConversationId(value) {
  const id = String(value || "").trim();
  if (!id) return null;
  if (id.length > 96) return null;
  if (!/^[a-zA-Z0-9._:-]+$/.test(id)) return null;
  return id;
}

export async function memoryHealth(env) {
  if (!hasMemoryDatabase(env)) {
    return {
      configured: false,
      ready: false,
      engine: "D1",
      message: "Binding ULTRON_DB ainda não configurado."
    };
  }

  const initialized = await ensureMemorySchema(env);

  if (!initialized) {
    return {
      configured: true,
      ready: false,
      engine: "D1",
      message: schemaError || "Não foi possível inicializar o schema de memória."
    };
  }

  try {
    await env.ULTRON_DB
      .prepare("SELECT 1 AS ok FROM conversations LIMIT 1")
      .first();

    return {
      configured: true,
      ready: true,
      engine: "D1"
    };
  } catch (error) {
    return {
      configured: true,
      ready: false,
      engine: "D1",
      message: compactError(error)
    };
  }
}

function explicitMemoryCandidate(message) {
  const text = String(message || "").trim();
  if (!text || text.length > 1600) return null;

  const normalized = text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  const cues = [
    "lembre que",
    "lembra que",
    "nao esqueca",
    "não esqueça",
    "sempre considere",
    "sempre que eu falar",
    "minha preferencia",
    "minha preferência",
    "eu prefiro",
    "meu projeto",
    "guarde isso",
    "salve isso"
  ];

  const matched = cues.some((cue) =>
    normalized.includes(
      cue.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    )
  );

  return matched ? text : null;
}

export async function loadMemoryContext(
  env,
  { operatorId, conversationId, recentLimit = DEFAULT_RECENT_MESSAGES } = {}
) {
  if (!hasMemoryDatabase(env) || !operatorId || !conversationId) {
    return {
      active: false,
      context: "",
      recalledMessages: 0,
      recalledMemories: 0
    };
  }

  if (!(await ensureMemorySchema(env))) {
    return {
      active: false,
      context: "",
      recalledMessages: 0,
      recalledMemories: 0,
      error: schemaError
    };
  }

  try {
    const [messageResult, memoryResult] = await Promise.all([
      env.ULTRON_DB
        .prepare(
          `SELECT role, content, provider, created_at
           FROM messages
           WHERE operator_id = ? AND conversation_id = ?
           ORDER BY created_at DESC
           LIMIT ?`
        )
        .bind(operatorId, conversationId, Math.max(1, Math.min(40, recentLimit)))
        .all(),
      env.ULTRON_DB
        .prepare(
          `SELECT category, content, importance, updated_at
           FROM memories
           WHERE operator_id = ?
           ORDER BY importance DESC, updated_at DESC
           LIMIT ?`
        )
        .bind(operatorId, DEFAULT_MEMORIES)
        .all()
    ]);

    const messages = Array.isArray(messageResult?.results)
      ? [...messageResult.results].reverse()
      : [];
    const memories = Array.isArray(memoryResult?.results)
      ? memoryResult.results
      : [];

    const sections = [];

    if (memories.length) {
      sections.push(
        "MEMÓRIAS PERSISTENTES RELEVANTES:",
        ...memories.map(
          (item) => `- [${item.category || "memória"}] ${clip(item.content, 1200)}`
        )
      );
    }

    if (messages.length) {
      sections.push(
        "",
        "HISTÓRICO RECENTE DESTA CONVERSA:",
        ...messages.map((item) => {
          const speaker = item.role === "assistant" ? "ULTRON" : "OPERADOR";
          return `${speaker}: ${clip(item.content)}`;
        })
      );
    }

    let context = sections.join("\n").trim();
    if (context.length > MAX_CONTEXT_CHARS) {
      context = context.slice(context.length - MAX_CONTEXT_CHARS);
    }

    return {
      active: true,
      context,
      recalledMessages: messages.length,
      recalledMemories: memories.length
    };
  } catch (error) {
    console.error("[ULTRON MEMORY] Falha ao recuperar contexto:", error);
    return {
      active: false,
      context: "",
      recalledMessages: 0,
      recalledMemories: 0,
      error: compactError(error)
    };
  }
}

export async function saveExchange(
  env,
  {
    operatorId,
    conversationId,
    userMessage,
    assistantMessage,
    provider = null,
    model = null
  } = {}
) {
  if (
    !hasMemoryDatabase(env) ||
    !operatorId ||
    !conversationId ||
    !userMessage ||
    !assistantMessage
  ) {
    return { saved: false };
  }

  if (!(await ensureMemorySchema(env))) {
    return { saved: false, error: schemaError };
  }

  const userMessageId = crypto.randomUUID();
  const assistantMessageId = crypto.randomUUID();
  const explicitMemory = explicitMemoryCandidate(userMessage);

  const statements = [
    env.ULTRON_DB
      .prepare(
        `INSERT INTO conversations
          (id, operator_id, created_at, updated_at)
         VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
         ON CONFLICT(id) DO UPDATE SET
           updated_at = CURRENT_TIMESTAMP`
      )
      .bind(conversationId, operatorId),
    env.ULTRON_DB
      .prepare(
        `INSERT INTO messages
          (id, conversation_id, operator_id, role, content, provider, model, created_at)
         VALUES (?, ?, ?, 'user', ?, NULL, NULL, CURRENT_TIMESTAMP)`
      )
      .bind(userMessageId, conversationId, operatorId, String(userMessage)),
    env.ULTRON_DB
      .prepare(
        `INSERT INTO messages
          (id, conversation_id, operator_id, role, content, provider, model, created_at)
         VALUES (?, ?, ?, 'assistant', ?, ?, ?, CURRENT_TIMESTAMP)`
      )
      .bind(
        assistantMessageId,
        conversationId,
        operatorId,
        String(assistantMessage),
        provider,
        model
      ),
    env.ULTRON_DB
      .prepare(
        `UPDATE conversations
         SET message_count = message_count + 2,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND operator_id = ?`
      )
      .bind(conversationId, operatorId)
  ];

  if (explicitMemory) {
    statements.push(
      env.ULTRON_DB
        .prepare(
          `INSERT OR IGNORE INTO memories
            (id, operator_id, category, content, importance, source_message_id, created_at, updated_at)
           VALUES (?, ?, 'explicit', ?, 90, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
        )
        .bind(
          crypto.randomUUID(),
          operatorId,
          explicitMemory,
          userMessageId
        )
    );
  }

  try {
    await env.ULTRON_DB.batch(statements);
    return {
      saved: true,
      explicitMemorySaved: Boolean(explicitMemory)
    };
  } catch (error) {
    console.error("[ULTRON MEMORY] Falha ao salvar conversa:", error);
    return {
      saved: false,
      error: compactError(error)
    };
  }
}
