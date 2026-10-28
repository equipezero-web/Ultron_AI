import { cameraWasAccepted, rememberCameraAccepted } from "./storage.js";

const CAMERA_DEVICE_KEY = "ultron_camera_device_id_v1";
const DEVICE_GRACE_MS = 7000;

function cameraProfile() {
  const profile = window.ULTRON_PERFORMANCE?.profile || {};
  return {
    width: Number(profile.cameraWidth || 1280),
    height: Number(profile.cameraHeight || 720),
    fps: Number(profile.cameraFps || 24)
  };
}

export class CameraController {
  constructor(video, onState) {
    this.video = video;
    this.onState = onState;
    this.stream = null;
    this.lastError = null;
    this.startPromise = null;
    this.stopRequested = false;
    this.devices = [];
    this.lastKnownDevices = [];
    this.lastNonEmptyAt = 0;
    this.lastEnumeratedCount = 0;
    this.deviceFingerprint = "";
    this.selectedDeviceId = localStorage.getItem(CAMERA_DEVICE_KEY) || "";
    window.ULTRON_CAMERA_CONTROLLER = this;

    navigator.mediaDevices?.addEventListener?.("devicechange", () => {
      setTimeout(() => this.refreshDevices({ announce: true }).catch(() => {}), 180);
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
      this.lastEnumeratedCount = 0;
      return [];
    }

    try {
      const previousCount = this.devices.length;
      const previousFingerprint = this.deviceFingerprint;
      const devices = await navigator.mediaDevices.enumerateDevices();
      const fresh = devices
        .filter((device) => device.kind === "videoinput")
        .map((device, index) => ({
          deviceId: device.deviceId,
          groupId: device.groupId,
          label: device.label || `Câmera ${index + 1}`
        }));

      this.lastEnumeratedCount = fresh.length;
      const now = Date.now();
      let transientZero = false;

      if (fresh.length) {
        this.lastKnownDevices = fresh;
        this.lastNonEmptyAt = now;
        this.devices = fresh;
      } else if (this.lastKnownDevices.length && now - this.lastNonEmptyAt < DEVICE_GRACE_MS) {
        transientZero = true;
        this.devices = this.lastKnownDevices;
      } else {
        this.devices = [];
      }

      this.deviceFingerprint = this.devices
        .map((device) => `${device.deviceId}:${device.label}`)
        .join("|");
      const changed = previousFingerprint !== this.deviceFingerprint;
      const becameAvailable = previousCount === 0 && this.devices.length > 0;

      if (
        this.selectedDeviceId &&
        !transientZero &&
        this.devices.length &&
        !this.devices.some((device) => device.deviceId === this.selectedDeviceId)
      ) {
        this.selectedDeviceId = "";
        localStorage.removeItem(CAMERA_DEVICE_KEY);
      }

      window.dispatchEvent(new CustomEvent("ultron:camera-devices", {
        detail: {
          devices: this.devices,
          count: this.devices.length,
          freshCount: fresh.length,
          previousCount,
          becameAvailable,
          changed,
          transientZero,
          selectedDeviceId: this.selectedDeviceId,
          announce: Boolean(announce && changed && !transientZero)
        }
      }));

      if (transientZero) {
        window.dispatchEvent(new CustomEvent("ultron:camera-transient", {
          detail: {
            reason: "enumeration-zero",
            graceMs: DEVICE_GRACE_MS,
            devices: this.devices
          }
        }));
      }

      return this.devices;
    } catch {
      return this.devices;
    }
  }

  async selectDevice(deviceId) {
    const next = String(deviceId || "");
    this.selectedDeviceId = next;
    if (next) localStorage.setItem(CAMERA_DEVICE_KEY, next);
    else localStorage.removeItem(CAMERA_DEVICE_KEY);

    if (this.isActive()) this.stop({ silent: true });
    return this.start({ restored: false });
  }

  buildCandidates({ preferExact = true } = {}) {
    const profile = cameraProfile();
    const preferred = preferExact && this.selectedDeviceId
      ? {
          deviceId: { exact: this.selectedDeviceId },
          width: { ideal: profile.width },
          height: { ideal: profile.height },
          frameRate: { ideal: profile.fps, max: Math.max(profile.fps, 24) }
        }
      : null;

    const candidates = [];
    if (preferred) candidates.push({ video: preferred, audio: false, _mode: "selected" });
    candidates.push(
      {
        video: {
          facingMode: { ideal: "user" },
          width: { ideal: profile.width },
          height: { ideal: profile.height },
          frameRate: { ideal: profile.fps, max: Math.max(profile.fps, 24) }
        },
        audio: false,
        _mode: "profile"
      },
      {
        video: {
          width: { ideal: Math.min(640, profile.width) },
          height: { ideal: Math.min(480, profile.height) },
          frameRate: { ideal: Math.min(20, profile.fps), max: 24 }
        },
        audio: false,
        _mode: "compatible"
      },
      { video: true, audio: false, _mode: "generic" }
    );
    return candidates;
  }

  async requestStream() {
    await this.refreshDevices().catch(() => {});

    // Alguns drivers USB/VGA oscilam entre 1 e 0 durante a inicialização.
    // Se o enumerateDevices acabou de retornar 0, evitamos prender a abertura
    // a um deviceId possivelmente efêmero e deixamos o browser escolher a câmera.
    const candidates = this.buildCandidates({ preferExact: this.lastEnumeratedCount > 0 });

    let lastError = null;
    for (let index = 0; index < candidates.length; index += 1) {
      const candidate = candidates[index];
      const constraints = { video: candidate.video, audio: false };

      try {
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        if (candidate._mode !== "selected" && this.selectedDeviceId) {
          window.dispatchEvent(new CustomEvent("ultron:camera-fallback", {
            detail: { mode: candidate._mode, selectedDeviceId: this.selectedDeviceId }
          }));
        }
        return stream;
      } catch (error) {
        lastError = error;
        const name = String(error?.name || "");
        if (["NotAllowedError", "SecurityError"].includes(name)) break;

        if (name === "NotFoundError" || name === "OverconstrainedError") {
          await this.refreshDevices({ announce: true }).catch(() => {});
          // Nunca interromper aqui: a próxima tentativa pode usar constraints
          // mais amplas e conseguir abrir a mesma câmera via driver genérico.
          if (index < candidates.length - 1) {
            await new Promise((resolve) => setTimeout(resolve, 220));
            continue;
          }
        }

        if (name === "NotReadableError" && index < candidates.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 420));
          continue;
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
        ? `${count} entrada(s) de vídeo foram listadas, mas nenhuma pôde ser aberta. O Ultron tentou também os modos genéricos do navegador.`
        : "Nenhuma entrada de vídeo foi encontrada pelo navegador. Verifique se a webcam está habilitada no Windows/driver ou conecte uma câmera USB/virtual.";
    }
    if (name === "NotReadableError") return "A câmera não pôde ser aberta. Ela pode estar em uso por outro aplicativo, pelo próprio navegador em outra aba, ou o driver ainda não liberou o dispositivo.";
    if (name === "OverconstrainedError") return "A câmera não suporta a configuração solicitada; os fallbacks compatíveis também foram tentados.";
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
