import API_CONFIG from "../config.js";
import "./stark-bootstrap.js?v=4.25.0";
import "./la-team-bootstrap.js?v=4.15.0";

const API_BASE = String(API_CONFIG?.backendUrl || "").replace(/\/$/, "");
const OUTPUT = document.getElementById("output-box");
const SETTINGS_KEY = "ultron_proactive_settings_v2";

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
    return { enabled: parsed.enabled !== false, speak: parsed.speak === true, selfHeal: parsed.selfHeal !== false };
  } catch {
    return { enabled: true, speak: false, selfHeal: true };
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
  const neuralCommand = window.ULTRON_NEURAL_COMMAND?.state || null;
  const neuralInput = window.ULTRON_NEURAL_INPUT?.state || null;
  const neural3d = window.ULTRON_NEURAL_3D?.state || null;
  const cameraPreview = window.ULTRON_CAMERA_PREVIEW?.state || null;
  const localFiles = window.ULTRON_LOCAL_FILES?.state || null;
  const laTeam = window.ULTRON_LA_TEAM?.state || null;
  const vision = window.ULTRON_VISION?.state || null;
  const orchestrator = window.ULTRON_ORCHESTRATOR?.state || null;
  const mobileCamera = window.ULTRON_MOBILE_CAMERA?.state || null;

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
    optical: {
      state: readText("camera-state", "UNKNOWN"),
      resolution: readText("camera-resolution", "NO SIGNAL"),
      fps: readText("fps", "-- FPS"),
      preview: cameraPreview,
      active: Boolean(mobileCamera?.active || window.ULTRON_CAMERA_CONTROLLER?.isActive?.()),
      source: mobileCamera?.mode || null,
      gesture: handGestures?.gesture || null,
      handCount: Number(neural3d?.handCount || 0)
    },
    vision: vision ? {
      waitingForCamera: Boolean(vision.cameraUnavailable),
      lastAnalysisAt: vision.lastAnalysisAt || null,
      frameHealth: vision.lastFrameHealth?.frame || null,
      resolution: vision.lastFrameHealth?.resolution || null,
      provider: vision.lastResult?.provider || null,
      model: vision.lastResult?.model || null,
      diagnosticsReady: Boolean(window.ULTRON_VISION?.diagnose)
    } : null,
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
      neuralCommand,
      neuralInput,
      holographic3d: neural3d ? {
        azimuth: Number(neural3d.ry || 0),
        elevation: Number(neural3d.rx || 0),
        roll: Number(neural3d.rz || 0),
        zoom: Number(neural3d.scale || 1),
        handCount: Number(neural3d.handCount || 0)
      } : null
    },
    localKnowledge: localFiles ? {
      online: Boolean(localFiles.online),
      files: Number(localFiles.health?.files || localFiles.files?.length || 0),
      vectorChunks: Number(localFiles.health?.vector_chunks || 0),
      activeFile: localFiles.activeFile?.path || null,
      ragV2: Boolean(window.ULTRON_LOCAL_FILES_V2),
      hybridSearch: Boolean(window.ULTRON_LOCAL_FILES?.capabilities?.hybridSearch)
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
    orchestration: orchestrator ? {
      version: window.ULTRON_ORCHESTRATOR?.version || "4.27.0",
      busy: Boolean(orchestrator.busy),
      activeRunId: orchestrator.activeRunId || null,
      lastRunId: orchestrator.lastRunId || null,
      lastRoute: orchestrator.lastRoute || null,
      processed: Number(orchestrator.processed || 0),
      failed: Number(orchestrator.failed || 0),
      proactiveRecoveries: Number(orchestrator.proactiveRecoveries || 0)
    } : null,
    modules: {
      memory: readText("memory-module", "UNKNOWN"),
      bridge: readText("bridge-module", "UNKNOWN"),
      voice: readText("voice-module", "UNKNOWN"),
      vision: readText("vision-module", "UNKNOWN"),
      aiGateway: readText("gemini-module", "UNKNOWN"),
      neuralCommand: window.ULTRON_NEURAL_COMMAND ? "ONLINE" : "OFFLINE",
      localFiles: localFiles?.online ? "ONLINE" : "OFFLINE",
      laTeam: laTeam?.authorized ? "ONLINE" : "LOCKED",
      orchestrator: window.ULTRON_ORCHESTRATOR ? "ONLINE" : "OFFLINE"
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
    body: JSON.stringify({ memoryKey: key, source: "web-v427", snapshot })
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
    console.warn("ULTRON telemetry v4.27:", error);
    return null;
  } finally {
    sending = false;
  }
}

function schedule() {
  if (timer) clearInterval(timer);
  timer = setInterval(() => pushTelemetry(), pushIntervalMs());
}

const eventNames = [
  "ultron:local-rag-context",
  "ultron:la-team-context",
  "ultron:vision-health",
  "ultron:vision-result",
  "ultron:neural-command",
  "ultron:camera-stream",
  "ultron:mobile-camera-source"
];
for (const eventName of eventNames) {
  window.addEventListener(eventName, (event) => pushTelemetry({
    event: eventName.replace("ultron:", ""),
    eventDetail: event?.detail || null
  }));
}

window.addEventListener("online", () => pushTelemetry({ event: "browser-online" }));
window.addEventListener("offline", () => pushTelemetry({ event: "browser-offline" }));
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) pushTelemetry({ event: "visibility-change" });
});
window.addEventListener("ultron:performance-mode", () => schedule());

window.ULTRON_TELEMETRY = {
  version: "4.27.0",
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
setTimeout(() => pushTelemetry({ event: "startup-v427" }), 2500);
schedule();
