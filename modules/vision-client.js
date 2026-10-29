import API_CONFIG from "../config.js";
import { analyzePixelBuffer, summarizeFrameHealth } from "./vision-frame-health.js?v=4.16.0";

const API_BASE = String(API_CONFIG?.backendUrl || "").replace(/\/$/, "");
const output = document.getElementById("output-box");
let cameraUnavailable = false;
let lastUnavailableLog = 0;
let lastResult = null;
let lastFrameHealth = null;
let lastAnalysisAt = null;

function log(message, alert = false) {
  if (!output) return;
  const line = document.createElement("p");
  if (alert) line.className = "alert";
  line.textContent = `> [VISION] ${message}`;
  output.appendChild(line);
  output.scrollTop = output.scrollHeight;
}

window.addEventListener("ultron:camera-error", (event) => {
  if (String(event.detail?.name || "") === "NotFoundError") cameraUnavailable = true;
});

window.addEventListener("ultron:camera-devices", (event) => {
  if (Number(event.detail?.count || 0) > 0) cameraUnavailable = false;
});

window.addEventListener("ultron:camera-stream", (event) => {
  if (event.detail?.active) cameraUnavailable = false;
});

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function waitForVideo(video, timeoutMs = 9000) {
  if (video?.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) {
    return Promise.resolve(true);
  }

  return new Promise((resolve) => {
    const started = Date.now();
    const tick = () => {
      if (video?.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) {
        resolve(true);
        return;
      }
      if (Date.now() - started >= timeoutMs) {
        resolve(false);
        return;
      }
      setTimeout(tick, 180);
    };
    tick();
  });
}

function captureFrame(video) {
  const maxWidth = 1280;
  const scale = Math.min(1, maxWidth / Math.max(1, video.videoWidth));
  const width = Math.max(1, Math.round(video.videoWidth * scale));
  const height = Math.max(1, Math.round(video.videoHeight * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { alpha: false });
  context.drawImage(video, 0, 0, width, height);

  const dataUrl = canvas.toDataURL("image/jpeg", 0.78);
  return {
    imageBase64: dataUrl.split(",")[1] || "",
    mimeType: "image/jpeg",
    width,
    height
  };
}

function sampleVideo(video, previousSample = null) {
  const width = 64;
  const height = 48;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { alpha: false, willReadFrequently: true });
  context.drawImage(video, 0, 0, width, height);
  const pixels = context.getImageData(0, 0, width, height).data;
  return analyzePixelBuffer(pixels, previousSample);
}

export async function diagnoseCurrentVision() {
  const video = document.getElementById("webcam");
  const controller = window.ULTRON_CAMERA_CONTROLLER;
  const permission = await controller?.permissionState?.().catch(() => "unknown") || "unknown";
  const devices = await controller?.refreshDevices?.().catch(() => []) || [];

  const base = {
    secureContext: window.isSecureContext,
    mediaDevices: Boolean(navigator.mediaDevices?.getUserMedia),
    permission,
    deviceCount: devices.length,
    devices: devices.map((device) => ({ label: device.label, deviceId: device.deviceId })),
    active: Boolean(controller?.isActive?.()),
    selectedDeviceId: controller?.selectedDeviceId || null,
    frame: null
  };

  if (!video || !base.active || !(video.readyState >= 2 && video.videoWidth > 0)) {
    lastFrameHealth = { ...base, frame: { ok: false, signal: "NO_FRAME" } };
    window.dispatchEvent(new CustomEvent("ultron:vision-health", { detail: lastFrameHealth }));
    return lastFrameHealth;
  }

  const readings = [];
  let previousSample = null;
  for (let index = 0; index < 3; index += 1) {
    const reading = sampleVideo(video, previousSample);
    previousSample = reading.sample;
    readings.push(reading);
    if (index < 2) await wait(260);
  }

  const summary = summarizeFrameHealth(readings);
  lastFrameHealth = {
    ...base,
    resolution: `${video.videoWidth}x${video.videoHeight}`,
    currentTime: Number(video.currentTime || 0),
    frame: summary
  };

  window.dispatchEvent(new CustomEvent("ultron:vision-health", { detail: lastFrameHealth }));
  return lastFrameHealth;
}

async function ensureCameraAvailable() {
  const controller = window.ULTRON_CAMERA_CONTROLLER;
  if (!controller) return { ok: false, reason: "controller" };

  const devices = await controller.refreshDevices?.().catch(() => []) || [];
  if (!devices.length) {
    cameraUnavailable = true;
    const now = Date.now();
    if (now - lastUnavailableLog > 15000) {
      lastUnavailableLog = now;
      log("Visão em espera: 0 câmeras detectadas. Conecte/habilite uma câmera USB, virtual ou do sistema; o Ultron retomará quando um videoinput aparecer.", true);
    }
    return { ok: false, reason: "no-camera" };
  }

  cameraUnavailable = false;
  return { ok: true, devices };
}

async function analyzeFramePayload(frame, prompt = "") {
  const response = await fetch(`${API_BASE}/api/vision/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({
      imageBase64: frame.imageBase64,
      mimeType: frame.mimeType,
      prompt: prompt || "Descreva o que está visível e destaque objetos, textos e elementos úteis para o operador."
    })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.ok === false || !data?.text) {
    throw new Error(data?.error || `HTTP ${response.status}`);
  }

  lastResult = data;
  lastAnalysisAt = new Date().toISOString();
  log(`${data.providerLabel || "VISUAL AI"}: ${data.text}`);
  window.ULTRON_VISUAL_PANEL?.setCaption?.(data.text);
  window.dispatchEvent(new CustomEvent("ultron:vision-result", { detail: data }));
  return data;
}

export async function analyzeCurrentVision(prompt = "") {
  const video = document.getElementById("webcam");
  if (!video || !API_BASE) {
    log("Câmera ou backend indisponível.", true);
    return null;
  }

  if (cameraUnavailable) {
    const availability = await ensureCameraAvailable();
    if (!availability.ok) return null;
  }

  if (!(video.readyState >= 2 && video.videoWidth > 0)) {
    const availability = await ensureCameraAvailable();
    if (!availability.ok) return null;

    try {
      log(`Ativando a câmera (${availability.devices.length} dispositivo(s) disponível(is)) para capturar um frame autorizado...`);
      await window.ULTRON_CAMERA_CONTROLLER?.start?.();
    } catch (error) {
      if (String(error?.name || "") !== "NotFoundError") {
        log(`Não foi possível iniciar a câmera: ${error?.message || error}`, true);
      }
      return null;
    }
  }

  const ready = await waitForVideo(video);
  if (!ready) {
    log("A câmera foi iniciada, mas nenhum frame ficou disponível a tempo.", true);
    return null;
  }

  try {
    const health = await diagnoseCurrentVision();
    if (health?.frame?.signal === "BLACK") {
      log("O stream abriu, mas o frame está praticamente preto. Verifique tampa física, iluminação ou falha da webcam.", true);
      return null;
    }
    if (health?.frame?.signal === "BLANK") {
      log("O stream abriu, mas o frame está vazio/branco. O driver pode não estar entregando imagem válida.", true);
      return null;
    }
    if (health?.frame?.signal === "STATIC_VERIFY") {
      log("O frame permaneceu quase idêntico durante o teste. Pode ser uma cena parada ou stream congelado; a análise continuará com o frame atual.", true);
    }

    const frame = captureFrame(video);
    log(`Analisando um frame ${frame.width}×${frame.height}...`);
    return await analyzeFramePayload(frame, prompt);
  } catch (error) {
    log(`Falha na análise visual: ${error?.message || error}`, true);
    return null;
  }
}

function readImageFile(file) {
  return new Promise((resolve, reject) => {
    if (!file || !String(file.type || "").startsWith("image/")) {
      reject(new Error("Selecione um arquivo de imagem."));
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Não foi possível ler a imagem."));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error("Formato de imagem inválido."));
      image.onload = () => {
        const maxWidth = 1600;
        const scale = Math.min(1, maxWidth / Math.max(1, image.naturalWidth));
        const width = Math.max(1, Math.round(image.naturalWidth * scale));
        const height = Math.max(1, Math.round(image.naturalHeight * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d", { alpha: false });
        context.drawImage(image, 0, 0, width, height);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
        resolve({
          imageBase64: dataUrl.split(",")[1] || "",
          mimeType: "image/jpeg",
          width,
          height,
          sourceName: file.name || "imagem local"
        });
      };
      image.src = String(reader.result || "");
    };
    reader.readAsDataURL(file);
  });
}

export async function analyzeImageFile(file, prompt = "") {
  if (!API_BASE) {
    log("Backend de visão indisponível.", true);
    return null;
  }

  try {
    const frame = await readImageFile(file);
    log(`Fallback visual local: analisando ${frame.sourceName} (${frame.width}×${frame.height}).`);
    return await analyzeFramePayload(frame, prompt);
  } catch (error) {
    log(`Falha ao analisar imagem local: ${error?.message || error}`, true);
    return null;
  }
}

function pickImage() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/jpeg,image/png,image/webp,image/*";
  input.addEventListener("change", () => {
    const file = input.files?.[0];
    if (file) analyzeImageFile(file);
  }, { once: true });
  input.click();
}

function installButtons() {
  const actions = document.querySelector(".quick-actions");
  if (!actions) return;

  if (!document.getElementById("btn-analyze-vision")) {
    const button = document.createElement("button");
    button.id = "btn-analyze-vision";
    button.textContent = "ANALISAR VISÃO";
    button.addEventListener("click", () => analyzeCurrentVision());
    actions.appendChild(button);
  }

  if (!document.getElementById("btn-analyze-image")) {
    const button = document.createElement("button");
    button.id = "btn-analyze-image";
    button.textContent = "IMAGEM LOCAL";
    button.addEventListener("click", pickImage);
    actions.appendChild(button);
  }
}

installButtons();

window.ULTRON_VISION = {
  analyze: analyzeCurrentVision,
  analyzeFile: analyzeImageFile,
  pickImage,
  diagnose: diagnoseCurrentVision,
  get waitingForCamera() {
    return cameraUnavailable;
  },
  get state() {
    return {
      cameraUnavailable,
      lastAnalysisAt,
      lastResult,
      lastFrameHealth
    };
  }
};
