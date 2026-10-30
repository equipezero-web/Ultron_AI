const STORAGE_KEY = 'ultron_performance_mode_v1';

function detectProfile() {
  const saved = String(localStorage.getItem(STORAGE_KEY) || 'auto').toLowerCase();
  if (['full', 'balanced', 'lite'].includes(saved)) return saved;

  const coarse = window.matchMedia?.('(pointer: coarse)')?.matches === true;
  const narrow = Math.min(innerWidth || 9999, screen?.width || 9999) <= 900;
  const memory = Number(navigator.deviceMemory || 0);
  const cores = Number(navigator.hardwareConcurrency || 0);
  const mobile = coarse || narrow;

  if (!mobile) return 'full';
  if ((memory && memory <= 4) || (cores && cores <= 4) || Math.min(innerWidth || 9999, screen?.width || 9999) <= 480) {
    return 'lite';
  }
  return 'balanced';
}

const PROFILES = {
  full: {
    mode: 'full',
    handInferenceMs: 72,
    pointerSmoothing: 0.46,
    pointerFastSmoothing: 0.78,
    pointerDeadzonePx: 0.8,
    pinchEnterRatio: 0.37,
    pinchExitRatio: 0.44,
    activationStableFrames: 2,
    motionWidth: 512,
    motionHeight: 288,
    motionEveryFrames: 2,
    motionStride: 28,
    motionPixelDelta: 88,
    motionSmoothing: 0.34,
    telemetryIntervalMs: 15000,
    sensorIntervalMs: 32,
    sensorSmoothing: 0.26,
    cameraWidth: 1920,
    cameraHeight: 1080,
    cameraFps: 24,
    maxFileNodes: 18,
    neuralVisualFps: 60
  },
  balanced: {
    mode: 'balanced',
    handInferenceMs: 92,
    pointerSmoothing: 0.38,
    pointerFastSmoothing: 0.68,
    pointerDeadzonePx: 1.25,
    pinchEnterRatio: 0.36,
    pinchExitRatio: 0.45,
    activationStableFrames: 2,
    motionWidth: 256,
    motionHeight: 144,
    motionEveryFrames: 3,
    motionStride: 40,
    motionPixelDelta: 92,
    motionSmoothing: 0.28,
    telemetryIntervalMs: 30000,
    sensorIntervalMs: 45,
    sensorSmoothing: 0.22,
    cameraWidth: 1280,
    cameraHeight: 720,
    cameraFps: 24,
    maxFileNodes: 12,
    neuralVisualFps: 40
  },
  lite: {
    mode: 'lite',
    handInferenceMs: 112,
    pointerSmoothing: 0.32,
    pointerFastSmoothing: 0.58,
    pointerDeadzonePx: 1.8,
    pinchEnterRatio: 0.35,
    pinchExitRatio: 0.46,
    activationStableFrames: 3,
    motionWidth: 192,
    motionHeight: 108,
    motionEveryFrames: 4,
    motionStride: 56,
    motionPixelDelta: 96,
    motionSmoothing: 0.24,
    telemetryIntervalMs: 45000,
    sensorIntervalMs: 66,
    sensorSmoothing: 0.18,
    cameraWidth: 1280,
    cameraHeight: 720,
    cameraFps: 18,
    maxFileNodes: 8,
    neuralVisualFps: 30
  }
};

let mode = detectProfile();
let profile = { ...PROFILES[mode] };

document.documentElement.dataset.ultronPerformance = mode;
document.documentElement.dataset.ultronHidden = document.hidden ? 'true' : 'false';

document.addEventListener('visibilitychange', () => {
  document.documentElement.dataset.ultronHidden = document.hidden ? 'true' : 'false';
});

function isRemoteStream(stream, detail = {}) {
  if (detail?.remote) return true;
  const source = String(detail?.source || '').toUpperCase();
  if (source.includes('BRIDGE') || source.includes('WEBRTC')) return true;
  const track = stream?.getVideoTracks?.()[0];
  if (!track) return false;
  const settings = track.getSettings?.() || {};
  return !settings.deviceId;
}

async function constrainCamera(stream, detail = {}) {
  if (!stream || isRemoteStream(stream, detail)) return;
  const track = stream.getVideoTracks?.()[0];
  if (!track?.applyConstraints) return;
  try {
    await track.applyConstraints({
      width: { ideal: profile.cameraWidth },
      height: { ideal: profile.cameraHeight },
      frameRate: { ideal: profile.cameraFps, max: profile.cameraFps }
    });
  } catch {
    // Alguns drivers móveis ignoram constraints após o stream iniciar.
  }
}

window.addEventListener('ultron:camera-stream', (event) => {
  if (event.detail?.active && event.detail?.stream) {
    constrainCamera(event.detail.stream, event.detail).catch(() => {});
  }
});

function apply(nextMode = 'auto') {
  const normalized = String(nextMode || 'auto').toLowerCase();
  if (normalized === 'auto') localStorage.removeItem(STORAGE_KEY);
  else if (PROFILES[normalized]) localStorage.setItem(STORAGE_KEY, normalized);
  else return mode;

  mode = normalized === 'auto' ? detectProfile() : normalized;
  profile = { ...PROFILES[mode] };
  document.documentElement.dataset.ultronPerformance = mode;
  constrainCamera(window.ULTRON_CAMERA_CONTROLLER?.stream).catch(() => {});
  window.dispatchEvent(new CustomEvent('ultron:performance-mode', { detail: { ...profile } }));
  return mode;
}

window.ULTRON_PERFORMANCE = {
  get mode() { return mode; },
  get profile() { return { ...profile }; },
  setMode: apply,
  isMobile: mode !== 'full',
  get version() { return '4.24.0'; }
};

window.dispatchEvent(new CustomEvent('ultron:performance-ready', { detail: { ...profile, version: '4.24.0' } }));
