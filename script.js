import { CameraController } from "./modules/camera.js";
import { MotionSensor } from "./modules/motion.js";
import { loadPreferences } from "./modules/storage.js";
import { addLog, clock } from "./modules/system.js";
import API_CONFIG from "./config.js";

const $ = (id) => document.getElementById(id);

const video = $("webcam");
const canvas = $("motion-canvas");
const output = $("output-box");

const btnCamera = $("btn-camera");
const btnStop = $("btn-stop-camera");

const screenModal = $("screen-modal");
const closeScreen = $("btn-close-screen");

const sensitivity = $("sensitivity");
const cooldown = $("cooldown");

const prefs = loadPreferences();

let motionEvents = 0;
let startTime = Date.now();
let fpsFrames = 0;
let lastFps = Date.now();

let currentMotion = 0;
let lastMotionAt = Date.now();
let voiceBusy = false;

const API_BASE = String(API_CONFIG?.backendUrl || "").replace(/\/$/, "");

const apiUrl = (path) => `${API_BASE}${path}`;

const emotionDefinitions = {
  feliz: {
    label: "FELIZ",
    symbol: "😊"
  },
  triste: {
    label: "TRISTE",
    symbol: "😢"
  },
  normal: {
    label: "NORMAL",
    symbol: "😐"
  },
  inquieto: {
    label: "INQUIETO",
    symbol: "⚡"
  },
  pensativo: {
    label: "PENSATIVO",
    symbol: "🧠"
  },
  estressado: {
    label: "ESTRESSADO",
    symbol: "🔥"
  }
};

function showScreen() {
  screenModal.classList.add("open");
  screenModal.setAttribute("aria-hidden", "false");
}

function hideScreen() {
  screenModal.classList.remove("open");
  screenModal.setAttribute("aria-hidden", "true");
}

function getErrorMessage(data, status) {
  if (typeof data === "string" && data.trim()) {
    return data;
  }

  if (data?.details) {
    return data.details;
  }

  if (data?.error) {
    return data.error;
  }

  if (data?.message) {
    return data.message;
  }

  return `Erro HTTP ${status}`;
}

async function readApiResponse(response) {
  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    return response.json();
  }

  const text = await response.text();

  return {
    error: text || `Erro HTTP ${response.status}`
  };
}

function playVoice(base64, mime = "audio/mpeg") {
  try {
    if (!base64) {
      throw new Error("O backend não retornou dados de áudio.");
    }

    const bytes = Uint8Array.from(
      atob(base64),
      (character) => character.charCodeAt(0)
    );

    const blob = new Blob([bytes], {
      type: mime
    });

    const url = URL.createObjectURL(blob);
    const audio = $("voice-audio");

    if (!audio) {
      URL.revokeObjectURL(url);
      throw new Error("Elemento de áudio #voice-audio não encontrado.");
    }

    if (audio.dataset.audioUrl) {
      URL.revokeObjectURL(audio.dataset.audioUrl);
    }

    audio.dataset.audioUrl = url;
    audio.src = url;
    audio.load();

    audio.play().catch(() => {
      addLog(
        output,
        "Áudio gerado, mas o navegador bloqueou a reprodução automática. Interaja com a página e tente novamente.",
        "alert"
      );
    });

    audio.onended = () => {
      if (audio.dataset.audioUrl === url) {
        URL.revokeObjectURL(url);
        delete audio.dataset.audioUrl;
      }
    };

  } catch (error) {
    addLog(
      output,
      `ELEVENLABS ERROR: Não foi possível reproduzir o áudio. ${error.message}`,
      "alert"
    );
  }
}

const camera = new CameraController(video, (state) => {
  if (state === "active") {
    $("camera-state").textContent = "ONLINE";
    $("camera-state").style.color = "var(--green)";

    $("permission-state").textContent = "GRANTED";
    $("telemetry-camera").textContent = "ON";

    $("vision-module").textContent = "ACTIVE";
    $("vision-module").className = "green";

    $("system-mode").textContent = "MONITORING";
    btnCamera.textContent = "TELA ATIVA";
    btnStop.disabled = false;

    $("camera-resolution").textContent =
      `${video.videoWidth}×${video.videoHeight}`;

    sensor.start();

    addLog(
      output,
      "Sensor óptico calibrado. Monitoramento iniciado."
    );

  } else {
    $("camera-state").textContent = "STANDBY";
    $("camera-state").style.color = "";

    $("telemetry-camera").textContent = "OFF";

    $("vision-module").textContent = "STANDBY";
    $("vision-module").className = "";

    $("system-mode").textContent = "STANDBY";
    btnCamera.textContent = "MOSTRAR TELA";
    btnStop.disabled = true;

    sensor.stop();

    $("motion-tag").textContent = "STANDBY";

    currentMotion = 0;
    updateEmotion(0);
  }
});

const sensor = new MotionSensor(
  video,
  canvas,

  (level) => {
    motionEvents += 1;

    $("motion-events").textContent = motionEvents;

    lastMotionAt = Date.now();

    $("motion-tag").textContent =
      `MOVIMENTO ${Math.round(level)}%`;

    $("motion-tag").style.color = "var(--red)";
    $("motion-tag").style.borderColor = "#ef444466";

    addLog(
      output,
      `Evento de movimento detectado (${Math.round(level)}%).`,
      "alert"
    );

    setTimeout(() => {
      $("motion-tag").textContent = "MONITORANDO";
      $("motion-tag").style.color = "";
      $("motion-tag").style.borderColor = "";
    }, 900);
  },

  (level) => {
    currentMotion = level;

    $("motion-value").textContent =
      `${Math.round(level)}%`;

    $("reaction-motion").textContent =
      `${Math.round(level)}%`;

    fpsFrames += 1;

    if (Date.now() - lastFps > 1000) {
      $("fps").textContent = `${fpsFrames} FPS`;

      fpsFrames = 0;
      lastFps = Date.now();
    }

    updateEmotion(level);
  }
);

sensor.threshold = Number(sensitivity.value);
sensor.cooldown = Number(cooldown.value) * 1000;

function updateEmotion(level) {
  const idleSeconds = (Date.now() - lastMotionAt) / 1000;

  let key = "normal";
  let confidence = 58;
  let activity = "BAIXA";

  if (level >= 75) {
    key = "estressado";
    confidence = Math.min(
      96,
      70 + Math.round(level * 0.25)
    );
    activity = "MUITO ALTA";

  } else if (level >= 45) {
    key = "inquieto";
    confidence = Math.min(
      92,
      62 + Math.round(level * 0.25)
    );
    activity = "ALTA";

  } else if (level >= 20) {
    key = "feliz";
    confidence = 55 + Math.round(level * 0.35);
    activity = "MODERADA";

  } else if (idleSeconds > 25) {
    key = "pensativo";
    confidence = 55;
    activity = "MUITO BAIXA";

  } else if (idleSeconds > 12) {
    key = "triste";
    confidence = 52;
    activity = "BAIXA";
  }

  const emotion = emotionDefinitions[key];

  $("emotion-symbol").textContent = emotion.symbol;
  $("emotion-state").textContent = emotion.label;

  $("emotion-confidence").textContent =
    `Confiança estimada: ${confidence}%`;

  $("reaction-activity").textContent = activity;

  Object.keys(emotionDefinitions).forEach((emotionKey) => {
    $("emotion-" + emotionKey).textContent =
      emotionKey === key ? `${confidence}%` : "—";
  });
}

async function activateCamera() {
  try {
    showScreen();

    if (!window.isSecureContext) {
      addLog(
        output,
        "AVISO: câmera exige HTTPS ou localhost.",
        "alert"
      );
    }

    await camera.start();

  } catch (error) {
    hideScreen();

    $("permission-state").textContent = "BLOCKED";

    addLog(
      output,
      `Falha de câmera: ${error.message}`,
      "alert"
    );
  }
}

btnCamera.addEventListener("click", activateCamera);

btnStop.addEventListener("click", () => {
  camera.stop();
  hideScreen();

  addLog(
    output,
    "Câmera desligada pelo operador."
  );
});

closeScreen.addEventListener("click", hideScreen);

screenModal.addEventListener("click", (event) => {
  if (event.target === screenModal) {
    hideScreen();
  }
});

sensitivity.addEventListener("input", () => {
  sensor.threshold = Number(sensitivity.value);

  $("sensitivity-out").textContent = sensitivity.value;
  $("threshold-value").textContent = sensitivity.value;
});

cooldown.addEventListener("input", () => {
  sensor.cooldown = Number(cooldown.value) * 1000;

  $("cooldown-out").textContent =
    `${cooldown.value}s`;
});

$("btn-send").addEventListener("click", execute);

$("command-input").addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    execute();
  }
});

document
  .querySelectorAll("[data-command]")
  .forEach((button) => {
    button.addEventListener("click", () => {
      handleQuick(button.dataset.command);
    });
  });

document
  .querySelectorAll("[data-emotion]")
  .forEach((button) => {
    button.addEventListener("click", () => {
      const key = button.dataset.emotion;
      const emotion = emotionDefinitions[key];

      $("emotion-symbol").textContent = emotion.symbol;
      $("emotion-state").textContent = emotion.label;

      $("emotion-confidence").textContent =
        "Modo manual do operador";

      addLog(
        output,
        `Estado emocional manual selecionado: ${emotion.label}.`
      );
    });
  });

async function execute() {
  const input = $("command-input");
  const command = input.value.trim();

  if (!command) {
    return;
  }

  addLog(output, `OPERATOR: ${command}`);

  input.value = "";

  const lowerCommand = command.toLowerCase();

  if (
    lowerCommand.includes("mostrar tela") ||
    lowerCommand.includes("câmera") ||
    lowerCommand.includes("camera")
  ) {
    await activateCamera();
    return;
  }

  if (lowerCommand.includes("status")) {
    handleQuick("status");
    return;
  }

  if (
    lowerCommand.includes("varredura") ||
    lowerCommand.includes("scan")
  ) {
    handleQuick("scan");
    return;
  }

  await askGemini(command);
}

async function askGemini(command) {
  const thinking = document.createElement("p");

  thinking.textContent =
    "> ULTRON CORE: processando com Gemini...";

  thinking.dataset.thinking = "true";

  output.appendChild(thinking);
  output.scrollTop = output.scrollHeight;

  try {
    if (!API_BASE) {
      throw new Error(
        "Backend não configurado. Defina backendUrl no arquivo config.js."
      );
    }

    const response = await fetch(apiUrl("/api/ai"), {
      method: "POST",

      headers: {
        "Content-Type": "application/json"
      },

      body: JSON.stringify({
        message: command,

        telemetry: {
          motion: Math.round(currentMotion),
          emotion: $("emotion-state").textContent,
          activity: $("reaction-activity").textContent
        }
      })
    });

    const data = await readApiResponse(response);

    if (!response.ok) {
      throw new Error(
        getErrorMessage(data, response.status)
      );
    }

    if (!data?.text) {
      throw new Error(
        "O backend respondeu, mas não retornou texto da Gemini."
      );
    }

    addLog(output, `GEMINI: ${data.text}`);

    if (data.audioBase64) {
      playVoice(
        data.audioBase64,
        data.audioMimeType || "audio/mpeg"
      );
    }

  } catch (error) {
    addLog(
      output,
      `GEMINI ERROR: ${error.message}`,
      "alert"
    );

  } finally {
    thinking.remove();
  }
}

async function testVoice() {
  if (voiceBusy) {
    return;
  }

  voiceBusy = true;

  addLog(
    output,
    "Solicitando teste de voz ElevenLabs..."
  );

  try {
    if (!API_BASE) {
      throw new Error(
        "Backend não configurado. Defina backendUrl no arquivo config.js."
      );
    }

    const response = await fetch(apiUrl("/api/voice"), {
      method: "POST",

      headers: {
        "Content-Type": "application/json"
      },

      body: JSON.stringify({
        text: "ULTRON online. Sistema de voz operacional."
      })
    });

    const data = await readApiResponse(response);

    if (!response.ok) {
      throw new Error(
        getErrorMessage(data, response.status)
      );
    }

    if (!data?.audioBase64) {
      throw new Error(
        "A ElevenLabs respondeu, mas não retornou áudio."
      );
    }

    playVoice(
      data.audioBase64,
      data.audioMimeType || "audio/mpeg"
    );

    addLog(
      output,
      "ElevenLabs: voz recebida e enviada para reprodução."
    );

  } catch (error) {
    addLog(
      output,
      `ELEVENLABS ERROR: ${error.message}`,
      "alert"
    );

  } finally {
    voiceBusy = false;
  }
}

async function loadHealth() {
  try {
    if (!API_BASE) {
      throw new Error("Backend não configurado.");
    }

    const response = await fetch(apiUrl("/api/health"));
    const data = await readApiResponse(response);

    if (!response.ok) {
      throw new Error(
        getErrorMessage(data, response.status)
      );
    }

    $("gemini-module").textContent =
      data.gemini ? "ONLINE" : "API OFF";

    $("gemini-module").className =
      data.gemini ? "green" : "";

    $("voice-module").textContent =
      data.elevenlabs ? "ONLINE" : "API OFF";

    $("voice-module").className =
      data.elevenlabs ? "green" : "";

    $("bridge-module").textContent =
      data.deviceBridge ? "READY" : "API WAIT";

    $("vitals-status").textContent =
      data.deviceBridge ? "CONECTADO" : "AGUARDANDO";

  } catch (error) {
    $("gemini-module").textContent = "BACKEND OFF";
    $("gemini-module").className = "";

    $("voice-module").textContent = "BACKEND OFF";
    $("voice-module").className = "";

    addLog(
      output,
      `BACKEND ERROR: ${error.message}`,
      "alert"
    );
  }
}

function handleQuick(command) {
  if (command === "clear") {
    output.innerHTML = "";
    return;
  }

  if (command === "voice") {
    testVoice();
    return;
  }

  if (command === "camera") {
    addLog(
      output,
      `Camera API: ${
        navigator.mediaDevices ? "DISPONÍVEL" : "INDISPONÍVEL"
      }`
    );
    return;
  }

  if (command === "status") {
    addLog(
      output,
      `Sistema ONLINE | câmera ${
        camera.stream ? "ATIVA" : "inativa"
      } | eventos ${motionEvents} | Gemini conectado ao backend | ElevenLabs ${
        $("voice-module").textContent
      }`
    );
    return;
  }

  if (command === "scan") {
    addLog(output, "Iniciando varredura local...");

    setTimeout(() => {
      addLog(
        output,
        "Varredura concluída. Núcleo local operacional."
      );
    }, 800);
  }
}

function updateBars() {
  const holder = $("activity-bars");

  holder.innerHTML = "";

  for (let index = 0; index < 70; index += 1) {
    const bar = document.createElement("i");

    bar.className = "bar";
    bar.style.height = `${3 + Math.random() * 42}px`;
    bar.style.animationDelay = `${Math.random() * 1.2}s`;

    holder.appendChild(bar);
  }
}

setInterval(() => {
  $("clock").textContent = clock();

  const totalSeconds = Math.floor(
    (Date.now() - startTime) / 1000
  );

  const hours = String(
    Math.floor(totalSeconds / 3600)
  ).padStart(2, "0");

  const minutes = String(
    Math.floor((totalSeconds % 3600) / 60)
  ).padStart(2, "0");

  const seconds = String(
    totalSeconds % 60
  ).padStart(2, "0");

  $("uptime").textContent =
    `${hours}:${minutes}:${seconds}`;

  updateEmotion(currentMotion);

}, 1000);

updateBars();

$("storage-state").textContent = "READY";

$("connection-state").textContent =
  navigator.onLine ? "ONLINE" : "OFFLINE";

window.addEventListener("online", () => {
  $("connection-state").textContent = "ONLINE";
});

window.addEventListener("offline", () => {
  $("connection-state").textContent = "OFFLINE";
});

if (prefs.cameraAccepted) {
  addLog(
    output,
    "Preferência local: câmera já autorizada anteriormente. A visualização permanece oculta até o operador solicitar."
  );
}

loadHealth();
updateEmotion(0);
