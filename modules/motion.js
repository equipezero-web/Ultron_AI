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
    this.smoothedLevel = 0;
    this.noiseFloor = 4;
  }

  perfProfile() {
    return window.ULTRON_PERFORMANCE?.profile || {
      motionWidth: 480,
      motionHeight: 270,
      motionEveryFrames: 2,
      motionStride: 32,
      motionPixelDelta: 95,
      motionSmoothing: 0.3
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
    this.smoothedLevel = 0;
    this.noiseFloor = 4;
    requestAnimationFrame(() => this.loop());
  }

  stop() {
    this.running = false;
    this.previous = null;
    this.smoothedLevel = 0;
  }

  analyze(current) {
    const profile = this.perfProfile();
    const pixelStride = Math.max(4, Math.round(Number(profile.motionStride || 32) / 4));
    const byteStride = pixelStride * 4;
    const baseDelta = Math.max(45, Number(profile.motionPixelDelta || 95));

    let changed = 0;
    let total = 0;
    let deltaSum = 0;

    const previousData = this.previous?.data;
    const currentData = current?.data;
    if (!previousData || !currentData) return null;

    for (let i = 0; i < currentData.length - 2; i += byteStride) {
      const dr = Math.abs(currentData[i] - previousData[i]);
      const dg = Math.abs(currentData[i + 1] - previousData[i + 1]);
      const db = Math.abs(currentData[i + 2] - previousData[i + 2]);
      const delta = dr + dg + db;
      deltaSum += delta;
      total += 1;
    }

    const meanDelta = deltaSum / Math.max(1, total);
    const dynamicDelta = Math.max(baseDelta, this.noiseFloor * 3.2 + 24);

    for (let i = 0; i < currentData.length - 2; i += byteStride) {
      const delta =
        Math.abs(currentData[i] - previousData[i]) +
        Math.abs(currentData[i + 1] - previousData[i + 1]) +
        Math.abs(currentData[i + 2] - previousData[i + 2]);
      if (delta > dynamicDelta) changed += 1;
    }

    const rawLevel = Math.min(100, (changed / Math.max(1, total)) * 100);
    const smoothing = Math.max(0.08, Math.min(0.72, Number(profile.motionSmoothing || 0.3)));
    this.smoothedLevel += (rawLevel - this.smoothedLevel) * smoothing;

    if (rawLevel < Math.max(4, this.threshold * 0.45)) {
      this.noiseFloor += (meanDelta - this.noiseFloor) * 0.035;
    }

    return {
      level: Math.max(0, Math.min(100, this.smoothedLevel)),
      rawLevel,
      changed,
      total,
      meanDelta,
      dynamicDelta,
      noiseFloor: this.noiseFloor
    };
  }

  loop() {
    if (!this.running) return;
    this.frame += 1;

    if (document.hidden) {
      requestAnimationFrame(() => this.loop());
      return;
    }

    const every = Math.max(2, Number(this.perfProfile().motionEveryFrames || 2));
    if (this.frame % every === 0) {
      if (this.canvas.width < 1 || this.canvas.height < 1) this.resizeAnalysisCanvas();
      this.ctx.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);
      const current = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);

      if (this.previous) {
        const analysis = this.analyze(current);
        if (analysis) {
          const level = analysis.level;
          this.onLevel(level);

          window.dispatchEvent(new CustomEvent("ultron:motion-level", {
            detail: {
              ...analysis,
              threshold: this.threshold,
              analysisResolution: `${this.canvas.width}x${this.canvas.height}`
            }
          }));

          const triggerLevel = Math.max(3, Number(this.threshold || 20));
          if (level >= triggerLevel && performance.now() - this.lastEvent > this.cooldown) {
            this.lastEvent = performance.now();
            this.onMotion(level);
            window.dispatchEvent(new CustomEvent("ultron:motion-event", {
              detail: {
                level,
                rawLevel: analysis.rawLevel,
                changed: analysis.changed,
                noiseFloor: analysis.noiseFloor
              }
            }));
          }
        }
      }

      this.previous = current;
    }

    requestAnimationFrame(() => this.loop());
  }
}
