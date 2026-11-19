// Builds a bounded prompt from ranked, operator-scoped D1 memories and
// recent messages. Never truncate from the left: that removes the most
// relevant memories and can cut a speaker label in half.
const MAX_CONTEXT_CHARS = 14000;
const MEMORY_HEADING = "MEMÓRIAS PERSISTENTES RELEVANTES:";
const HISTORY_HEADING = "HISTÓRICO RECENTE DESTA CONVERSA:";
const cap = (value, maximum) => {
  const text = String(value ?? "").trim();
  return text.length > maximum ? text.slice(0, maximum - 1) + "…" : text;
};

export function composeMemoryContext(memories = [], messages = [], {maxChars = MAX_CONTEXT_CHARS} = {}) {
  const requested = Number(maxChars);
  const limit = Number.isFinite(requested) && requested >= 256
    ? Math.min(MAX_CONTEXT_CHARS, Math.floor(requested)) : MAX_CONTEXT_CHARS;
  const memoryQuota = Math.floor(limit * .43);
  const memoryLines = [];
  let memoryLength = MEMORY_HEADING.length;
  for (const memory of Array.isArray(memories) ? memories : []) {
    if (!memory || !String(memory.content ?? "").trim()) continue;
    const tier = ["HOT", "WARM", "COLD"].includes(memory.retrieval?.tier) ? memory.retrieval.tier : "COLD";
    const category = cap(String(memory.category || "memória").replace(/[\r\n]/g, " "), 60);
    const line = "- [" + tier + " / " + category + "] " + cap(memory.content, 1200);
    if (memoryLength + line.length + 1 > memoryQuota) continue;
    memoryLines.push(line);
    memoryLength += line.length + 1;
  }
  const memoryBlock = memoryLines.length ? [MEMORY_HEADING, ...memoryLines].join("\n") : "";
  // Always reserve space for recent dialogue. Selecting from the newest
  // messages backwards retains continuity without cutting an older message.
  const availableForHistory = limit - memoryBlock.length - (memoryBlock ? 2 : 0) - HISTORY_HEADING.length - 1;
  const selected = [];
  let used = 0;
  const allMessages = Array.isArray(messages) ? messages : [];
  for (let index = allMessages.length - 1; index >= 0; index--) {
    const entry = allMessages[index];
    if (!entry || !["user", "assistant"].includes(entry.role)) continue;
    const value = cap(entry.content, 2200);
    if (!value) continue;
    const line = (entry.role === "assistant" ? "ULTRON" : "OPERADOR") + ": " + value;
    if (used + line.length + (selected.length ? 1 : 0) > availableForHistory) break;
    selected.push(line);
    used += line.length + (selected.length > 1 ? 1 : 0);
  }
  selected.reverse();
  const historyBlock = selected.length ? [HISTORY_HEADING, ...selected].join("\n") : "";
  const context = [memoryBlock, historyBlock].filter(Boolean).join("\n\n");
  return {context,recalledMemories:memoryLines.length,recalledMessages:selected.length};
}
