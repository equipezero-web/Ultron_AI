import {
  NEURAL_ACTION_POLICY,
  neuralSignature,
  normalizeNeuralAction,
  validateNeuralAction
} from './neural-command-policy.mjs?v=4.20.0';

const HAS_WINDOW = typeof window !== 'undefined';
const HAS_DOCUMENT = typeof document !== 'undefined';
const cooldowns = new Map();
let sequence = 0;

const state = {
  ready: false,
  accepted: 0,
  rejected: 0,
  duplicatesBlocked: 0,
  lastCommand: null,
  lastRejected: null
};

function nowMs() {
  return typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
}

function outputLine(message, alert = false) {
  if (!HAS_DOCUMENT) return;
  const output = document.getElementById('output-box');
  if (!output) return;
  const line = document.createElement('p');
  if (alert) line.className = 'alert';
  const time = new Date().toLocaleTimeString('pt-BR', { hour12: false });
  line.textContent = `> [${time}] [NEURAL-CMD] ${message}`;
  output.appendChild(line);
  output.scrollTop = output.scrollHeight;
}

function withinCooldown(action, detail = {}) {
  const policy = NEURAL_ACTION_POLICY[action];
  if (!policy) return false;
  const signature = neuralSignature(action, detail);
  const now = nowMs();
  const last = cooldowns.get(signature) || 0;
  if (now - last < policy.cooldownMs) return true;
  cooldowns.set(signature, now);
  return false;
}

function publish(action, detail = {}, { source = 'neural-router', handled = false, mode = 'observed' } = {}) {
  const command = {
    id: `neural-${Date.now()}-${++sequence}`,
    source,
    action,
    handled: Boolean(handled),
    mode,
    confidence: Number(detail.confidence ?? 1),
    target: detail.target || detail.label || null,
    direction: detail.direction || null,
    delta: Number(detail.delta || detail.rotationStep || 0),
    scale: Number(detail.scale || 1),
    openness: Number(detail.openness ?? 0),
    cameraTap: detail.cameraTap === true,
    at: Date.now()
  };
  state.accepted += 1;
  state.lastCommand = command;
  if (HAS_WINDOW && typeof CustomEvent !== 'undefined') {
    window.dispatchEvent(new CustomEvent('ultron:neural-command', { detail: command }));
  }
  return { ok: true, command };
}

function reject(action, detail, reason) {
  const record = {
    action: normalizeNeuralAction(action),
    reason,
    confidence: Number(detail?.confidence ?? 0),
    at: Date.now()
  };
  state.rejected += 1;
  state.lastRejected = record;
  return { ok: false, ...record };
}

function observe(action, detail = {}, source = 'gesture-v420') {
  const verdict = validateNeuralAction(action, detail);
  if (!verdict.ok) return reject(action, detail, verdict.reason);
  if (withinCooldown(verdict.action, detail)) {
    state.duplicatesBlocked += 1;
    return reject(verdict.action, detail, 'cooldown');
  }
  return publish(verdict.action, detail, { source, handled: true, mode: 'observed' });
}

function executeAction(action, detail = {}) {
  const core = HAS_WINDOW ? window.ULTRON_STARK_CORE : null;
  const mesh = HAS_WINDOW ? window.ULTRON_STARK_MESH : null;
  const hand = HAS_WINDOW ? window.ULTRON_HAND_GESTURES : null;
  const inspector = HAS_WINDOW ? window.ULTRON_FILE_INSPECTOR : null;
  const vortex = HAS_DOCUMENT ? document.querySelector('.stark-vortex') : null;

  if (action === 'activate') return Boolean(hand?.activate?.('neural-command'));

  if (action === 'rotate') {
    const delta = Number(detail.delta || detail.rotationStep || 0);
    const current = parseFloat(vortex?.dataset?.neuralYaw || '0') || 0;
    const next = current + delta * 180 / Math.PI;
    if (vortex) {
      vortex.dataset.neuralYaw = String(next);
      vortex.style.setProperty('--tilt-y', `${next}deg`);
    }
    return Boolean(vortex);
  }

  if (action === 'zoom-in' || action === 'zoom-out') {
    const scale = Math.max(0.86, Math.min(1.68, Number(detail.scale || (action === 'zoom-in' ? 1.35 : 1))));
    if (vortex) vortex.style.setProperty('--gesture-scale', String(scale));
    mesh?.setZoomLevel?.(scale >= 1.42 ? 2 : scale >= 1.12 ? 1 : 0);
    return Boolean(vortex || mesh);
  }

  if (action === 'sweep') {
    core?.sweep?.(detail.direction === 'right' ? 'right' : 'left');
    return Boolean(core);
  }

  if (action === 'holder') {
    window.ULTRON_FILE_LAB?.showTable?.();
    return Boolean(window.ULTRON_FILE_LAB);
  }

  if (action === 'pinch-select') {
    const target = String(detail.target || detail.label || '').trim();
    if (!target) return false;
    if (inspector?.open) {
      Promise.resolve(inspector.open(detail)).catch(() => {});
      return true;
    }
    if (window.ULTRON_FILE_MESH?.active && window.ULTRON_FILE_MESH.openFileNode?.(detail.fileId || target)) return true;
    core?.focus?.(target);
    return Boolean(core?.open?.(target));
  }

  return false;
}

function execute(action, detail = {}, source = 'neural-api') {
  const verdict = validateNeuralAction(action, detail);
  if (!verdict.ok) return reject(action, detail, verdict.reason);
  if (withinCooldown(verdict.action, detail)) {
    state.duplicatesBlocked += 1;
    return reject(verdict.action, detail, 'cooldown');
  }
  const handled = executeAction(verdict.action, detail);
  const result = publish(verdict.action, detail, { source, handled, mode: 'executed' });
  if (!handled) outputLine(`${verdict.action.toUpperCase()} recebido, mas nenhum alvo operacional estava disponível.`, true);
  return result;
}

if (HAS_WINDOW) {
  const bindings = [
    ['ultron:neural-gesture-activated', 'activate', 'camera-hands'],
    ['ultron:palm-rotate', 'rotate', 'palm-matrix-v420'],
    ['ultron:palm-zoom-in', 'zoom-in', 'palm-matrix-v420'],
    ['ultron:palm-zoom-out', 'zoom-out', 'palm-matrix-v420'],
    ['ultron:camera-hand-select', 'pinch-select', 'camera-hand-v420']
  ];

  bindings.forEach(([eventName, action, source]) => {
    window.addEventListener(eventName, (event) => {
      const detail = event?.detail || {};
      const normalizedDetail = action === 'activate'
        ? { handCount: detail.handCount || 2, confidence: detail.confidence ?? 1, ...detail }
        : detail;
      const result = observe(action, normalizedDetail, source);
      if (result.ok && !['rotate', 'zoom-in', 'zoom-out'].includes(action)) {
        const target = result.command.target ? ` // ${result.command.target}` : '';
        outputLine(`${action.toUpperCase()} CONFIRMADO${target}`);
      }
    });
  });

  state.ready = true;
  window.ULTRON_NEURAL_COMMAND = {
    execute,
    observe,
    validate: validateNeuralAction,
    normalize: normalizeNeuralAction,
    get state() { return JSON.parse(JSON.stringify(state)); }
  };

  window.dispatchEvent(new CustomEvent('ultron:neural-command-ready', {
    detail: { actions: Object.keys(NEURAL_ACTION_POLICY), version: '4.20.0' }
  }));
}

export { execute, observe, state };
