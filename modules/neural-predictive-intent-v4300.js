const VERSION = '4.30.0';
const history = [];
const state = { active: false, vx: 0, vy: 0, ax: 0, ay: 0, confidence: 0, intent: 'IDLE', leadMs: 96 };

function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }
function nowMs() { return performance.now(); }

function sample(center, detail) {
  const t = nowMs();
  history.push({ x: Number(center.x), y: Number(center.y), t });
  while (history.length > 5) history.shift();
  if (history.length < 2) return;
  const a = history[history.length - 2];
  const b = history[history.length - 1];
  const dt = Math.max(8, b.t - a.t) / 1000;
  const nvx = (b.x - a.x) / dt;
  const nvy = (b.y - a.y) / dt;
  state.ax = (nvx - state.vx) / dt;
  state.ay = (nvy - state.vy) / dt;
  state.vx = state.vx * .62 + nvx * .38;
  state.vy = state.vy * .62 + nvy * .38;
  const speed = Math.hypot(state.vx, state.vy);
  state.confidence = clamp(speed * 1.8 + Number(detail.handSpeed || 0) * .18, 0, 1);

  const openness = Number(detail.openness || 0);
  const span = Number(detail.handSpan || 0);
  const pinch = Boolean(detail.pinch);
  if (pinch) state.intent = 'PRECISION_ZOOM';
  else if (openness > .72 && span > .16) state.intent = 'EXPAND';
  else if (openness < .34) state.intent = 'COLLAPSE_LOCK';
  else if (speed > .45) state.intent = 'ROTATE_PREDICT';
  else state.intent = 'HOVER';

  const lead = state.leadMs / 1000;
  const px = clamp(b.x + state.vx * lead + .5 * state.ax * lead * lead, 0, 1);
  const py = clamp(b.y + state.vy * lead + .5 * state.ay * lead * lead, 0, 1);
  const detailOut = { x: px, y: py, vx: state.vx, vy: state.vy, ax: state.ax, ay: state.ay, confidence: state.confidence, intent: state.intent, leadMs: state.leadMs };
  window.dispatchEvent(new CustomEvent('ultron:predictive-intent', { detail: detailOut }));

  if (window.ULTRON_PRIORITY?.state?.frozen) return;
  if (state.intent === 'ROTATE_PREDICT' && state.confidence > .35) {
    window.ULTRON_NEURAL_3D?.rotateBy?.({ y: clamp(state.vx * 2.8, -5.5, 5.5), x: clamp(-state.vy * 2.1, -4.5, 4.5) });
  } else if (state.intent === 'EXPAND' && state.confidence > .18) {
    const current = Number(window.ULTRON_NEURAL_3D?.state?.scale || 1);
    window.ULTRON_NEURAL_3D?.zoom?.(clamp(current + .008, .78, 1.48));
  } else if (state.intent === 'COLLAPSE_LOCK' && Number(detail.handCount || 0) > 0) {
    const current = Number(window.ULTRON_NEURAL_3D?.state?.scale || 1);
    window.ULTRON_NEURAL_3D?.zoom?.(clamp(current - .006, .78, 1.48));
  }
}

window.addEventListener('ultron:camera-hand', (event) => {
  const detail = event?.detail || {};
  const center = detail.palmCenter;
  if (!center || !Number.isFinite(Number(center.x)) || !Number.isFinite(Number(center.y))) return;
  state.active = true;
  sample(center, detail);
});

window.addEventListener('ultron:camera-stream', (event) => {
  if (event?.detail?.active === false) {
    history.length = 0;
    Object.assign(state, { active: false, vx: 0, vy: 0, ax: 0, ay: 0, confidence: 0, intent: 'IDLE' });
  }
});

window.addEventListener('ultron:emergency-stop', () => {
  history.length = 0;
  state.active = false;
  state.intent = 'FROZEN';
});

window.ULTRON_PREDICTIVE_INTENT = { version: VERSION, get state() { return { ...state }; } };
window.dispatchEvent(new CustomEvent('ultron:predictive-ready', { detail: { version: VERSION, leadMs: state.leadMs, acceleration: true, intention: true } }));
