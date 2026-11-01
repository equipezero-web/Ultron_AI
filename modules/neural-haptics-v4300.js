const VERSION = '4.30.0';
const PATTERNS = {
  select: [18],
  confirm: [28, 35, 28],
  critical: [80, 45, 110, 45, 140],
  wake: [24, 32, 44],
  reject: [65, 35, 65]
};
const COOLDOWN_MS = {
  select: 220,
  confirm: 420,
  critical: 900,
  wake: 650,
  reject: 650
};

const state = { supported: 'vibrate' in navigator, lastPattern: null, lastAt: 0, lastByPattern: {} };

function vibrate(pattern = 'select', source = 'ui', { force = false } = {}) {
  const sequence = PATTERNS[pattern] || PATTERNS.select;
  const now = Date.now();
  const last = Number(state.lastByPattern[pattern] || 0);
  if (!force && now - last < Number(COOLDOWN_MS[pattern] || 220)) {
    return { ok: true, throttled: true, local: false, pattern, sequence };
  }
  state.lastPattern = pattern;
  state.lastAt = now;
  state.lastByPattern[pattern] = now;
  let local = false;
  try {
    if (state.supported) local = navigator.vibrate(sequence) !== false;
  } catch {}
  window.dispatchEvent(new CustomEvent('ultron:bridge-haptic', {
    detail: { pattern, sequence, source, version: VERSION, local }
  }));
  return { ok: true, local, pattern, sequence };
}

window.addEventListener('ultron:haptic-request', (event) => vibrate(event?.detail?.pattern || 'select', event?.detail?.source || 'runtime', { force: event?.detail?.pattern === 'critical' }));
window.addEventListener('ultron:wake-state', (event) => {
  if (event?.detail?.state === 'AWAKE') vibrate('wake', 'voice-wake');
});
window.addEventListener('ultron:priority-change', (event) => {
  if (event?.detail?.level === 'P1') vibrate('critical', 'integrity-priority');
});
window.addEventListener('ultron:predictive-intent', (event) => {
  if (event?.detail?.intent === 'PRECISION_ZOOM' && Number(event?.detail?.confidence || 0) > .55) vibrate('select', 'precision-pinch');
});

document.addEventListener('click', (event) => {
  if (event.target?.closest?.('.hud-button, .quick-actions button, .stark-file-node')) vibrate('select', 'ui');
}, { passive: true });

window.ULTRON_HAPTICS = { version: VERSION, vibrate, patterns: PATTERNS, cooldowns: COOLDOWN_MS, get state() { return { ...state }; } };
