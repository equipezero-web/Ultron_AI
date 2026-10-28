const cameraState = document.getElementById("camera-state");
const permissionState = document.getElementById("permission-state");
const telemetryCamera = document.getElementById("telemetry-camera");
const visionModule = document.getElementById("vision-module");
const output = document.getElementById("output-box");
const retryButton = document.getElementById("btn-camera");
const opticalPanel = document.querySelector(".optical-panel");

let selector = null;
let deviceCountLabel = null;
let lastDeviceCount = null;
let recovering = false;
let lastTransientLogAt = 0;

function log(message, alert = false) {
  if (!output || !message) return;
  const line = document.createElement("p");
  if (alert) line.className = "alert";
  const time = new Date().toLocaleTimeString("pt-BR", { hour12: false });
  line.textContent = `> [${time}] [CAMERA] ${message}`;
  output.appendChild(line);
  output.scrollTop = output.scrollHeight;
}

function state(label, permission = null, alert = false) {
  if (cameraState) {
    cameraState.textContent = label;
    cameraState.style.color = alert ? "#ff7a45" : (label === "ONLINE" ? "var(--green)" : "");
  }
  if (permissionState && permission) permissionState.textContent = permission;
  if (telemetryCamera && label !== "ONLINE") telemetryCamera.textContent = "OFF";
  if (visionModule && label !== "ONLINE") {
    visionModule.textContent = label === "ERROR" ? "ERROR" : "STANDBY";
    visionModule.className = "";
  }
}

function ensureDeviceUi() {
  if (!opticalPanel || selector) return;
  const controls = opticalPanel.querySelector(".controls");
  if (!controls) return;

  const wrap = document.createElement("div");
  wrap.className = "camera-device-picker";
  wrap.style.cssText = "display:grid;grid-template-columns:1fr auto;gap:6px;margin:8px 0;align-items:center";

  selector = document.createElement("select");
  selector.id = "camera-device-select";
  selector.style.cssText = "min-width:0;border:1px solid rgba(0,240,255,.25);background:rgba(0,0,0,.35);color:#dffcff;padding:7px;font:9px ui-monospace,monospace;outline:none";
  selector.innerHTML = '<option value="">CÂMERA AUTOMÁTICA</option>';

  deviceCountLabel = document.createElement("span");
  deviceCountLabel.style.cssText = "font:8px ui-monospace,monospace;color:rgba(191,237,244,.65);white-space:nowrap";
  deviceCountLabel.textContent = "DETECTANDO...";

  selector.addEventListener("change", async () => {
    try {
      log(selector.value ? "Dispositivo de câmera selecionado manualmente." : "Seleção automática de câmera ativada.");
      await window.ULTRON_CAMERA_CONTROLLER?.selectDevice?.(selector.value);
    } catch (error) {
      log(error?.message || String(error), true);
    }
  });

  wrap.append(selector, deviceCountLabel);
  controls.before(wrap);
}

function updateDeviceUi(detail = {}) {
  ensureDeviceUi();
  if (!selector || !deviceCountLabel) return;

  const devices = Array.isArray(detail.devices) ? detail.devices : [];
  const selected = String(detail.selectedDeviceId || "");
  const previous = selector.value;
  const transientZero = detail.transientZero === true;

  selector.replaceChildren();
  const automatic = document.createElement("option");
  automatic.value = "";
  automatic.textContent = "CÂMERA AUTOMÁTICA";
  selector.appendChild(automatic);

  devices.forEach((device, index) => {
    const option = document.createElement("option");
    option.value = device.deviceId || "";
    option.textContent = device.label || `Câmera ${index + 1}`;
    selector.appendChild(option);
  });

  selector.value = selected || previous || "";
  deviceCountLabel.textContent = transientZero
    ? `${devices.length} CÂMERA // DRIVER SYNC`
    : `${devices.length} CÂMERA${devices.length === 1 ? "" : "S"}`;
  deviceCountLabel.style.color = devices.length ? "#00f0ff" : "#ff7a45";

  if (detail.announce) {
    log(devices.length
      ? `${devices.length} entrada(s) de vídeo detectada(s): ${devices.map((device) => device.label).join(", ")}.`
      : "0 entradas de vídeo detectadas pelo navegador.", !devices.length);
  }
}

async function recoverWhenAvailable(detail = {}) {
  const controller = window.ULTRON_CAMERA_CONTROLLER;
  const devices = Array.isArray(detail.devices) ? detail.devices : [];
  const count = devices.length;
  if (!controller || count <= 0 || controller.isActive?.() || recovering) return;

  const permission = await controller.permissionState?.().catch(() => "unknown") || "unknown";

  if (permission === "granted") {
    state("AVAILABLE", "GRANTED", false);
    recovering = true;
    log(`Câmera disponível: ${devices[0]?.label || "videoinput"}. Tentando recuperar o sensor óptico automaticamente.`);
    try {
      await controller.start({ restored: true });
    } catch (error) {
      log(`A câmera apareceu, mas não pôde ser iniciada automaticamente: ${error?.message || error}`, true);
    } finally {
      recovering = false;
    }
    return;
  }

  if (permission === "denied") {
    state("AVAILABLE", "BLOCKED", true);
    log(`Hardware detectado (${devices[0]?.label || "câmera"}), porém a permissão do navegador está bloqueada. Libere a câmera para este site e pressione MOSTRAR TELA.`, true);
    return;
  }

  state("AVAILABLE", permission === "prompt" ? "ASK" : "AVAILABLE", false);
  log(`Hardware detectado (${devices[0]?.label || "câmera"}). Pressione MOSTRAR TELA para concluir a autorização.`);
}

window.addEventListener("ultron:camera-devices", (event) => {
  const detail = event.detail || {};
  updateDeviceUi(detail);

  if (detail.transientZero === true) {
    state("SYNCING", String(permissionState?.textContent || "AVAILABLE"), false);
    const now = Date.now();
    if (now - lastTransientLogAt > 5000) {
      lastTransientLogAt = now;
      log("O driver retornou 0 entradas momentaneamente; mantendo a última VGA Camera conhecida e tentando fallbacks genéricos.");
    }
    return;
  }

  const count = Number(detail.count ?? detail.devices?.length ?? 0);
  const becameAvailable = detail.becameAvailable === true || (lastDeviceCount === 0 && count > 0);
  lastDeviceCount = count;
  if (becameAvailable) recoverWhenAvailable(detail).catch(() => {});
});

window.addEventListener("ultron:camera-transient", () => {
  state("SYNCING", String(permissionState?.textContent || "AVAILABLE"), false);
});

window.addEventListener("ultron:camera-fallback", (event) => {
  const mode = String(event.detail?.mode || "generic").toUpperCase();
  log(`Device ID exato indisponível; câmera aberta pelo fallback ${mode}.`);
});

window.addEventListener("ultron:camera-error", (event) => {
  const detail = event.detail || {};
  const name = String(detail.name || "CameraError");
  const message = String(detail.message || "Falha ao iniciar câmera.");

  let label = "ERROR";
  let permission = "ERROR";
  if (name === "NotAllowedError" || name === "SecurityError") {
    label = Number(detail.deviceCount || 0) > 0 ? "AVAILABLE" : "BLOCKED";
    permission = "BLOCKED";
  } else if (name === "NotReadableError") {
    label = "BUSY";
    permission = "GRANTED";
  } else if (name === "NotFoundError") {
    label = Number(detail.deviceCount || 0) > 0 ? "AVAILABLE" : "NO CAMERA";
    permission = Number(detail.deviceCount || 0) > 0 ? "RETRY" : "UNAVAILABLE";
  }

  state(label, permission, true);
  updateDeviceUi({
    devices: detail.devices || [],
    count: detail.deviceCount || 0,
    selectedDeviceId: window.ULTRON_CAMERA_CONTROLLER?.selectedDeviceId || ""
  });
  log(message, true);
  if (name === "NotFoundError" && Number(detail.deviceCount || 0) === 0) {
    log("DIAGNÓSTICO: nenhuma câmera estável foi encontrada após os fallbacks. O Ultron continuará observando o driver.", true);
  }
});

window.addEventListener("ultron:camera-stream", (event) => {
  const detail = event.detail || {};
  if (detail.active) {
    state("ONLINE", "GRANTED", false);
    if (telemetryCamera) telemetryCamera.textContent = "ON";
    if (visionModule) {
      visionModule.textContent = "ACTIVE";
      visionModule.className = "green";
    }
    const device = detail.label ? ` (${detail.label})` : "";
    log(detail.restored ? `Permissão existente reutilizada; câmera restaurada${device}.` : `Câmera online e stream validado${device}.`);
  } else if (detail.reason === "track-ended") {
    state("INTERRUPTED", "GRANTED", true);
    log("O stream da câmera foi interrompido pelo navegador, sistema ou outro aplicativo.", true);
  }
});

async function syncPermission() {
  ensureDeviceUi();
  try {
    await window.ULTRON_CAMERA_CONTROLLER?.refreshDevices?.();
  } catch {}

  if (!navigator.permissions?.query) return;
  try {
    const permission = await navigator.permissions.query({ name: "camera" });
    if (permissionState) permissionState.textContent = String(permission.state || "UNKNOWN").toUpperCase();
    permission.onchange = async () => {
      if (permissionState) permissionState.textContent = String(permission.state || "UNKNOWN").toUpperCase();
      if (permission.state === "granted") {
        const controller = window.ULTRON_CAMERA_CONTROLLER;
        const devices = await controller?.refreshDevices?.({ announce: true }).catch(() => []) || [];
        if (devices.length && !controller?.isActive?.()) {
          controller.start({ restored: true }).catch(() => {});
        }
      }
    };
  } catch {}
}

retryButton?.addEventListener("dblclick", () => {
  window.ULTRON_CAMERA_CONTROLLER?.start?.().catch((error) => {
    log(error?.message || String(error), true);
  });
});

setTimeout(syncPermission, 1200);

window.ULTRON_CAMERA_RUNTIME = {
  retry() {
    return window.ULTRON_CAMERA_CONTROLLER?.start?.() || Promise.reject(new Error("Controlador da câmera ainda não carregado."));
  },
  refreshDevices() {
    return window.ULTRON_CAMERA_CONTROLLER?.refreshDevices?.({ announce: true }) || Promise.resolve([]);
  },
  get active() {
    return Boolean(window.ULTRON_CAMERA_CONTROLLER?.isActive?.());
  },
  get devices() {
    return window.ULTRON_CAMERA_CONTROLLER?.devices || [];
  }
};
