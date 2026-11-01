const VERSION = '4.30.0';
const body = document.body;
const output = document.getElementById('output-box');
const input = document.getElementById('command-input');
const mode = document.getElementById('system-mode');

const state = {
  frozen: false,
  priority: 'P5',
  reason: 'render-idle',
  stopEpoch: 0,
  lastStopAt: 0,
  lastCommand: '',
  guarded: new Set()
};

function normalize(text) {
  return String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

const P0 = [
  /^(?:ultron[ ,:-]*)?(?:stop|parar|pare|congelar|congele|freeze|cancelar|cancele|abortar|aborte)(?: tudo| agora)?[.!]?$/,
  /^(?:ultron[ ,:-]*)?(?:abaixa isso|baixe isso|interrompa tudo|interromper tudo)[.!]?$/
];
const RESUME = /^(?:ultron[ ,:-]*)?(?:retomar|retome|continuar|continue|descongelar|descongele|resume)[.!]?$/;
const P1 = /\b(emergencia|risco|falha critica|integridade|seguranca|superaquec|incendio|perigo|brecha)\b/;

function classify(text, source = 'terminal') {
  const n = normalize(text);
  if (P0.some((pattern) => pattern.test(n))) return { level: 'P0', label: 'EMERGENCY STOP', n };
  if (RESUME.test(n)) return { level: 'P0', label: 'RESUME', n };
  if (P1.test(n)) return { level: 'P1', label: 'INTEGRITY', n };
  if (/voice/.test(source) || source === 'mobile') return { level: 'P2', label: 'VOICE AUTHORITY', n };
  if (/proactive|automation|self-heal/.test(source)) return { level: 'P4', label: 'AUTOMATION', n };
  return { level: 'P3', label: 'ACTIVE COMMAND', n };
}

function log(message, alert = false) {
  if (!output) return;
  const line = document.createElement('p');
  if (alert) line.className = 'alert';
  const time = new Date().toLocaleTimeString('pt-BR', { hour12: false });
  line.textContent = `> [${time}] [PRIORITY] ${message}`;
  output.appendChild(line);
  output.scrollTop = output.scrollHeight;
}

function announcePriority(level, label) {
  state.priority = level;
  state.reason = label;
  body.dataset.ultronPriority = level;
  window.dispatchEvent(new CustomEvent('ultron:priority-change', { detail: { level, label, frozen: state.frozen, version: VERSION } }));
}

function stopMedia() {
  try { window.speechSynthesis?.cancel?.(); } catch {}
  const audio = document.getElementById('voice-audio');
  try { audio?.pause?.(); } catch {}
  try { window.ULTRON_HAND_GESTURES?.deactivate?.('priority-stop'); } catch {}
}

function emergencyStop(reason = 'operator') {
  state.frozen = true;
  state.stopEpoch += 1;
  state.lastStopAt = Date.now();
  state.reason = reason;
  window.ULTRON_ABORT_EPOCH = state.stopEpoch;
  body.classList.add('ultron-frozen');
  if (mode) mode.textContent = 'FROZEN // P0';
  stopMedia();
  announcePriority('P0', 'EMERGENCY STOP');
  window.dispatchEvent(new CustomEvent('ultron:emergency-stop', { detail: { epoch: state.stopEpoch, reason, at: state.lastStopAt } }));
  window.dispatchEvent(new CustomEvent('ultron:haptic-request', { detail: { pattern: 'critical', source: 'priority-stop' } }));
  log('P0 // EXECUÇÃO INTERROMPIDA. Neural, gestos e novas etapas foram congelados.', true);
  return { ok: true, stopped: true, epoch: state.stopEpoch, priority: 'P0' };
}

function resume(reason = 'operator') {
  state.frozen = false;
  body.classList.remove('ultron-frozen');
  if (mode) mode.textContent = 'AWAKE';
  announcePriority('P2', 'OPERATOR RESUME');
  try { window.ULTRON_HAND_GESTURES?.activate?.('priority-resume'); } catch {}
  window.dispatchEvent(new CustomEvent('ultron:priority-resume', { detail: { epoch: state.stopEpoch, reason } }));
  window.dispatchEvent(new CustomEvent('ultron:haptic-request', { detail: { pattern: 'confirm', source: 'priority-resume' } }));
  log('P0 RELEASE // sistema liberado para novos comandos.');
  return { ok: true, resumed: true, epoch: state.stopEpoch };
}

function guardRuntimeObject(object, methodName, label) {
  if (!object || typeof object[methodName] !== 'function') return false;
  const key = `${label}.${methodName}`;
  if (state.guarded.has(key) || object[methodName].__ultronPriorityGuard) return true;
  const original = object[methodName].bind(object);
  const guarded = async (...args) => {
    if (state.frozen) {
      log(`P0 BLOCK // ${label}.${methodName} ignorado enquanto FROZEN.`, true);
      return { ok: false, stopped: true, priority: 'P0', error: 'ULTRON_FROZEN' };
    }
    return original(...args);
  };
  guarded.__ultronPriorityGuard = true;
  guarded.__original = original;
  object[methodName] = guarded;
  state.guarded.add(key);
  return true;
}

function installRuntimeGuards() {
  const core = guardRuntimeObject(window.ULTRON_CORE, 'ask', 'core');
  const devices = guardRuntimeObject(window.ULTRON_DEVICES, 'routeNaturalLanguage', 'devices');
  const vision = guardRuntimeObject(window.ULTRON_VISION_ROUTER, 'run', 'vision');
  return { core, devices, vision };
}

function installOrchestratorGate() {
  const orchestrator = window.ULTRON_ORCHESTRATOR;
  if (!orchestrator?.execute || orchestrator.__priority4300) return Boolean(orchestrator?.__priority4300);
  const original = orchestrator.execute.bind(orchestrator);
  orchestrator.execute = (message, source = 'terminal') => {
    const p = classify(message, source);
    state.lastCommand = String(message || '');
    announcePriority(p.level, p.label);
    if (p.label === 'EMERGENCY STOP') return Promise.resolve(emergencyStop(source));
    if (p.label === 'RESUME') return Promise.resolve(resume(source));
    if (state.frozen) {
      log(`P0 ACTIVE // comando ${p.level} bloqueado. Diga “Ultron, retomar”.`, true);
      return Promise.resolve({ ok: false, stopped: true, priority: 'P0' });
    }
    return original(message, source);
  };
  orchestrator.__priority4300 = true;
  orchestrator.__directExecute = original;
  return true;
}

function interceptP0FromTerminal(event) {
  const target = event.target;
  const send = target?.closest?.('#btn-send');
  const enter = event.type === 'keydown' && target?.id === 'command-input' && event.key === 'Enter' && !event.shiftKey;
  if (!send && !enter) return;
  const text = String(input?.value || '').trim();
  const p = classify(text, 'terminal');
  if (p.label !== 'EMERGENCY STOP' && p.label !== 'RESUME') return;
  event.preventDefault();
  event.stopImmediatePropagation();
  if (input) input.value = '';
  if (p.label === 'RESUME') resume('terminal'); else emergencyStop('terminal');
}

document.addEventListener('click', interceptP0FromTerminal, true);
document.addEventListener('keydown', interceptP0FromTerminal, true);
window.addEventListener('ultron:wake-state', (event) => {
  if (event?.detail?.state === 'AWAKE' && !state.frozen) announcePriority('P2', 'VOICE AUTHORITY');
});

const installTimer = setInterval(() => {
  const orchestratorReady = installOrchestratorGate();
  const guards = installRuntimeGuards();
  if (orchestratorReady && guards.core && guards.devices && guards.vision) clearInterval(installTimer);
}, 120);
setTimeout(() => clearInterval(installTimer), 20000);
installOrchestratorGate();
installRuntimeGuards();

window.ULTRON_PRIORITY = {
  version: VERSION,
  classify,
  stop: emergencyStop,
  resume,
  installRuntimeGuards,
  get state() { return { ...state }; }
};

window.dispatchEvent(new CustomEvent('ultron:priority-ready', { detail: { version: VERSION, hierarchy: ['P0','P1','P2','P3','P4','P5'] } }));
log('NEURAL PRIORITY CORE v4.30.0 // P0→P5 READY.');
