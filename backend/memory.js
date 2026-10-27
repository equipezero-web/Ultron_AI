const MAX_CONTEXT_CHARS = 14000;
const DEFAULT_RECENT_MESSAGES = 24;
const DEFAULT_MEMORIES = 10;

function clip(value, max = 2200) {
  const text = String(value || "").trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export function hasMemoryDatabase(env) {
  return Boolean(env?.ULTRON_DB && typeof env.ULTRON_DB.prepare === "function");
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
      message: String(error?.message || error).slice(0, 180)
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

  if (!cues.some((cue) => normalized.includes(
    cue.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  ))) {
    return null;
  }

  return text;
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
      error: String(error?.message || error).slice(0, 180)
    };
  }
}
