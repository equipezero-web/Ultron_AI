import { cameraWasAccepted, rememberCameraAccepted } from "./storage.js";

const CAMERA_DEVICE_KEY = "ultron_camera_device_id_v1";

export class CameraController {
  constructor(video, onState) {
    this.video = video;
    this.onState = onState;
    this.stream = null;
    this.lastError = null;
    this.startPromise = null;
    this.stopRequested = false;
    this.devices = [];
    this.selectedDeviceId = localStorage.getItem(CAMERA_DEVICE_KEY) || "";
    window.ULTRON_CAMERA_CONTROLLER = this;

    navigator.mediaDevices?.addEventListener?.("devicechange", () => {
      this.refreshDevices({ announce: true }).catch(() => {});
    });

    setTimeout(() => {
      this.refreshDevices().catch(() => {});
      this.restoreIfGranted().catch(() => {});
    }, 900);
  }

  async permissionState() {
    if (!navigator.permissions?.query) return "unknown";
    try {
      const result = await navigator.permissions.query({ name: "camera" });
      return String(result?.state || "unknown");
    } catch {
      return "unknown";
    }
  }

  async canAutoStart() {
    if (!cameraWasAccepted()) return false;
    return (await this.permissionState()) === "granted";
  }

  async restoreIfGranted() {
    if (this.isActive()) return true;
    if (!(await this.canAutoStart())) return false;
    await this.start({ restored: true });
    return true;
  }

  isActive() {
    return this.stream?.getVideoTracks?.().some((track) => track.readyState === "live") === true;
  }

  recoverExistingStream() {
    const existing = this.video?.srcObject;
    const liveTrack = existing?.getVideoTracks?.().find((track) => track.readyState === "live");
    if (!liveTrack) return null;
    this.stream = existing;
    return existing;
  }

  async refreshDevices({ announce = false } = {}) {
    if (!navigator.mediaDevices?.enumerateDevices) {
      this.devices = [];
      return [];
    }

    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      this.devices = devices
        .filter((device) => device.kind === "videoinput")
        .map((device, index) => ({
          deviceId: device.deviceId,
          groupId: device.groupId,
          label: device.label || `Câmera ${index + 1}`
        }));

      if (this.selectedDeviceId && !this.devices.some((device) => device.deviceId === this.selectedDeviceId)) {
        this.selectedDeviceId = "";
        localStorage.removeItem(CAMERA_DEVICE_KEY);
      }

      window.dispatchEvent(new CustomEvent("ultron:camera-devices", {
        detail: {
          devices: this.devices,
          count: this.devices.length,
          selectedDeviceId: this.selectedDeviceId,
          announce
        }
      }));

      return this.devices;
    } catch {
      this.devices = [];
      return [];
    }
  }

  async selectDevice(deviceId) {
    const next = String(deviceId || "");
    this.selectedDeviceId = next;
    if (next) localStorage.setItem(CAMERA_DEVICE_KEY, next);
    else localStorage.removeItem(CAMERA_DEVICE_KEY);

    if (this.isActive()) {
      this.stop({ silent: true });
      await this.start();
    }

    return this.selectedDeviceId;
  }

  buildCandidates() {
    const preferred = this.selectedDeviceId
      ? {
          deviceId: { exact: this.selectedDeviceId },
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 24, max: 30 }
        }
      : null;

    const candidates = [];
    if (preferred) candidates.push({ video: preferred, audio: false });
    candidates.push(
      {
        video: {
          facingMode: { ideal: "user" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 24, max: 30 }
        },
        audio: false
      },
      {
        video: {
          facingMode: { ideal: "user" },
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { ideal: 20, max: 24 }
        },
        audio: false
      },
      { video: true, audio: false }
    );
    return candidates;
  }

  async requestStream() {
    await this.refreshDevices().catch(() => {});
    const candidates = this.buildCandidates();

    let lastError = null;
    for (let index = 0; index < candidates.length; index += 1) {
      try {
        return await navigator.mediaDevices.getUserMedia(candidates[index]);
      } catch (error) {
        lastError = error;
        const name = String(error?.name || "");
        if (["NotAllowedError", "SecurityError"].includes(name)) break;

        if (name === "NotFoundError") {
          await this.refreshDevices({ announce: true }).catch(() => {});
          if (!this.devices.length) break;
        }

        if (name === "NotReadableError" && index < candidates.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 320));
        }
      }
    }

    throw lastError || new Error("Não foi possível abrir a câmera.");
  }

  friendlyError(error) {
    const name = String(error?.name || "");
    if (name === "NotAllowedError") return "Permissão da câmera bloqueada no navegador ou sistema.";
    if (name === "NotFoundError") {
      const count = this.devices.length;
      return count
        ? `${count} entrada(s) de vídeo foram listadas, mas nenhuma pôde ser aberta. Verifique driver/dispositivo selecionado.`
        : "Nenhuma entrada de vídeo foi encontrada pelo navegador. Verifique se a webcam está habilitada no Windows/driver ou conecte uma câmera USB/virtual.";
    }
    if (name === "NotReadableError") return "A câmera não pôde ser aberta. Ela pode estar em uso por outro aplicativo, pelo próprio navegador em outra aba, ou o driver ainda não liberou o dispositivo.";
    if (name === "OverconstrainedError") return "A câmera não suporta a configuração solicitada.";
    if (name === "SecurityError") return "O navegador bloqueou o acesso à câmera por segurança.";
    if (name === "AbortError") return "A inicialização da câmera foi interrompida.";
    return String(error?.message || error || "Falha desconhecida da câmera.");
  }

  bindTrackLifecycle(stream) {
    const track = stream?.getVideoTracks?.()[0];
    if (!track) return;
    track.addEventListener("ended", () => {
      if (this.stream !== stream) return;
      this.stream = null;
      this.video.srcObject = null;
      this.onState("stopped");
      window.dispatchEvent(new CustomEvent("ultron:camera-stream", {
        detail: { active: false, restored: false, stream: null, reason: "track-ended" }
      }));
    }, { once: true });
  }

  async activateStream(stream, { restored = false } = {}) {
    if (!stream) throw new Error("Stream de câmera inválido.");
    if (this.stopRequested) {
      stream.getTracks?.().forEach((track) => track.stop());
      throw new DOMException("Inicialização cancelada pelo operador.", "AbortError");
    }

    this.stream = stream;
    this.bindTrackLifecycle(stream);
    this.video.srcObject = stream;
    this.video.muted = true;
    this.video.playsInline = true;
    await this.video.play();
    rememberCameraAccepted();
    this.lastError = null;

    const track = stream.getVideoTracks?.()[0];
    const settings = track?.getSettings?.() || {};
    if (settings.deviceId && settings.deviceId !== this.selectedDeviceId) {
      this.selectedDeviceId = settings.deviceId;
      localStorage.setItem(CAMERA_DEVICE_KEY, settings.deviceId);
    }

    await this.refreshDevices().catch(() => {});
    this.onState("active", stream, { restored });
    window.dispatchEvent(new CustomEvent("ultron:camera-stream", {
      detail: {
        active: true,
        restored,
        stream,
        deviceId: settings.deviceId || this.selectedDeviceId || null,
        label: track?.label || null,
        width: settings.width || null,
        height: settings.height || null
      }
    }));
    return stream;
  }

  async start({ restored = false } = {}) {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("Câmera indisponível. Use HTTPS ou localhost.");
    }

    this.stopRequested = false;

    if (this.isActive()) {
      if (this.video.srcObject !== this.stream) this.video.srcObject = this.stream;
      await this.video.play().catch(() => {});
      this.onState("active", this.stream, { restored });
      window.dispatchEvent(new CustomEvent("ultron:camera-stream", {
        detail: { active: true, restored, stream: this.stream, reused: true }
      }));
      return this.stream;
    }

    const recovered = this.recoverExistingStream();
    if (recovered) return this.activateStream(recovered, { restored: true });

    if (this.startPromise) return this.startPromise;

    this.startPromise = (async () => {
      try {
        const stream = await this.requestStream();
        return await this.activateStream(stream, { restored });
      } catch (error) {
        this.lastError = error;
        this.stream?.getTracks?.().forEach((track) => track.stop());
        this.stream = null;
        if (this.video) this.video.srcObject = null;
        const message = this.friendlyError(error);
        window.dispatchEvent(new CustomEvent("ultron:camera-error", {
          detail: {
            name: error?.name || "CameraError",
            message,
            deviceCount: this.devices.length,
            devices: this.devices
          }
        }));
        const wrapped = new Error(message);
        wrapped.name = error?.name || "CameraError";
        throw wrapped;
      } finally {
        this.startPromise = null;
      }
    })();

    return this.startPromise;
  }

  stop({ silent = false } = {}) {
    this.stopRequested = true;
    const stream = this.stream || this.video?.srcObject;
    this.stream = null;
    if (this.video) this.video.srcObject = null;
    stream?.getTracks?.().forEach((track) => track.stop());
    if (!silent) this.onState("stopped");
    window.dispatchEvent(new CustomEvent("ultron:camera-stream", {
      detail: { active: false, restored: false, stream: null, reason: silent ? "device-switch" : "operator-stop" }
    }));
  }
}
