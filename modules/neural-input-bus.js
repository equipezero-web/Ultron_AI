const adapters = new Map();
const listeners = new Set();
const TRUSTED_SOURCES = new Set(['pointer','touch','keyboard','device-bridge','emg','eye-tracker','subvocal']);

const state = {
  lastEvent: null,
  emg: { connected: false, pinch: 0, wrist: 0, fist: 0 },
  gaze: { connected: false, x: null, y: null, confidence: 0 },
  subvocal: { connected: false, confidence: 0 },
  hardware: { emg: false, gaze: false, subvocal: false }
};

function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function emit(event) {
  state.lastEvent = { ...event, at: Date.now() };
  for (const listener of listeners) {
    try { listener(state.lastEvent, state); } catch (error) { console.warn('ULTRON neural listener:', error); }
  }
  window.dispatchEvent(new CustomEvent('ultron:neural-input', { detail: state.lastEvent }));
}

function executeSubvocal(text, confidence = 0) {
  const clean = String(text || '').trim();
  if (!clean || confidence < 0.72) return false;

  const input = document.getElementById('command-input');
  const send = document.getElementById('btn-send');
  if (!input || !send) return false;

  input.value = clean;
  window.dispatchEvent(new CustomEvent('ultron:subvocal-command', { detail: { text: clean, confidence } }));
  send.click();
  return true;
}

function routeToStarkCore(event) {
  const core = window.ULTRON_STARK_CORE;
  if (!core) return false;

  if (event.type === 'pinch') {
    core.ingestGesture({
      type: 'pinch',
      dx: safeNumber(event.dx),
      dy: safeNumber(event.dy),
      scaleDelta: safeNumber(event.scaleDelta)
    });
    return true;
  }

  if (event.type === 'air-tap') {
    core.ingestGesture({
      type: 'air-tap',
      x: safeNumber(event.x, innerWidth / 2),
      y: safeNumber(event.y, innerHeight / 2)
    });
    return true;
  }

  if (event.type === 'sweep') {
    core.ingestGesture({ type: 'sweep', direction: event.direction === 'right' ? 'right' : 'left' });
    return true;
  }

  if (event.type === 'focus') {
    core.ingestGesture({ type: 'focus', label: String(event.label || '') });
    return true;
  }

  return false;
}

function ingest(event = {}, { trusted = false } = {}) {
  const source = String(event.source || 'unknown').toLowerCase();
  const type = String(event.type || '').toLowerCase();

  if (!trusted && !TRUSTED_SOURCES.has(source)) {
    return { ok: false, error: 'Fonte neural não autorizada.' };
  }

  if (!type) return { ok: false, error: 'Tipo de entrada neural ausente.' };

  const normalized = { ...event, source, type, at: Date.now() };

  if (source === 'emg') {
    state.emg.connected = true;
    state.hardware.emg = true;
    if ('pinch' in event) state.emg.pinch = safeNumber(event.pinch);
    if ('wrist' in event) state.emg.wrist = safeNumber(event.wrist);
    if ('fist' in event) state.emg.fist = safeNumber(event.fist);
  }

  if (source === 'eye-tracker') {
    state.gaze.connected = true;
    state.hardware.gaze = true;
    state.gaze.x = safeNumber(event.x, null);
    state.gaze.y = safeNumber(event.y, null);
    state.gaze.confidence = safeNumber(event.confidence);
  }

  if (source === 'subvocal') {
    state.subvocal.connected = true;
    state.hardware.subvocal = true;
    state.subvocal.confidence = safeNumber(event.confidence);
  }

  let handled = routeToStarkCore(normalized);

  if (type === 'gaze') {
    const element = document.elementFromPoint(safeNumber(event.x), safeNumber(event.y));
    const node = element?.closest?.('.stark-node');
    if (node) {
      handled = window.ULTRON_STARK_CORE?.focus?.(node.dataset.label) || handled;
    }
  }

  if (type === 'subvocal') {
    handled = executeSubvocal(event.text, safeNumber(event.confidence)) || handled;
  }

  emit({ ...normalized, handled });
  return { ok: true, handled };
}

function registerAdapter(name, adapter) {
  const key = String(name || '').trim().toLowerCase();
  if (!key || !adapter || typeof adapter !== 'object') throw new Error('Adapter neural inválido.');
  if (adapters.has(key)) throw new Error(`Adapter neural já registrado: ${key}`);
  adapters.set(key, adapter);
  return true;
}

async function connectAdapter(name, options = {}) {
  const key = String(name || '').trim().toLowerCase();
  const adapter = adapters.get(key);
  if (!adapter?.connect) throw new Error(`Adapter neural indisponível: ${key}`);
  return adapter.connect({ ...options, ingest: (event) => ingest({ ...event, source: event.source || key }, { trusted: true }) });
}

async function disconnectAdapter(name) {
  const key = String(name || '').trim().toLowerCase();
  const adapter = adapters.get(key);
  if (!adapter?.disconnect) return false;
  await adapter.disconnect();
  return true;
}

// Generic serial adapter: hardware may stream one JSON object per line.
registerAdapter('serial', {
  port: null,
  reader: null,
  async connect({ baudRate = 115200, ingest: sink }) {
    if (!('serial' in navigator)) throw new Error('Web Serial não suportado neste navegador.');
    this.port = await navigator.serial.requestPort();
    await this.port.open({ baudRate });
    const decoder = new TextDecoderStream();
    this.port.readable.pipeTo(decoder.writable).catch(() => {});
    this.reader = decoder.readable.getReader();
    let buffer = '';
    (async () => {
      while (this.reader) {
        const { value, done } = await this.reader.read();
        if (done) break;
        buffer += value || '';
        let newline;
        while ((newline = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, newline).trim();
          buffer = buffer.slice(newline + 1);
          if (!line) continue;
          try { sink(JSON.parse(line)); } catch {}
        }
      }
    })();
    return { ok: true, transport: 'web-serial' };
  },
  async disconnect() {
    try { await this.reader?.cancel(); } catch {}
    this.reader = null;
    try { await this.port?.close(); } catch {}
    this.port = null;
  }
});

// Device Bridge can inject already-authorized sensor events without exposing a browser hardware API.
window.addEventListener('ultron:device-sensor', (event) => {
  const payload = event?.detail || {};
  ingest({ ...payload, source: payload.source || 'device-bridge' }, { trusted: true });
});

window.ULTRON_NEURAL_INPUT = {
  ingest,
  registerAdapter,
  connectAdapter,
  disconnectAdapter,
  subscribe(listener) {
    if (typeof listener !== 'function') return () => {};
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  get state() { return JSON.parse(JSON.stringify(state)); },
  get adapters() { return [...adapters.keys()]; }
};

window.dispatchEvent(new CustomEvent('ultron:neural-bus-ready', { detail: { adapters: [...adapters.keys()] } }));
