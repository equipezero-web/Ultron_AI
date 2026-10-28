const cameraState = document.getElementById("camera-state");
const permissionState = document.getElementById("permission-state");
const telemetryCamera = document.getElementById("telemetry-camera");
const visionModule = document.getElementById("vision-module");
const output = document.getElementById("output-box");
const retryButton = document.getElementById("btn-camera");

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
    cameraState.style.color = alert ? "#ff7a45" : "";
  }
  if (permissionState && permission) permissionState.textContent = permission;
  if (telemetryCamera && label !== "ONLINE") telemetryCamera.textContent = "OFF";
  if (visionModule && label !== "ONLINE") {
    visionModule.textContent = label === "ERROR" ? "ERROR" : "STANDBY";
    visionModule.className = "";
  }
}

window.addEventListener("ultron:camera-error", (event) => {
  const detail = event.detail || {};
  const name = String(detail.name || "CameraError");
  const message = String(detail.message || "Falha ao iniciar câmera.");

  let label = "ERROR";
  let permission = "ERROR";
  if (name === "NotAllowedError" || name === "SecurityError") {
    label = "BLOCKED";
    permission = "BLOCKED";
  } else if (name === "NotReadableError") {
    label = "BUSY";
    permission = "GRANTED";
  } else if (name === "NotFoundError") {
    label = "NO CAMERA";
    permission = "UNAVAILABLE";
  }

  state(label, permission, true);
  log(message, true);
});

window.addEventListener("ultron:camera-stream", (event) => {
  const detail = event.detail || {};
  if (detail.active) {
    state("ONLINE", "GRANTED", false);
    if (cameraState) cameraState.style.color = "var(--green)";
    if (telemetryCamera) telemetryCamera.textContent = "ON";
    if (visionModule) {
      visionModule.textContent = "ACTIVE";
      visionModule.className = "green";
    }
    log(detail.restored ? "Permissão existente reutilizada; câmera restaurada." : "Câmera online e stream validado.");
  } else if (detail.reason === "track-ended") {
    state("INTERRUPTED", "GRANTED", true);
    log("O stream da câmera foi interrompido pelo navegador, sistema ou outro aplicativo.", true);
  }
});

async function syncPermission() {
  if (!navigator.permissions?.query) return;
  try {
    const permission = await navigator.permissions.query({ name: "camera" });
    if (permissionState) permissionState.textContent = String(permission.state || "UNKNOWN").toUpperCase();
    permission.onchange = () => {
      if (permissionState) permissionState.textContent = String(permission.state || "UNKNOWN").toUpperCase();
      if (permission.state === "granted") {
        window.ULTRON_CAMERA_CONTROLLER?.restoreIfGranted?.().catch(() => {});
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
  get active() {
    return Boolean(window.ULTRON_CAMERA_CONTROLLER?.isActive?.());
  }
};
