import API_CONFIG from "../config.js";

const API_BASE = String(API_CONFIG?.backendUrl || "").replace(/\/$/, "");

const $ = (id) => document.getElementById(id);
const requestButton = $("btn-mobile-mic");
const output = $("output-box");
const audio = $("voice-audio");

let selectedDeviceId = null;
let polling = false;
let pollTimer = null;
let remoteMicActive = false;
let lastTranscript = "";
let lastTranscriptAt = 0;

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

async function selectMobileDevice() {
  const devices = await listMobileDevices();
  const device = devices[0] || null;

  if (!device) {
    throw new Error("Nenhum celular pareado foi encontrado. Use PAREAR CELULAR primeiro.");
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
          remoteMicActive = true;
          if (requestButton) requestButton.textContent = "MIC CELULAR ATIVO";
          log(detail || "Microfone do celular autorizado e conectado.");
        } else if (state === "stopped") {
          remoteMicActive = false;
          if (requestButton) requestButton.textContent = "USAR MIC DO CELULAR";
          log(detail || "Microfone remoto interrompido.");
        } else if (state === "blocked") {
          remoteMicActive = false;
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
    const device = await selectMobileDevice();
    disableNotebookMicrophone();
    startPolling();

    await sendDeviceNotification("microphone.request", {
      title: "Ultron quer usar o microfone",
      text: "Toque para revisar e autorizar o microfone remoto."
    });

    if (requestButton) requestButton.textContent = "AGUARDANDO CELULAR...";
    log(`Solicitação enviada para ${device.deviceName || "celular pareado"}.`);
    log("No celular, toque na notificação do Ultron e autorize o microfone no Android.");
  } catch (error) {
    log(error.message, true);
  }
}

async function syncRemoteMicWithUltronSpeech(state) {
  if (!selectedDeviceId || !remoteMicActive) return;

  try {
    await sendDeviceNotification(
      state === "pause" ? "microphone.pause" : "microphone.resume",
      { quiet: true }
    );
  } catch (error) {
    console.warn("ULTRON remote mic sync:", error);
  }
}

requestButton?.addEventListener("click", requestMobileMicrophone);

if (audio) {
  audio.addEventListener("playing", () => {
    syncRemoteMicWithUltronSpeech("pause");
  });

  const resume = () => {
    syncRemoteMicWithUltronSpeech("resume");
  };

  audio.addEventListener("ended", resume);
  audio.addEventListener("error", resume);
  audio.addEventListener("pause", () => {
    if (audio.ended || audio.currentTime > 0) resume();
  });
}

window.addEventListener("beforeunload", () => {
  polling = false;
  if (pollTimer) clearTimeout(pollTimer);
});

window.ULTRON_MOBILE_MIC = {
  request: requestMobileMicrophone,
  get active() {
    return remoteMicActive;
  }
};
