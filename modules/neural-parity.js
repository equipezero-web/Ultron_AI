const output = document.getElementById('output-box');
let lastReport = null;
let syncTimer = null;
let lastSignature='';

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
  const current=Boolean(window.JARVIS_COMMAND_CENTER?.active);
  return {
    architecture:current?'command-center':'legacy',
    neuralRing:current?Boolean(window.ULTRON_NEURAL_RING_3D?.reset&&window.ULTRON_NEURAL_RING_3D?.zoomBy):null,
    globe:current?Boolean(window.ULTRON_EARTH?.open):null,
    neuralAnswer:current?Boolean(window.ULTRON_NEURAL_ANSWER?.show):null,
    performance: window.ULTRON_PERFORMANCE?.mode || 'full',
    starkCore: Boolean(current?window.ULTRON_STARK_CORE?.active&&window.ULTRON_STARK_CORE?.mode==='command-center':window.ULTRON_STARK_CORE),
    innerMesh: Boolean(current?window.ULTRON_STARK_MESH?.active&&window.ULTRON_STARK_MESH?.mode==='command-center':window.ULTRON_STARK_MESH),
    fileMesh: Boolean(window.ULTRON_FILE_MESH),
    neuralInput: Boolean(window.ULTRON_NEURAL_INPUT),
    neuralCommandRouter: Boolean(window.ULTRON_NEURAL_COMMAND),
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

window.addEventListener('ultron:neural-command-ready', () => scheduleSync('neural-command-ready'));
window.addEventListener('ultron:performance-mode', () => scheduleSync('performance-change'));
window.addEventListener('resize', () => scheduleSync('resize'));

function diagnostics(current){
  // PalmMatrix remains untouched: it is optional in the current architecture.
  const optional=current.architecture==='command-center'?['palmMatrix']: [];
  const missing=Object.entries(current).filter(([key,value])=>key!=='cameraActive'&&!optional.includes(key)&&value===false).map(([key])=>key);
  const signature=JSON.stringify([current.architecture,missing,current.palmMatrix]);
  if(signature===lastSignature)return;
  lastSignature=signature;
  if(missing.length)log('PARITY CHECK // módulos ausentes: '+missing.join(', '),true);
  else log('PARITY READY // '+current.architecture.toUpperCase()+' // StarkCore + InnerMesh operacionais');
  if(optional.length&&!current.palmMatrix)log('PALM MATRIX // não inicializado (legado opcional, sem alteração).');
}
for(const type of ['ultron:stark-current-ready','ultron:neural-ring-3d-ready','ultron:stark-bootstrap-ready']){
  window.addEventListener(type,()=>setTimeout(()=>sync(type).then(diagnostics).catch(()=>{}),300));
}
setTimeout(()=>sync('bootstrap').then(diagnostics).catch(()=>{}),1500);

window.ULTRON_NEURAL_PARITY = {
  sync,
  report,
  get state() { return lastReport || report(); }
};
