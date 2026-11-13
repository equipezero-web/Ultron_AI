import API_CONFIG from "../config.js";
import { summarizeDevices } from "./device-overview.js";
import { interpretDeviceReceipt } from "./device-command-receipts.js";

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

// Preserve activation when a responsive layout moves between pointerdown
// and click. Each actual pointer gesture executes ONCE; Enter/Space still work.
function bindDevicePress(button,perform){
  if(!button)return;
  let lastPointerAt=0;
  button.addEventListener("pointerdown",event=>{
    if(event.button!==0)return;
    lastPointerAt=Date.now();perform();
  });
  button.addEventListener("click",()=>{
    if(Date.now()-lastPointerAt<850)return;
    perform();
  });
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
  // A direct, unambiguous operator imperative is authorization. Do not
  // infer permission from a question, a hypothetical or a negated request.
  const direct=n.replace(/^(?:jarvis|ultron)[, :]+/,"").replace(/^por favor[, ]+/,"");
  const explicit=/^(?:desligue|reinicie|suspenda)\s+(?:o\s+)?(?:meu\s+)?(?:computador|pc|notebook|windows)(?:\s+agora)?[.!]*$/.test(direct);
  const confirm = isConfirmed(raw)||explicit;
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
  const direct=n.replace(/^(?:jarvis|ultron)[, :]+/,"").replace(/^por favor[, ]+/,"");
  if(/^(?:nao|nunca|como|por que|porque|e se|se eu|o que|quais|qual|voce pode|voce consegue|eu posso)\b/.test(direct)&&!/\b(status|estado|online)\b/.test(direct))return null;
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

// Inventory is read-only and appears in the existing terminal, not a new page.
export async function showDeviceOverview() {
  outputLine("CENTRAL DE DISPOSITIVOS // consultando registros reais...");
  try {
    if (!memoryKey()) throw new Error("Identidade do operador indisponível.");
    const summary = summarizeDevices(await listDevices());
    outputLine(`REGISTROS ${summary.total} // ONLINE ${summary.online} // PAREADOS OFFLINE ${summary.pairedOffline} // INATIVOS ${summary.inactive}.`);
    if (!summary.total) {
      outputLine("Nenhum aparelho registrado. Use CONECTAR CELULAR ou CONECTAR PC para iniciar o pareamento.");
      return summary;
    }
    for (const item of summary.items.slice(0, 12)) {
      outputLine(`${item.label} // ${item.name} // ${item.state}${item.capabilities.length ? " // RECURSOS: " + item.capabilities.join(", ") : ""}.`);
    }
    if (summary.items.length > 12) outputLine(`Outros ${summary.items.length - 12} dispositivos não exibidos; consulte o gateway.`);
    outputLine("GATEWAY ativo não comprova que celular, computador ou TV estejam conectados. A TV LG também exige autorização no próprio aparelho.");
    return summary;
  } catch (error) {
    outputLine("Consulta de dispositivos falhou: " + String(error?.message || error), true);
    return null;
  }
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

// A P0 stop only revokes a command that is still pending in the Cloud queue.
export async function cancelQueuedCommand(commandId) {
  const key = memoryKey();
  if (!key || !commandId) return {ok:false,status:"unavailable"};
  try {
    const response = await fetch(`${API_BASE}/api/control/cancel`,{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      cache:"no-store",
      signal:AbortSignal.timeout(5000),
      body:JSON.stringify({memoryKey:key,commandId})
    });
    const result = await response.json().catch(()=>({}));
    if(response.ok && result?.status==="cancelled") {
      outputLine("P0 // comando pendente cancelado antes do envio ao dispositivo.");
      return result;
    }
    outputLine("P0 // não foi possível retirar comando do aparelho: "+String(result?.status||result?.error||"sem confirmação")+".",true);
    return {ok:false,status:result?.status||"unknown"};
  }catch(error){
    outputLine("P0 // falha ao confirmar cancelamento remoto; o dispositivo pode já ter recebido a ordem.",true);
    return {ok:false,status:"unknown"};
  }
}

function pauseUntil(ms,signal) {
  return new Promise(resolve=>{
    if(signal?.aborted)return resolve();
    const timer=setTimeout(done,ms);
    function onAbort(){done();}
    function done(){
      clearTimeout(timer);
      signal?.removeEventListener("abort",onAbort);
      resolve();
    }
    signal?.addEventListener("abort",onAbort,{once:true});
  });
}

async function monitorCommand(commandId,{signal=null,maxAttempts=20}={}) {
  const key = memoryKey();
  if (!key || !commandId) return null;
  let last = "pending";
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if(signal?.aborted)return cancelQueuedCommand(commandId);
    await pauseUntil(900,signal);
    if(signal?.aborted)return cancelQueuedCommand(commandId);
    try {
      const result = await postCloud("/api/control/status", { memoryKey: key, commandId });
      const command = result?.command;
      if(signal?.aborted)return cancelQueuedCommand(commandId);
      if (!command) continue;
      if (command.status !== last) {
        last = command.status;
        outputLine(`${command.command} // ${String(command.status).toUpperCase()} // ${command.deviceName || command.deviceType}.`, command.status === "failed");
      }
      if (["completed", "failed", "expired", "cancelled"].includes(command.status)) return command;
    } catch {
      if(signal?.aborted)return cancelQueuedCommand(commandId);
    }
  }
  outputLine(`Comando ${commandId.slice(0, 8)} ainda sem confirmação física do dispositivo.`, true);
  return {status:"pending"};
}

export async function listAutomations() {
  const key = memoryKey();
  if (!key) return [];
  const result = await postCloud("/api/automations/list", { memoryKey: key });
  return result.automations || [];
}

export async function routeNaturalLanguage(text, parsedIntent = null, {awaitCompletion=false,signal=null}={}) {
  const n = normalizeSpeech(text);
  if (/\b(listar|liste|mostrar|mostre)\b.*\bautomac/.test(n)) {
    const automations = await listAutomations();
    outputLine(automations.length ? `AUTOMAÇÕES (${automations.length}):` : "Nenhuma automação cadastrada.");
    automations.slice(0, 12).forEach((item) => outputLine(`${item.enabled ? "ON" : "OFF"} // ${item.name} // próxima: ${item.nextRunAt || "-"}`));
    return { handled: true, ok: true, automations };
  }

  const intent = parsedIntent || parseDeviceIntent(text);
  if (!intent) return { handled: false };
  if(signal?.aborted)return {handled:true,ok:false,cancelled:true};
  if (intent.sensitive && !intent.payload?.confirm) {
    outputLine(`CONFIRMAÇÃO NECESSÁRIA: ${intent.label}. Repita incluindo "CONFIRMO".`, true);
    return { handled: true, ok: false, needsConfirmation: true, intent };
  }

  const schedule = parseSchedule(text);
  try {
    if (schedule) {
      const result = await createScheduled(intent, schedule);
      outputLine(`AUTOMAÇÃO CRIADA: ${intent.label} // ${schedule.label} // próxima execução ${result.nextRunAt}.`);
      return { handled: true, ok: true, submitted: awaitCompletion, commandStatus:"scheduled", intent, schedule, result };
    }

    if(signal?.aborted)return {handled:true,ok:false,cancelled:true,intent};
    outputLine(`ENVIANDO À FILA: ${intent.label}.`);
    const result = await sendControl(intent);
    if(signal?.aborted) {
      const cancellation = result.commandId ? await cancelQueuedCommand(result.commandId) : null;
      return {handled:true,ok:false,cancelled:true,commandStatus:cancellation?.status||"unknown",intent,result};
    }
    outputLine(`FILA: ${result.commandId?.slice(0, 8) || "OK"} → ${result.device?.deviceName || intent.deviceType}.`);
    if (awaitCompletion && result.commandId) {
      const remote = await monitorCommand(result.commandId,{signal});
      return {handled:true,...interpretDeviceReceipt(remote,{aborted:signal?.aborted}),intent,result};
    }
    if(result.commandId)void monitorCommand(result.commandId);
    return { handled: true, ok: true, submitted:Boolean(result.commandId),verified:false,commandStatus:result.status||"pending", intent, result };
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
    // Unified orchestrator must see compound device missions and P0 controls.
    if (window.ULTRON_ORCHESTRATOR?.execute) return false;
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
    bindDevicePress(desktop,()=>pairDesktop().catch(error=>outputLine(error.message,true)));
    actions.appendChild(desktop);
  }
  if (!document.getElementById("btn-device-overview")) {
    const button = document.createElement("button");
    button.id = "btn-device-overview";
    button.type = "button";
    button.textContent = "DISPOSITIVOS";
    bindDevicePress(button, () => { void showDeviceOverview(); });
    actions.appendChild(button);
  }
  if (!document.getElementById("btn-automations")) {
    const button = document.createElement("button");
    button.id = "btn-automations";
    button.textContent = "AUTOMAÇÕES";
    bindDevicePress(button,()=>routeNaturalLanguage("listar automações").catch(
      error=>outputLine(error?.message||"Não foi possível consultar as automações.",true)));
    actions.appendChild(button);
  }
}

async function refreshBridgeState() {
  const indicator = document.getElementById("bridge-module");
  if (!indicator || !API_BASE) return;
  try {
    const response = await fetch(`${API_BASE}/api/health`, { cache: "no-store", signal: AbortSignal.timeout(6500) });
    if (!response.ok) throw new Error("Gateway HTTP " + response.status);
    const data = await response.json();
    if (data?.deviceControl?.ready && data?.automations?.ready) {
      indicator.textContent = "GATEWAY READY";
      indicator.className = "green";
    } else if (data?.bridge?.ready) {
      indicator.textContent = "BRIDGE READY";
      indicator.className = "green";
    } else {
      indicator.textContent = "GATEWAY PARCIAL";
      indicator.className = "";
    }
  } catch (error) {
    indicator.textContent = "GATEWAY OFF";
    indicator.className = "";
  }
}

async function pairMobileDirect(){
  try{
    const result=await startPairing("mobile","Ultron Mobile Bridge");
    outputLine(`CELULAR // CÓDIGO ${result.code} // válido por ${Math.round((result.expiresInSeconds||600)/60)} min.`);
    const bridgeLabel=document.getElementById("bridge-link-state");
    const bridgeSession=document.getElementById("bridge-session-state");
    if(bridgeLabel)bridgeLabel.textContent="PAIRING";
    if(bridgeSession)bridgeSession.textContent="CODE "+result.code;
    outputLine("Abra o Ultron Bridge no celular, digite o código e toque em INICIAR BRIDGE.");
  }catch(error){outputLine("Falha ao gerar código do celular: "+String(error?.message||error),true);}
}
const mobilePairButton=document.getElementById("btn-pair-mobile");
let lastDirectMobilePointerAt=0;
mobilePairButton?.addEventListener("pointerdown",event=>{
  if(event.button!==0||window.ULTRON_MOBILE_LINK?.connect)return;
  lastDirectMobilePointerAt=Date.now();
  void pairMobileDirect();
});
mobilePairButton?.addEventListener("click",()=>{
  if(Date.now()-lastDirectMobilePointerAt<850)return;
  if(!window.ULTRON_MOBILE_LINK?.connect)void pairMobileDirect();
});
async function setupTv(){
  outputLine("LG WEBOS: verificando o pareamento do celular. A TV não aceita o código de seis dígitos do J.A.R.V.I.S.");
  try{
    const devices=await listDevices();
    const mobiles=devices.filter(d=>d.deviceType==="mobile"&&d.status!=="disabled");
    if(!mobiles.length){
      outputLine("Nenhum celular pareado. Gerando um código para o aplicativo Ultron Bridge...");
      await pairMobileDirect();
      return;
    }
    outputLine("Celular registrado: "+(mobiles[0]?.deviceName||"Ultron Bridge")+
      ". Abra o app Ultron Bridge nesse celular, toque em PAREAR LG WEBOS e aceite a autorização usando o controle remoto da TV.");
  }catch(error){
    outputLine("Não foi possível verificar o gateway: "+String(error?.message||error)+
      ". Confirme que o backend e o celular estão conectados.",true);
  }
}
bindDevicePress(document.getElementById("btn-pair-tv"),()=>{void setupTv();});

window.ULTRON_DEVICES = {
  startPairing,
  pairDesktop,
  listDevices,
  showDeviceOverview,
  cancelQueuedCommand,
  routeNaturalLanguage,
  parseDeviceIntent,
  listAutomations,
  refreshBridgeState
};

bindNaturalLanguageInterception();
injectControls();
refreshBridgeState();
setInterval(() => { if (!document.hidden && navigator.onLine) refreshBridgeState(); }, 45000);
window.addEventListener("online", refreshBridgeState);
