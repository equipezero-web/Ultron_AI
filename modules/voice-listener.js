import { loadPreferences, savePreferences } from "./storage.js";
import { addLog } from "./system.js";
import API_CONFIG from "../config.js";
import {
  VOICE_RUNTIME_POLICY,
  normalizeVoiceText,
  restartDelayFor,
  nextFailureState,
  isLikelySpeechEcho,
  isDuplicateVoiceText
} from "./voice-runtime-policy.js";

const SpeechRecognition =
  window.SpeechRecognition || window.webkitSpeechRecognition;

const WAKE_ALIASES = ["ultron", "outron", "utron", "ultra on", "ultraon"];
const IS_ANDROID = /Android/i.test(navigator.userAgent || "");
const API_BASE = String(API_CONFIG?.backendUrl || "").replace(/\/$/, "");

const $ = (id) => document.getElementById(id);
const output = $("output-box");
const button = $("btn-listen-voice");
const testMicButton = $("btn-test-mic");
const micModule = $("mic-module");
const audio = $("voice-audio");
const commandInput = $("command-input");
const sendButton = $("btn-send");

let recognition = null;
let recognitionRunning = false;
let recognitionStarting = false;
let recognitionStopping = false;
let listeningEnabled = false;
let localSuspended = false;
let suspensionReason = "";
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
let lastRecognitionError = "";
let lastFinalTranscript = "";
let lastFinalAt = 0;
let lastCommandTranscript = "";
let lastCommandAt = 0;
let lastUltronSpeechText = "";
let lastUltronSpeechEndedAt = 0;
let echoGuardUntil = 0;
let speechSources = new Set();

function setMicState(state, detail = "") {
  if (!micModule) return;

  const states = {
    unsupported: ["INDISPONÍVEL", "MIC INDISPONÍVEL"],
    off: ["STANDBY", "ATIVAR ESCUTA"],
    ready: ["READY", "ATIVAR ESCUTA"],
    passive: ["PASSIVE", "ESCUTA: PASSIVA"],
    active: ["LISTENING", "CONVERSA ATIVA"],
    hearing: ["HEARING", "OUVINDO..."],
    speaking: ["PAUSED", "ULTRON FALANDO"],
    suspended: ["SUSPENDED", "MIC LOCAL PAUSADO"],
    recovering: ["RECOVERING", "RECUPERANDO MIC"],
    blocked: ["BLOCKED", "MIC BLOQUEADO"],
    error: ["ERROR", "REATIVAR ESCUTA"]
  };

  const [moduleText, buttonText] = states[state] || states.off;
  micModule.textContent = detail || moduleText;
  micModule.className = [
    "passive",
    "active",
    "hearing",
    "speaking",
    "ready",
    "suspended",
    "recovering"
  ].includes(state)
    ? "green"
    : "";

  if (button) button.textContent = buttonText;
}

function canRunRecognition() {
  return Boolean(
    recognition &&
    listeningEnabled &&
    !localSuspended &&
    !ultronSpeaking &&
    Date.now() >= echoGuardUntil
  );
}

function clearRestartTimer() {
  restartGeneration += 1;
  if (restartTimer) {
    clearTimeout(restartTimer);
    restartTimer = null;
  }
}

function clearConversationTimer() {
  if (conversationTimer) {
    clearTimeout(conversationTimer);
    conversationTimer = null;
  }
}

function clearAudioPauseTimer() {
  if (audioPauseTimer) {
    clearTimeout(audioPauseTimer);
    audioPauseTimer = null;
  }
}

function clearStableTimer() {
  if (stableTimer) {
    clearTimeout(stableTimer);
    stableTimer = null;
  }
}

function resetFailureState() {
  failureTimes = [];
  restartFailures = 0;
  restartBlockedUntil = 0;
  lastRecognitionError = "";
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
  lastRecognitionError = String(error || "unknown");
  if (state.blockedUntil) restartBlockedUntil = state.blockedUntil;

  if (state.burst) {
    setMicState("recovering", "MIC EM BACKOFF");
    addLog(
      output,
      `VOZ: várias falhas seguidas detectadas. Recuperação automática pausada por ${Math.round(VOICE_RUNTIME_POLICY.burstCooldownMs / 1000)}s para evitar reconexões em loop.`,
      "alert"
    );
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

  return normalized
    .slice(match.index + match.alias.length)
    .replace(/^[\s,:;.!?-]+/, "")
    .trim();
}

function setPassiveMode({ announce = false } = {}) {
  conversationActive = false;
  conversationUntil = 0;
  clearConversationTimer();

  if (listeningEnabled && !ultronSpeaking && !localSuspended) {
    setMicState("passive");
  }

  if (announce) {
    addLog(output, 'ESCUTA PASSIVA: diga "Ultron" para iniciar uma nova conversa.');
  }
}

function activateConversation({ announceWake = false, resetTimer = true } = {}) {
  conversationActive = true;
  conversationUntil = Date.now() + VOICE_RUNTIME_POLICY.conversationWindowMs;

  if (resetTimer) {
    clearConversationTimer();
    conversationTimer = setTimeout(() => {
      if (conversationActive && Date.now() >= conversationUntil && !ultronSpeaking) {
        setPassiveMode({ announce: true });
      }
    }, VOICE_RUNTIME_POLICY.conversationWindowMs + 250);
  }

  if (listeningEnabled && !ultronSpeaking && !localSuspended) {
    setMicState("active");
  }

  if (announceWake) {
    addLog(output, "ULTRON: ativado. Pode falar normalmente nas próximas mensagens.");
  }
}

function isSleepCommand(text) {
  const normalized = normalizeVoiceText(text);
  return [
    "dormir",
    "durma",
    "modo passivo",
    "pare de responder",
    "encerrar conversa",
    "finalizar conversa"
  ].some((command) => normalized === command || normalized.endsWith(` ${command}`));
}

async function routeVoiceCommand(cleanCommand, source = "local") {
  const visionRouter = window.ULTRON_VISION_ROUTER;
  if (visionRouter?.isVisualAnalysisCommand?.(cleanCommand)) {
    addLog(output, `${source === "mobile" ? "VOZ CELULAR" : "VOZ"}: comando visual roteado diretamente.`);
    await visionRouter.run(cleanCommand);
    return { handled: true, route: "vision" };
  }

  const devices = window.ULTRON_DEVICES;
  const deviceIntent = devices?.parseTvIntent?.(cleanCommand) || null;
  if (deviceIntent) {
    addLog(output, `${source === "mobile" ? "VOZ CELULAR" : "VOZ"}: comando de dispositivo roteado diretamente.`);
    await devices.routeNaturalLanguage(cleanCommand, deviceIntent);
    return { handled: true, route: "device" };
  }

  if (!commandInput || !sendButton) return { handled: false, route: "none" };
  commandInput.value = cleanCommand;
  sendButton.click();
  return { handled: true, route: "terminal" };
}

async function executeVoiceCommand(command, { source = "local", bypassDedupe = false } = {}) {
  const cleanCommand = String(command || "").trim();
  if (!cleanCommand) return { handled: false };

  if (isSleepCommand(cleanCommand)) {
    setPassiveMode({ announce: true });
    return { handled: true, route: "sleep" };
  }

  const normalized = normalizeVoiceText(cleanCommand);
  const now = Date.now();

  if (
    !bypassDedupe &&
    isDuplicateVoiceText(
      normalized,
      lastCommandTranscript,
      now - lastCommandAt,
      VOICE_RUNTIME_POLICY.commandDedupeMs
    )
  ) {
    return { handled: false, duplicate: true };
  }

  lastCommandTranscript = normalized;
  lastCommandAt = now;
  activateConversation({ resetTimer: true });

  addLog(output, `${source === "mobile" ? "VOZ CELULAR" : "VOZ"}: ${cleanCommand}`);
  return routeVoiceCommand(cleanCommand, source);
}

function shouldIgnoreAsEcho(transcript) {
  const now = Date.now();
  if (now < echoGuardUntil) return true;
  if (!lastUltronSpeechText || !lastUltronSpeechEndedAt) return false;
  if (now - lastUltronSpeechEndedAt > VOICE_RUNTIME_POLICY.spokenEchoWindowMs) return false;
  return isLikelySpeechEcho(transcript, lastUltronSpeechText);
}

function handleFinalTranscript(transcript) {
  const cleanTranscript = String(transcript || "").trim();
  if (!cleanTranscript || ultronSpeaking || !listeningEnabled || localSuspended) return;

  if (shouldIgnoreAsEcho(cleanTranscript)) {
    addLog(output, "VOZ: eco da própria resposta do Ultron ignorado.");
    return;
  }

  const normalized = normalizeVoiceText(cleanTranscript);
  const now = Date.now();

  if (
    isDuplicateVoiceText(
      normalized,
      lastFinalTranscript,
      now - lastFinalAt,
      VOICE_RUNTIME_POLICY.finalDedupeMs
    )
  ) return;

  lastFinalTranscript = normalized;
  lastFinalAt = now;
  markRecognitionHealthy();
  addLog(output, `MICROFONE OUVIU: ${cleanTranscript}`);

  const wakeCommand = extractWakeCommand(cleanTranscript);

  if (conversationActive && now <= conversationUntil) {
    if (wakeCommand !== null) {
      if (wakeCommand) executeVoiceCommand(wakeCommand);
      else activateConversation({ announceWake: true, resetTimer: true });
    } else {
      executeVoiceCommand(cleanTranscript);
    }
    return;
  }

  if (wakeCommand !== null) {
    if (wakeCommand) {
      activateConversation({ resetTimer: true });
      executeVoiceCommand(wakeCommand);
    } else {
      activateConversation({ announceWake: true, resetTimer: true });
    }
  }
}

function nextRestartDelay() {
  return restartDelayFor({
    failures: restartFailures,
    isAndroid: IS_ANDROID,
    blockedUntil: restartBlockedUntil,
    now: Date.now()
  });
}

function scheduleRecognitionRestart(delay = null) {
  if (
    !listeningEnabled ||
    localSuspended ||
    ultronSpeaking ||
    recognitionRunning ||
    recognitionStarting ||
    recognitionStopping
  ) return;

  clearRestartTimer();
  const generation = restartGeneration;
  const guardDelay = Math.max(0, echoGuardUntil - Date.now());
  const plannedDelay = Math.max(
    guardDelay,
    delay == null ? nextRestartDelay() : Number(delay) || 0
  );

  restartTimer = setTimeout(() => {
    restartTimer = null;
    if (generation !== restartGeneration) return;
    startRecognition({ quiet: true });
  }, plannedDelay);
}

function startRecognition({ quiet = false } = {}) {
  if (
    !recognition ||
    recognitionRunning ||
    recognitionStarting ||
    recognitionStopping ||
    !canRunRecognition()
  ) return;

  clearRestartTimer();
  recognitionStarting = true;

  if (!quiet || restartFailures > 0) {
    setMicState(
      restartFailures > 0 ? "recovering" : (conversationActive ? "active" : "passive"),
      restartFailures > 0 ? "RECUPERANDO MIC..." : "CONECTANDO MIC..."
    );
  }

  try {
    recognition.start();
  } catch (error) {
    recognitionStarting = false;
    registerRecognitionFailure(error?.name || "start-error");

    if (error?.name !== "InvalidStateError") {
      console.error("ULTRON voice recognition start:", error);
    }

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
    if (abort && typeof recognition.abort === "function") recognition.abort();
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
  instance.lang = "pt-BR";
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
      if (recognitionRunning && Date.now() - recognitionStartedAt >= VOICE_RUNTIME_POLICY.stableSessionMs) {
        markRecognitionHealthy();
      }
    }, VOICE_RUNTIME_POLICY.stableSessionMs + 100);

    if (!ultronSpeaking && listeningEnabled && !localSuspended) {
      setMicState(conversationActive ? "active" : "passive");
    }
  };

  instance.onspeechstart = () => {
    if (listeningEnabled && !ultronSpeaking && !localSuspended) {
      setMicState("hearing", "VOZ DETECTADA");
    }
  };

  instance.onspeechend = () => {
    if (listeningEnabled && !ultronSpeaking && !localSuspended) {
      setMicState(
        conversationActive ? "active" : "passive",
        "PROCESSANDO VOZ..."
      );
    }
  };

  instance.onresult = (event) => {
    let interim = "";

    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const result = event.results[index];
      const transcript = result[0]?.transcript || "";

      if (result.isFinal) handleFinalTranscript(transcript);
      else interim += transcript;
    }

    if (interim.trim() && listeningEnabled && !ultronSpeaking && !localSuspended) {
      setMicState("hearing", "OUVINDO...");
    }
  };

  instance.onerror = (event) => {
    const error = event?.error || "unknown";
    lastRecognitionError = error;

    if (error === "not-allowed" || error === "service-not-allowed") {
      listeningEnabled = false;
      recognitionRunning = false;
      recognitionStarting = false;
      recognitionStopping = false;
      clearRestartTimer();
      setMicState("blocked");
      addLog(
        output,
        "MICROFONE: acesso bloqueado. Libere o microfone nas permissões do navegador.",
        "alert"
      );
      return;
    }

    if (error === "audio-capture") {
      registerRecognitionFailure(error);
      setMicState("error", "FALHA DE CAPTURA");
      addLog(
        output,
        "MICROFONE: o navegador não conseguiu capturar áudio. Feche outros apps que possam estar usando o microfone; o Ultron tentará recuperar automaticamente.",
        "alert"
      );
      return;
    }

    if (error === "network") {
      registerRecognitionFailure(error);
      setMicState("recovering", "REDE DE VOZ INSTÁVEL");
      addLog(
        output,
        "VOZ: o serviço de reconhecimento falhou na rede. A recuperação agora usa backoff para evitar conectar/desconectar em loop.",
        "alert"
      );
      return;
    }

    if (!["no-speech", "aborted"].includes(error)) {
      registerRecognitionFailure(error);
      addLog(output, `VOZ: erro do reconhecedor (${error}).`, "alert");
    }
  };

  instance.onend = () => {
    recognitionRunning = false;
    recognitionStarting = false;
    recognitionStopping = false;
    clearStableTimer();

    if (listeningEnabled && !ultronSpeaking && !localSuspended) {
      if (restartFailures > 0) setMicState("recovering", "RECUPERANDO MIC...");
      else setMicState(conversationActive ? "active" : "passive");
      scheduleRecognitionRestart();
    }
  };

  return instance;
}

async function microphonePermissionState() {
  if (!navigator.permissions?.query) return "unknown";

  try {
    const result = await navigator.permissions.query({ name: "microphone" });
    return result.state;
  } catch {
    return "unknown";
  }
}

async function ensureMicrophonePermission() {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Este navegador não oferece acesso direto ao microfone.");
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true
    },
    video: false
  });

  stream.getTracks().forEach((track) => track.stop());

  const prefs = loadPreferences();
  prefs.microphoneAccepted = true;
  prefs.voiceWakeEnabled = true;
  savePreferences(prefs);
}

async function testPhysicalMicrophone() {
  if (!navigator.mediaDevices?.getUserMedia) {
    addLog(output, "TESTE MIC: getUserMedia não está disponível neste navegador.", "alert");
    return;
  }

  let stream;
  let context;

  try {
    addLog(output, "TESTE MIC: fale normalmente por 3 segundos...");
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      },
      video: false
    });
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

    if (peak >= 0.012) {
      addLog(output, `TESTE MIC: OK — som detectado (${Math.round(peak * 100)}%).`);
      setMicState(listeningEnabled ? "active" : "ready", "MIC OK");
    } else {
      addLog(
        output,
        "TESTE MIC: o microfone abriu, mas quase nenhum som chegou. Verifique volume, permissão e microfone selecionado.",
        "alert"
      );
      setMicState("error", "SEM NÍVEL DE ÁUDIO");
    }
  } catch (error) {
    addLog(output, `TESTE MIC: falhou — ${error?.message || error}`, "alert");
    setMicState("blocked");
  } finally {
    stream?.getTracks?.().forEach((track) => track.stop());
    if (context && context.state !== "closed") {
      context.close().catch(() => {});
    }
  }
}

async function enableListening({ userInitiated = false, persist = true } = {}) {
  if (!SpeechRecognition) {
    setMicState("unsupported");
    addLog(
      output,
      "Reconhecimento de voz não é suportado neste navegador. No Android, use o Google Chrome.",
      "alert"
    );
    return false;
  }

  try {
    const prefs = loadPreferences();
    const permissionState = await microphonePermissionState();

    if (permissionState === "denied") {
      setMicState("blocked");
      addLog(output, "MICROFONE: permissão negada nas configurações do navegador.", "alert");
      return false;
    }

    if (permissionState !== "granted") {
      if (!userInitiated) {
        setMicState("ready");
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
    suspensionReason = "";
    ultronSpeaking = false;
    recognition ||= createRecognition();
    resetFailureState();
    activateConversation({ resetTimer: true });

    if (persist) {
      prefs.voiceWakeEnabled = true;
      savePreferences(prefs);
    }

    if (userInitiated) {
      addLog(
        output,
        "ESCUTA ATIVA: fale agora. O Ultron pausa o microfone durante a própria fala e retoma automaticamente depois."
      );
    } else {
      addLog(output, "ESCUTA RESTAURADA: microfone pronto para receber sua próxima frase.");
    }

    startRecognition();
    return true;
  } catch (error) {
    listeningEnabled = false;
    recognitionStarting = false;
    recognitionStopping = false;

    if (error?.name === "NotAllowedError" || error?.name === "PermissionDeniedError") {
      setMicState("blocked");
      addLog(output, "MICROFONE: permissão não concedida.", "alert");
      return false;
    }

    setMicState("error");
    addLog(
      output,
      `MICROFONE: não foi possível iniciar a escuta. ${error?.message || error}`,
      "alert"
    );
    return false;
  }
}

function disableListening({ persist = true, announce = true } = {}) {
  listeningEnabled = false;
  localSuspended = false;
  suspensionReason = "";
  ultronSpeaking = false;
  speechSources.clear();
  setPassiveMode();
  stopRecognition({ abort: true });
  setMicState("off");

  if (persist) {
    const prefs = loadPreferences();
    prefs.voiceWakeEnabled = false;
    savePreferences(prefs);
  }

  if (announce) addLog(output, "Escuta por voz desativada pelo operador.");
}

function suspendLocalListening(reason = "external") {
  if (!listeningEnabled) return false;
  localSuspended = true;
  suspensionReason = reason;
  stopRecognition({ abort: true });
  setMicState("suspended", reason === "mobile-mic" ? "MIC CELULAR ASSUMIU" : "MIC LOCAL PAUSADO");
  return true;
}

function resumeLocalListening(reason = "external") {
  if (!listeningEnabled) return false;
  if (suspensionReason && reason && suspensionReason !== reason && reason !== "force") return false;

  localSuspended = false;
  suspensionReason = "";
  if (ultronSpeaking) {
    setMicState("speaking");
    return true;
  }

  activateConversation({ resetTimer: true });
  scheduleRecognitionRestart(Math.max(0, echoGuardUntil - Date.now()));
  return true;
}

function isAnySpeechOutputActive() {
  const audioActive = Boolean(audio && !audio.paused && !audio.ended);
  const browserActive = Boolean(window.ULTRON_VOICE_OUTPUT?.speaking);
  return audioActive || browserActive || speechSources.size > 0;
}

function beginUltronSpeech(source = "voice", text = "") {
  clearAudioPauseTimer();
  speechSources.add(source);
  if (text) lastUltronSpeechText = String(text);
  ultronSpeaking = true;
  echoGuardUntil = Number.POSITIVE_INFINITY;
  stopRecognition({ abort: true });

  if (listeningEnabled && !localSuspended) {
    setMicState("speaking");
  }
}

function finishUltronSpeech(source = "voice", text = "") {
  clearAudioPauseTimer();
  speechSources.delete(source);
  if (text) lastUltronSpeechText = String(text);

  setTimeout(() => {
    if (speechSources.size || isAnySpeechOutputActive()) return;

    ultronSpeaking = false;
    lastUltronSpeechEndedAt = Date.now();
    const guard = IS_ANDROID
      ? VOICE_RUNTIME_POLICY.androidEchoGuardMs
      : VOICE_RUNTIME_POLICY.desktopEchoGuardMs;
    echoGuardUntil = Date.now() + guard;

    if (listeningEnabled && !localSuspended) {
      activateConversation({ resetTimer: true });
      scheduleRecognitionRestart(guard);
    }
  }, 90);
}

function bindSpeechPauseResume() {
  if (audio) {
    audio.addEventListener("playing", () => beginUltronSpeech("audio-element"));
    audio.addEventListener("ended", () => finishUltronSpeech("audio-element"));
    audio.addEventListener("error", () => finishUltronSpeech("audio-element"));

    audio.addEventListener("pause", () => {
      clearAudioPauseTimer();
      if (!speechSources.has("audio-element")) return;

      audioPauseTimer = setTimeout(() => {
        audioPauseTimer = null;
        if (audio.paused) finishUltronSpeech("audio-element");
      }, 450);
    });
  }

  window.addEventListener("ultron:speech-start", (event) => {
    const provider = String(event.detail?.provider || "browser-tts");
    beginUltronSpeech(`event:${provider}`, event.detail?.text || "");
  });

  window.addEventListener("ultron:speech-end", (event) => {
    const provider = String(event.detail?.provider || "browser-tts");
    finishUltronSpeech(`event:${provider}`, event.detail?.text || "");
  });
}

async function refreshGatewayHealth() {
  if (!API_BASE) return;

  try {
    const response = await fetch(`${API_BASE}/api/health`, { cache: "no-store" });
    if (!response.ok) return;

    const data = await response.json();
    const providers = Object.values(data?.providers || {});
    const configured = providers.filter((provider) => provider?.configured).length;
    const gateway = $("gemini-module");

    if (gateway) {
      gateway.textContent = configured
        ? `${configured}/${providers.length || 5} ONLINE`
        : "API OFF";
      gateway.className = configured ? "green" : "";
    }
  } catch {}
}

function exposeVoiceInputApi() {
  window.ULTRON_VOICE_INPUT = {
    dispatch(text, options = {}) {
      return executeVoiceCommand(text, options);
    },
    suspend(reason = "external") {
      return suspendLocalListening(reason);
    },
    resume(reason = "external") {
      return resumeLocalListening(reason);
    },
    enable(options = {}) {
      return enableListening(options);
    },
    disable(options = {}) {
      return disableListening(options);
    },
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
        restartFailures,
        restartBlockedUntil: restartBlockedUntil || null,
        lastRecognitionError: lastRecognitionError || null,
        echoGuardUntil: Number.isFinite(echoGuardUntil) ? echoGuardUntil : null
      };
    }
  };
}

function initializeVoiceListener() {
  recognition = createRecognition();
  exposeVoiceInputApi();
  bindSpeechPauseResume();
  refreshGatewayHealth();

  if (!SpeechRecognition) {
    setMicState("unsupported");
    return;
  }

  setMicState("off");

  button?.addEventListener("click", async () => {
    if (listeningEnabled) {
      disableListening();
    } else {
      await enableListening({ userInitiated: true, persist: true });
    }
  });

  testMicButton?.addEventListener("click", testPhysicalMicrophone);

  const prefs = loadPreferences();

  if (prefs.microphoneAccepted && prefs.voiceWakeEnabled !== false) {
    enableListening({ userInitiated: false, persist: false });
  } else {
    setMicState("ready");
  }

  window.addEventListener("online", () => {
    if (listeningEnabled && !localSuspended && !ultronSpeaking) {
      resetFailureState();
      scheduleRecognitionRestart(250);
    }
  });

  setInterval(refreshGatewayHealth, 30000);
}

initializeVoiceListener();
