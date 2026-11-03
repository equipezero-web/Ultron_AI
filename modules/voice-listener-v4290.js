import { loadPreferences, savePreferences } from './storage.js';
import { addLog } from './system.js';
import API_CONFIG from '../config.js';
import {
  VOICE_RUNTIME_POLICY,
  normalizeVoiceText,
  restartDelayFor,
  nextFailureState,
  isLikelySpeechEcho,
  isDuplicateVoiceText
} from './voice-runtime-policy.js';

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const WAKE_ALIASES = ['ultron', 'outron', 'utron', 'ultra on', 'ultraon'];
const IS_ANDROID = /Android/i.test(navigator.userAgent || '');
const API_BASE = String(API_CONFIG?.backendUrl || '').replace(/\/$/, '');

const $ = (id) => document.getElementById(id);
const output = $('output-box');
const button = $('btn-listen-voice');
const testMicButton = $('btn-test-mic');
const micModule = $('mic-module');
const systemMode = $('system-mode');
const audio = $('voice-audio');
const commandInput = $('command-input');
const sendButton = $('btn-send');

let recognition = null;
let recognitionRunning = false;
let recognitionStarting = false;
let recognitionStopping = false;
let listeningEnabled = false;
let localSuspended = false;
let suspensionReason = '';
let ultronSpeaking = false;
let conversationActive = false;
let conversationUntil = 0;
let restartTimer = null;
let conversationTimer = null;
let audioPauseTimer = null;
let stableTimer = null;
let restartGeneration = 0;
let failureTimes = [];
let restartFailures = 0;
let restartBlockedUntil = 0;
let recognitionStartedAt = 0;
let lastRecognitionError = '';
let lastFinalTranscript = '';
let lastFinalAt = 0;
let lastCommandTranscript = '';
let lastCommandAt = 0;
let lastUltronSpeechText = '';
let lastUltronSpeechEndedAt = 0;
let echoGuardUntil = 0;
let speechSources = new Set();
let wakeAuthorizationBusy = false;

function sourceLabel(source) {
  return source === 'mobile' ? 'VOZ CELULAR' : 'VOZ';
}

function setMicState(state, detail = '') {
  if (!micModule) return;
  const states = {
    unsupported: ['INDISPONÍVEL', 'MIC INDISPONÍVEL'],
    off: ['STANDBY', 'ATIVAR ESCUTA'],
    ready: ['READY', 'ATIVAR ESCUTA'],
    passive: ['VOICE STANDBY', 'ESCUTA: PASSIVA'],
    active: ['AWAKE', 'CONVERSA ATIVA'],
    hearing: ['HEARING', 'OUVINDO...'],
    speaking: ['PAUSED', 'ULTRON FALANDO'],
    suspended: ['SUSPENDED', 'MIC LOCAL PAUSADO'],
    recovering: ['RECOVERING', 'RECUPERANDO MIC'],
    blocked: ['BLOCKED', 'MIC BLOQUEADO'],
    error: ['ERROR', 'REATIVAR ESCUTA']
  };
  const [moduleText, buttonText] = states[state] || states.off;
  micModule.textContent = detail || moduleText;
  micModule.className = ['passive', 'active', 'hearing', 'speaking', 'ready', 'suspended', 'recovering'].includes(state) ? 'green' : '';
  if (button) button.textContent = buttonText;
}

function setWakeUi(awake, detail = '') {
  document.body.classList.toggle('ultron-voice-awake', Boolean(awake));
  if (systemMode) systemMode.textContent = awake ? 'AWAKE' : 'VOICE STANDBY';
  window.dispatchEvent(new CustomEvent('ultron:wake-state', {
    detail: { awake: Boolean(awake), detail, at: Date.now() }
  }));
}

function canRunRecognition() {
  return Boolean(recognition && listeningEnabled && !localSuspended && !ultronSpeaking && Date.now() >= echoGuardUntil);
}

function clearRestartTimer() {
  restartGeneration += 1;
  if (restartTimer) clearTimeout(restartTimer);
  restartTimer = null;
}
function clearConversationTimer() {
  if (conversationTimer) clearTimeout(conversationTimer);
  conversationTimer = null;
}
function clearAudioPauseTimer() {
  if (audioPauseTimer) clearTimeout(audioPauseTimer);
  audioPauseTimer = null;
}
function clearStableTimer() {
  if (stableTimer) clearTimeout(stableTimer);
  stableTimer = null;
}
function resetFailureState() {
  failureTimes = [];
  restartFailures = 0;
  restartBlockedUntil = 0;
  lastRecognitionError = '';
}
function markRecognitionHealthy() {
  resetFailureState();
  clearStableTimer();
}
function registerRecognitionFailure(error) {
  const now = Date.now();
  const state = nextFailureState(failureTimes, now);
  failureTimes = state.times;
  restartFailures = state.count;
  lastRecognitionError = String(error || 'unknown');
  if (state.blockedUntil) restartBlockedUntil = state.blockedUntil;
  if (state.burst) {
    setMicState('recovering', 'MIC EM BACKOFF');
    addLog(output, `VOZ: falhas seguidas. Recuperação pausada por ${Math.round(VOICE_RUNTIME_POLICY.burstCooldownMs / 1000)}s para evitar loop.`, 'alert');
  }
}

function findWakeAlias(normalized) {
  for (const alias of WAKE_ALIASES) {
    const normalizedAlias = normalizeVoiceText(alias);
    const index = normalized.indexOf(normalizedAlias);
    if (index !== -1) return { alias: normalizedAlias, index };
  }
  return null;
}
function extractWakeCommand(transcript) {
  const normalized = normalizeVoiceText(transcript);
  const match = findWakeAlias(normalized);
  if (!match) return null;
  return normalized.slice(match.index + match.alias.length).replace(/^[\s,:;.!?-]+/, '').trim();
}

function setPassiveMode({ announce = false } = {}) {
  conversationActive = false;
  conversationUntil = 0;
  clearConversationTimer();
  setWakeUi(false, 'passive');
  if (listeningEnabled && !ultronSpeaking && !localSuspended) setMicState('passive');
  if (announce) addLog(output, 'VOICE STANDBY: diga “Ultron” para acordar o sistema.');
}

function activateConversation({ announceWake = false, resetTimer = true, method = 'wake-word' } = {}) {
  conversationActive = true;
  conversationUntil = Date.now() + VOICE_RUNTIME_POLICY.conversationWindowMs;
  setWakeUi(true, method);
  if (resetTimer) {
    clearConversationTimer();
    conversationTimer = setTimeout(() => {
      if (conversationActive && Date.now() >= conversationUntil && !ultronSpeaking) setPassiveMode({ announce: true });
    }, VOICE_RUNTIME_POLICY.conversationWindowMs + 250);
  }
  if (listeningEnabled && !ultronSpeaking && !localSuspended) setMicState('active');
  if (announceWake) addLog(output, `ULTRON: acordado (${method}). Pode falar normalmente.`);
}

function isSleepCommand(text) {
  const normalized = normalizeVoiceText(text);
  return ['dormir', 'durma', 'modo passivo', 'pare de responder', 'encerrar conversa', 'finalizar conversa']
    .some((command) => normalized === command || normalized.endsWith(` ${command}`));
}

async function routeVoiceCommand(cleanCommand, source = 'local') {
  const orchestrator = window.ULTRON_ORCHESTRATOR;
  if (orchestrator?.execute) {
    return orchestrator.execute(cleanCommand, source === 'mobile' ? 'voice-mobile' : 'voice');
  }
  const visionRouter = window.ULTRON_VISION_ROUTER;
  if (visionRouter?.isVisualAnalysisCommand?.(cleanCommand)) {
    await visionRouter.run(cleanCommand);
    return { handled: true, route: 'vision' };
  }
  const devices = window.ULTRON_DEVICES;
  const deviceIntent = devices?.parseTvIntent?.(cleanCommand) || null;
  if (deviceIntent) {
    await devices.routeNaturalLanguage(cleanCommand, deviceIntent);
    return { handled: true, route: 'device' };
  }
  if (!commandInput || !sendButton) return { handled: false, route: 'none' };
  commandInput.value = cleanCommand;
  sendButton.click();
  return { handled: true, route: 'terminal' };
}

async function executeVoiceCommand(command, { source = 'local', bypassDedupe = false } = {}) {
  const cleanCommand = String(command || '').trim();
  if (!cleanCommand) return { handled: false };
  if (isSleepCommand(cleanCommand)) {
    setPassiveMode({ announce: true });
    return { handled: true, route: 'sleep' };
  }
  const normalized = normalizeVoiceText(cleanCommand);
  const now = Date.now();
  if (!bypassDedupe && isDuplicateVoiceText(normalized, lastCommandTranscript, now - lastCommandAt, VOICE_RUNTIME_POLICY.commandDedupeMs)) {
    return { handled: false, duplicate: true };
  }
  lastCommandTranscript = normalized;
  lastCommandAt = now;
  activateConversation({ resetTimer: true, method: 'conversation' });
  addLog(output, `${sourceLabel(source)}: ${cleanCommand}`);
  return routeVoiceCommand(cleanCommand, source);
}

function shouldIgnoreAsEcho(transcript) {
  const now = Date.now();
  if (now < echoGuardUntil) return true;
  if (!lastUltronSpeechText || !lastUltronSpeechEndedAt) return false;
  if (now - lastUltronSpeechEndedAt > VOICE_RUNTIME_POLICY.spokenEchoWindowMs) return false;
  return isLikelySpeechEcho(transcript, lastUltronSpeechText);
}

async function authorizeWake(source, meta = {}) {
  if (wakeAuthorizationBusy) return { matched: false, reason: 'busy' };
  wakeAuthorizationBusy = true;
  try {
    const voiceMatch = window.ULTRON_VOICE_MATCH;
    if (!voiceMatch?.authorizeWake) return { matched: true, method: 'wake-word-only' };
    const result = await voiceMatch.authorizeWake({
      source,
      trustedDevice: Boolean(meta.trustedDevice),
      voiceMatch: Boolean(meta.voiceMatch)
    });
    if (!result?.matched) {
      const score = Number.isFinite(result?.score) ? ` (${Math.round(result.score * 100)}%)` : '';
      addLog(output, `VOICE MATCH: voz não autorizada${score}. O Ultron permanece em standby.`, 'alert');
      setMicState('passive', 'VOICE REJECTED');
      setWakeUi(false, 'voice-rejected');
      return result || { matched: false };
    }
    const score = Number.isFinite(result?.score) ? ` ${Math.round(result.score * 100)}%` : '';
    addLog(output, `VOICE MATCH: autorizado por ${result?.method || 'wake'}${score}.`);
    return result;
  } finally {
    wakeAuthorizationBusy = false;
  }
}

async function processTranscript(transcript, { source = 'local', meta = {}, localGuards = true } = {}) {
  const cleanTranscript = String(transcript || '').trim();
  if (!cleanTranscript || ultronSpeaking || !listeningEnabled) return { handled: false };
  if (localGuards && localSuspended) return { handled: false };
  if (localGuards && shouldIgnoreAsEcho(cleanTranscript)) {
    addLog(output, 'VOZ: eco da própria resposta do Ultron ignorado.');
    return { handled: false, echo: true };
  }

  const normalized = normalizeVoiceText(cleanTranscript);
  const now = Date.now();
  if (isDuplicateVoiceText(normalized, lastFinalTranscript, now - lastFinalAt, VOICE_RUNTIME_POLICY.finalDedupeMs)) {
    return { handled: false, duplicate: true };
  }
  lastFinalTranscript = normalized;
  lastFinalAt = now;
  markRecognitionHealthy();
  addLog(output, `${sourceLabel(source)} OUVIU: ${cleanTranscript}`);

  const wakeCommand = extractWakeCommand(cleanTranscript);
  if (conversationActive && now <= conversationUntil) {
    if (wakeCommand !== null) {
      if (wakeCommand) return executeVoiceCommand(wakeCommand, { source });
      activateConversation({ announceWake: true, resetTimer: true, method: 'conversation' });
      return { handled: true, route: 'wake-refresh' };
    }
    return executeVoiceCommand(cleanTranscript, { source });
  }

  if (wakeCommand === null) return { handled: false, passive: true };
  const authorization = await authorizeWake(source, meta);
  if (!authorization?.matched) return { handled: false, rejected: true, authorization };

  activateConversation({ announceWake: !wakeCommand, resetTimer: true, method: authorization.method || 'voice-match' });
  if (wakeCommand) return executeVoiceCommand(wakeCommand, { source });
  return { handled: true, route: 'wake', authorization };
}

function handleFinalTranscript(transcript) {
  processTranscript(transcript, { source: 'local', localGuards: true }).catch((error) => {
    addLog(output, `VOICE MATCH: falha ao processar despertar — ${error?.message || error}`, 'alert');
  });
}

function nextRestartDelay() {
  return restartDelayFor({ failures: restartFailures, isAndroid: IS_ANDROID, blockedUntil: restartBlockedUntil, now: Date.now() });
}
function scheduleRecognitionRestart(delay = null) {
  if (!listeningEnabled || localSuspended || ultronSpeaking || recognitionRunning || recognitionStarting || recognitionStopping) return;
  clearRestartTimer();
  const generation = restartGeneration;
  const guardDelay = Math.max(0, echoGuardUntil - Date.now());
  const plannedDelay = Math.max(guardDelay, delay == null ? nextRestartDelay() : Number(delay) || 0);
  restartTimer = setTimeout(() => {
    restartTimer = null;
    if (generation !== restartGeneration) return;
    startRecognition({ quiet: true });
  }, plannedDelay);
}
function startRecognition({ quiet = false } = {}) {
  if (!recognition || recognitionRunning || recognitionStarting || recognitionStopping || !canRunRecognition()) return;
  clearRestartTimer();
  recognitionStarting = true;
  if (!quiet || restartFailures > 0) {
    setMicState(restartFailures > 0 ? 'recovering' : (conversationActive ? 'active' : 'passive'), restartFailures > 0 ? 'RECUPERANDO MIC...' : 'CONECTANDO MIC...');
  }
  try {
    recognition.start();
  } catch (error) {
    recognitionStarting = false;
    registerRecognitionFailure(error?.name || 'start-error');
    if (error?.name !== 'InvalidStateError') console.error('ULTRON voice recognition start:', error);
    scheduleRecognitionRestart();
  }
}
function stopRecognition({ abort = true } = {}) {
  clearRestartTimer();
  clearStableTimer();
  if (!recognition || (!recognitionRunning && !recognitionStarting)) {
    recognitionStarting = false;
    recognitionStopping = false;
    return;
  }
  recognitionStopping = true;
  try {
    if (abort && typeof recognition.abort === 'function') recognition.abort();
    else recognition.stop();
  } catch {
    recognitionRunning = false;
    recognitionStarting = false;
    recognitionStopping = false;
  }
}

function createRecognition() {
  if (!SpeechRecognition) return null;
  const instance = new SpeechRecognition();
  instance.lang = 'pt-BR';
  instance.continuous = !IS_ANDROID;
  instance.interimResults = true;
  instance.maxAlternatives = 1;
  instance.onstart = () => {
    recognitionStarting = false;
    recognitionStopping = false;
    recognitionRunning = true;
    recognitionStartedAt = Date.now();
    clearStableTimer();
    stableTimer = setTimeout(() => {
      if (recognitionRunning && Date.now() - recognitionStartedAt >= VOICE_RUNTIME_POLICY.stableSessionMs) markRecognitionHealthy();
    }, VOICE_RUNTIME_POLICY.stableSessionMs + 100);
    if (!ultronSpeaking && listeningEnabled && !localSuspended) setMicState(conversationActive ? 'active' : 'passive');
  };
  instance.onspeechstart = () => {
    if (listeningEnabled && !ultronSpeaking && !localSuspended) setMicState('hearing', 'VOZ DETECTADA');
  };
  instance.onspeechend = () => {
    if (listeningEnabled && !ultronSpeaking && !localSuspended) setMicState(conversationActive ? 'active' : 'passive', 'PROCESSANDO VOZ...');
  };
  instance.onresult = (event) => {
    let interim = '';
    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const result = event.results[index];
      const transcript = result[0]?.transcript || '';
      if (result.isFinal) handleFinalTranscript(transcript);
      else interim += transcript;
    }
    if (interim.trim() && listeningEnabled && !ultronSpeaking && !localSuspended) setMicState('hearing', 'OUVINDO...');
  };
  instance.onerror = (event) => {
    const error = event?.error || 'unknown';
    lastRecognitionError = error;
    if (error === 'not-allowed' || error === 'service-not-allowed') {
      listeningEnabled = false;
      recognitionRunning = false;
      recognitionStarting = false;
      recognitionStopping = false;
      clearRestartTimer();
      setMicState('blocked');
      addLog(output, 'MICROFONE: acesso bloqueado. Libere o microfone nas permissões do navegador.', 'alert');
      return;
    }
    if (error === 'audio-capture') {
      registerRecognitionFailure(error);
      setMicState('error', 'FALHA DE CAPTURA');
      addLog(output, 'MICROFONE: falha de captura. O Ultron tentará recuperar automaticamente.', 'alert');
      return;
    }
    if (error === 'network') {
      registerRecognitionFailure(error);
      setMicState('recovering', 'REDE DE VOZ INSTÁVEL');
      return;
    }
    if (!['no-speech', 'aborted'].includes(error)) registerRecognitionFailure(error);
  };
  instance.onend = () => {
    recognitionRunning = false;
    recognitionStarting = false;
    recognitionStopping = false;
    clearStableTimer();
    if (listeningEnabled && !ultronSpeaking && !localSuspended) {
      setMicState(restartFailures > 0 ? 'recovering' : (conversationActive ? 'active' : 'passive'));
      scheduleRecognitionRestart();
    }
  };
  return instance;
}

async function microphonePermissionState() {
  if (!navigator.permissions?.query) return 'unknown';
  try { return (await navigator.permissions.query({ name: 'microphone' })).state; } catch { return 'unknown'; }
}
async function ensureMicrophonePermission() {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('Este navegador não oferece acesso direto ao microfone.');
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    video: false
  });
  stream.getTracks().forEach((track) => track.stop());
  const prefs = loadPreferences();
  prefs.microphoneAccepted = true;
  prefs.voiceWakeEnabled = true;
  savePreferences(prefs);
}
async function testPhysicalMicrophone() {
  if (!navigator.mediaDevices?.getUserMedia) return;
  let stream;
  let context;
  try {
    addLog(output, 'TESTE MIC: fale normalmente por 3 segundos...');
    stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    context = new (window.AudioContext || window.webkitAudioContext)();
    const source = context.createMediaStreamSource(stream);
    const analyser = context.createAnalyser();
    analyser.fftSize = 1024;
    source.connect(analyser);
    const samples = new Uint8Array(analyser.fftSize);
    let peak = 0;
    const started = performance.now();
    while (performance.now() - started < 3000) {
      analyser.getByteTimeDomainData(samples);
      let sum = 0;
      for (const sample of samples) {
        const value = (sample - 128) / 128;
        sum += value * value;
      }
      peak = Math.max(peak, Math.sqrt(sum / samples.length));
      await new Promise((resolve) => setTimeout(resolve, 60));
    }
    if (peak >= 0.012) addLog(output, `TESTE MIC: OK — som detectado (${Math.round(peak * 100)}%).`);
    else addLog(output, 'TESTE MIC: microfone abriu, mas quase nenhum som chegou.', 'alert');
  } catch (error) {
    addLog(output, `TESTE MIC: falhou — ${error?.message || error}`, 'alert');
  } finally {
    stream?.getTracks?.().forEach((track) => track.stop());
    if (context && context.state !== 'closed') context.close().catch(() => {});
  }
}

async function enableListening({ userInitiated = false, persist = true } = {}) {
  if (document.body.classList.contains("jarvis-voice-paused")) return false;
  if (!SpeechRecognition) {
    setMicState('unsupported');
    return false;
  }
  try {
    const prefs = loadPreferences();
    const permissionState = await microphonePermissionState();
    if (permissionState === 'denied') {
      setMicState('blocked');
      return false;
    }
    if (permissionState !== 'granted') {
      if (!userInitiated) {
        setMicState('ready');
        return false;
      }
      await ensureMicrophonePermission();
    } else if (!prefs.microphoneAccepted) {
      prefs.microphoneAccepted = true;
      prefs.voiceWakeEnabled = true;
      savePreferences(prefs);
    }
    listeningEnabled = true;
    localSuspended = false;
    suspensionReason = '';
    ultronSpeaking = false;
    recognition ||= createRecognition();
    resetFailureState();
    setPassiveMode({ announce: userInitiated });
    if (persist) {
      prefs.voiceWakeEnabled = true;
      savePreferences(prefs);
    }
    window.dispatchEvent(new CustomEvent('ultron:voice-listening-enabled'));
    startRecognition();
    return true;
  } catch (error) {
    listeningEnabled = false;
    setMicState(error?.name === 'NotAllowedError' ? 'blocked' : 'error');
    addLog(output, `MICROFONE: não foi possível iniciar a escuta. ${error?.message || error}`, 'alert');
    return false;
  }
}
function disableListening({ persist = true, announce = true } = {}) {
  listeningEnabled = false;
  localSuspended = false;
  suspensionReason = '';
  ultronSpeaking = false;
  speechSources.clear();
  setPassiveMode();
  stopRecognition({ abort: true });
  setMicState('off');
  if (systemMode) systemMode.textContent = 'STANDBY';
  if (persist) {
    const prefs = loadPreferences();
    prefs.voiceWakeEnabled = false;
    savePreferences(prefs);
  }
  if (announce) addLog(output, 'Escuta por voz desativada pelo operador.');
}
function suspendLocalListening(reason = 'external') {
  if (!listeningEnabled) return false;
  localSuspended = true;
  suspensionReason = reason;
  stopRecognition({ abort: true });
  setMicState('suspended', reason === 'mobile-mic' ? 'MIC CELULAR ASSUMIU' : 'MIC LOCAL PAUSADO');
  return true;
}
function resumeLocalListening(reason = 'external') {
  if (!listeningEnabled) return false;
  if (suspensionReason && reason && suspensionReason !== reason && reason !== 'force') return false;
  localSuspended = false;
  suspensionReason = '';
  if (ultronSpeaking) {
    setMicState('speaking');
    return true;
  }
  if (conversationActive && Date.now() <= conversationUntil) activateConversation({ resetTimer: true, method: 'conversation' });
  else setPassiveMode();
  scheduleRecognitionRestart(Math.max(0, echoGuardUntil - Date.now()));
  return true;
}

function isAnySpeechOutputActive() {
  const audioActive = Boolean(audio && !audio.paused && !audio.ended);
  const browserActive = Boolean(window.ULTRON_VOICE_OUTPUT?.speaking);
  return audioActive || browserActive || speechSources.size > 0;
}
function beginUltronSpeech(source = 'voice', text = '') {
  clearAudioPauseTimer();
  speechSources.add(source);
  if (text) lastUltronSpeechText = String(text);
  ultronSpeaking = true;
  echoGuardUntil = Number.POSITIVE_INFINITY;
  stopRecognition({ abort: true });
  if (listeningEnabled && !localSuspended) setMicState('speaking');
}
function finishUltronSpeech(source = 'voice', text = '') {
  clearAudioPauseTimer();
  speechSources.delete(source);
  if (text) lastUltronSpeechText = String(text);
  setTimeout(() => {
    if (speechSources.size || isAnySpeechOutputActive()) return;
    ultronSpeaking = false;
    lastUltronSpeechEndedAt = Date.now();
    const guard = IS_ANDROID ? VOICE_RUNTIME_POLICY.androidEchoGuardMs : VOICE_RUNTIME_POLICY.desktopEchoGuardMs;
    echoGuardUntil = Date.now() + guard;
    if (listeningEnabled && !localSuspended) {
      if (conversationActive && Date.now() <= conversationUntil) activateConversation({ resetTimer: true, method: 'conversation' });
      else setPassiveMode();
      scheduleRecognitionRestart(guard);
    }
  }, 90);
}
function bindSpeechPauseResume() {
  if (audio) {
    audio.addEventListener('playing', () => beginUltronSpeech('audio-element'));
    audio.addEventListener('ended', () => finishUltronSpeech('audio-element'));
    audio.addEventListener('error', () => finishUltronSpeech('audio-element'));
    audio.addEventListener('pause', () => {
      clearAudioPauseTimer();
      if (!speechSources.has('audio-element')) return;
      audioPauseTimer = setTimeout(() => {
        audioPauseTimer = null;
        if (audio.paused) finishUltronSpeech('audio-element');
      }, 450);
    });
  }
  window.addEventListener('ultron:speech-start', (event) => beginUltronSpeech(`event:${event.detail?.provider || 'browser-tts'}`, event.detail?.text || ''));
  window.addEventListener('ultron:speech-end', (event) => finishUltronSpeech(`event:${event.detail?.provider || 'browser-tts'}`, event.detail?.text || ''));
}

async function refreshGatewayHealth() {
  if (!API_BASE) return;
  try {
    const response = await fetch(`${API_BASE}/api/health`, { cache: 'no-store' });
    if (!response.ok) return;
    const data = await response.json();
    const providers = Object.values(data?.providers || {});
    const configured = providers.filter((provider) => provider?.configured).length;
    const gateway = $('gemini-module');
    if (gateway) {
      gateway.textContent = configured ? `${configured}/${providers.length || 5} ONLINE` : 'API OFF';
      gateway.className = configured ? 'green' : '';
    }
  } catch {}
}

function exposeVoiceInputApi() {
  window.ULTRON_VOICE_INPUT = {
    version: '4.29.0',
    dispatch(text, options = {}) {
      return processTranscript(text, {
        source: options.source || 'external',
        meta: {
          trustedDevice: Boolean(options.trustedDevice || options.source === 'mobile'),
          voiceMatch: Boolean(options.voiceMatch)
        },
        localGuards: false
      });
    },
    execute(text, options = {}) {
      return executeVoiceCommand(text, options);
    },
    ingestTranscript(text, options = {}) {
      return processTranscript(text, { source: options.source || 'external', meta: options, localGuards: false });
    },
    suspend: suspendLocalListening,
    resume: resumeLocalListening,
    enable: enableListening,
    disable: disableListening,
    sleep() { setPassiveMode({ announce: true }); },
    wake() { activateConversation({ announceWake: true, resetTimer: true, method: 'manual' }); },
    get state() {
      return {
        enabled: listeningEnabled,
        suspended: localSuspended,
        suspensionReason: suspensionReason || null,
        recognitionRunning,
        recognitionStarting,
        recognitionStopping,
        speaking: ultronSpeaking,
        conversationActive,
        awake: conversationActive && Date.now() <= conversationUntil,
        restartFailures,
        restartBlockedUntil: restartBlockedUntil || null,
        lastRecognitionError: lastRecognitionError || null,
        echoGuardUntil: Number.isFinite(echoGuardUntil) ? echoGuardUntil : null,
        voiceMatch: window.ULTRON_VOICE_MATCH?.state || null
      };
    }
  };
}

function initializeVoiceListener() {
  if (document.body.classList.contains("jarvis-voice-paused")) {
    setMicState("off");
    return;
  }
  recognition = createRecognition();
  exposeVoiceInputApi();
  bindSpeechPauseResume();
  refreshGatewayHealth();
  if (!SpeechRecognition) {
    setMicState('unsupported');
    return;
  }
  setMicState('off');
  setWakeUi(false, 'boot');
  button?.addEventListener('click', async () => {
    if (listeningEnabled) disableListening();
    else await enableListening({ userInitiated: true, persist: true });
  });
  testMicButton?.addEventListener('click', testPhysicalMicrophone);
  const prefs = loadPreferences();
  if (prefs.microphoneAccepted && prefs.voiceWakeEnabled !== false) enableListening({ userInitiated: false, persist: false });
  else setMicState('ready');
  window.addEventListener('online', () => {
    if (listeningEnabled && !localSuspended && !ultronSpeaking) {
      resetFailureState();
      scheduleRecognitionRestart(250);
    }
  });
  setInterval(refreshGatewayHealth, 30000);
}

initializeVoiceListener();
