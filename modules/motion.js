export class MotionSensor {
  constructor(video, canvas, onMotion, onLevel) {
    this.video = video;
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { willReadFrequently: true });
    this.onMotion = onMotion;
    this.onLevel = onLevel;
    this.previous = null;
    this.running = false;
    this.frame = 0;
    this.threshold = 20;
    this.lastEvent = 0;
    this.cooldown = 3000;
  }

  perfProfile() {
    return window.ULTRON_PERFORMANCE?.profile || {
      motionWidth: 480,
      motionHeight: 270,
      motionEveryFrames: 2
    };
  }

  resizeAnalysisCanvas() {
    const profile = this.perfProfile();
    const sourceW = this.video.videoWidth || 640;
    const sourceH = this.video.videoHeight || 480;
    const maxW = Math.max(96, Number(profile.motionWidth || 480));
    const maxH = Math.max(72, Number(profile.motionHeight || 270));
    const scale = Math.min(1, maxW / sourceW, maxH / sourceH);
    this.canvas.width = Math.max(96, Math.round(sourceW * scale));
    this.canvas.height = Math.max(72, Math.round(sourceH * scale));
  }

  start() {
    this.resizeAnalysisCanvas();
    this.running = true;
    this.previous = null;
    this.frame = 0;
    requestAnimationFrame(() => this.loop());
  }

  stop() {
    this.running = false;
    this.previous = null;
  }

  loop() {
    if (!this.running) return;
    this.frame++;

    if (document.hidden) {
      requestAnimationFrame(() => this.loop());
      return;
    }

    const every = Math.max(2, Number(this.perfProfile().motionEveryFrames || 2));
    if (this.frame % every === 0) {
      this.ctx.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);
      const current = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);

      if (this.previous) {
        let changed = 0;
        let total = 0;
        const stride = window.ULTRON_PERFORMANCE?.mode === "lite" ? 48 : 32;

        for (let i = 0; i < current.data.length; i += stride) {
          const d =
            Math.abs(current.data[i] - this.previous.data[i]) +
            Math.abs(current.data[i + 1] - this.previous.data[i + 1]) +
            Math.abs(current.data[i + 2] - this.previous.data[i + 2]);
          if (d > 95) changed++;
          total++;
        }

        const level = Math.min(100, (changed / Math.max(1, total)) * 100);
        this.onLevel(level);

        window.dispatchEvent(new CustomEvent("ultron:motion-level", {
          detail: {
            level,
            changed,
            total,
            threshold: this.threshold,
            analysisResolution: `${this.canvas.width}x${this.canvas.height}`
          }
        }));

        if (changed > this.threshold * 3 && performance.now() - this.lastEvent > this.cooldown) {
          this.lastEvent = performance.now();
          this.onMotion(level);
          window.dispatchEvent(new CustomEvent("ultron:motion-event", {
            detail: { level, changed }
          }));
        }
      }

      this.previous = current;
    }

    requestAnimationFrame(() => this.loop());
  }
}
