const STYLE_ID = 'ultron-stark-core-style';
const FUNCTIONAL_STYLE_ID = 'ultron-stark-functional-style';
const HAND_STYLE_ID = 'ultron-stark-hand-style';
const CAMERA_PREVIEW_STYLE_ID = 'ultron-stark-camera-preview-style';
const ZOOM_DIAGNOSTICS_STYLE_ID = 'ultron-stark-zoom-diagnostics-style';
const PALM_MATRIX_STYLE_ID = 'ultron-palm-matrix-style';
const LOCAL_FILES_STYLE_ID = 'ultron-local-files-style';
const FILE_MESH_STYLE_ID = 'ultron-stark-file-mesh-style';
const MOBILE_PERF_STYLE_ID = 'ultron-mobile-performance-style';

function loadStyle(id, href) {
  if (document.getElementById(id)) return;
  const link = document.createElement('link');
  link.id = id;
  link.rel = 'stylesheet';
  link.href = href;
  document.head.appendChild(link);
}

loadStyle(MOBILE_PERF_STYLE_ID, 'modules/mobile-performance.css?v=4.12.1');
await import('./mobile-performance.js?v=4.12.1');

loadStyle(STYLE_ID, 'modules/stark-core.css?v=4.12.1');
loadStyle(FUNCTIONAL_STYLE_ID, 'modules/stark-functional.css?v=4.12.1');
loadStyle(HAND_STYLE_ID, 'modules/stark-hand.css?v=4.12.1');
loadStyle(CAMERA_PREVIEW_STYLE_ID, 'modules/stark-camera-preview.css?v=4.12.1');
loadStyle(ZOOM_DIAGNOSTICS_STYLE_ID, 'modules/stark-zoom-diagnostics.css?v=4.12.1');
loadStyle(PALM_MATRIX_STYLE_ID, 'modules/palm-matrix.css?v=4.12.1');
loadStyle(LOCAL_FILES_STYLE_ID, 'modules/local-files.css?v=4.12.1');
loadStyle(FILE_MESH_STYLE_ID, 'modules/stark-file-mesh.css?v=4.12.1');

await import('./stark-core.js?v=4.12.1');
await import('./stark-inner-mesh.js?v=4.12.1');
await import('./neural-input-bus.js?v=4.12.1');
await import('./stark-advanced.js?v=4.12.1');
await import('./vision-client.js?v=4.12.1');
await import('./stark-hand-gesture.js?v=4.12.1');
await import('./stark-camera-preview.js?v=4.12.1');
await import('./camera-runtime.js?v=4.12.1');
await import('./stark-zoom-diagnostics.js?v=4.12.1');
await import('./stark-production-bridge.js?v=4.12.1');
await import('./palm-matrix.js?v=4.12.1');
await import('./local-files-client.js?v=4.14.0');
await import('./local-files-v2.js?v=4.14.0');
await import('./local-files-ai-bridge.js?v=4.14.0');
await import('./stark-file-mesh.js?v=4.14.0');
await import('./backend-version-check.js?v=4.13.0');
await import('./neural-parity.js?v=4.12.1');

window.addEventListener('ultron:processing-start', () => {
  window.ULTRON_STARK_CORE?.processing?.(true);
});

window.addEventListener('ultron:processing-end', () => {
  window.ULTRON_STARK_CORE?.processing?.(false);
});

window.addEventListener('ultron:subvocal-command', (event) => {
  window.ULTRON_STARK_CORE?.focus?.('COMANDOS');
  window.ULTRON_STARK_CORE?.processing?.(true);
  setTimeout(() => window.ULTRON_STARK_CORE?.processing?.(false), 650);
  window.dispatchEvent(new CustomEvent('ultron:stark-silent-command', {
    detail: event.detail || {}
  }));
});

window.dispatchEvent(new CustomEvent('ultron:stark-bootstrap-ready', {
  detail: {
    version: '4.14.0',
    performanceMode: window.ULTRON_PERFORMANCE?.mode || 'full',
    starkCore: Boolean(window.ULTRON_STARK_CORE),
    innerMesh: Boolean(window.ULTRON_STARK_MESH),
    advanced: Boolean(window.ULTRON_STARK_ADVANCED),
    neuralInput: Boolean(window.ULTRON_NEURAL_INPUT),
    vision: Boolean(window.ULTRON_VISION),
    handGestures: Boolean(window.ULTRON_HAND_GESTURES),
    palmMatrix: Boolean(window.ULTRON_PALM_MATRIX),
    cameraPreview: Boolean(window.ULTRON_CAMERA_PREVIEW),
    cameraRuntime: Boolean(window.ULTRON_CAMERA_RUNTIME),
    zoomDiagnostics: Boolean(window.ULTRON_ZOOM_DIAGNOSTICS),
    productionBridge: Boolean(window.ULTRON_STARK_PRODUCTION),
    localFiles: Boolean(window.ULTRON_LOCAL_FILES),
    localFilesV2: Boolean(window.ULTRON_LOCAL_FILES_V2),
    localRagBridge: Boolean(window.ULTRON_LOCAL_RAG_BRIDGE),
    fileMesh: Boolean(window.ULTRON_FILE_MESH),
    neuralParity: Boolean(window.ULTRON_NEURAL_PARITY),
    backendVersionCheck: Boolean(window.ULTRON_BACKEND_VERSION)
  }
}));
