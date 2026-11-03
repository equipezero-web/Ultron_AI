const PROFILE_KEY = 'ultron_voice_match_profile_v1';
const SETTINGS_KEY = 'ultron_voice_match_settings_v1';
const SAMPLE_COUNT = 3;
const CAPTURE_MS = 1800;
const RECENT_WINDOW_MS = 3200;
const FRAME_INTERVAL_MS = 80;
const MIN_RMS = 0.012;

const output = document.getElementById('output-box');
const statusEl = document.getElementById('voice-match-state');
const enrollButton = document.getElementById('btn-enroll-voice-match');
const disableButton = document.getElementById('btn-disable-voice-match');

let monitor = null;
let monitorTimer = null;
let monitorOpening = null;
let monitorClosing = false;
let ttsSpeaking = false;
let recentFrames = [];
let enrolling = false;
let lastVerification = null;

function log(message, alert = false) {
  if (!output) return;
  const line = document.createElement('p');
  if (alert) line.className = 'alert';
  const time = new Date().toLocaleTimeString('pt-BR', { hour12: false });
  line.textContent = `> [${time}] [VOICE-MATCH] ${message}`;
  output.appendChild(line);
  output.scrollTop = output.scrollHeight;
}

function safeJsonParse(value, fallback) {
  try { return JSON.parse(value); } catch { return fallback; }
}

function loadProfile() {
  return safeJsonParse(localStorage.getItem(PROFILE_KEY), null);
}

function loadSettings() {
  return {
    required: true,
    allowTrustedMobile: true,
    ...safeJsonParse(localStorage.getItem(SETTINGS_KEY), {})
  };
}

function saveSettings(settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function setStatus(state, detail = '') {
  if (!statusEl) return;
  const labels = {
    missing: 'NÃO CADASTRADO',
    ready: 'READY',
    enrolling: 'CADASTRANDO',
    match: 'MATCH',
    rejected: 'REJECTED',
    error: 'ERROR',
    disabled: 'DESATIVADO'
  };
  statusEl.textContent = detail || labels[state] || state.toUpperCase();
  statusEl.className = ['ready', 'match', 'enrolling'].includes(state) ? 'green' : '';
}

function currentProfile() {
  return loadProfile();
}

function isEnrolled() {
  const profile = currentProfile();
  return Boolean(profile?.vector?.length && profile?.version === 1);
}

function settings() {
  return loadSettings();
}

function normalizeVector(vector) {
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
  return vector.map((value) => value / norm);
}

function cosineSimilarity(a, b) {
  if (!a?.length || a.length !== b?.length) return 0;
  let dot = 0;
  let aa = 0;
  let bb = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    aa += a[i] * a[i];
    bb += b[i] * b[i];
  }
  return dot / ((Math.sqrt(aa) * Math.sqrt(bb)) || 1);
}

function averageVectors(vectors) {
  if (!vectors.length) return [];
  const size = vectors[0].length;
  const out = new Array(size).fill(0);
  for (const vector of vectors) {
    for (let i = 0; i < size; i += 1) out[i] += Number(vector[i] || 0);
  }
  return out.map((value) => value / vectors.length);
}

function featureFrame(analyser, sampleRate) {
  const frequency = new Float32Array(analyser.frequencyBinCount);
  const time = new Float32Array(analyser.fftSize);
  analyser.getFloatFrequencyData(frequency);
  analyser.getFloatTimeDomainData(time);

  let rmsSum = 0;
  let zeroCrossings = 0;
  for (let i = 0; i < time.length; i += 1) {
    const value = time[i];
    rmsSum += value * value;
    if (i > 0 && Math.sign(time[i - 1]) !== Math.sign(value)) zeroCrossings += 1;
  }
  const rms = Math.sqrt(rmsSum / time.length);
  if (!Number.isFinite(rms) || rms < MIN_RMS) return null;

  const minHz = 100;
  const maxHz = Math.min(4200, sampleRate / 2 - 50);
  const bands = 14;
  const values = [];
  let weightedHz = 0;
  let powerTotal = 0;

  for (let band = 0; band < bands; band += 1) {
    const t0 = band / bands;
    const t1 = (band + 1) / bands;
    const lowHz = minHz * Math.pow(maxHz / minHz, t0);
    const highHz = minHz * Math.pow(maxHz / minHz, t1);
    const start = Math.max(1, Math.floor((lowHz / (sampleRate / 2)) * frequency.length));
    const end = Math.max(start + 1, Math.min(frequency.length, Math.ceil((highHz / (sampleRate / 2)) * frequency.length)));
    let sum = 0;
    let count = 0;
    for (let i = start; i < end; i += 1) {
      const db = Number.isFinite(frequency[i]) ? frequency[i] : -120;
      const linear = Math.pow(10, db / 20);
      sum += linear;
      count += 1;
      const hz = (i / frequency.length) * (sampleRate / 2);
      weightedHz += hz * linear;
      powerTotal += linear;
    }
    values.push(count ? sum / count : 0);
  }

  const spectral = normalizeVector(values);
  const centroid = powerTotal > 0 ? weightedHz / powerTotal / maxHz : 0;
  const zcr = zeroCrossings / time.length;
  return {
    at: performance.now(),
    vector: normalizeVector([...spectral, centroid, zcr])
  };
}

function aggregateFrames(frames) {
  const valid = frames.filter((frame) => frame?.vector?.length);
  if (valid.length < 4) return null;
  return normalizeVector(averageVectors(valid.map((frame) => frame.vector)));
}

async function createMonitor() {
  if (monitor) return monitor;
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('Microfone indisponível neste navegador.');

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true
    },
    video: false
  });
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) {
    stream.getTracks().forEach((track) => track.stop());
    throw new Error('Web Audio não está disponível neste navegador.');
  }

  const context = new AudioContextClass();
  const source = context.createMediaStreamSource(stream);
  const analyser = context.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.18;
  source.connect(analyser);

  monitor = { stream, context, analyser };
  stream.getAudioTracks().forEach((track) => {
    track.addEventListener('ended', () => {
      if (monitor?.stream !== stream) return;
      closeMonitor().catch(() => {});
      setStatus('error', 'MICROFONE DESCONECTADO');
      log('O microfone foi desconectado. Ative a escuta novamente para reconectar.', true);
    }, { once: true });
  });
  recentFrames = [];
  monitorTimer = setInterval(() => {
    if (!monitor || enrolling || ttsSpeaking || document.hidden || document.body.classList.contains("jarvis-voice-paused")) return;
    const frame = featureFrame(monitor.analyser, monitor.context.sampleRate);
    if (frame) recentFrames.push(frame);
    const cutoff = performance.now() - RECENT_WINDOW_MS;
    recentFrames = recentFrames.filter((item) => item.at >= cutoff);
  }, FRAME_INTERVAL_MS);
  return monitor;
}

function openMonitor() {
  if (monitor) return Promise.resolve(monitor);
  if (monitorClosing) return Promise.reject(new Error('Monitor de voz em encerramento.'));
  if (!monitorOpening) {
    monitorOpening = createMonitor().finally(() => { monitorOpening = null; });
  }
  return monitorOpening;
}

async function closeMonitor() {
  monitorClosing = true;
  if (monitorOpening) await monitorOpening.catch(() => {});
  if (monitorTimer) clearInterval(monitorTimer);
  monitorTimer = null;
  recentFrames = [];
  if (!monitor) { monitorClosing = false; return; }
  const closingMonitor = monitor;
  monitor = null;
  try {
    closingMonitor.stream?.getTracks?.().forEach((track) => track.stop());
    if (closingMonitor.context && closingMonitor.context.state !== 'closed') {
      await closingMonitor.context.close().catch(() => {});
    }
  } finally {
    monitorClosing = false;
  }
}

async function captureSample(ms = CAPTURE_MS) {
  const active = await openMonitor();
  const frames = [];
  const started = performance.now();
  while (performance.now() - started < ms) {
    const frame = featureFrame(active.analyser, active.context.sampleRate);
    if (frame) frames.push(frame);
    await new Promise((resolve) => setTimeout(resolve, FRAME_INTERVAL_MS));
  }
  return aggregateFrames(frames);
}

async function enroll() {
  if (enrolling) return false;
  enrolling = true;
  setStatus('enrolling');
  window.ULTRON_VOICE_INPUT?.suspend?.('voice-match-enroll');
  recentFrames = [];

  try {
    const samples = [];
    for (let index = 0; index < SAMPLE_COUNT; index += 1) {
      log(`AMOSTRA ${index + 1}/${SAMPLE_COUNT}: diga “Jarvis” com sua voz normal.`);
      await new Promise((resolve) => setTimeout(resolve, 650));
      const vector = await captureSample();
      if (!vector) throw new Error('Pouca voz detectada. Fale mais próximo do microfone e tente novamente.');
      samples.push(vector);
      log(`AMOSTRA ${index + 1}/${SAMPLE_COUNT}: capturada.`);
      await new Promise((resolve) => setTimeout(resolve, 450));
    }

    const template = normalizeVector(averageVectors(samples));
    const similarities = samples.map((sample) => cosineSimilarity(sample, template));
    const minSimilarity = Math.min(...similarities);
    const threshold = Math.max(0.78, Math.min(0.91, minSimilarity - 0.06));
    const profile = {
      version: 1,
      createdAt: new Date().toISOString(),
      samples: SAMPLE_COUNT,
      vector: template,
      threshold
    };
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    saveSettings({ ...settings(), required: true });
    setStatus('ready');
    log(`Perfil vocal local cadastrado. Limiar dinâmico: ${Math.round(threshold * 100)}%.`);
    window.dispatchEvent(new CustomEvent('ultron:voice-match-enrolled', { detail: { threshold } }));
    return true;
  } catch (error) {
    setStatus('error');
    log(`Falha no cadastro de voz: ${error?.message || error}`, true);
    return false;
  } finally {
    enrolling = false;
    window.ULTRON_VOICE_INPUT?.resume?.('voice-match-enroll');
  }
}

async function verifyLocalWake() {
  const profile = currentProfile();
  if (!profile?.vector?.length) {
    return { matched: true, method: 'wake-word-only', score: null, enrolled: false };
  }

  try {
    await openMonitor();
  } catch (error) {
    return { matched: false, method: 'local-voice-match', score: null, reason: error?.message || String(error) };
  }

  const cutoff = performance.now() - RECENT_WINDOW_MS;
  const vector = aggregateFrames(recentFrames.filter((frame) => frame.at >= cutoff));
  if (!vector) {
    return { matched: false, method: 'local-voice-match', score: null, reason: 'Áudio insuficiente para comparar a voz.' };
  }

  const score = cosineSimilarity(vector, profile.vector);
  const threshold = Number(profile.threshold || 0.82);
  const matched = score >= threshold;
  lastVerification = { at: Date.now(), score, threshold, matched };
  setStatus(matched ? 'match' : 'rejected', `${matched ? 'MATCH' : 'REJECTED'} ${Math.round(score * 100)}%`);
  setTimeout(() => {
    if (isEnrolled()) setStatus('ready');
  }, 1800);
  window.dispatchEvent(new CustomEvent('ultron:voice-match-result', { detail: lastVerification }));
  return { matched, method: 'local-voice-match', score, threshold };
}

async function authorizeWake({ source = 'local', trustedDevice = false, voiceMatch = false } = {}) {
  const cfg = settings();
  const profile = currentProfile();
  if (!profile?.vector?.length || cfg.required === false) {
    return { matched: true, method: profile?.vector?.length ? 'voice-match-disabled' : 'wake-word-only' };
  }

  if (source === 'mobile') {
    if (voiceMatch === true) return { matched: true, method: 'mobile-voice-match' };
    if (cfg.allowTrustedMobile && trustedDevice) {
      return { matched: true, method: 'paired-mobile-trust' };
    }
    return { matched: false, method: 'remote-unverified', reason: 'Fonte remota sem Voice Match verificável.' };
  }

  return verifyLocalWake();
}

async function enableRequired() {
  if (!isEnrolled()) {
    log('Cadastre sua voz antes de exigir Voice Match.', true);
    return false;
  }
  saveSettings({ ...settings(), required: true });
  setStatus('ready');
  await openMonitor().catch(() => {});
  return true;
}

function disableRequired() {
  saveSettings({ ...settings(), required: false });
  setStatus('disabled');
  log('Voice Match desativado. O wake word continuará funcionando sem comparação de voz.');
  return true;
}

async function initialize() {
  const profile = currentProfile();
  const cfg = settings();
  if (!profile?.vector?.length) {
    setStatus('missing');
    return;
  }
  if (cfg.required === false) {
    setStatus('disabled');
    return;
  }
  setStatus('ready');
  try {
    const permission = await navigator.permissions?.query?.({ name: 'microphone' });
    if (!permission || permission.state === 'granted') await openMonitor();
  } catch {}
}

enrollButton?.addEventListener('click', enroll);
disableButton?.addEventListener('click', () => {
  if (settings().required === false) enableRequired();
  else disableRequired();
});

window.addEventListener('ultron:speech-start', () => { ttsSpeaking = true; recentFrames = []; });
window.addEventListener('ultron:speech-end', () => { ttsSpeaking = false; recentFrames = []; });

window.addEventListener('ultron:voice-listening-enabled', () => {
  if (isEnrolled() && settings().required !== false) openMonitor().catch(() => {});
});
window.addEventListener('beforeunload', () => closeMonitor());

window.ULTRON_VOICE_MATCH = {
  version: '4.32.2',
  enroll,
  authorizeWake,
  verifyLocalWake,
  enableRequired,
  disableRequired,
  get enrolled() { return isEnrolled(); },
  get required() { return isEnrolled() && settings().required !== false; },
  get allowTrustedMobile() { return settings().allowTrustedMobile !== false; },
  get state() {
    return {
      enrolled: isEnrolled(),
      required: isEnrolled() && settings().required !== false,
      monitorActive: Boolean(monitor),
      monitorOpening: Boolean(monitorOpening),
      monitorClosing,
      ttsSpeaking,
      lastVerification
    };
  }
};

initialize();
