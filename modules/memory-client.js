const MEMORY_KEY_STORAGE = "ultron_memory_key_v1";
const CONVERSATION_STORAGE = "ultron_conversation_id_v1";

function randomHex(bytes = 32) {
  const data = new Uint8Array(bytes);
  crypto.getRandomValues(data);
  return Array.from(data)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function loadOrCreate(storageKey, createValue) {
  try {
    const existing = localStorage.getItem(storageKey);
    if (existing) return existing;

    const created = createValue();
    localStorage.setItem(storageKey, created);
    return created;
  } catch {
    return createValue();
  }
}

export function getMemoryKey() {
  return loadOrCreate(MEMORY_KEY_STORAGE, () => randomHex(32));
}

export function getConversationId() {
  return loadOrCreate(
    CONVERSATION_STORAGE,
    () => crypto.randomUUID?.() || `conv-${Date.now()}-${randomHex(8)}`
  );
}

export function startNewConversation() {
  const next = crypto.randomUUID?.() || `conv-${Date.now()}-${randomHex(8)}`;
  try {
    localStorage.setItem(CONVERSATION_STORAGE, next);
  } catch {}
  return next;
}

function isAiRequest(input, init = {}) {
  const url = typeof input === "string" ? input : input?.url || "";
  const method = String(init?.method || (input instanceof Request ? input.method : "GET"))
    .toUpperCase();

  return method === "POST" && /\/api\/ai(?:\?|$)/.test(url);
}

const nativeFetch = window.fetch.bind(window);

window.fetch = async function ultronMemoryFetch(input, init = {}) {
  if (!isAiRequest(input, init) || typeof init?.body !== "string") {
    return nativeFetch(input, init);
  }

  try {
    const payload = JSON.parse(init.body);

    if (payload && typeof payload === "object") {
      payload.memoryKey = getMemoryKey();
      payload.conversationId = getConversationId();

      return nativeFetch(input, {
        ...init,
        body: JSON.stringify(payload)
      });
    }
  } catch (error) {
    console.warn("[ULTRON MEMORY] Falha ao anexar identidade de memória:", error);
  }

  return nativeFetch(input, init);
};

window.ULTRON_MEMORY = {
  getConversationId,
  startNewConversation
};
