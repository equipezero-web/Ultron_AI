import { cameraWasAccepted, rememberCameraAccepted } from "./storage.js";

export class CameraController {
  constructor(video, onState) {
    this.video = video;
    this.onState = onState;
    this.stream = null;
    this.lastError = null;

    setTimeout(() => {
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

  async requestStream() {
    const candidates = [
      {
        video: {
          facingMode: "user",
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30, max: 30 }
        },
        audio: false
      },
      {
        video: {
          facingMode: "user",
          width: { ideal: 640 },
          height: { ideal: 480 }
        },
        audio: false
      },
      { video: true, audio: false }
    ];

    let lastError = null;
    for (const constraints of candidates) {
      try {
        return await navigator.mediaDevices.getUserMedia(constraints);
      } catch (error) {
        lastError = error;
        const name = String(error?.name || "");
        if (["NotAllowedError", "SecurityError"].includes(name)) break;
      }
    }

    throw lastError || new Error("Não foi possível abrir a câmera.");
  }

  friendlyError(error) {
    const name = String(error?.name || "");
    if (name === "NotAllowedError") return "Permissão da câmera bloqueada no navegador ou sistema.";
    if (name === "NotFoundError") return "Nenhuma câmera foi encontrada neste dispositivo.";
    if (name === "NotReadableError") return "A câmera está ocupada por outro aplicativo ou indisponível.";
    if (name === "OverconstrainedError") return "A câmera não suporta a configuração solicitada.";
    if (name === "SecurityError") return "O navegador bloqueou o acesso à câmera por segurança.";
    return String(error?.message || error || "Falha desconhecida da câmera.");
  }

  async start({ restored = false } = {}) {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("Câmera indisponível. Use HTTPS ou localhost.");
    }

    if (this.isActive()) {
      if (this.video.srcObject !== this.stream) this.video.srcObject = this.stream;
      await this.video.play().catch(() => {});
      this.onState("active", this.stream, { restored });
      window.dispatchEvent(new CustomEvent("ultron:camera-stream", {
        detail: { active: true, restored, stream: this.stream }
      }));
      return this.stream;
    }

    try {
      this.stream = await this.requestStream();
      this.video.srcObject = this.stream;
      this.video.muted = true;
      this.video.playsInline = true;
      await this.video.play();
      rememberCameraAccepted();
      this.lastError = null;
      this.onState("active", this.stream, { restored });
      window.dispatchEvent(new CustomEvent("ultron:camera-stream", {
        detail: { active: true, restored, stream: this.stream }
      }));
      return this.stream;
    } catch (error) {
      this.lastError = error;
      this.stream?.getTracks?.().forEach((track) => track.stop());
      this.stream = null;
      this.video.srcObject = null;
      const message = this.friendlyError(error);
      window.dispatchEvent(new CustomEvent("ultron:camera-error", {
        detail: { name: error?.name || "CameraError", message }
      }));
      throw new Error(message);
    }
  }

  stop() {
    this.stream?.getTracks?.().forEach((track) => track.stop());
    this.stream = null;
    this.video.srcObject = null;
    this.onState("stopped");
    window.dispatchEvent(new CustomEvent("ultron:camera-stream", {
      detail: { active: false, restored: false, stream: null }
    }));
  }
}
