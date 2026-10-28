import { cameraWasAccepted, rememberCameraAccepted } from "./storage.js";

export class CameraController {
  constructor(video, onState) {
    this.video = video;
    this.onState = onState;
    this.stream = null;
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

  async start() {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("Câmera indisponível. Use HTTPS ou localhost.");
    }

    const activeTrack = this.stream?.getVideoTracks?.()[0];
    if (activeTrack?.readyState === "live") {
      if (this.video.srcObject !== this.stream) this.video.srcObject = this.stream;
      await this.video.play().catch(() => {});
      this.onState("active", this.stream);
      return this.stream;
    }

    this.stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: "user",
        width: { ideal: 1280 },
        height: { ideal: 720 }
      },
      audio: false
    });

    this.video.srcObject = this.stream;
    await this.video.play();
    rememberCameraAccepted();
    this.onState("active", this.stream);
    return this.stream;
  }

  stop() {
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.video.srcObject = null;
    this.onState("stopped");
  }
}
