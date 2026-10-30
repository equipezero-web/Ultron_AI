export const VOICE_RUNTIME_POLICY = Object.freeze({
  conversationWindowMs: 90000,
  finalDedupeMs: 4500,
  commandDedupeMs: 2500,
  desktopRestartDelayMs: 500,
  androidRestartDelayMs: 900,
  maxRestartDelayMs: 12000,
  failureWindowMs: 45000,
  failureBurstLimit: 6,
  burstCooldownMs: 12000,
  stableSessionMs: 8000,
  desktopEchoGuardMs: 450,
  androidEchoGuardMs: 850,
  spokenEchoWindowMs: 3500
});

export function normalizeVoiceText(text) {
  return String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function restartDelayFor({
  failures = 0,
  isAndroid = false,
  blockedUntil = 0,
  now = Date.now()
} = {}) {
  const base = isAndroid
    ? VOICE_RUNTIME_POLICY.androidRestartDelayMs
    : VOICE_RUNTIME_POLICY.desktopRestartDelayMs;
  const exponent = Math.min(4, Math.max(0, Number(failures) || 0));
  const exponential = Math.min(
    VOICE_RUNTIME_POLICY.maxRestartDelayMs,
    base * (2 ** exponent)
  );
  const blockedDelay = Math.max(0, Number(blockedUntil || 0) - Number(now || 0));
  return Math.max(exponential, blockedDelay);
}

export function pruneFailureTimes(times = [], now = Date.now()) {
  const threshold = now - VOICE_RUNTIME_POLICY.failureWindowMs;
  return times.filter((timestamp) => Number(timestamp) >= threshold);
}

export function nextFailureState(times = [], now = Date.now()) {
  const recent = pruneFailureTimes([...times, now], now);
  const burst = recent.length >= VOICE_RUNTIME_POLICY.failureBurstLimit;
  return {
    times: recent,
    count: recent.length,
    burst,
    blockedUntil: burst ? now + VOICE_RUNTIME_POLICY.burstCooldownMs : 0
  };
}

export function isLikelySpeechEcho(transcript, spokenText) {
  const heard = normalizeVoiceText(transcript);
  const spoken = normalizeVoiceText(spokenText);
  if (!heard || !spoken) return false;
  if (heard === spoken) return true;
  if (heard.length >= 10 && spoken.includes(heard)) return true;
  if (spoken.length >= 10 && heard.includes(spoken)) return true;

  const heardTokens = new Set(heard.split(" ").filter((token) => token.length > 2));
  const spokenTokens = new Set(spoken.split(" ").filter((token) => token.length > 2));
  if (!heardTokens.size || !spokenTokens.size) return false;

  let overlap = 0;
  for (const token of heardTokens) {
    if (spokenTokens.has(token)) overlap += 1;
  }
  return overlap / Math.min(heardTokens.size, spokenTokens.size) >= 0.72;
}

export function isDuplicateVoiceText(text, lastText, elapsedMs, limitMs) {
  const current = normalizeVoiceText(text);
  const previous = normalizeVoiceText(lastText);
  return Boolean(current && previous && current === previous && elapsedMs >= 0 && elapsedMs < limitMs);
}
