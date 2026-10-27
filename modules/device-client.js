import API_CONFIG from "../config.js";

const API_BASE = String(API_CONFIG?.backendUrl || "").replace(/\/$/, "");

function outputLine(message, alert = false) {
  const output = document.getElementById("output-box");
  if (!output) return;
  const line = document.createElement("p");
  line.className = alert ? "alert" : "";
  line.textContent = `> [BRIDGE] ${message}`;
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

export async function startPairing(deviceType, deviceName) {
  const key = memoryKey();
  if (!key) throw new Error("Identidade de memória ainda não carregada.");

  const result = await post("/api/devices/pair/start", {
    memoryKey: key,
    deviceType,
    deviceName
  });

  outputLine(
    `${deviceType === "tv" ? "TV" : "CELULAR"} // CÓDIGO ${result.code} // válido por ${Math.round((result.expiresInSeconds || 600) / 60)} min`
  );
  outputLine("Digite este código no Ultron Bridge do dispositivo que será pareado.");

  return result;
}

export async function listDevices() {
  const key = memoryKey();
  if (!key) return [];
  const result = await post("/api/devices/list", { memoryKey: key });
  return result.devices || [];
}

export async function sendCommand(deviceId, command, payload = {}) {
  const key = memoryKey();
  if (!key) throw new Error("Identidade do operador indisponível.");
  return post("/api/devices/command", {
    memoryKey: key,
    deviceId,
    command,
    payload
  });
}

async function refreshBridgeState() {
  const indicator = document.getElementById("bridge-module");
  if (!indicator || !API_BASE) return;

  try {
    const response = await fetch(`${API_BASE}/api/health`, { cache: "no-store" });
    const data = await response.json();
    if (data?.bridge?.ready) {
      indicator.textContent = "READY";
      indicator.className = "green";
    }
  } catch {}
}

document.getElementById("btn-pair-mobile")?.addEventListener("click", async () => {
  try {
    const result = await startPairing("mobile", "Ultron Mobile Bridge");
    outputLine(`PASSO 1: abra o app Ultron Bridge no celular.`);
    outputLine(`PASSO 2: digite ${result.code} no campo "Código de 6 dígitos do Ultron".`);
    outputLine("IMPORTANTE: este código NÃO aparece na TV; ele é gerado aqui no painel do Ultron.");
  } catch (error) {
    outputLine(`ERRO: ${error.message}`, true);
  }
});

document.getElementById("btn-pair-tv")?.addEventListener("click", () => {
  outputLine("LG WEBOS: a TV não usa código de 6 dígitos.");
  outputLine("Primeiro pareie o CELULAR com o Ultron. Depois, no app Ultron Bridge, toque em PAREAR LG WEBOS.");
  outputLine("A LG deve mostrar apenas uma solicitação de autorização na tela; aceite usando o controle remoto.");
});

window.ULTRON_DEVICES = {
  startPairing,
  listDevices,
  sendCommand,
  refreshBridgeState
};

refreshBridgeState();
setInterval(refreshBridgeState, 30000);
