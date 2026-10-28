import { loadPreferences, savePreferences } from "./storage.js";
import { addLog } from "./system.js";
import API_CONFIG from "../config.js";

const SpeechRecognition =
  window.SpeechRecognition || window.webkitSpeechRecognition;

const WAKE_ALIASES = ["ultron", "outron", "utron", "ultra on"];
const ACTIVE_WINDOW_MS = 10000;
const IS_ANDROID = /Android/i.test(navigator.userAgent || "");
const RESTART_DELAY_MS = IS_ANDROID ? 650 : 350;
const MAX_RESTART_DELAY_MS = 4000;

const $ = (id) => document.getElementById(id);
const output = $("output-box");
const button = $("btn-listen-voice");
const micModule = $("mic-module");
const audio = $("voice-audio");
const commandInput = $("command-input");
const sendButton = $("btn-send");

const API_BASE = String(API_CONFIG?.backendUrl || "").replace(/\/$/, "");

let recognition = null;
let recognitionRunning = false;
let recognitionStarting = false;
let recognitionStopping = false;
let listeningEnabled = false;
let ultronSpeaking = false;
let awaitingCommand = false;
let activeUntil = 0;
let restartTimer = null;
let activeTimer = null;
let audioPauseTimer = null;
let restartFailures = 0;
let restartGeneration = 0;

function setMicState(state, detail = "") {
  if (!button || !micModule) return;

  const states = {
    unsupported: ["INDISPONÍVEL", "MIC INDISPONÍVEL"],
    off: ["STANDBY", "ATIVAR ESCUTA"],
    ready: ["READY", "ATIVAR ESCUTA"],
    passive: ["PASSIVE", "ESCUTA: PASSIVA"],
    active: ["LISTENING", "ESCUTA: ATIVA"],
    speaking: ["PAUSED", "ULTRON FALANDO"],
    blocked: ["BLOCKED", "MIC BLOQUEADO"]
  };

  const [moduleText, buttonText] = states[state] || states.off;
  micModule.textContent = detail || moduleText;
  button.textContent = buttonText;
  micModule.className = ["passive", "active", "speaking", "ready"].includes(state)
    ? "green"
    : "";
}

function clearRestartTimer() {
  restartGeneration += 1;
  if (restartTimer) {
    clearTimeout(restartTimer);
    restartTimer = null;
  }
}

function clearActiveTimer() {
  if (activeTimer) {
    clearTimeout(activeTimer);
    activeTimer = null;
  }
}

function clearAudioPauseTimer() {
  if (audioPauseTimer) {
    clearTimeout(audioPauseTimer);
    audioPauseTimer = null;
  }
}

function returnToPassiveState() {
  awaitingCommand = false;
  activeUntil = 0;
  clearActiveTimer();

  if (listeningEnabled && !ultronSpeaking) {
    setMicState("passive");
  }
}

function activateCommandWindow() {
  awaitingCommand = true;
  activeUntil = Date.now() + ACTIVE_WINDOW_MS;
  clearActiveTimer();
  setMicState("active");

  addLog(
    output,
    "ULTRON: palavra de ativação reconhecida. Aguardando comando de voz."
  );

  activeTimer = setTimeout(() => {
    if (awaitingCommand && Date.now() >= activeUntil) {
      returnToPassiveState();
    }
  }, ACTIVE_WINDOW_MS + 100);
}

function normalizeText(text) {
  return String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function findWakeAlias(normalized) {
  for (const alias of WAKE_ALIASES) {
    const normalizedAlias = normalizeText(alias);
    const index = normalized.indexOf(normalizedAlias);
    if (index !== -1) {
      return { alias: normalizedAlias, index };
    }
  }
  return null;
}

function extractWakeCommand(transcript) {
  const original = String(transcript || "");
  const normalized = normalizeText(original);
  const match = findWakeAlias(normalized);

  if (!match) return null;

  const normalizedTail = normalized
    .slice(match.index + match.alias.length)
    .replace(/^[\s,:;.!?-]+/, "")
    .trim();

  if (!normalizedTail) return "";

  // O comando normalizado é mais confiável no Android, onde o reconhecimento
  // pode alterar capitalização e pontuação entre sessões curtas.
  return normalizedTail;
}

function executeVoiceCommand(command) {
  const cleanCommand = String(command || "").trim();

  if (!cleanCommand || !commandInput || !sendButton) {
    returnToPassiveState();
    return;
  }

  returnToPassiveState();
  commandInput.value = cleanCommand;
  addLog(output, `VOZ: ${cleanCommand}`);
  sendButton.click();
}

function handleTranscript(transcript) {
  const cleanTranscript = String(transcript || "").trim();
  if (!cleanTranscript || ultronSpeaking || !listeningEnabled) return;

  const wakeCommand = extractWakeCommand(cleanTranscript);

  if (wakeCommand !== null) {
    if (wakeCommand) {
      executeVoiceCommand(wakeCommand);
    } else {
      activateCommandWindow();
    }
    return;
  }

  if (awaitingCommand && Date.now() <= activeUntil) {
    executeVoiceCommand(cleanTranscript);
  }
}

function nextRestartDelay() {
  const multiplier = Math.min(4, Math.max(0, restartFailures));
  return Math.min(
    MAX_RESTART_DELAY_MS,
    RESTART_DELAY_MS * Math.max(1, multiplier)
  );
}

function scheduleRecognitionRestart(delay = nextRestartDelay()) {
  if (
    !listeningEnabled ||
    ultronSpeaking ||
    recognitionRunning ||
    recognitionStarting ||
    recognitionStopping
  ) {
    return;
  }

  clearRestartTimer();
  const generation = restartGeneration;

  restartTimer = setTimeout(() => {
    restartTimer = null;
    if (generation !== restartGeneration) return;
    startRecognition();
  }, delay);
}

function startRecognition() {
  if (
    !recognition ||
    recognitionRunning ||
    recognitionStarting ||
    recognitionStopping ||
    !listeningEnabled ||
    ultronSpeaking
  ) {
    return;
  }

  clearRestartTimer();
  recognitionStarting = true;

  try {
    recognition.start();
  } catch (error) {
    recognitionStarting = false;

    if (error?.name === "InvalidStateError") {
      scheduleRecognitionRestart(RESTART_DELAY_MS);
      return;
    }

    restartFailures += 1;
    console.error("ULTRON voice recognition start:", error);
    scheduleRecognitionRestart();
  }
}

function stopRecognition({ abort = true } = {}) {
  clearRestartTimer();

  if (!recognition || (!recognitionRunning && !recognitionStarting)) {
    recognitionStarting = false;
    recognitionStopping = false;
    return;
  }

  recognitionStopping = true;

  try {
    if (abort && typeof recognition.abort === "function") {
      recognition.abort();
    } else {
      recognition.stop();
    }
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
  // No Android, sessões curtas são mais estáveis. O próprio controlador
  // reinicia silenciosamente após cada sessão.
  instance.continuous = !IS_ANDROID;
  instance.interimResults = false;
  instance.maxAlternatives = 1;

  instance.onstart = () => {
    recognitionStarting = false;
    recognitionStopping = false;
    recognitionRunning = true;
    restartFailures = 0;

    if (!ultronSpeaking && listeningEnabled) {
      setMicState(awaitingCommand ? "active" : "passive");
    }
  };

  instance.onresult = (event) => {
    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const result = event.results[index];
      if (result.isFinal) {
        handleTranscript(result[0]?.transcript || "");
      }
    }
  };

  instance.onerror = (event) => {
    const error = event?.error || "unknown";

    if (error === "not-allowed" || error === "service-not-allowed") {
      listeningEnabled = false;
      recognitionRunning = false;
      recognitionStarting = false;
      recognitionStopping = false;
      clearRestartTimer();
      setMicState("blocked");

      addLog(
        output,
        "MICROFONE: acesso bloqueado pelo navegador. Libere a permissão do site para reativar a escuta.",
        "alert"
      );
      return;
    }

    if (error === "audio-capture") {
      restartFailures += 1;
      addLog(
        output,
        "MICROFONE: o navegador não conseguiu capturar áudio. Verifique se outro app está usando o microfone.",
        "alert"
      );
      return;
    }

    if (error === "network") {
      restartFailures += 1;
      console.warn("ULTRON voice recognition: network");
      return;
    }

    if (!["no-speech", "aborted"].includes(error)) {
      restartFailures += 1;
      console.warn("ULTRON voice recognition:", error);
    }
  };

  instance.onend = () => {
    recognitionRunning = false;
    recognitionStarting = false;
    recognitionStopping = false;

    if (listeningEnabled && !ultronSpeaking) {
      setMicState(awaitingCommand ? "active" : "passive");
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

async function requestMicrophonePermission() {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Este navegador não oferece acesso ao microfone.");
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: true,
    video: false
  });

  stream.getTracks().forEach((track) => track.stop());

  const prefs = loadPreferences();
  prefs.microphoneAccepted = true;
  prefs.voiceWakeEnabled = true;
  savePreferences(prefs);
}

async function enableListening({ userInitiated = false } = {}) {
  if (!SpeechRecognition) {
    setMicState("unsupported");
    addLog(
      output,
      "Reconhecimento de voz não é suportado neste navegador.",
      "alert"
    );
    return;
  }

  try {
    const prefs = loadPreferences();
    const permissionState = await microphonePermissionState();

    if (permissionState === "denied") {
      setMicState("blocked");
      addLog(
        output,
        "MICROFONE: permissão negada nas configurações do navegador.",
        "alert"
      );
      return;
    }

    if (permissionState !== "granted") {
      if (!userInitiated) {
        setMicState("ready");
        return;
      }

      await requestMicrophonePermission();
    } else if (!prefs.microphoneAccepted) {
      prefs.microphoneAccepted = true;
      prefs.voiceWakeEnabled = true;
      savePreferences(prefs);
    }

    listeningEnabled = true;
    ultronSpeaking = false;
    recognition ||= createRecognition();
    setMicState("passive");
    startRecognition();

    if (userInitiated) {
      addLog(
        output,
        'ESCUTA ATIVA: diga "Ultron" e depois o comando.'
      );
    }
  } catch (error) {
    listeningEnabled = false;
    recognitionStarting = false;
    recognitionStopping = false;

    if (
      error?.name === "NotAllowedError" ||
      error?.name === "PermissionDeniedError"
    ) {
      setMicState("blocked");
      addLog(
        output,
        "MICROFONE: permissão não concedida.",
        "alert"
      );
      return;
    }

    setMicState("off");
    addLog(
      output,
      `MICROFONE: não foi possível iniciar a escuta. ${error?.message || error}`,
      "alert"
    );
  }
}

function disableListening() {
  listeningEnabled = false;
  ultronSpeaking = false;
  returnToPassiveState();
  stopRecognition({ abort: true });
  setMicState("off");

  const prefs = loadPreferences();
  prefs.voiceWakeEnabled = false;
  savePreferences(prefs);

  addLog(output, "Escuta por voz desativada pelo operador.");
}

function resumeAfterSpeech() {
  clearAudioPauseTimer();
  if (!ultronSpeaking) return;

  ultronSpeaking = false;

  if (listeningEnabled) {
    returnToPassiveState();
    scheduleRecognitionRestart(RESTART_DELAY_MS);
  }
}

function bindAudioPauseResume() {
  if (!audio) return;

  audio.addEventListener("playing", () => {
    clearAudioPauseTimer();

    if (!ultronSpeaking) {
      ultronSpeaking = true;
      stopRecognition({ abort: true });
    }

    if (listeningEnabled) {
      setMicState("speaking");
    }
  });

  audio.addEventListener("ended", resumeAfterSpeech);
  audio.addEventListener("error", resumeAfterSpeech);

  audio.addEventListener("pause", () => {
    clearAudioPauseTimer();
    if (!ultronSpeaking) return;

    // Evita o ciclo pause -> restart -> playing -> stop quando o src do áudio
    // é trocado. Só retoma se o áudio continuar realmente pausado.
    audioPauseTimer = setTimeout(() => {
      audioPauseTimer = null;
      if (ultronSpeaking && audio.paused && !audio.ended) {
        resumeAfterSpeech();
      }
    }, 400);
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

function initializeVoiceListener() {
  recognition = createRecognition();
  bindAudioPauseResume();
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
      const prefs = loadPreferences();
      prefs.voiceWakeEnabled = true;
      savePreferences(prefs);
      await enableListening({ userInitiated: true });
    }
  });

  const prefs = loadPreferences();

  if (prefs.microphoneAccepted && prefs.voiceWakeEnabled !== false) {
    enableListening({ userInitiated: false });
  } else {
    setMicState("ready");
  }

  setInterval(refreshGatewayHealth, 30000);
}

initializeVoiceListener();
