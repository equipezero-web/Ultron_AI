import API_CONFIG from "../config.js";

const API_BASE = String(API_CONFIG?.backendUrl || "").replace(/\/$/, "");
const LOCAL_BASE = "http://127.0.0.1:8765";

function outputLine(message, alert = false) {
  const output = document.getElementById("output-box");
  if (!output) return;
  const line = document.createElement("p");
  line.className = alert ? "alert" : "";
  line.textContent = `> [DEVICE] ${message}`;
  output.appendChild(line);
  output.scrollTop = output.scrollHeight;
}

function memoryKey() {
  return window.ULTRON_MEMORY?.getMemoryKey?.() || null;
}

async function postCloud(path, payload = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify(payload)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.ok === false) {
    const error = new Error(data?.error || `HTTP ${response.status}`);
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}

async function postLocal(path, payload = {}) {
  const response = await fetch(`${LOCAL_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify(payload)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.ok === false) throw new Error(data?.detail || data?.error || `LOCAL HTTP ${response.status}`);
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

function isConfirmed(text) {
  return /\b(confirmo|confirmado|confirme|pode desligar|pode reiniciar|pode suspender)\b/.test(normalizeSpeech(text));
}

function parseSchedule(text) {
  const n = normalizeSpeech(text);
  const timezoneOffsetMinutes = new Date().getTimezoneOffset();

  let match = n.match(/\ba cada\s+(\d{1,4})\s*(minuto|minutos|hora|horas)\b/);
  if (match) {
    const amount = Number(match[1]);
    const intervalMinutes = /hora/.test(match[2]) ? amount * 60 : amount;
    return { kind: "interval", schedule: { intervalMinutes }, label: `a cada ${intervalMinutes} min` };
  }

  match = n.match(/\bdaqui a\s+(\d{1,4})\s*(minuto|minutos|hora|horas)\b/);
  if (match) {
    const amount = Number(match[1]);
    const minutes = /hora/.test(match[2]) ? amount * 60 : amount;
    return {
      kind: "once",
      schedule: { runAt: new Date(Date.now() + minutes * 60000).toISOString() },
      label: `daqui a ${minutes} min`
    };
  }

  const daily = /\b(todo dia|todos os dias|diariamente)\b/.test(n);
  match = n.match(/\b(?:as)\s+(\d{1,2})(?::(\d{2}))?\b/) || n.match(/\b(\d{1,2})h(?:(\d{2}))?\b/);
  if (match) {
    const hour = Math.max(0, Math.min(23, Number(match[1])));
    const minute = Math.max(0, Math.min(59, Number(match[2] || 0)));
    const hhmm = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    if (daily) {
      return { kind: "daily", schedule: { time: hhmm, timezoneOffsetMinutes }, label: `todo dia às ${hhmm}` };
    }
    const local = new Date();
    local.setHours(hour, minute, 0, 0);
    if (local.getTime() <= Date.now()) local.setDate(local.getDate() + 1);
    return { kind: "once", schedule: { runAt: local.toISOString() }, label: `às ${hhmm}` };
  }

  return null;
}

function tvIntent(n) {
  if (!/\b(tv|televisao|televisor|lg)\b/.test(n)) return null;
  let match = n.match(/\bhdmi\s*([1-4])\b/);
  if (match) return { deviceType: "mobile", command: "tv.input", payload: { inputId: `HDMI_${match[1]}` }, label: `TV → HDMI ${match[1]}` };
  match = n.match(/\bvolume(?:\s+da\s+tv)?\s*(?:para|em|no|na|a)?\s*(\d{1,3})\b/);
  if (match) {
    const volume = Math.max(0, Math.min(100, Number(match[1])));
    return { deviceType: "mobile", command: "tv.volume.set", payload: { volume }, label: `volume da TV em ${volume}` };
  }
  if (/\b(desligue|desliga|desligar|apague|apagar)\b/.test(n)) return { deviceType: "mobile", command: "tv.power.off", payload: {}, label: "desligar a TV" };
  if (/\b(ligue|liga|ligar|acenda|acender)\b/.test(n)) return { deviceType: "mobile", command: "tv.power.on", payload: {}, label: "ligar a TV" };
  if (/\b(aumente|aumentar|suba|subir)\b.*\bvolume\b|\bvolume\b.*\b(aumente|aumentar|suba|subir)\b/.test(n)) return { deviceType: "mobile", command: "tv.volume.up", payload: {}, label: "aumentar volume da TV" };
  if (/\b(diminua|diminuir|baixe|baixar)\b.*\bvolume\b|\bvolume\b.*\b(diminua|diminuir|baixe|baixar)\b/.test(n)) return { deviceType: "mobile", command: "tv.volume.down", payload: {}, label: "diminuir volume da TV" };
  if (/\b(desmute|desmutar)\b|\b(tire|retire)\b.*\b(mudo|silencio)\b/.test(n)) return { deviceType: "mobile", command: "tv.mute.toggle", payload: { mute: false }, label: "tirar TV do mudo" };
  if (/\b(mute|mutar|mudo|silencio|silencie)\b/.test(n)) return { deviceType: "mobile", command: "tv.mute.toggle", payload: { mute: true }, label: "silenciar TV" };
  if (/\b(pause|pausar)\b/.test(n)) return { deviceType: "mobile", command: "tv.media.pause", payload: {}, label: "pausar TV" };
  if (/\b(retome|continue|play|reproduza)\b/.test(n)) return { deviceType: "mobile", command: "tv.media.play", payload: {}, label: "reproduzir na TV" };
  if (/\b(pare|parar|stop)\b/.test(n)) return { deviceType: "mobile", command: "tv.media.stop", payload: {}, label: "parar mídia da TV" };
  if (/\b(proximo|proxima|suba)\b.*\bcanal\b/.test(n)) return { deviceType: "mobile", command: "tv.channel.up", payload: {}, label: "próximo canal" };
  if (/\b(anterior|volte|desca)\b.*\bcanal\b/.test(n)) return { deviceType: "mobile", command: "tv.channel.down", payload: {}, label: "canal anterior" };
  if (/\b(youtube)\b/.test(n) && /\b(abra|abrir|inicie|iniciar)\b/.test(n)) return { deviceType: "mobile", command: "tv.launch", payload: { appId: "youtube.leanback.v4" }, label: "abrir YouTube na TV" };
  if (/\b(status|estado|online|conectada)\b/.test(n)) return { deviceType: "mobile", command: "tv.status", payload: {}, label: "status da TV" };
  return null;
}

function desktopIntent(n, raw) {
  if (!/\b(computador|pc|windows|notebook)\b/.test(n)) return null;
  const confirm = isConfirmed(raw);
  const url = String(raw || "").match(/https?:\/\/[^\s]+/i)?.[0];
  if (url && /\b(abra|abrir|acesse|acessar)\b/.test(n)) return { deviceType: "desktop", command: "desktop.open.url", payload: { url }, label: `abrir ${url} no computador` };
  if (/\b(desligue|desliga|desligar)\b/.test(n)) return { deviceType: "desktop", command: "desktop.shutdown", payload: { confirm }, sensitive: true, label: "desligar o computador" };
  if (/\b(reinicie|reiniciar|reinicia)\b/.test(n)) return { deviceType: "desktop", command: "desktop.restart", payload: { confirm }, sensitive: true, label: "reiniciar o computador" };
  if (/\b(suspender|suspenda|dormir|durma)\b/.test(n)) return { deviceType: "desktop", command: "desktop.sleep", payload: { confirm }, sensitive: true, label: "suspender o computador" };
  if (/\b(bloqueie|bloquear|trave|travar)\b/.test(n)) return { deviceType: "desktop", command: "desktop.lock", payload: {}, label: "bloquear o computador" };
  if (/\b(aumente|aumentar|suba)\b.*\bvolume\b/.test(n)) return { deviceType: "desktop", command: "desktop.volume.up", payload: {}, label: "aumentar volume do computador" };
  if (/\b(diminua|diminuir|baixe)\b.*\bvolume\b/.test(n)) return { deviceType: "desktop", command: "desktop.volume.down", payload: {}, label: "diminuir volume do computador" };
  if (/\b(mute|mutar|mudo|silencio)\b/.test(n)) return { deviceType: "desktop", command: "desktop.volume.mute", payload: {}, label: "alternar mudo do computador" };
  if (/\b(proxima|proximo)\b.*\b(musica|faixa)\b/.test(n)) return { deviceType: "desktop", command: "desktop.media.next", payload: {}, label: "próxima mídia no computador" };
  if (/\b(anterior|volte)\b.*\b(musica|faixa)\b/.test(n)) return { deviceType: "desktop", command: "desktop.media.previous", payload: {}, label: "mídia anterior no computador" };
  if (/\b(play|pause|pausar|continuar|retomar)\b/.test(n)) return { deviceType: "desktop", command: "desktop.media.play_pause", payload: {}, label: "play/pause no computador" };
  const apps = ["chrome", "edge", "notepad", "bloco de notas", "calculadora", "calculator", "explorer", "arquivos", "paint", "terminal"];
  const app = apps.find((name) => n.includes(name));
  if (app && /\b(abra|abrir|inicie|iniciar)\b/.test(n)) return { deviceType: "desktop", command: "desktop.app.open", payload: { app }, label: `abrir ${app} no computador` };
  if (/\b(youtube)\b/.test(n) && /\b(abra|abrir)\b/.test(n)) return { deviceType: "desktop", command: "desktop.open.url", payload: { url: "https://www.youtube.com" }, label: "abrir YouTube no computador" };
  if (/\b(status|estado|online)\b/.test(n)) return { deviceType: "desktop", command: "desktop.status", payload: {}, label: "status do computador" };
  return null;
}

function mobileIntent(n) {
  if (!/\b(celular|telefone|android)\b/.test(n)) return null;
  if (/\b(status|estado|online)\b/.test(n)) return { deviceType: "mobile", command: "device.status", payload: {}, label: "status do celular" };
  const apps = [
    ["youtube", "com.google.android.youtube"],
    ["chrome", "com.android.chrome"],
    ["whatsapp", "com.whatsapp"]
  ];
  const match = apps.find(([name]) => n.includes(name));
  if (match && /\b(abra|abrir|inicie|iniciar)\b/.test(n)) {
    return { deviceType: "mobile", command: "app.open", payload: { packageName: match[1] }, label: `abrir ${match[0]} no celular` };
  }
  return null;
}

export function parseDeviceIntent(text) {
  const n = normalizeSpeech(text);
  if (!n) return null;
  return tvIntent(n) || desktopIntent(n, text) || mobileIntent(n);
}

export async function startPairing(deviceType, deviceName) {
  const key = memoryKey();
  if (!key) throw new Error("Identidade de memória ainda não carregada.");
  return postCloud("/api/devices/pair/start", { memoryKey: key, deviceType, deviceName });
}

export async function listDevices() {
  const key = memoryKey();
  if (!key) return [];
  const data = await postCloud("/api/devices/list", { memoryKey: key });
  return data.devices || [];
}

export async function pairDesktop() {
  outputLine("DESKTOP BRIDGE: procurando Ultron Local Core...");
  const pairing = await startPairing("desktop", "Ultron Desktop Bridge");
  try {
    const result = await postLocal("/desktop/bridge/pair", { code: pairing.code });
    outputLine(`COMPUTADOR PAREADO: ${result.deviceName || "Windows"}.`);
    return result;
  } catch (error) {
    outputLine(`O código ${pairing.code} foi criado, mas o Local Core não respondeu. Execute local-core/start.bat e tente CONECTAR PC novamente.`, true);
    throw error;
  }
}

async function sendControl(intent) {
  const key = memoryKey();
  if (!key) throw new Error("Identidade do operador indisponível.");
  return postCloud("/api/control/command", {
    memoryKey: key,
    deviceType: intent.deviceType,
    command: intent.command,
    payload: intent.payload || {}
  });
}

async function createScheduled(intent, schedule) {
  const key = memoryKey();
  if (!key) throw new Error("Identidade do operador indisponível.");
  return postCloud("/api/automations/create", {
    memoryKey: key,
    name: `${intent.label} // ${schedule.label}`,
    deviceType: intent.deviceType,
    command: intent.command,
    payload: intent.payload || {},
    scheduleKind: schedule.kind,
    schedule: schedule.schedule,
    enabled: true
  });
}

async function monitorCommand(commandId) {
  const key = memoryKey();
  if (!key || !commandId) return null;
  let last = "pending";
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 900));
    try {
      const result = await postCloud("/api/control/status", { memoryKey: key, commandId });
      const command = result?.command;
      if (!command) continue;
      if (command.status !== last) {
        last = command.status;
        outputLine(`${command.command} // ${String(command.status).toUpperCase()} // ${command.deviceName || command.deviceType}.`, command.status === "failed");
      }
      if (["completed", "failed"].includes(command.status)) return command;
    } catch {}
  }
  outputLine(`Comando ${commandId.slice(0, 8)} continua aguardando o dispositivo.`, true);
  return null;
}

export async function listAutomations() {
  const key = memoryKey();
  if (!key) return [];
  const result = await postCloud("/api/automations/list", { memoryKey: key });
  return result.automations || [];
}

export async function routeNaturalLanguage(text, parsedIntent = null) {
  const n = normalizeSpeech(text);
  if (/\b(listar|liste|mostrar|mostre)\b.*\bautomac/.test(n)) {
    const automations = await listAutomations();
    outputLine(automations.length ? `AUTOMAÇÕES (${automations.length}):` : "Nenhuma automação cadastrada.");
    automations.slice(0, 12).forEach((item) => outputLine(`${item.enabled ? "ON" : "OFF"} // ${item.name} // próxima: ${item.nextRunAt || "-"}`));
    return { handled: true, ok: true, automations };
  }

  const intent = parsedIntent || parseDeviceIntent(text);
  if (!intent) return { handled: false };
  if (intent.sensitive && !intent.payload?.confirm) {
    outputLine(`CONFIRMAÇÃO NECESSÁRIA: ${intent.label}. Repita incluindo "CONFIRMO".`, true);
    return { handled: true, ok: false, needsConfirmation: true, intent };
  }

  const schedule = parseSchedule(text);
  try {
    if (schedule) {
      const result = await createScheduled(intent, schedule);
      outputLine(`AUTOMAÇÃO CRIADA: ${intent.label} // ${schedule.label} // próxima execução ${result.nextRunAt}.`);
      return { handled: true, ok: true, intent, schedule, result };
    }

    outputLine(`EXECUTANDO: ${intent.label}.`);
    const result = await sendControl(intent);
    outputLine(`FILA: ${result.commandId?.slice(0, 8) || "OK"} → ${result.device?.deviceName || intent.deviceType}.`);
    if (result.commandId) monitorCommand(result.commandId);
    return { handled: true, ok: true, intent, result };
  } catch (error) {
    outputLine(`ERRO: ${error.message}`, true);
    return { handled: true, ok: false, intent, error };
  }
}

function bindNaturalLanguageInterception() {
  const input = document.getElementById("command-input");
  const sendButton = document.getElementById("btn-send");
  if (!input || !sendButton) return;
  const intercept = (event) => {
    const raw = input.value.trim();
    const intent = parseDeviceIntent(raw);
    const automationList = /\b(listar|liste|mostrar|mostre)\b.*\bautomac/.test(normalizeSpeech(raw));
    if (!intent && !automationList) return false;
    event.preventDefault();
    event.stopImmediatePropagation();
    input.value = "";
    routeNaturalLanguage(raw, intent);
    return true;
  };
  sendButton.addEventListener("click", intercept, true);
  input.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || event.shiftKey) return;
    intercept(event);
  }, true);
}

function injectControls() {
  const actions = document.querySelector(".quick-actions");
  if (!actions) return;
  if (!document.getElementById("btn-pair-desktop")) {
    const desktop = document.createElement("button");
    desktop.id = "btn-pair-desktop";
    desktop.textContent = "CONECTAR PC";
    desktop.addEventListener("click", () => pairDesktop().catch((error) => outputLine(error.message, true)));
    actions.appendChild(desktop);
  }
  if (!document.getElementById("btn-automations")) {
    const button = document.createElement("button");
    button.id = "btn-automations";
    button.textContent = "AUTOMAÇÕES";
    button.addEventListener("click", () => routeNaturalLanguage("listar automações"));
    actions.appendChild(button);
  }
}

async function refreshBridgeState() {
  const indicator = document.getElementById("bridge-module");
  if (!indicator || !API_BASE) return;
  try {
    const response = await fetch(`${API_BASE}/api/health`, { cache: "no-store" });
    const data = await response.json();
    if (data?.deviceControl?.ready && data?.automations?.ready) {
      indicator.textContent = "100% READY";
      indicator.className = "green";
    } else if (data?.bridge?.ready) {
      indicator.textContent = "READY";
      indicator.className = "green";
    }
  } catch {}
}

document.getElementById("btn-pair-mobile")?.addEventListener("click", async () => {
  try {
    const result = await startPairing("mobile", "Ultron Mobile Bridge");
    outputLine(`CELULAR // CÓDIGO ${result.code} // válido por ${Math.round((result.expiresInSeconds || 600) / 60)} min.`);
    outputLine("Abra o Ultron Bridge no celular e digite este código no campo de pareamento.");
  } catch (error) {
    outputLine(`ERRO: ${error.message}`, true);
  }
});

document.getElementById("btn-pair-tv")?.addEventListener("click", () => {
  outputLine("LG WEBOS: use o Mobile Bridge já pareado e toque em PAREAR LG WEBOS. Aceite a autorização na TV uma única vez.");
});

window.ULTRON_DEVICES = {
  startPairing,
  pairDesktop,
  listDevices,
  routeNaturalLanguage,
  parseDeviceIntent,
  listAutomations,
  refreshBridgeState
};

bindNaturalLanguageInterception();
injectControls();
refreshBridgeState();
setInterval(refreshBridgeState, 30000);
