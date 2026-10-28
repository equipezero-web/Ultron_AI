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

function normalizeSpeech(text) {
  return String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function hasTvReference(normalized) {
  return /\b(tv|televisao|televisor|lg)\b/.test(normalized);
}

function parseTvIntent(text) {
  const normalized = normalizeSpeech(text);
  if (!normalized || !hasTvReference(normalized)) return null;

  const hdmi = normalized.match(/\bhdmi\s*([1-4])\b/);
  if (hdmi) {
    return {
      command: "tv.input",
      payload: { inputId: `HDMI_${hdmi[1]}` },
      label: `mudar TV para HDMI ${hdmi[1]}`
    };
  }

  const volume = normalized.match(/\bvolume(?:\s+da\s+tv)?\s*(?:para|em|no|na|a)?\s*(\d{1,3})\b/);
  if (volume) {
    const value = Math.max(0, Math.min(100, Number(volume[1])));
    return {
      command: "tv.volume.set",
      payload: { volume: value },
      label: `ajustar volume da TV para ${value}`
    };
  }

  if (/\b(desligue|desliga|desligar|apague|apagar)\b/.test(normalized)) {
    return { command: "tv.power.off", payload: {}, label: "desligar a TV" };
  }

  if (/\b(ligue|liga|ligar|acenda|acender)\b/.test(normalized)) {
    return { command: "tv.power.on", payload: {}, label: "ligar a TV" };
  }

  if (/\b(aumente|aumentar|suba|subir)\b.*\bvolume\b|\bvolume\b.*\b(aumente|aumentar|suba|subir)\b/.test(normalized)) {
    return { command: "tv.volume.up", payload: {}, label: "aumentar o volume da TV" };
  }

  if (/\b(diminua|diminuir|baixe|baixar)\b.*\bvolume\b|\bvolume\b.*\b(diminua|diminuir|baixe|baixar)\b/.test(normalized)) {
    return { command: "tv.volume.down", payload: {}, label: "diminuir o volume da TV" };
  }

  if (/\b(desmute|desmutar)\b|\b(tire|tirar|retire|retirar)\b.*\b(mudo|silencio)\b/.test(normalized)) {
    return { command: "tv.mute.toggle", payload: { mute: false }, label: "tirar a TV do mudo" };
  }

  if (/\b(mute|mutar|mudo|silencio|silencie)\b/.test(normalized)) {
    return { command: "tv.mute.toggle", payload: { mute: true }, label: "colocar a TV no mudo" };
  }

  if (/\b(pause|pausar)\b/.test(normalized)) {
    return { command: "tv.media.pause", payload: {}, label: "pausar reprodução na TV" };
  }

  if (/\b(retome|retomar|continue|continuar|play|reproduza|reproduzir)\b/.test(normalized)) {
    return { command: "tv.media.play", payload: {}, label: "continuar reprodução na TV" };
  }

  if (/\b(pare|parar|stop)\b/.test(normalized)) {
    return { command: "tv.media.stop", payload: {}, label: "parar reprodução na TV" };
  }

  if (/\b(proximo|proxima|suba|aumente)\b.*\bcanal\b|\bcanal\b.*\b(proximo|proxima|suba|aumente)\b/.test(normalized)) {
    return { command: "tv.channel.up", payload: {}, label: "avançar canal da TV" };
  }

  if (/\b(anterior|volte|desca|diminua)\b.*\bcanal\b|\bcanal\b.*\b(anterior|volte|desca|diminua)\b/.test(normalized)) {
    return { command: "tv.channel.down", payload: {}, label: "voltar canal da TV" };
  }

  if (/\b(abra|abrir|inicie|iniciar)\b.*\byoutube\b|\byoutube\b.*\b(abra|abrir|inicie|iniciar)\b/.test(normalized)) {
    return {
      command: "tv.launch",
      payload: { appId: "youtube.leanback.v4" },
      label: "abrir YouTube na TV"
    };
  }

  if (/\b(status|estado|online|conectada|conectado)\b/.test(normalized)) {
    return { command: "tv.status", payload: {}, label: "consultar status da TV" };
  }

  return null;
}

function bridgeDeviceScore(device) {
  let score = 0;
  if (device?.status === "active") score += 20;
  if (device?.deviceType === "mobile") score += 50;
  if (Array.isArray(device?.capabilities) && device.capabilities.some((item) => String(item).startsWith("tv."))) {
    score += 30;
  }
  const lastSeen = Date.parse(device?.lastSeenAt || "") || 0;
  return { score, lastSeen };
}

function selectTvBridgeDevice(devices = []) {
  return [...devices]
    .filter((device) => device?.deviceType === "mobile" && device?.status !== "disabled")
    .sort((a, b) => {
      const sa = bridgeDeviceScore(a);
      const sb = bridgeDeviceScore(b);
      return sb.score - sa.score || sb.lastSeen - sa.lastSeen;
    })[0] || null;
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

export async function routeNaturalLanguage(text, parsedIntent = null) {
  const intent = parsedIntent || parseTvIntent(text);
  if (!intent) return { handled: false };

  try {
    outputLine(`INTENÇÃO TV: ${intent.label}.`);
    const devices = await listDevices();
    const device = selectTvBridgeDevice(devices);

    if (!device) {
      throw new Error("Nenhum Mobile Bridge pareado foi encontrado para controlar a TV.");
    }

    const result = await sendCommand(device.id, intent.command, intent.payload);
    outputLine(`COMANDO ENVIADO: ${intent.command} → ${device.deviceName || "Mobile Bridge"}.`);
    if (result?.commandId) {
      outputLine(`FILA: ${result.commandId.slice(0, 8)} // aguardando execução pelo celular.`);
    }

    return { handled: true, ok: true, intent, device, result };
  } catch (error) {
    outputLine(`ERRO TV: ${error.message}`, true);
    return { handled: true, ok: false, intent, error };
  }
}

function bindNaturalLanguageInterception() {
  const input = document.getElementById("command-input");
  const sendButton = document.getElementById("btn-send");
  if (!input || !sendButton) return;

  sendButton.addEventListener("click", (event) => {
    const raw = input.value.trim();
    const intent = parseTvIntent(raw);
    if (!intent) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    input.value = "";
    routeNaturalLanguage(raw, intent);
  }, true);

  input.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || event.shiftKey) return;
    const raw = input.value.trim();
    const intent = parseTvIntent(raw);
    if (!intent) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    input.value = "";
    routeNaturalLanguage(raw, intent);
  }, true);
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
  routeNaturalLanguage,
  parseTvIntent,
  refreshBridgeState
};

bindNaturalLanguageInterception();
refreshBridgeState();
setInterval(refreshBridgeState, 30000);
