import { cameraWasAccepted, rememberCameraAccepted } from "./storage.js";

export class CameraController {
  constructor(video, onState) {
    this.video = video;
    this.onState = onState;
    this.stream = null;
    this.lastError = null;
    this.startPromise = null;
    this.stopRequested = false;
    window.ULTRON_CAMERA_CONTROLLER = this;

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

  recoverExistingStream() {
    const existing = this.video?.srcObject;
    const liveTrack = existing?.getVideoTracks?.().find((track) => track.readyState === "live");
    if (!liveTrack) return null;
    this.stream = existing;
    return existing;
  }

  async requestStream() {
    const candidates = [
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
    ];

    let lastError = null;
    for (let index = 0; index < candidates.length; index += 1) {
      try {
        return await navigator.mediaDevices.getUserMedia(candidates[index]);
      } catch (error) {
        lastError = error;
        const name = String(error?.name || "");
        if (["NotAllowedError", "SecurityError", "NotFoundError"].includes(name)) break;

        // Alguns drivers do Windows precisam de uma pequena janela para liberar o dispositivo.
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
    if (name === "NotFoundError") return "Nenhuma câmera foi encontrada neste dispositivo.";
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
    this.onState("active", stream, { restored });
    window.dispatchEvent(new CustomEvent("ultron:camera-stream", {
      detail: { active: true, restored, stream }
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

    // Impede restore automático + clique do operador de abrirem duas capturas ao mesmo tempo.
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
          detail: { name: error?.name || "CameraError", message }
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

  stop() {
    this.stopRequested = true;
    const stream = this.stream || this.video?.srcObject;
    this.stream = null;
    if (this.video) this.video.srcObject = null;
    stream?.getTracks?.().forEach((track) => track.stop());
    this.onState("stopped");
    window.dispatchEvent(new CustomEvent("ultron:camera-stream", {
      detail: { active: false, restored: false, stream: null, reason: "operator-stop" }
    }));
  }
}
