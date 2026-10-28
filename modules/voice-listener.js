import { loadPreferences, savePreferences } from "./storage.js";
import { addLog } from "./system.js";
import API_CONFIG from "../config.js";

const SpeechRecognition =
  window.SpeechRecognition || window.webkitSpeechRecognition;

const WAKE_ALIASES = ["ultron", "outron", "utron", "ultra on", "ultraon"];
const CONVERSATION_WINDOW_MS = 60000;
const IS_ANDROID = /Android/i.test(navigator.userAgent || "");
const RESTART_DELAY_MS = IS_ANDROID ? 850 : 450;
const MAX_RESTART_DELAY_MS = 5000;

const $ = (id) => document.getElementById(id);
const output = $("output-box");
const button = $("btn-listen-voice");
const testMicButton = $("btn-test-mic");
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
let conversationActive = false;
let conversationUntil = 0;
let restartTimer = null;
let conversationTimer = null;
let audioPauseTimer = null;
let restartFailures = 0;
let restartGeneration = 0;
let lastFinalTranscript = "";
let lastFinalAt = 0;
let lastCommandTranscript = "";
let lastCommandAt = 0;

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
    blocked: ["BLOCKED", "MIC BLOQUEADO"],
    error: ["ERROR", "REATIVAR ESCUTA"]
  };

  const [moduleText, buttonText] = states[state] || states.off;
  micModule.textContent = detail || moduleText;
  micModule.className = ["passive", "active", "hearing", "speaking", "ready"].includes(state)
    ? "green"
    : "";

  if (button) button.textContent = buttonText;
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
    if (index !== -1) return { alias: normalizedAlias, index };
  }
  return null;
}

function extractWakeCommand(transcript) {
  const normalized = normalizeText(transcript);
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

  if (listeningEnabled && !ultronSpeaking) {
    setMicState("passive");
  }

  if (announce) {
    addLog(output, 'ESCUTA PASSIVA: diga "Ultron" para iniciar uma nova conversa.');
  }
}

function activateConversation({ announceWake = false, resetTimer = true } = {}) {
  conversationActive = true;
  conversationUntil = Date.now() + CONVERSATION_WINDOW_MS;

  if (resetTimer) {
    clearConversationTimer();
    conversationTimer = setTimeout(() => {
      if (conversationActive && Date.now() >= conversationUntil && !ultronSpeaking) {
        setPassiveMode({ announce: true });
      }
    }, CONVERSATION_WINDOW_MS + 200);
  }

  if (listeningEnabled && !ultronSpeaking) {
    setMicState("active");
  }

  if (announceWake) {
    addLog(output, "ULTRON: ativado. Pode falar normalmente nas próximas mensagens.");
  }
}

function isSleepCommand(text) {
  const normalized = normalizeText(text);
  return [
    "dormir",
    "durma",
    "modo passivo",
    "pare de responder",
    "encerrar conversa",
    "finalizar conversa"
  ].some((command) => normalized === command || normalized.endsWith(` ${command}`));
}

function executeVoiceCommand(command) {
  const cleanCommand = String(command || "").trim();

  if (!cleanCommand || !commandInput || !sendButton) return;

  if (isSleepCommand(cleanCommand)) {
    setPassiveMode({ announce: true });
    return;
  }

  const normalized = normalizeText(cleanCommand);
  const now = Date.now();

  if (normalized === lastCommandTranscript && now - lastCommandAt < 2200) {
    return;
  }

  lastCommandTranscript = normalized;
  lastCommandAt = now;

  // Mantém a conversa aberta após cada comando. Assim, depois da primeira
  // ativação, o usuário pode continuar falando sem repetir "Ultron".
  activateConversation({ resetTimer: true });

  commandInput.value = cleanCommand;
  addLog(output, `VOZ: ${cleanCommand}`);
  sendButton.click();
}

function handleFinalTranscript(transcript) {
  const cleanTranscript = String(transcript || "").trim();
  if (!cleanTranscript || ultronSpeaking || !listeningEnabled) return;

  const normalized = normalizeText(cleanTranscript);
  const now = Date.now();

  if (normalized === lastFinalTranscript && now - lastFinalAt < 1800) return;
  lastFinalTranscript = normalized;
  lastFinalAt = now;

  addLog(output, `MICROFONE OUVIU: ${cleanTranscript}`);

  const wakeCommand = extractWakeCommand(cleanTranscript);

  // Se a conversa já está ativa, qualquer fala final vira um novo comando.
  // Se o usuário disser "Ultron" novamente, removemos apenas a wake word.
  if (conversationActive && now <= conversationUntil) {
    if (wakeCommand !== null) {
      if (wakeCommand) executeVoiceCommand(wakeCommand);
      else activateConversation({ announceWake: true, resetTimer: true });
    } else {
      executeVoiceCommand(cleanTranscript);
    }
    return;
  }

  // Fora de uma conversa, exige a wake word para evitar acionamentos do ambiente.
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
  const multiplier = Math.min(5, Math.max(1, restartFailures + 1));
  return Math.min(MAX_RESTART_DELAY_MS, RESTART_DELAY_MS * multiplier);
}

function scheduleRecognitionRestart(delay = nextRestartDelay()) {
  if (
    !listeningEnabled ||
    ultronSpeaking ||
    recognitionRunning ||
    recognitionStarting ||
    recognitionStopping
  ) return;

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
  ) return;

  clearRestartTimer();
  recognitionStarting = true;
  setMicState(
    conversationActive ? "active" : "passive",
    "CONECTANDO MIC..."
  );

  try {
    recognition.start();
  } catch (error) {
    recognitionStarting = false;
    restartFailures += 1;

    if (error?.name !== "InvalidStateError") {
      console.error("ULTRON voice recognition start:", error);
    }

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
    restartFailures = 0;

    if (!ultronSpeaking && listeningEnabled) {
      setMicState(conversationActive ? "active" : "passive");
    }
  };

  instance.onspeechstart = () => {
    if (listeningEnabled && !ultronSpeaking) {
      setMicState("hearing", "VOZ DETECTADA");
    }
  };

  instance.onspeechend = () => {
    if (listeningEnabled && !ultronSpeaking) {
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

    if (interim.trim() && listeningEnabled && !ultronSpeaking) {
      setMicState("hearing", "OUVINDO...");
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
        "MICROFONE: acesso bloqueado. Libere o microfone nas permissões do navegador.",
        "alert"
      );
      return;
    }

    if (error === "audio-capture") {
      restartFailures += 1;
      setMicState("error", "FALHA DE CAPTURA");
      addLog(
        output,
        "MICROFONE: o navegador não conseguiu capturar áudio. Feche outros apps que possam estar usando o microfone e teste novamente.",
        "alert"
      );
      return;
    }

    if (error === "network") {
      restartFailures += 1;
      setMicState("error", "ERRO DE RECONHECIMENTO");
      addLog(
        output,
        "VOZ: o serviço de reconhecimento do navegador falhou na rede. No Android, abra o Ultron diretamente no Google Chrome e tente novamente.",
        "alert"
      );
      return;
    }

    if (!["no-speech", "aborted"].includes(error)) {
      restartFailures += 1;
      addLog(output, `VOZ: erro do reconhecedor (${error}).`, "alert");
    }
  };

  instance.onend = () => {
    recognitionRunning = false;
    recognitionStarting = false;
    recognitionStopping = false;

    if (listeningEnabled && !ultronSpeaking) {
      setMicState(conversationActive ? "active" : "passive");
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
    audio: true,
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

async function enableListening({ userInitiated = false } = {}) {
  if (!SpeechRecognition) {
    setMicState("unsupported");
    addLog(
      output,
      "Reconhecimento de voz não é suportado neste navegador. No Android, use o Google Chrome.",
      "alert"
    );
    return;
  }

  try {
    const prefs = loadPreferences();
    const permissionState = await microphonePermissionState();

    if (permissionState === "denied") {
      setMicState("blocked");
      addLog(output, "MICROFONE: permissão negada nas configurações do navegador.", "alert");
      return;
    }

    if (permissionState !== "granted") {
      if (!userInitiated) {
        setMicState("ready");
        return;
      }
      await ensureMicrophonePermission();
    } else if (!prefs.microphoneAccepted) {
      prefs.microphoneAccepted = true;
      prefs.voiceWakeEnabled = true;
      savePreferences(prefs);
    }

    listeningEnabled = true;
    ultronSpeaking = false;
    recognition ||= createRecognition();

    if (userInitiated) {
      activateConversation({ resetTimer: true });
      addLog(
        output,
        "ESCUTA ATIVA: fale agora. Depois da primeira resposta, você pode continuar a conversa sem repetir 'Ultron'."
      );
    } else {
      setPassiveMode();
    }

    startRecognition();
  } catch (error) {
    listeningEnabled = false;
    recognitionStarting = false;
    recognitionStopping = false;

    if (error?.name === "NotAllowedError" || error?.name === "PermissionDeniedError") {
      setMicState("blocked");
      addLog(output, "MICROFONE: permissão não concedida.", "alert");
      return;
    }

    setMicState("error");
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
  setPassiveMode();
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
    // Este é o ponto principal da conversa contínua: quando o Ultron termina
    // de falar, ele volta a ouvir já em modo de follow-up, sem exigir wake word.
    activateConversation({ resetTimer: true });
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

    audioPauseTimer = setTimeout(() => {
      audioPauseTimer = null;
      if (ultronSpeaking && audio.paused) resumeAfterSpeech();
    }, 550);
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

  testMicButton?.addEventListener("click", testPhysicalMicrophone);

  const prefs = loadPreferences();

  if (prefs.microphoneAccepted && prefs.voiceWakeEnabled !== false) {
    enableListening({ userInitiated: false });
  } else {
    setMicState("ready");
  }

  setInterval(refreshGatewayHealth, 30000);
}

initializeVoiceListener();
