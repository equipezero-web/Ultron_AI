import { loadPreferences, savePreferences } from "./storage.js";
import { addLog } from "./system.js";
import API_CONFIG from "../config.js";

const SpeechRecognition =
  window.SpeechRecognition || window.webkitSpeechRecognition;

const WAKE_WORD = "ultron";
const ACTIVE_WINDOW_MS = 10000;
const RESTART_DELAY_MS = 450;

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
let listeningEnabled = false;
let ultronSpeaking = false;
let awaitingCommand = false;
let activeUntil = 0;
let restartTimer = null;
let activeTimer = null;

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
    .trim();
}

function extractWakeCommand(transcript) {
  const normalized = normalizeText(transcript);
  const wakeIndex = normalized.indexOf(WAKE_WORD);

  if (wakeIndex === -1) return null;

  const originalWakeIndex = String(transcript).toLowerCase().indexOf(WAKE_WORD);
  const command = originalWakeIndex >= 0
    ? String(transcript)
        .slice(originalWakeIndex + WAKE_WORD.length)
        .replace(/^[\s,:;.!?-]+/, "")
        .trim()
    : "";

  return command;
}

function executeVoiceCommand(command) {
  const cleanCommand = String(command || "").trim();

  if (!cleanCommand || !commandInput || !sendButton) {
    returnToPassiveState();
    return;
  }

  returnToPassiveState();
  commandInput.value = cleanCommand;
  sendButton.click();
}

function handleTranscript(transcript) {
  const cleanTranscript = String(transcript || "").trim();
  if (!cleanTranscript || ultronSpeaking) return;

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

function scheduleRecognitionRestart() {
  clearRestartTimer();

  if (!listeningEnabled || ultronSpeaking || recognitionRunning) return;

  restartTimer = setTimeout(() => {
    startRecognition();
  }, RESTART_DELAY_MS);
}

function startRecognition() {
  if (
    !recognition ||
    recognitionRunning ||
    !listeningEnabled ||
    ultronSpeaking
  ) {
    return;
  }

  try {
    recognition.start();
  } catch (error) {
    if (error?.name !== "InvalidStateError") {
      console.error("ULTRON voice recognition start:", error);
    }
  }
}

function stopRecognition() {
  clearRestartTimer();

  if (!recognition || !recognitionRunning) return;

  try {
    recognition.stop();
  } catch {}
}

function createRecognition() {
  if (!SpeechRecognition) return null;

  const instance = new SpeechRecognition();
  instance.lang = "pt-BR";
  instance.continuous = true;
  instance.interimResults = false;
  instance.maxAlternatives = 1;

  instance.onstart = () => {
    recognitionRunning = true;

    if (!ultronSpeaking) {
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
      setMicState("blocked");

      addLog(
        output,
        "MICROFONE: acesso bloqueado pelo navegador. Libere a permissão do site para reativar a escuta.",
        "alert"
      );
      return;
    }

    if (!["no-speech", "aborted"].includes(error)) {
      console.warn("ULTRON voice recognition:", error);
    }
  };

  instance.onend = () => {
    recognitionRunning = false;
    scheduleRecognitionRestart();
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
  returnToPassiveState();
  stopRecognition();
  setMicState("off");

  const prefs = loadPreferences();
  prefs.voiceWakeEnabled = false;
  savePreferences(prefs);

  addLog(output, "Escuta por voz desativada pelo operador.");
}

function bindAudioPauseResume() {
  if (!audio) return;

  const pauseListener = () => {
    ultronSpeaking = true;
    stopRecognition();

    if (listeningEnabled) {
      setMicState("speaking");
    }
  };

  const resumeListener = () => {
    if (!ultronSpeaking) return;

    ultronSpeaking = false;

    if (listeningEnabled) {
      returnToPassiveState();
      scheduleRecognitionRestart();
    }
  };

  audio.addEventListener("play", pauseListener);
  audio.addEventListener("playing", pauseListener);
  audio.addEventListener("ended", resumeListener);
  audio.addEventListener("pause", resumeListener);
}

async function refreshGatewayHealth() {
  if (!API_BASE) return;

  try {
    const response = await fetch(`${API_BASE}/api/health`);
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
