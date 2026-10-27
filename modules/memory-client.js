import API_CONFIG from "../config.js";

const MEMORY_KEY_STORAGE = "ultron_memory_key_v1";
const CONVERSATION_STORAGE = "ultron_conversation_id_v1";
const API_BASE = String(API_CONFIG?.backendUrl || "").replace(/\/$/, "");

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

function appendDiagnostic(message, alert = false) {
  const output = document.getElementById("output-box");
  if (!output) return;

  const line = document.createElement("p");
  line.className = alert ? "alert" : "";
  line.textContent = `> [MEMORY] ${message}`;
  output.appendChild(line);
  output.scrollTop = output.scrollHeight;
}

function reportMemoryResult(data) {
  const memory = data?.memory;
  if (!memory) return;

  const indicator = document.getElementById("memory-module");

  if (memory.active && memory.saved) {
    if (indicator) {
      indicator.textContent = "ONLINE";
      indicator.className = "green";
    }

    appendDiagnostic(
      `ACTIVE | salvo: SIM | contexto: ${memory.recalledMessages || 0} mensagens / ${memory.recalledMemories || 0} memórias`
    );

    if (memory.explicitMemorySaved) {
      appendDiagnostic("SAVED | memória permanente registrada.");
    }
    return;
  }

  if (indicator) {
    indicator.textContent = memory.active ? "WRITE ERROR" : "INACTIVE";
    indicator.className = "";
  }

  const detail = memory.error ? ` | ${memory.error}` : "";
  appendDiagnostic(
    `INACTIVE | identidade: ${memory.identityReceived ? "OK" : "AUSENTE"} | salvo: ${memory.saved ? "SIM" : "NÃO"}${detail}`,
    true
  );
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

      const response = await nativeFetch(input, {
        ...init,
        cache: "no-store",
        body: JSON.stringify(payload)
      });

      try {
        const diagnosticData = await response.clone().json();
        reportMemoryResult(diagnosticData);
      } catch {}

      return response;
    }
  } catch (error) {
    console.warn("[ULTRON MEMORY] Falha ao anexar identidade de memória:", error);
  }

  return nativeFetch(input, init);
};

async function refreshMemoryHealth() {
  const indicator = document.getElementById("memory-module");
  if (!indicator || !API_BASE) return;

  try {
    const response = await nativeFetch(`${API_BASE}/api/health`, {
      cache: "no-store"
    });

    if (!response.ok) {
      indicator.textContent = "BACKEND OFF";
      indicator.className = "";
      return;
    }

    const data = await response.json();
    const memory = data?.memory;

    if (memory?.ready) {
      indicator.textContent = "ONLINE";
      indicator.className = "green";
    } else if (memory?.configured) {
      indicator.textContent = "ERROR";
      indicator.className = "";
    } else {
      indicator.textContent = "WAIT";
      indicator.className = "";
    }
  } catch {
    indicator.textContent = "BACKEND OFF";
    indicator.className = "";
  }
}

window.ULTRON_MEMORY = {
  getConversationId,
  getMemoryKey,
  startNewConversation,
  refreshMemoryHealth
};

refreshMemoryHealth();
setInterval(refreshMemoryHealth, 30000);
