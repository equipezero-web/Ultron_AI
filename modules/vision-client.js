import API_CONFIG from "../config.js";

const API_BASE = String(API_CONFIG?.backendUrl || "").replace(/\/$/, "");
const output = document.getElementById("output-box");
let cameraUnavailable = false;
let lastUnavailableLog = 0;

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

async function ensureCameraAvailable() {
  const controller = window.ULTRON_CAMERA_CONTROLLER;
  if (!controller) return { ok: false, reason: "controller" };

  const devices = await controller.refreshDevices?.().catch(() => []) || [];
  if (!devices.length) {
    cameraUnavailable = true;
    const now = Date.now();
    if (now - lastUnavailableLog > 15000) {
      lastUnavailableLog = now;
      log("Visão em espera: 0 câmeras detectadas. Conecte/habilite uma câmera; o Ultron retomará quando um videoinput aparecer.", true);
    }
    return { ok: false, reason: "no-camera" };
  }

  cameraUnavailable = false;
  return { ok: true, devices };
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
    const frame = captureFrame(video);
    log(`Analisando um frame ${frame.width}×${frame.height}...`);

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

    log(`${data.providerLabel || "VISUAL AI"}: ${data.text}`);
    window.ULTRON_VISUAL_PANEL?.setCaption?.(data.text);
    window.dispatchEvent(new CustomEvent("ultron:vision-result", { detail: data }));
    return data;
  } catch (error) {
    log(`Falha na análise visual: ${error?.message || error}`, true);
    return null;
  }
}

function installButton() {
  const actions = document.querySelector(".quick-actions");
  if (!actions || document.getElementById("btn-analyze-vision")) return;

  const button = document.createElement("button");
  button.id = "btn-analyze-vision";
  button.textContent = "ANALISAR VISÃO";
  button.addEventListener("click", () => analyzeCurrentVision());
  actions.appendChild(button);
}

installButton();

window.ULTRON_VISION = {
  analyze: analyzeCurrentVision,
  get waitingForCamera() {
    return cameraUnavailable;
  }
};
