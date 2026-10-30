import API_CONFIG from "../config.js";

const API_BASE = String(API_CONFIG?.backendUrl || "").replace(/\/$/, "");

function memoryKey() {
  return window.ULTRON_MEMORY?.getMemoryKey?.() || null;
}

async function status(commandId) {
  const response = await fetch(`${API_BASE}/api/control/status`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({ memoryKey: memoryKey(), commandId })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.ok === false) return null;
  return data?.command || null;
}

async function verify(commandId, timeoutMs = 19000) {
  if (!commandId || !API_BASE) return null;
  const started = Date.now();
  let last = null;
  while (Date.now() - started < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, 750));
    try {
      last = await status(commandId);
      if (last && ["completed", "failed"].includes(last.status)) return last;
    } catch {}
  }
  return last;
}

function install() {
  const devices = window.ULTRON_DEVICES;
  if (!devices?.routeNaturalLanguage || devices.__orchestratorVerified) return false;
  const original = devices.routeNaturalLanguage.bind(devices);

  devices.routeNaturalLanguage = async (...args) => {
    const routed = await original(...args);
    const commandId = routed?.result?.commandId || routed?.commandId || null;
    if (!commandId || routed?.needsConfirmation || routed?.schedule) {
      return routed;
    }
    const command = await verify(commandId);
    if (!command) {
      return {
        ...routed,
        verified: false,
        commandStatus: routed?.result?.status || "pending"
      };
    }
    return {
      ...routed,
      verified: command.status === "completed",
      commandStatus: command.status,
      commandResult: command.result || null,
      deviceName: command.deviceName || routed?.result?.device?.deviceName || null
    };
  };
  devices.__orchestratorVerified = true;
  devices.verifyCommand = verify;
  return true;
}

if (!install()) {
  const timer = setInterval(() => {
    if (install()) clearInterval(timer);
  }, 100);
  setTimeout(() => clearInterval(timer), 10000);
}
