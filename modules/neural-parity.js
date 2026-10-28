const output = document.getElementById('output-box');
let lastReport = null;
let syncTimer = null;

function log(message, alert = false) {
  if (!output || !message) return;
  const line = document.createElement('p');
  if (alert) line.className = 'alert';
  const time = new Date().toLocaleTimeString('pt-BR', { hour12: false });
  line.textContent = `> [${time}] [NEURAL] ${message}`;
  output.appendChild(line);
  output.scrollTop = output.scrollHeight;
}

function report() {
  return {
    performance: window.ULTRON_PERFORMANCE?.mode || 'full',
    starkCore: Boolean(window.ULTRON_STARK_CORE),
    innerMesh: Boolean(window.ULTRON_STARK_MESH),
    fileMesh: Boolean(window.ULTRON_FILE_MESH),
    handTracking: Boolean(window.ULTRON_HAND_GESTURES),
    palmMatrix: Boolean(window.ULTRON_PALM_MATRIX),
    cameraRuntime: Boolean(window.ULTRON_CAMERA_RUNTIME),
    cameraActive: Boolean(window.ULTRON_CAMERA_RUNTIME?.active),
    vision: Boolean(window.ULTRON_VISION),
    localFiles: Boolean(window.ULTRON_LOCAL_FILES)
  };
}

async function sync(reason = 'startup') {
  const mesh = window.ULTRON_STARK_MESH;
  mesh?.refresh?.();
  mesh?.layout?.();

  if (window.ULTRON_CAMERA_RUNTIME?.active) {
    await window.ULTRON_HAND_GESTURES?.enable?.().catch?.(() => false);
  }

  lastReport = report();
  window.dispatchEvent(new CustomEvent('ultron:neural-parity', {
    detail: { reason, ...lastReport }
  }));
  return lastReport;
}

function scheduleSync(reason) {
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    sync(reason).catch(() => {});
  }, 220);
}

window.addEventListener('ultron:camera-stream', (event) => {
  if (event.detail?.active) scheduleSync('camera-online');
});

window.addEventListener('ultron:camera-devices', (event) => {
  if (Number(event.detail?.count || 0) > 0) scheduleSync('camera-detected');
});

window.addEventListener('ultron:performance-mode', () => scheduleSync('performance-change'));
window.addEventListener('resize', () => scheduleSync('resize'));

setTimeout(async () => {
  const current = await sync('bootstrap');
  const missing = Object.entries(current)
    .filter(([key, value]) => !['performance', 'cameraActive'].includes(key) && value === false)
    .map(([key]) => key);
  if (missing.length) {
    log(`PARITY CHECK // módulos ausentes: ${missing.join(', ')}`, true);
  } else {
    log(`PARITY READY // ${String(current.performance).toUpperCase()} // mesmas funções Neural em desktop e mobile.`);
  }
}, 900);

window.ULTRON_NEURAL_PARITY = {
  sync,
  report,
  get state() { return lastReport || report(); }
};
