import "./neural-live.js";
import "./voice-fallback.js";
import API_CONFIG from "../config.js";

const API_BASE = String(API_CONFIG?.backendUrl || "").replace(/\/$/, "");

const $ = (id) => document.getElementById(id);
const requestButton = $("btn-mobile-mic");
const output = $("output-box");
const audio = $("voice-audio");

const BRIDGE_ONLINE_MAX_AGE_MS = 15000;
const REQUEST_CONFIRM_TIMEOUT_MS = 12000;
const REMOTE_MIC_AUTH_STORAGE = "ultron_remote_mic_authorized_v1";

let selectedDeviceId = null;
let polling = false;
let pollTimer = null;
let requestConfirmTimer = null;
let remoteMicActive = false;
let lastTranscript = "";
let lastTranscriptAt = 0;
let remoteSpeechSyncState = "resume";
let remoteSpeechSyncBusy = false;
let queuedSpeechSyncState = null;

function log(message, alert = false) {
  if (!output) return;
  const line = document.createElement("p");
  line.className = alert ? "alert" : "";
  line.textContent = `> [MIC CELULAR] ${message}`;
  output.appendChild(line);
  output.scrollTop = output.scrollHeight;
}

function memoryKey() {
  return window.ULTRON_MEMORY?.getMemoryKey?.() || null;
}

function remoteMicPreviouslyAuthorized() {
  try {
    return localStorage.getItem(REMOTE_MIC_AUTH_STORAGE) === "yes";
  } catch {
    return false;
  }
}

function rememberRemoteMicAuthorization() {
  try {
    localStorage.setItem(REMOTE_MIC_AUTH_STORAGE, "yes");
  } catch {}
}

async function post(path, payload = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify(payload)
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok || data?.ok === false) {
    throw new Error(data?.error || `HTTP ${response.status}`);
  }

  return data;
}

function deviceAgeMs(device) {
  const lastSeen = Date.parse(device?.lastSeenAt || "") || 0;
  return lastSeen ? Date.now() - lastSeen : Number.POSITIVE_INFINITY;
}

function deviceLooksOnline(device) {
  return deviceAgeMs(device) <= BRIDGE_ONLINE_MAX_AGE_MS;
}

async function listMobileDevices() {
  const key = memoryKey();
  if (!key) throw new Error("Identidade do Ultron ainda não carregada.");

  const result = await post("/api/devices/list", { memoryKey: key });

  return (result.devices || [])
    .filter((device) => device?.deviceType === "mobile" && device?.status !== "disabled")
    .sort((a, b) => {
      const aa = Date.parse(a?.lastSeenAt || "") || 0;
      const bb = Date.parse(b?.lastSeenAt || "") || 0;
      return bb - aa;
    });
}

async function selectMobileDevice({ requireOnline = true } = {}) {
  const devices = await listMobileDevices();
  const onlineDevice = devices.find(deviceLooksOnline) || null;
  const device = onlineDevice || devices[0] || null;

  if (!device) {
    throw new Error("Nenhum celular pareado foi encontrado. Use PAREAR CELULAR primeiro.");
  }

  if (requireOnline && !onlineDevice) {
    const ageSeconds = Number.isFinite(deviceAgeMs(device))
      ? Math.max(1, Math.round(deviceAgeMs(device) / 1000))
      : null;

    throw new Error(
      ageSeconds
        ? `Celular pareado, mas o Ultron Bridge está offline ou sem responder há ${ageSeconds}s. Abra o app no celular e toque em INICIAR BRIDGE.`
        : "Celular pareado, mas o Ultron Bridge ainda não apareceu online. Abra o app no celular e toque em INICIAR BRIDGE."
    );
  }

  selectedDeviceId = device.id;
  return device;
}

async function sendDeviceNotification(action, payload = {}) {
  const key = memoryKey();
  if (!key) throw new Error("Identidade do operador indisponível.");

  if (!selectedDeviceId) {
    await selectMobileDevice();
  }

  return post("/api/devices/command", {
    memoryKey: key,
    deviceId: selectedDeviceId,
    command: "notification.push",
    payload: {
      action,
      ...payload
    }
  });
}

function disableNotebookMicrophone() {
  const state = $("mic-module");
  const localButton = $("btn-listen-voice");

  if (!state || !localButton) return;

  const passiveStates = new Set([
    "READY",
    "STANDBY",
    "MIC BLOQUEADO",
    "INDISPONÍVEL"
  ]);

  if (!passiveStates.has(String(state.textContent || "").trim())) {
    localButton.click();
    log("Microfone do notebook pausado para evitar comandos duplicados.");
  }
}

function executeRemoteTranscript(text) {
  const clean = String(text || "").trim();
  if (!clean) return;

  const normalized = clean.toLowerCase();
  const now = Date.now();

  if (normalized === lastTranscript && now - lastTranscriptAt < 4000) {
    return;
  }

  lastTranscript = normalized;
  lastTranscriptAt = now;

  const input = $("command-input");
  const send = $("btn-send");

  if (!input || !send) return;

  log(`OUVIU: ${clean}`);
  input.value = clean;
  send.click();
}

function clearRequestConfirmTimer() {
  if (requestConfirmTimer) {
    clearTimeout(requestConfirmTimer);
    requestConfirmTimer = null;
  }
}

function armRequestConfirmationTimeout() {
  clearRequestConfirmTimer();
  requestConfirmTimer = setTimeout(() => {
    requestConfirmTimer = null;
    if (remoteMicActive) return;

    if (requestButton) requestButton.textContent = "USAR MIC DO CELULAR";
    log(
      "O celular não confirmou a solicitação. Abra o Ultron Bridge e confirme que o serviço está ativo.",
      true
    );
  }, REQUEST_CONFIRM_TIMEOUT_MS);
}

async function pollEventsOnce() {
  if (!polling) return;

  try {
    const key = memoryKey();
    if (!key) return;

    const result = await post("/api/devices/events/poll", {
      memoryKey: key,
      limit: 20
    });

    for (const event of result.events || []) {
      if (selectedDeviceId && event.deviceId !== selectedDeviceId) continue;

      if (event.eventType === "speech.transcript") {
        executeRemoteTranscript(event.payload?.text);
        continue;
      }

      if (event.eventType === "microphone.status") {
        const state = String(event.payload?.state || "unknown");
        const detail = String(event.payload?.detail || "").trim();

        if (state === "active") {
          clearRequestConfirmTimer();
          remoteMicActive = true;
          remoteSpeechSyncState = "resume";
          rememberRemoteMicAuthorization();
          if (requestButton) requestButton.textContent = "MIC CELULAR ATIVO";
          log(detail || "Microfone do celular autorizado e conectado.");

          if (
            (audio && !audio.paused && !audio.ended) ||
            window.ULTRON_VOICE_OUTPUT?.speaking
          ) {
            syncRemoteMicWithUltronSpeech("pause");
          }
        } else if (state === "stopped") {
          clearRequestConfirmTimer();
          remoteMicActive = false;
          remoteSpeechSyncState = "resume";
          queuedSpeechSyncState = null;
          if (requestButton) requestButton.textContent = "MIC CELULAR DISPONÍVEL";
          log(detail || "Sessão de escuta remota parada; a permissão continua salva no Android.");
        } else if (state === "blocked") {
          clearRequestConfirmTimer();
          remoteMicActive = false;
          remoteSpeechSyncState = "resume";
          queuedSpeechSyncState = null;
          if (requestButton) requestButton.textContent = "USAR MIC DO CELULAR";
          log(detail || "Permissão do microfone foi bloqueada no celular.", true);
        }
      }
    }
  } catch (error) {
    console.warn("ULTRON mobile mic poll:", error);
  } finally {
    if (polling) {
      pollTimer = setTimeout(pollEventsOnce, remoteMicActive ? 750 : 1200);
    }
  }
}

function startPolling() {
  if (polling) return;
  polling = true;
  pollEventsOnce();
}

async function requestMobileMicrophone() {
  try {
    if (requestButton) requestButton.textContent = "VERIFICANDO CELULAR...";

    const device = await selectMobileDevice({ requireOnline: true });
    disableNotebookMicrophone();
    startPolling();

    const alreadyAuthorized = remoteMicPreviouslyAuthorized();
    const queued = await sendDeviceNotification("microphone.request", {
      title: alreadyAuthorized
        ? "Ultron quer ativar o microfone remoto"
        : "Ultron quer usar o microfone",
      text: alreadyAuthorized
        ? "Permissão já registrada. Ative a sessão de microfone remoto."
        : "Autorize uma vez o microfone remoto do Ultron."
    });

    if (requestButton) requestButton.textContent = "AGUARDANDO CELULAR...";

    log(`Bridge online: ${device.deviceName || "celular pareado"}.`);
    log(
      queued?.commandId
        ? `Comando de microfone enviado (${queued.commandId.slice(0, 8)}).`
        : "Comando de microfone enviado."
    );

    if (alreadyAuthorized) {
      log("A permissão de microfone já foi registrada anteriormente; não é necessário autorizar novamente no Android.");
    } else {
      log("Na primeira ativação, autorize o microfone no Android. Essa permissão ficará salva pelo sistema.");
    }

    armRequestConfirmationTimeout();
  } catch (error) {
    clearRequestConfirmTimer();
    if (requestButton) requestButton.textContent = "USAR MIC DO CELULAR";
    log(error.message, true);
  }
}

async function flushRemoteSpeechSync() {
  if (remoteSpeechSyncBusy || !remoteMicActive || !selectedDeviceId) return;
  if (!queuedSpeechSyncState || queuedSpeechSyncState === remoteSpeechSyncState) {
    queuedSpeechSyncState = null;
    return;
  }

  const state = queuedSpeechSyncState;
  queuedSpeechSyncState = null;
  remoteSpeechSyncBusy = true;

  try {
    await sendDeviceNotification(
      state === "pause" ? "microphone.pause" : "microphone.resume",
      { quiet: true }
    );
    remoteSpeechSyncState = state;
  } catch (error) {
    console.warn("ULTRON remote mic sync:", error);
  } finally {
    remoteSpeechSyncBusy = false;
    if (queuedSpeechSyncState && queuedSpeechSyncState !== remoteSpeechSyncState) {
      flushRemoteSpeechSync();
    }
  }
}

function syncRemoteMicWithUltronSpeech(state) {
  if (!selectedDeviceId || !remoteMicActive) return;

  const normalizedState = state === "pause" ? "pause" : "resume";
  if (normalizedState === remoteSpeechSyncState && !remoteSpeechSyncBusy) return;

  queuedSpeechSyncState = normalizedState;
  flushRemoteSpeechSync();
}

requestButton?.addEventListener("click", requestMobileMicrophone);

if (audio) {
  audio.addEventListener("playing", () => {
    syncRemoteMicWithUltronSpeech("pause");
  });

  audio.addEventListener("ended", () => {
    syncRemoteMicWithUltronSpeech("resume");
  });

  audio.addEventListener("error", () => {
    syncRemoteMicWithUltronSpeech("resume");
  });
}

window.addEventListener("ultron:speech-start", () => {
  syncRemoteMicWithUltronSpeech("pause");
});

window.addEventListener("ultron:speech-end", () => {
  syncRemoteMicWithUltronSpeech("resume");
});

window.addEventListener("beforeunload", () => {
  polling = false;
  clearRequestConfirmTimer();
  if (pollTimer) clearTimeout(pollTimer);
});

if (requestButton && remoteMicPreviouslyAuthorized()) {
  requestButton.textContent = "MIC CELULAR DISPONÍVEL";
}

window.ULTRON_MOBILE_MIC = {
  request: requestMobileMicrophone,
  get active() {
    return remoteMicActive;
  },
  get speechSyncState() {
    return remoteSpeechSyncState;
  },
  get authorized() {
    return remoteMicPreviouslyAuthorized();
  }
};
