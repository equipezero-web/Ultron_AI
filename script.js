import { CameraController } from "./modules/camera.js";
import { loadPreferences } from "./modules/storage.js";
import { addLog, clock } from "./modules/system.js";
import API_CONFIG from "./config.js";

const $ = (id) => document.getElementById(id);
const setText = (id, value) => {
  const element = $(id);
  if (element) element.textContent = String(value);
};
const setClass = (id, value = "") => {
  const element = $(id);
  if (element) element.className = value;
};

const video = $("webcam");
const output = $("output-box");
const btnCamera = $("btn-camera");
const btnStop = $("btn-stop-camera");
const screenModal = $("screen-modal");
const closeScreen = $("btn-close-screen");
const prefs = loadPreferences();
const API_BASE = String(API_CONFIG?.backendUrl || "").replace(/\/$/, "");
const apiUrl = (path) => `${API_BASE}${path}`;

let startTime = Date.now();
let voiceBusy = false;
let opticalFrames = 0;
let opticalFps = 0;
let opticalWindowStarted = performance.now();
let frameLoopActive = false;
let cameraSource = "MOBILE_BRIDGE";

function showScreen() {
  screenModal?.classList.add("open");
  screenModal?.setAttribute("aria-hidden", "false");
}

function hideScreen() {
  screenModal?.classList.remove("open");
  screenModal?.setAttribute("aria-hidden", "true");
}

function getErrorMessage(data, status) {
  if (typeof data === "string" && data.trim()) return data;
  if (data?.details) return data.details;
  if (data?.error) return data.error;
  if (data?.message) return data.message;
  return `Erro HTTP ${status}`;
}

async function readApiResponse(response) {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) return response.json();
  const text = await response.text();
  return { error: text || `Erro HTTP ${response.status}` };
}

function prepareNeuralResponse(data) {
  const panel = window.ULTRON_VISUAL_PANEL;
  if (!panel) return;

  if (data?.visualContext) {
    panel.showContext({
      ...data.visualContext,
      caption: data.visualContext.caption || data.text || ""
    });
  } else {
    panel.clearImages?.();
    panel.clearCards?.();
    panel.setCaption?.(data?.text || "");
  }
}

function playVoice(base64, mime = "audio/mpeg") {
  try {
    if (!base64) throw new Error("O backend não retornou dados de áudio.");
    const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
    const blob = new Blob([bytes], { type: mime });
    const url = URL.createObjectURL(blob);
    const audio = $("voice-audio");

    if (!audio) {
      URL.revokeObjectURL(url);
      throw new Error("Elemento de áudio não encontrado.");
    }

    if (audio.dataset.audioUrl) URL.revokeObjectURL(audio.dataset.audioUrl);
    audio.dataset.audioUrl = url;
    audio.src = url;
    audio.load();
    audio.play().catch(() => {
      addLog(output, "Áudio gerado, mas o navegador bloqueou a reprodução automática.", "alert");
    });
    audio.onended = () => {
      if (audio.dataset.audioUrl === url) {
        URL.revokeObjectURL(url);
        delete audio.dataset.audioUrl;
      }
    };
  } catch (error) {
    addLog(output, `VOICE ERROR: ${error.message}`, "alert");
  }
}

function updateOpticalFrameReadout() {
  if (!video) return;
  if (video.videoWidth > 0 && video.videoHeight > 0) {
    setText("camera-resolution", `${video.videoWidth}×${video.videoHeight}`);
    setText("infra-frame", `${video.videoWidth}×${video.videoHeight}`);
  }
  setText("fps", `${opticalFps || "--"} FPS`);
}

function frameTick() {
  if (!frameLoopActive || !video) return;
  opticalFrames += 1;
  const now = performance.now();
  const elapsed = now - opticalWindowStarted;
  if (elapsed >= 1000) {
    opticalFps = Math.round((opticalFrames * 1000) / elapsed);
    opticalFrames = 0;
    opticalWindowStarted = now;
    updateOpticalFrameReadout();
  }
  if (typeof video.requestVideoFrameCallback === "function") {
    video.requestVideoFrameCallback(frameTick);
  } else {
    requestAnimationFrame(frameTick);
  }
}

function startFrameTelemetry() {
  if (frameLoopActive) return;
  frameLoopActive = true;
  opticalFrames = 0;
  opticalWindowStarted = performance.now();
  frameTick();
}

function stopFrameTelemetry() {
  frameLoopActive = false;
  opticalFrames = 0;
  opticalFps = 0;
  setText("fps", "-- FPS");
  setText("camera-resolution", "NO SIGNAL");
  setText("infra-frame", "WAITING");
}

const camera = new CameraController(video, (state) => {
  if (state === "active") {
    setText("camera-state", "ONLINE");
    if ($("camera-state")) $("camera-state").style.color = "var(--green)";
    setText("permission-state", "MOBILE OPTICAL LINK");
    setText("vision-module", "ACTIVE");
    setClass("vision-module", "green");
    setText("system-mode", "OPTICAL LINK");
    setText("bridge-camera-state", "ONLINE");
    if (btnCamera) btnCamera.textContent = "SENSOR ATIVO";
    if (btnStop) btnStop.disabled = false;
    startFrameTelemetry();
    updateOpticalFrameReadout();
    addLog(output, `Optical Sensor online via ${cameraSource}. Feed dedicado a visão, mãos e controle 3D.`);
  } else {
    setText("camera-state", "STANDBY");
    if ($("camera-state")) $("camera-state").style.color = "";
    setText("vision-module", "STANDBY");
    setClass("vision-module", "");
    setText("system-mode", "STANDBY");
    setText("bridge-camera-state", "STANDBY");
    if (btnCamera) btnCamera.textContent = "ATIVAR SENSOR DO CELULAR";
    if (btnStop) btnStop.disabled = true;
    stopFrameTelemetry();
  }
});

// O computador não abre a webcam local automaticamente. A fonte principal é o celular.
camera.restoreIfGranted = async () => false;

async function activateCamera({ openPreview = true } = {}) {
  try {
    if (openPreview) showScreen();
    setText("permission-state", "CONNECTING MOBILE");
    setText("bridge-camera-state", "CONNECTING");

    const mobile = window.ULTRON_MOBILE_CAMERA;
    if (!mobile?.smartConnect && !mobile?.useBridgeCamera) {
      throw new Error("Módulo de câmera do celular ainda não carregou.");
    }

    cameraSource = "ULTRON BRIDGE";
    if (mobile.smartConnect) await mobile.smartConnect();
    else await mobile.useBridgeCamera();
  } catch (error) {
    if (openPreview) hideScreen();
    setText("permission-state", "MOBILE OFFLINE");
    setText("bridge-camera-state", "OFFLINE");
    addLog(output, `OPTICAL SENSOR: ${error.message}`, "alert");
  }
}

btnCamera?.addEventListener("click", () => activateCamera({ openPreview: true }));

btnStop?.addEventListener("click", () => {
  window.ULTRON_MOBILE_CAMERA?.stopBridgeCamera?.();
  camera.stop({ silent: true });
  hideScreen();
  addLog(output, "Optical Sensor desligado pelo operador.");
});

closeScreen?.addEventListener("click", hideScreen);
screenModal?.addEventListener("click", (event) => {
  if (event.target === screenModal) hideScreen();
});

$("btn-send")?.addEventListener("click", execute);
$("command-input")?.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    execute();
  }
});

document.querySelectorAll("[data-command]").forEach((button) => {
  button.addEventListener("click", () => handleQuick(button.dataset.command));
});

async function execute() {
  const input = $("command-input");
  const command = input?.value.trim() || "";
  if (!command) return;

  addLog(output, `OPERATOR: ${command}`);
  input.value = "";
  const normalized = command.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

  if (/\b(camera|sensor|optical|celular)\b/.test(normalized) && /\b(ativar|ligar|abrir|mostrar|conectar|camera|sensor)\b/.test(normalized)) {
    await activateCamera({ openPreview: true });
    return;
  }

  if (/\b(centralizar|resetar|reset)\b/.test(normalized) && /\b(3d|esfera|neural|holograma|holografica)\b/.test(normalized)) {
    window.ULTRON_NEURAL_3D?.reset?.();
    addLog(output, "Esfera holográfica centralizada em 0°.");
    return;
  }

  if (normalized.includes("status")) {
    handleQuick("status");
    return;
  }

  await askUltron(command);
}

async function askUltron(command) {
  const thinking = document.createElement("p");
  thinking.textContent = "> ULTRON CORE: roteando comando e contexto óptico...";
  thinking.dataset.thinking = "true";
  output?.appendChild(thinking);
  if (output) output.scrollTop = output.scrollHeight;

  try {
    if (!API_BASE) throw new Error("Backend não configurado.");
    const neural3d = window.ULTRON_NEURAL_3D?.state || {};
    const gesture = window.ULTRON_HAND_GESTURES?.state || {};
    const remoteCamera = window.ULTRON_MOBILE_CAMERA?.state || {};

    const response = await fetch(apiUrl("/api/ai"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: command,
        memoryKey: window.ULTRON_MEMORY?.getMemoryKey?.() || null,
        telemetry: {
          optical: {
            active: Boolean(remoteCamera.active || camera.stream),
            source: remoteCamera.mode || cameraSource,
            resolution: video?.videoWidth && video?.videoHeight ? `${video.videoWidth}x${video.videoHeight}` : null,
            fps: opticalFps,
            gesture: gesture.gesture || null,
            handCount: neural3d.handCount || 0
          },
          neural3d: {
            azimuth: Math.round(Number(neural3d.ry || 0)),
            elevation: Math.round(Number(neural3d.rx || 0)),
            roll: Math.round(Number(neural3d.rz || 0)),
            zoom: Number(neural3d.scale || 1)
          }
        }
      })
    });

    const data = await readApiResponse(response);
    if (!response.ok) throw new Error(getErrorMessage(data, response.status));
    if (!data?.text) throw new Error("O gateway respondeu sem texto.");

    const provider = data.providerLabel || data.provider || "AI";
    addLog(output, `ULTRON [${provider}]: ${data.text}`);
    prepareNeuralResponse(data);
    if (data.audioBase64) playVoice(data.audioBase64, data.audioMimeType || "audio/mpeg");
  } catch (error) {
    addLog(output, `ULTRON AI ERROR: ${error.message}`, "alert");
  } finally {
    thinking.remove();
  }
}

async function testVoice() {
  if (voiceBusy) return;
  voiceBusy = true;
  addLog(output, "Solicitando teste de voz...");

  try {
    if (!API_BASE) throw new Error("Backend não configurado.");
    const response = await fetch(apiUrl("/api/voice"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "ULTRON online. Núcleo neural e sensor óptico operacionais." })
    });
    const data = await readApiResponse(response);
    if (!response.ok) throw new Error(getErrorMessage(data, response.status));
    if (!data?.audioBase64) throw new Error("O provedor não retornou áudio.");
    window.ULTRON_VISUAL_PANEL?.setCaption?.("ULTRON online. Núcleo neural e sensor óptico operacionais.");
    playVoice(data.audioBase64, data.audioMimeType || "audio/mpeg");
    addLog(output, "Voz recebida e enviada para reprodução.");
  } catch (error) {
    addLog(output, `VOICE ERROR: ${error.message}`, "alert");
  } finally {
    voiceBusy = false;
  }
}

async function loadHealth() {
  try {
    if (!API_BASE) throw new Error("Backend não configurado.");
    const response = await fetch(apiUrl("/api/health"), { cache: "no-store" });
    const data = await readApiResponse(response);
    if (!response.ok) throw new Error(getErrorMessage(data, response.status));

    const providerEntries = Object.values(data?.providers || {});
    const configuredProviders = providerEntries.filter((provider) => provider?.configured).length;
    const gatewayOnline = Boolean(data?.aiGateway && configuredProviders > 0);

    setText("gemini-module", gatewayOnline ? `${configuredProviders} AI ONLINE` : "API OFF");
    setClass("gemini-module", gatewayOnline ? "green" : "");
    setText("voice-module", data.elevenlabs || data.voiceRouter ? "ONLINE" : "API OFF");
    setClass("voice-module", data.elevenlabs || data.voiceRouter ? "green" : "");
    setText("bridge-module", data.deviceBridge || data.bridge?.ready ? "READY" : "API WAIT");
    setText("infra-backend", "ONLINE");
  } catch (error) {
    setText("gemini-module", "BACKEND OFF");
    setText("voice-module", "BACKEND OFF");
    setText("infra-backend", "OFFLINE");
    addLog(output, `BACKEND ERROR: ${error.message}`, "alert");
  }
}

function handleQuick(command) {
  if (command === "clear") {
    if (output) output.innerHTML = "";
    return;
  }
  if (command === "voice") {
    testVoice();
    return;
  }
  if (command === "camera") {
    activateCamera({ openPreview: true });
    return;
  }
  if (command === "center") {
    window.ULTRON_NEURAL_3D?.reset?.();
    addLog(output, "Esfera holográfica centralizada.");
    return;
  }
  if (command === "status") {
    const cameraState = window.ULTRON_MOBILE_CAMERA?.state || {};
    const gestureState = window.ULTRON_HAND_GESTURES?.state || {};
    const orb = window.ULTRON_NEURAL_3D?.state || {};
    addLog(
      output,
      `Sistema ONLINE | Optical ${cameraState.active ? "ONLINE" : "standby"} | ${video?.videoWidth || 0}×${video?.videoHeight || 0} @ ${opticalFps || 0} FPS | mãos ${orb.handCount || 0} | gesto ${gestureState.gesture || "NONE"} | AI ${$("gemini-module")?.textContent || "--"}`
    );
  }
}

window.addEventListener("ultron:camera-hand", (event) => {
  const detail = event?.detail || {};
  setText("optical-gesture", String(detail.gesture || "TRACKING").replaceAll("_", " ").toUpperCase());
  setText("optical-hands", Number(detail.handCount || 0));
});

window.addEventListener("ultron:camera-stream", (event) => {
  const detail = event?.detail || {};
  if (detail.active) {
    cameraSource = detail.source || "REMOTE";
    setText("infra-frame", detail.width && detail.height ? `${detail.width}×${detail.height}` : "ACTIVE");
  }
});

window.addEventListener("ultron:remote-camera-ice-recovery", (event) => {
  const detail = event?.detail || {};
  setText("infra-ice-path", detail.state === "recovered" ? "RECOVERED" : "RECONNECTING");
});

window.addEventListener("ultron:mobile-camera-source", (event) => {
  const detail = event?.detail || {};
  if (detail.active) {
    setText("bridge-camera-state", "ONLINE");
    setText("permission-state", "MOBILE OPTICAL LINK");
  }
});

window.addEventListener("ultron:remote-camera-webrtc-hotfix-ready", (event) => {
  const detail = event?.detail || {};
  setText("infra-webrtc", `v${detail.version || "READY"}`);
  setText("turn-state", detail.turnConfigured ? "TURN READY" : "AUTO/STUN");
});

setInterval(() => {
  setText("clock", clock());
  const totalSeconds = Math.floor((Date.now() - startTime) / 1000);
  const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
  const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  setText("uptime", `${hours}:${minutes}:${seconds}`);
}, 1000);

setText("storage-state", "READY");
setText("connection-state", navigator.onLine ? "ONLINE" : "OFFLINE");
window.addEventListener("online", () => setText("connection-state", "ONLINE"));
window.addEventListener("offline", () => setText("connection-state", "OFFLINE"));

if (prefs.cameraAccepted) {
  addLog(output, "Preferência anterior de câmera detectada. A webcam local permanecerá desligada; o Ultron prioriza o celular.");
}

video?.addEventListener("playing", startFrameTelemetry);
video?.addEventListener("emptied", stopFrameTelemetry);
loadHealth();
