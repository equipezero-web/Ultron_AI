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
    mode: 'full', handInferenceMs: 78,
    motionWidth: 480, motionHeight: 270, motionEveryFrames: 2,
    telemetryIntervalMs: 15000,
    cameraWidth: 1280, cameraHeight: 720, cameraFps: 24,
    maxFileNodes: 18
  },
  balanced: {
    mode: 'balanced', handInferenceMs: 135,
    motionWidth: 192, motionHeight: 144, motionEveryFrames: 4,
    telemetryIntervalMs: 30000,
    cameraWidth: 640, cameraHeight: 480, cameraFps: 20,
    maxFileNodes: 12
  },
  lite: {
    mode: 'lite', handInferenceMs: 180,
    motionWidth: 128, motionHeight: 96, motionEveryFrames: 5,
    telemetryIntervalMs: 45000,
    cameraWidth: 480, cameraHeight: 360, cameraFps: 15,
    maxFileNodes: 8
  }
};

let mode = detectProfile();
let profile = { ...PROFILES[mode] };

document.documentElement.dataset.ultronPerformance = mode;
document.documentElement.dataset.ultronHidden = document.hidden ? 'true' : 'false';

document.addEventListener('visibilitychange', () => {
  document.documentElement.dataset.ultronHidden = document.hidden ? 'true' : 'false';
});

async function constrainCamera(stream) {
  if (!stream || mode === 'full') return;
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
  if (event.detail?.active && event.detail?.stream) constrainCamera(event.detail.stream);
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
  isMobile: mode !== 'full'
};

window.dispatchEvent(new CustomEvent('ultron:performance-ready', { detail: { ...profile } }));
