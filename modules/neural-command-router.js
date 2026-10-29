import {
  NEURAL_ACTION_POLICY,
  neuralSignature,
  normalizeNeuralAction,
  validateNeuralAction
} from './neural-command-policy.mjs?v=4.19.0';

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
    zoomLevel: Number(detail.zoomLevel || 0),
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

function observe(action, detail = {}, source = 'palm-matrix') {
  const verdict = validateNeuralAction(action, detail);
  if (!verdict.ok) return reject(action, detail, verdict.reason);
  if (withinCooldown(verdict.action, detail)) {
    state.duplicatesBlocked += 1;
    return reject(verdict.action, detail, 'cooldown');
  }
  return publish(verdict.action, detail, { source, handled: true, mode: 'observed' });
}

function fileExplosion() {
  const stage = HAS_DOCUMENT ? document.querySelector('.neural-stage') : null;
  stage?.classList.remove('stark-file-explosion');
  if (stage) {
    void stage.offsetWidth;
    stage.classList.add('stark-file-explosion');
    setTimeout(() => stage.classList.remove('stark-file-explosion'), 760);
  }

  const fileMesh = HAS_WINDOW ? window.ULTRON_FILE_MESH : null;
  if (fileMesh?.active) {
    fileMesh.refresh?.({ requestLocal: false });
    return true;
  }

  if (fileMesh?.enter) {
    Promise.resolve(fileMesh.enter()).catch(() => {});
    return true;
  }

  const core = HAS_WINDOW ? window.ULTRON_STARK_CORE : null;
  return Boolean(core?.open?.('ARQUIVOS'));
}

function executeAction(action, detail = {}) {
  const core = HAS_WINDOW ? window.ULTRON_STARK_CORE : null;
  const mesh = HAS_WINDOW ? window.ULTRON_STARK_MESH : null;
  const fileLab = HAS_WINDOW ? window.ULTRON_FILE_LAB : null;
  const fileMesh = HAS_WINDOW ? window.ULTRON_FILE_MESH : null;
  const hand = HAS_WINDOW ? window.ULTRON_HAND_GESTURES : null;

  if (action === 'push') {
    return fileExplosion();
  }

  if (action === 'sweep') {
    const direction = detail.direction === 'right' ? 'right' : 'left';
    if (fileLab?.active) return Boolean(fileLab.sweep?.(direction) ?? true);
    core?.sweep?.(direction);
    return Boolean(core);
  }

  if (action === 'freeze') {
    hand?.freeze?.('neural-command');
    mesh?.endDrag?.({ persist: true });
    return Boolean(hand || mesh);
  }

  if (action === 'dial') {
    const delta = Number(detail.delta || detail.rotationStep || 0);
    if (fileLab?.active) return Boolean(fileLab.dial?.(delta) ?? true);
    const level = Number(mesh?.zoomLevel || 0);
    const next = Math.max(0, Math.min(2, level + (delta > 0 ? 1 : -1)));
    if (next !== level) mesh?.setZoomLevel?.(next);
    return Boolean(mesh);
  }

  if (action === 'holder') {
    fileLab?.showTable?.();
    return Boolean(fileLab);
  }

  if (action === 'pinch-select') {
    const target = String(detail.target || detail.label || '').trim();
    if (!target) return false;

    if (fileMesh?.active && fileMesh.openFileNode?.(target)) return true;
    core?.focus?.(target);
    if (mesh?.openFocused?.()) return true;
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
    ['ultron:palm-push', 'push', 'palm-matrix'],
    ['ultron:palm-sweep', 'sweep', 'palm-matrix'],
    ['ultron:palm-freeze', 'freeze', 'palm-matrix'],
    ['ultron:palm-dial', 'dial', 'palm-matrix'],
    ['ultron:palm-holder', 'holder', 'palm-matrix'],
    ['ultron:camera-hand-select', 'pinch-select', 'camera-hand']
  ];

  bindings.forEach(([eventName, action, source]) => {
    window.addEventListener(eventName, (event) => {
      const result = observe(action, event?.detail || {}, source);
      if (result.ok && action !== 'dial') {
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
    detail: { actions: Object.keys(NEURAL_ACTION_POLICY), version: '4.19.0' }
  }));
}

export { execute, observe, state };
