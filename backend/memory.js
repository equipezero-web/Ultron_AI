import { selectMemoriesForTurn } from "./memory-relevance.js";
import { composeMemoryContext } from "./memory-context.js";
const DEFAULT_RECENT_MESSAGES = 24;
const DEFAULT_MEMORIES = 10;
const MAX_MEMORY_CANDIDATES = 160; // bounded, operator-scoped D1 retrieval pool

const schemaReady = new WeakSet();
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
  if (schemaReady.has(env.ULTRON_DB)) return true;

  schemaError = null;

  for (let index = 0; index < SCHEMA_STATEMENTS.length; index += 1) {
    try {
      await env.ULTRON_DB
        .prepare(SCHEMA_STATEMENTS[index])
        .run();
    } catch (error) {
      schemaError = `Etapa ${index + 1}/${SCHEMA_STATEMENTS.length}: ${compactError(error)}`;
      console.error("[ULTRON MEMORY] Falha ao inicializar schema D1:", schemaError);
      return false;
    }
  }

  schemaReady.add(env.ULTRON_DB);
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

export function explicitMemoryCandidate(message) {
  const text = String(message || "").trim();
  if (!text || text.length > 1600) return null;

  // Explicit memory is not a secret vault. Reject credential-bearing
  // statements instead of persisting them as reusable long-term memories.
  // Ordinary conversation persistence follows a separate account-scoped policy.
  const secretLabel=/\b(?:senha|password|passphrase|api[ _-]?key|chave (?:api|secreta|privada)|access[ _-]?token|refresh[ _-]?token|token(?: de acesso)?|credenciais?|codigo de recuperacao|c[oó]digo de recupera[cç][aã]o)\b/i;
  const privateKey=/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i;
  const sensitiveIdentifier=/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/;
  if (secretLabel.test(text)||privateKey.test(text)||sensitiveIdentifier.test(text)) return null;

  const normalized = text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  // Questions about an existing preference are READS, not requests to
  // store the question itself as an explicit long-term memory.
  if(/[?？]/.test(text) || /^(?:qual|quais|o que|como|quando|onde|voce|você|lembra do|lembra da)\b/.test(normalized))
    return null;

  const cues = [
    "lembre que",
    "lembre-se de que",
    "lembre se de que",
    "lembre-se que",
    "lembre de que",
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

/** Read only the current operator's explicit interface preference. No cross-account fallback. */
export async function readExplicitInterfacePreference(env,{operatorId}={}){
  if(!operatorId||!hasMemoryDatabase(env)||!(await ensureMemorySchema(env)))
    return {found:false,ready:false};
  try {
    const rows=await env.ULTRON_DB.prepare(
      "SELECT content FROM memories WHERE operator_id = ? AND category = 'explicit' AND content LIKE ? ORDER BY updated_at DESC, rowid DESC LIMIT 20"
    ).bind(operatorId,"%interface%").all();
    for(const row of rows?.results||[]){
      const text=String(row.content||"");
      const match=text.match(/prefer[eê]ncia\s+de\s+interface(?:\s+para\s+[^.!?]{0,90}?)?\s+(?:é|e|:|será|sera)\s+([\p{L}\p{M}\p{N}\s-]{2,45})(?:[.!?]|$)/iu);
      if(match)return {found:true,ready:true,value:match[1].trim()};
    }
    return {found:false,ready:true};
  }catch(error){
    console.error("[ULTRON MEMORY] Falha ao recuperar preferência:",error);
    return {found:false,ready:false,error:"MEMORY_READ_FAILED"};
  }
}

export async function loadMemoryContext(
  env,
  { operatorId, conversationId, query = "", recentLimit = DEFAULT_RECENT_MESSAGES } = {}
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
      recalledMemories: 0
    };
  }

  try {
    const [messageResult, memoryResult] = await Promise.all([
      env.ULTRON_DB
        .prepare(
          `SELECT role, content, provider, created_at
           FROM messages
           WHERE operator_id = ? AND conversation_id = ?
           ORDER BY created_at DESC, rowid DESC
           LIMIT ?`
        )
        .bind(operatorId, conversationId, Math.max(1, Math.min(40, recentLimit)))
        .all(),
      env.ULTRON_DB
        .prepare(
          `SELECT category, content, importance, updated_at, use_count
           FROM memories
           WHERE operator_id = ?
           ORDER BY importance DESC, updated_at DESC
           LIMIT ?`
        )
        .bind(operatorId, MAX_MEMORY_CANDIDATES)
        .all()
    ]);

    const messages = Array.isArray(messageResult?.results)
      ? [...messageResult.results].reverse()
      : [];
    const recentUserMessage = [...messages].reverse().find((item) => item.role === "user")?.content || "";
    // Referential follow-ups must recover the previous topic rather than
    // matching only pronouns like "qual foi a preferência que informei".
    // Scoped to the same operator + conversation; no general stale-context injection.
    const referential=/^(?:e\s+)?(?:qual foi|qual era|e qual|o que eu|voce lembra|você lembra|e isso|e essa|e esse)\b/i.test(String(query||"").trim());
    const memoryQuery=referential && recentUserMessage
      ? query+" "+recentUserMessage
      : (query || recentUserMessage);
    const memories = selectMemoriesForTurn(memoryResult?.results, memoryQuery, { limit: DEFAULT_MEMORIES });

    const rendered = composeMemoryContext(memories, messages);
    return {
      active: true,
      ...rendered,
      lastAssistantMessage: [...messages].reverse().find(item => item.role === "assistant")?.content || null,
      lastUserMessage: [...messages].reverse().find(item => item.role === "user")?.content || null
    };
  } catch (error) {
    console.error("[ULTRON MEMORY] Falha ao recuperar contexto:", error);
    return {
      active: false,
      context: "",
      recalledMessages: 0,
      recalledMemories: 0,
      error: String(error?.message || error).slice(0, 180)
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
    return { saved: false };
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
           updated_at = CURRENT_TIMESTAMP
         WHERE conversations.operator_id = excluded.operator_id`
      )
      .bind(conversationId, operatorId),
    env.ULTRON_DB
      .prepare(
        `INSERT INTO messages
          (id, conversation_id, operator_id, role, content, provider, model, created_at)
         SELECT ?, c.id, c.operator_id, 'user', ?, NULL, NULL, CURRENT_TIMESTAMP
         FROM conversations AS c
         WHERE c.id = ? AND c.operator_id = ?`
      )
      .bind(userMessageId, String(userMessage), conversationId, operatorId),
    env.ULTRON_DB
      .prepare(
        `INSERT INTO messages
          (id, conversation_id, operator_id, role, content, provider, model, created_at)
         SELECT ?, c.id, c.operator_id, 'assistant', ?, ?, ?, CURRENT_TIMESTAMP
         FROM conversations AS c
         WHERE c.id = ? AND c.operator_id = ?`
      )
      .bind(
        assistantMessageId,
        String(assistantMessage),
        provider,
        model,
        conversationId,
        operatorId
      ),
    env.ULTRON_DB
      .prepare(
        `UPDATE conversations
         SET message_count = message_count + 2,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND operator_id = ?
           AND EXISTS (SELECT 1 FROM messages WHERE id = ? AND operator_id = ?)
           AND EXISTS (SELECT 1 FROM messages WHERE id = ? AND operator_id = ?)`
      )
      .bind(conversationId, operatorId,
        userMessageId, operatorId, assistantMessageId, operatorId)
  ];

  if (explicitMemory) {
    statements.push(
      env.ULTRON_DB
        .prepare(
          `INSERT OR IGNORE INTO memories
            (id, operator_id, category, content, importance, source_message_id, created_at, updated_at)
           SELECT ?, c.operator_id, 'explicit', ?, 90, m.id, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
           FROM conversations AS c JOIN messages AS m
             ON m.conversation_id = c.id AND m.operator_id = c.operator_id
           WHERE c.id = ? AND c.operator_id = ? AND m.id = ?`
        )
        .bind(
          crypto.randomUUID(), explicitMemory,
          conversationId, operatorId, userMessageId
        )
    );
  }

  try {
    const writes = await env.ULTRON_DB.batch(statements);
    // D1 batch commits atomically. A conversation ID belonging to another
    // operator must not create messages, memories, or a false "saved" result.
    // D1's change counters are checked for each conversation write. Do not
    // accept an ignored insert for a foreign-owned conversation.
    const recorded = Array.isArray(writes) &&
      writes.slice(0, 4).every(write => Number(write?.meta?.changes) === 1);
    if (!recorded) return { saved: false, error: "CONVERSATION_SCOPE_CONFLICT" };
    let explicitSaved=Boolean(explicitMemory &&
      Number(writes[4]?.meta?.changes) === 1);
    if(explicitMemory && !explicitSaved){
      // INSERT OR IGNORE reports 0 changes when an identical memory already
      // exists. Verify it within the SAME operator scope before reporting
      // failure. Never infer successful persistence from an ignored write.
      const existing=await env.ULTRON_DB.prepare(
        "SELECT id FROM memories WHERE operator_id = ? AND content = ? LIMIT 1"
      ).bind(operatorId,explicitMemory).first();
      explicitSaved=Boolean(existing?.id);
    }
    return {saved:true,explicitMemorySaved:explicitSaved};
  } catch (error) {
    console.error("[ULTRON MEMORY] Falha ao salvar conversa:", error);
    return {
      saved: false,
      error: String(error?.message || error).slice(0, 180)
    };
  }
}
