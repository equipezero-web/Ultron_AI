import API_CONFIG from "../config.js";
import "./stark-bootstrap.js?v=4.16.0";
import "./la-team-bootstrap.js?v=4.15.0";

const API_BASE = String(API_CONFIG?.backendUrl || "").replace(/\/$/, "");
const OUTPUT = document.getElementById("output-box");
const SETTINGS_KEY = "ultron_proactive_settings_v1";

let timer = null;
let sending = false;
let lastSnapshot = null;
let lastServerState = "unknown";
let batteryState = null;

function pushIntervalMs() {
  return Number(window.ULTRON_PERFORMANCE?.profile?.telemetryIntervalMs || 15000);
}

function readText(id, fallback = "") {
  return String(document.getElementById(id)?.textContent || fallback).trim();
}

function log(message, severity = "info") {
  if (!OUTPUT) return;
  const line = document.createElement("p");
  if (severity === "warning" || severity === "critical") line.className = "alert";
  const time = new Date().toLocaleTimeString("pt-BR", { hour12: false });
  line.textContent = `> [${time}] [PROACTIVE] ${message}`;
  OUTPUT.appendChild(line);
  OUTPUT.scrollTop = OUTPUT.scrollHeight;
}

function loadSettings() {
  try {
    const parsed = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
    return { enabled: parsed.enabled !== false, speak: parsed.speak === true };
  } catch {
    return { enabled: true, speak: false };
  }
}

function saveSettings(settings) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch {}
}

function networkSnapshot() {
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  return {
    online: navigator.onLine,
    effectiveType: connection?.effectiveType || null,
    downlinkMbps: Number.isFinite(connection?.downlink) ? connection.downlink : null,
    rttMs: Number.isFinite(connection?.rtt) ? connection.rtt : null,
    saveData: Boolean(connection?.saveData)
  };
}

async function refreshBattery() {
  if (!navigator.getBattery) return;
  try {
    const battery = await navigator.getBattery();
    batteryState = {
      level: Math.round(Number(battery.level || 0) * 100),
      charging: Boolean(battery.charging),
      chargingTime: Number.isFinite(battery.chargingTime) ? battery.chargingTime : null,
      dischargingTime: Number.isFinite(battery.dischargingTime) ? battery.dischargingTime : null
    };
  } catch {}
}

export async function buildTelemetrySnapshot(extra = {}) {
  if (!batteryState) refreshBattery();

  const remoteMic = window.ULTRON_MOBILE_MIC;
  const memory = window.ULTRON_MEMORY;
  const handGestures = window.ULTRON_HAND_GESTURES?.state || null;
  const palmMatrix = window.ULTRON_PALM_MATRIX?.state || null;
  const starkState = window.ULTRON_STARK_CORE?.state || null;
  const mesh = window.ULTRON_STARK_MESH;
  const cameraPreview = window.ULTRON_CAMERA_PREVIEW?.state || null;
  const localFiles = window.ULTRON_LOCAL_FILES?.state || null;
  const laTeam = window.ULTRON_LA_TEAM?.state || null;
  const vision = window.ULTRON_VISION?.state || null;

  return {
    capturedAt: new Date().toISOString(),
    performance: {
      mode: window.ULTRON_PERFORMANCE?.mode || "full",
      profile: window.ULTRON_PERFORMANCE?.profile || null
    },
    connection: networkSnapshot(),
    page: {
      visibility: document.visibilityState,
      focused: document.hasFocus(),
      secureContext: window.isSecureContext,
      path: location.pathname
    },
    runtime: {
      language: navigator.language || null,
      hardwareConcurrency: navigator.hardwareConcurrency || null,
      deviceMemoryGb: navigator.deviceMemory || null,
      userAgent: String(navigator.userAgent || "").slice(0, 240)
    },
    battery: batteryState,
    camera: {
      state: readText("camera-state", "UNKNOWN"),
      telemetry: readText("telemetry-camera", "OFF"),
      resolution: readText("camera-resolution", "NO SIGNAL"),
      fps: readText("fps", "-- FPS"),
      preview: cameraPreview,
      detectedDevices: Number(window.ULTRON_CAMERA_RUNTIME?.devices?.length || 0),
      active: Boolean(window.ULTRON_CAMERA_RUNTIME?.active)
    },
    vision: vision ? {
      waitingForCamera: Boolean(vision.cameraUnavailable),
      lastAnalysisAt: vision.lastAnalysisAt || null,
      frameHealth: vision.lastFrameHealth?.frame || null,
      resolution: vision.lastFrameHealth?.resolution || null,
      provider: vision.lastResult?.provider || null,
      model: vision.lastResult?.model || null,
      imageFallbackReady: Boolean(window.ULTRON_VISION?.analyzeFile),
      diagnosticsReady: Boolean(window.ULTRON_VISION?.diagnose)
    } : null,
    motion: {
      level: readText("motion-value", "0%"),
      events: Number(readText("motion-events", "0")) || 0,
      activity: readText("reaction-activity", "BAIXA"),
      emotionEstimate: readText("emotion-state", "NORMAL")
    },
    microphone: {
      localState: readText("mic-module", "UNKNOWN"),
      remoteActive: Boolean(remoteMic?.active),
      remoteAuthorized: Boolean(remoteMic?.authorized),
      remoteSpeechSync: remoteMic?.speechSyncState || null,
      remoteState: remoteMic?.active ? "active" : (remoteMic?.authorized ? "available" : "idle")
    },
    neuralControl: {
      handTracking: handGestures,
      palmMatrix,
      starkCore: starkState,
      focusedNode: mesh?.focused || null,
      zoomLevel: Number(mesh?.zoomLevel || 0),
      handZoom: Boolean(mesh?.zoomed),
      draggingNode: mesh?.dragging || null
    },
    localKnowledge: localFiles ? {
      online: Boolean(localFiles.online),
      files: Number(localFiles.health?.files || localFiles.files?.length || 0),
      vectorChunks: Number(localFiles.health?.vector_chunks || 0),
      activeFile: localFiles.activeFile?.path || null,
      ragV2: Boolean(window.ULTRON_LOCAL_FILES_V2),
      hybridSearch: Boolean(window.ULTRON_LOCAL_FILES?.capabilities?.hybridSearch),
      messageSafe: Boolean(window.ULTRON_LOCAL_RAG_BRIDGE?.messageSafe)
    } : null,
    businessSystems: {
      laTeam: laTeam ? {
        ready: Boolean(laTeam.ready),
        authenticated: Boolean(laTeam.authenticated),
        authorized: Boolean(laTeam.authorized),
        role: laTeam.member?.role || null,
        lastContext: laTeam.lastContext || null
      } : null
    },
    modules: {
      memory: readText("memory-module", "UNKNOWN"),
      bridge: readText("bridge-module", "UNKNOWN"),
      voice: readText("voice-module", "UNKNOWN"),
      vision: readText("vision-module", "UNKNOWN"),
      aiGateway: readText("gemini-module", "UNKNOWN"),
      localFiles: localFiles?.online ? "ONLINE" : "OFFLINE",
      laTeam: laTeam?.authorized ? "ONLINE" : "LOCKED"
    },
    system: {
      mode: readText("system-mode", "STANDBY"),
      status: readText("status-text", "UNKNOWN")
    },
    memory: {
      conversationId: memory?.getConversationId?.() || null
    },
    ...extra
  };
}

async function postSnapshot(snapshot) {
  const key = window.ULTRON_MEMORY?.getMemoryKey?.();
  if (!API_BASE || !key) return null;

  const response = await fetch(`${API_BASE}/api/telemetry/ingest`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({ memoryKey: key, source: "web", snapshot })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.ok === false) throw new Error(data?.error || `HTTP ${response.status}`);
  return data;
}

function handleAlerts(alerts = []) {
  const settings = loadSettings();
  if (!settings.enabled) return;

  for (const alert of alerts) {
    const severity = String(alert?.severity || "info");
    const message = String(alert?.message || "").trim();
    if (!message) continue;
    log(message, severity);
    window.dispatchEvent(new CustomEvent("ultron:proactive-alert", { detail: alert }));

    if (settings.speak && ["warning", "critical"].includes(severity)) {
      window.ULTRON_VOICE_OUTPUT?.speak?.(`Atenção. ${message}`, { reason: "proactive", announce: false });
    }
  }
}

export async function pushTelemetry(extra = {}) {
  if (sending || document.hidden) return null;
  sending = true;
  try {
    const snapshot = await buildTelemetrySnapshot(extra);
    lastSnapshot = snapshot;
    const result = await postSnapshot(snapshot);
    lastServerState = result?.ok ? "online" : "error";
    handleAlerts(result?.alerts || []);
    return result;
  } catch (error) {
    lastServerState = "error";
    console.warn("ULTRON telemetry:", error);
    return null;
  } finally {
    sending = false;
  }
}

function schedule() {
  if (timer) clearInterval(timer);
  timer = setInterval(() => pushTelemetry(), pushIntervalMs());
}

window.addEventListener("online", () => pushTelemetry({ event: "browser-online" }));
window.addEventListener("offline", () => pushTelemetry({ event: "browser-offline" }));
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) pushTelemetry({ event: "visibility-change" });
});
window.addEventListener("ultron:performance-mode", () => schedule());
window.addEventListener("ultron:stark-zoom-level", (event) => pushTelemetry({
  event: "stark-zoom-level",
  zoomLevel: Number(event.detail?.level || 0)
}));
window.addEventListener("ultron:local-rag-context", (event) => pushTelemetry({
  event: "local-rag-context",
  localRag: event.detail || null
}));
window.addEventListener("ultron:la-team-context", (event) => pushTelemetry({
  event: "la-team-context",
  laTeam: event.detail || null
}));
window.addEventListener("ultron:vision-health", (event) => pushTelemetry({
  event: "vision-health",
  visionHealth: event.detail || null
}));
window.addEventListener("ultron:vision-result", (event) => pushTelemetry({
  event: "vision-result",
  visionResult: {
    provider: event.detail?.provider || null,
    model: event.detail?.model || null,
    ok: event.detail?.ok !== false
  }
}));

window.ULTRON_TELEMETRY = {
  push: pushTelemetry,
  snapshot: buildTelemetrySnapshot,
  configureProactive(next = {}) {
    const settings = { ...loadSettings(), ...next };
    saveSettings(settings);
    return settings;
  },
  get settings() { return loadSettings(); },
  get lastSnapshot() { return lastSnapshot; },
  get serverState() { return lastServerState; }
};

refreshBattery();
setTimeout(() => pushTelemetry({ event: "startup" }), 2500);
schedule();
