name=script.js
import { CameraController } from "./modules/camera.js";
import { MotionSensor } from "./modules/motion.js";
import { loadPreferences } from "./modules/storage.js";
import { addLog, clock } from "./modules/system.js";
// Configuração da URL do Backend (Altere para a URL pública no Render/Railway/Ngrok em produção)
const BACKEND_URL = "https://seu-backend-ultron.onrender.com";
const $ = id => document.getElementById(id);
const video = $("webcam"), canvas = $("motion-canvas"), output = $("output-box");
const btnCamera = $("btn-camera"), btnStop = $("btn-stop-camera");
const screenModal = $("screen-modal"), closeScreen = $("btn-close-screen");
const sensitivity = $("sensitivity"), cooldown = $("cooldown");
const prefs = loadPreferences();
let motionEvents = 0, startTime = Date.now(), fpsFrames = 0, lastFps = Date.now();
let currentMotion = 0, lastMotionAt = Date.now(), voiceBusy = false;
const emotionDefinitions = {
feliz: { label: "FELIZ", symbol: "😊" },
triste: { label: "TRISTE", symbol: "😢" },
normal: { label: "NORMAL", symbol: "😐" },
inquieto: { label: "INQUIETO", symbol: "⚡" },
pensativo: { label: "PENSATIVO", symbol: "🧠" },
estressado: { label: "ESTRESSADO", symbol: "🔥" }
};
function showScreen() {
if (!screenModal) return;
screenModal.classList.add("open");
screenModal.setAttribute("aria-hidden", "false");
}
function hideScreen() {
if (!screenModal) return;
screenModal.classList.remove("open");
screenModal.setAttribute("aria-hidden", "true");
}
// Inicialização do Controlador de Câmera
const camera = new CameraController(video, (state) => {
if (state === "active") {
if ($("camera-state")) { $("camera-state").textContent = "ONLINE"; ("camera-state").style.color = "var(--green)"; }
if (("permission-state")) ("permission-state").textContent = "GRANTED";
if (("telemetry-camera")) ("telemetry-camera").textContent = "ON";
if (("vision-module")) { $("vision-module").textContent = "ACTIVE"; ("vision-module").className = "green"; }
if (("system-mode")) ("system-mode").textContent = "MONITORING";
if (btnCamera) btnCamera.textContent = "TELA ATIVA";
if (btnStop) btnStop.disabled = false;
if (("camera-resolution")) $("camera-resolution").textContent = ${video.videoWidth}×${video.videoHeight};
sensor.start();
addLog(output, "Sensor óptico calibrado. Monitoramento iniciado.");
} else {
if ($("camera-state")) { $("camera-state").textContent = "STANDBY"; ("camera-state").style.color = ""; }
if (("telemetry-camera")) ("telemetry-camera").textContent = "OFF";
if (("vision-module")) { $("vision-module").textContent = "STANDBY"; ("vision-module").className = ""; }
if (("system-mode")) $("system-mode").textContent = "STANDBY";
if (btnCamera) btnCamera.textContent = "MOSTRAR TELA";
if (btnStop) btnStop.disabled = true;
sensor.stop();
if ($("motion-tag")) $("motion-tag").textContent = "STANDBY";
currentMotion = 0;
updateEmotion(0);
}
});
// Inicialização do Sensor de Movimento
const sensor = new MotionSensor(video, canvas, (level) => {
motionEvents++;
if ($("motion-events")) $("motion-events").textContent = motionEvents;
lastMotionAt = Date.now();
if ($("motion-tag")) {
$("motion-tag").textContent = MOVIMENTO ${Math.round(level)}%;
$("motion-tag").style.color = "var(--red)";
$("motion-tag").style.borderColor = "#ef444466";
}
addLog(output, Evento de movimento detectado (${Math.round(level)}%)., "alert");
setTimeout(() => {
if ($("motion-tag")) {
$("motion-tag").textContent = "MONITORANDO";
$("motion-tag").style.color = "";
("motion-tag").style.borderColor = "";
}
}, 900);
}, level => {
currentMotion = level;
if (("motion-value")) ("motion-value").textContent = `${Math.round(level)}%`;
if (("reaction-motion")) $("reaction-motion").textContent = ${Math.round(level)}%;
fpsFrames++;
if (Date.now() - lastFps > 1000) {
if ($("fps")) $("fps").textContent = ${fpsFrames} FPS;
fpsFrames = 0;
lastFps = Date.now();
}
updateEmotion(level);
});
if (sensitivity) sensor.threshold = Number(sensitivity.value);
if (cooldown) sensor.cooldown = Number(cooldown.value) * 1000;
function updateEmotion(level) {
const idleSeconds = (Date.now() - lastMotionAt) / 1000;
let key = "normal", confidence = 58, activity = "BAIXA";
if (level >= 75) { key = "estressado"; confidence = Math.min(96, 70 + Math.round(level * .25)); activity = "MUITO ALTA"; }
else if (level >= 45) { key = "inquieto"; confidence = Math.min(92, 62 + Math.round(level * .25)); activity = "ALTA"; }
else if (level >= 20) { key = "feliz"; confidence = 55 + Math.round(level * .35); activity = "MODERADA"; }
else if (idleSeconds > 25) { key = "pensativo"; confidence = 55; activity = "MUITO BAIXA"; }
else if (idleSeconds > 12) { key = "triste"; confidence = 52; activity = "BAIXA"; }
const d = emotionDefinitions[key];
if ($("emotion-symbol")) ("emotion-symbol").textContent = d.symbol;
if (("emotion-state")) ("emotion-state").textContent = d.label;
if (("emotion-confidence")) ("emotion-confidence").textContent = `Confiança estimada: ${confidence}%`;
if (("reaction-activity")) $("reaction-activity").textContent = activity;
Object.keys(emotionDefinitions).forEach(k => {
const el = $("emotion-" + k);
if (el) el.textContent = k === key ? ${confidence}% : "—";
});
}
async function activateCamera() {
try {
showScreen();
if (!window.isSecureContext) addLog(output, "AVISO: câmera exige HTTPS ou localhost.", "alert");
await camera.start();
} catch (e) {
hideScreen();
if ($("permission-state")) $("permission-state").textContent = "BLOCKED";
addLog(output, Falha de câmera: ${e.message}, "alert");
}
}
// Event Listeners dos Controlos de Câmera
if (btnCamera) btnCamera.addEventListener("click", activateCamera);
if (btnStop) btnStop.addEventListener("click", () => {
camera.stop();
hideScreen();
addLog(output, "Câmera desligada pelo operador.");
});
if (closeScreen) closeScreen.addEventListener("click", hideScreen);
if (screenModal) screenModal.addEventListener("click", e => { if (e.target === screenModal) hideScreen(); });
if (sensitivity) {
sensitivity.addEventListener("input", () => {
sensor.threshold = Number(sensitivity.value);
if ($("sensitivity-out")) ("sensitivity-out").textContent = sensitivity.value;
if (("threshold-value")) $("threshold-value").textContent = sensitivity.value;
});
}
if (cooldown) {
cooldown.addEventListener("input", () => {
sensor.cooldown = Number(cooldown.value) * 1000;
if ($("cooldown-out")) $("cooldown-out").textContent = ${cooldown.value}s;
});
}
// Submissão de Comandos
if ($("btn-send")) ("btn-send").addEventListener("click", execute);
if (("command-input")) {
$("command-input").addEventListener("keydown", e => {
if (e.key === "Enter" && !e.shiftKey) {
e.preventDefault();
execute();
}
});
}
document.querySelectorAll("[data-command]").forEach(b => b.addEventListener("click", () => handleQuick(b.dataset.command)));
document.querySelectorAll("[data-emotion]").forEach(b => b.addEventListener("click", () => {
const key = b.dataset.emotion, d = emotionDefinitions[key];
if ($("emotion-symbol")) ("emotion-symbol").textContent = d.symbol;
if (("emotion-state")) ("emotion-state").textContent = d.label;
if (("emotion-confidence")) $("emotion-confidence").textContent = "Modo manual do operador";
addLog(output, Estado emocional manual selecionado: ${d.label}.);
}));
async function execute() {
const input = $("command-input"), cmd = input.value.trim();
if (!cmd) return;
addLog(output, OPERATOR: ${cmd});
input.value = "";
const low = cmd.toLowerCase();
if (low.includes("mostrar tela") || low.includes("câmera") || low.includes("camera")) {
await activateCamera();
return;
}
if (low.includes("status")) { handleQuick("status"); return; }
if (low.includes("varredura") || low.includes("scan")) { handleQuick("scan"); return; }
await askGemini(cmd);
}
// Comunicação com a API do Gemini e síntese de voz simultânea
async function askGemini(cmd) {
const thinking = document.createElement("p");
thinking.textContent = "> ULTRON CORE: processando com Gemini...";
thinking.dataset.thinking = "true";
if (output) { output.appendChild(thinking); output.scrollTop = output.scrollHeight; }
try {
const response = await fetch(${BACKEND_URL}/api/ai, {
method: "POST",
headers: { "Content-Type": "application/json" },
body: JSON.stringify({
prompt: cmd,
telemetry: {
motion: Math.round(currentMotion),
emotion: $("emotion-state") ? $("emotion-state").textContent : "NORMAL",
activity: $("reaction-activity") ? $("reaction-activity").textContent : "BAIXA"
}
})
});
const data = await response.json();
thinking.remove();
if (!response.ok || !data.success) {
throw new Error(data.error || "Erro na resposta do backend.");
}
addLog(output, GEMINI: ${data.text});
// Solicita a conversão para voz via ElevenLabs se o texto for válido
if (data.text) {
await speakText(data.text);
}
} catch (e) {
thinking.remove();
addLog(output, GEMINI ERROR: ${e.message}, "alert");
}
}
// Comunicação direta com a rota de voz ElevenLabs no Backend
async function speakText(text) {
if (voiceBusy) return;
voiceBusy = true;
try {
const response = await fetch(${BACKEND_URL}/api/voice, {
method: "POST",
headers: { "Content-Type": "application/json" },
body: JSON.stringify({ text })
});
const data = await response.json();
if (!response.ok || !data.success) {
throw new Error(data.error || "Falha na geração de áudio.");
}
if (data.audioBase64) {
playVoice(data.audioBase64, data.audioMimeType || "audio/mpeg");
}
} catch (e) {
addLog(output, ELEVENLABS ERROR: ${e.message}, "alert");
} finally {
voiceBusy = false;
}
}
async function testVoice() {
addLog(output, "Solicitando teste de voz ElevenLabs...");
await speakText("ULTRON online. Sistema de voz operacional.");
}
function playVoice(base64, mime) {
try {
const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
const blob = new Blob([bytes], { type: mime });
const url = URL.createObjectURL(blob);
let audio = $("voice-audio");
if (!audio) {
audio = new Audio();
audio.id = "voice-audio";
document.body.appendChild(audio);
}
audio.src = url;
audio.play().catch(() => addLog(output, "Áudio pronto, mas o navegador bloqueou a reprodução automática.", "alert"));
audio.onended = () => URL.revokeObjectURL(url);
} catch (e) {
addLog(output, ERRO AO REPRODUZIR ÁUDIO: ${e.message}, "alert");
}
}
async function loadHealth() {
try {
const r = await fetch(${BACKEND_URL}/api/health);
const d = await r.json();
if ($("gemini-module")) {
$("gemini-module").textContent = d.gemini ? "ONLINE" : "API OFF";
("gemini-module").className = d.gemini ? "green" : "";
}
if (("voice-module")) {
$("voice-module").textContent = d.elevenlabs ? "ONLINE" : "API OFF";
("voice-module").className = d.elevenlabs ? "green" : "";
}
if (("bridge-module")) ("bridge-module").textContent = d.deviceBridge ? "READY" : "API WAIT";
if (("vitals-status")) ("vitals-status").textContent = d.deviceBridge ? "CONECTADO" : "AGUARDANDO";
} catch {
if (("gemini-module")) ("gemini-module").textContent = "BACKEND OFF";
if (("voice-module")) $("voice-module").textContent = "BACKEND OFF";
}
}
function handleQuick(cmd) {
if (cmd === "clear") { if (output) output.innerHTML = ""; return; }
if (cmd === "voice") { testVoice(); return; }
if (cmd === "camera") { addLog(output, "Camera API: " + (navigator.mediaDevices ? "DISPONÍVEL" : "INDISPONÍVEL")); return; }
if (cmd === "status") {
addLog(output, Sistema ONLINE | câmera ${camera.stream ? "ATIVA" : "inativa"} | eventos ${motionEvents} | Gemini conectado ao backend | ElevenLabs ${$("voice-module") ? $("voice-module").textContent : "N/A"});
return;
}
if (cmd === "scan") {
addLog(output, "Iniciando varredura local...");
setTimeout(() => addLog(output, "Varredura concluída. Núcleo local operacional."), 800);
}
}
function updateBars() {
const holder = $("activity-bars");
if (!holder) return;
holder.innerHTML = "";
for (let i = 0; i < 70; i++) {
const b = document.createElement("i");
b.className = "bar";
b.style.height = ${3 + Math.random() * 42}px;
b.style.animationDelay = ${Math.random() * 1.2}s;
holder.appendChild(b);
}
}
// Loop de atualização de telemetria
setInterval(() => {
if ($("clock")) $("clock").textContent = clock();
const s = Math.floor((Date.now() - startTime) / 1000);
const h = String(Math.floor(s / 3600)).padStart(2, "0");
const m = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
const sec = String(s % 60).padStart(2, "0");
if ($("uptime")) $("uptime").textContent = ${h}:${m}:${sec};
updateEmotion(currentMotion);
}, 1000);
// Eventos de estado de rede e inicialização de sistema
updateBars();
if ($("storage-state")) ("storage-state").textContent = "READY";
if (("connection-state")) $("connection-state").textContent = navigator.onLine ? "ONLINE" : "OFFLINE";
window.addEventListener("online", () => { if ($("connection-state")) ("connection-state").textContent = "ONLINE"; });
window.addEventListener("offline", () => { if (("connection-state")) $("connection-state").textContent = "OFFLINE"; });
if (prefs.cameraAccepted) {
addLog(output, "Preferência local: câmera já autorizada anteriormente. A visualização permanece oculta até o operador solicitar.");
}
loadHealth();
updateEmotion(0);
