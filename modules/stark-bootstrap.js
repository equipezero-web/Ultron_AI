const STYLE_ID = 'ultron-stark-core-style';
const FUNCTIONAL_STYLE_ID = 'ultron-stark-functional-style';
const HAND_STYLE_ID = 'ultron-stark-hand-style';
const CAMERA_PREVIEW_STYLE_ID = 'ultron-stark-camera-preview-style';
const ZOOM_DIAGNOSTICS_STYLE_ID = 'ultron-stark-zoom-diagnostics-style';

function loadStyle(id, href) {
  if (document.getElementById(id)) return;
  const link = document.createElement('link');
  link.id = id;
  link.rel = 'stylesheet';
  link.href = href;
  document.head.appendChild(link);
}

loadStyle(STYLE_ID, 'modules/stark-core.css?v=4.9.0');
loadStyle(FUNCTIONAL_STYLE_ID, 'modules/stark-functional.css?v=4.9.0');
loadStyle(HAND_STYLE_ID, 'modules/stark-hand.css?v=4.9.0');
loadStyle(CAMERA_PREVIEW_STYLE_ID, 'modules/stark-camera-preview.css?v=4.9.0');
loadStyle(ZOOM_DIAGNOSTICS_STYLE_ID, 'modules/stark-zoom-diagnostics.css?v=4.9.0');

await import('./stark-core.js?v=4.9.0');
await import('./stark-inner-mesh.js?v=4.9.0');
await import('./neural-input-bus.js?v=4.5.0');
await import('./stark-advanced.js?v=4.5.0');
await import('./vision-client.js?v=4.9.0');
await import('./stark-hand-gesture.js?v=4.9.0');
await import('./stark-camera-preview.js?v=4.9.0');
await import('./camera-runtime.js?v=4.9.0');
await import('./stark-zoom-diagnostics.js?v=4.9.0');
await import('./stark-production-bridge.js?v=4.6.0');

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
    starkCore: Boolean(window.ULTRON_STARK_CORE),
    innerMesh: Boolean(window.ULTRON_STARK_MESH),
    advanced: Boolean(window.ULTRON_STARK_ADVANCED),
    neuralInput: Boolean(window.ULTRON_NEURAL_INPUT),
    vision: Boolean(window.ULTRON_VISION),
    handGestures: Boolean(window.ULTRON_HAND_GESTURES),
    cameraPreview: Boolean(window.ULTRON_CAMERA_PREVIEW),
    cameraRuntime: Boolean(window.ULTRON_CAMERA_RUNTIME),
    zoomDiagnostics: Boolean(window.ULTRON_ZOOM_DIAGNOSTICS),
    productionBridge: Boolean(window.ULTRON_STARK_PRODUCTION)
  }
}));
