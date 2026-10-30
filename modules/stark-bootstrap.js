const BOOT_KEY = '__ULTRON_STARK_BOOTSTRAP_V4250__';

if (!window[BOOT_KEY]) {
  window[BOOT_KEY] = true;

  const STYLE_ID = 'ultron-stark-core-style';
  const FUNCTIONAL_STYLE_ID = 'ultron-stark-functional-style';
  const HAND_STYLE_ID = 'ultron-stark-hand-style';
  const CAMERA_PREVIEW_STYLE_ID = 'ultron-stark-camera-preview-style';
  const ZOOM_DIAGNOSTICS_STYLE_ID = 'ultron-stark-zoom-diagnostics-style';
  const PALM_MATRIX_STYLE_ID = 'ultron-palm-matrix-style';
  const LOCAL_FILES_STYLE_ID = 'ultron-local-files-style';
  const FILE_MESH_STYLE_ID = 'ultron-stark-file-mesh-style';
  const MOBILE_PERF_STYLE_ID = 'ultron-mobile-performance-style';
  const GESTURE_V420_STYLE_ID = 'ultron-neural-gesture-v420-style';
  const NEURAL_FOCUS_STYLE_ID = 'ultron-neural-focus-v4250-style';

  function loadStyle(id, href) {
    if (document.getElementById(id)) return;
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
  }

  loadStyle(MOBILE_PERF_STYLE_ID, 'modules/mobile-performance.css?v=4.24.0');
  await import('./mobile-performance.js?v=4.24.0');

  loadStyle(STYLE_ID, 'modules/stark-core.css?v=4.12.1');
  loadStyle(FUNCTIONAL_STYLE_ID, 'modules/stark-functional.css?v=4.12.1');
  loadStyle(HAND_STYLE_ID, 'modules/stark-hand.css?v=4.19.0');
  loadStyle(CAMERA_PREVIEW_STYLE_ID, 'modules/stark-camera-preview.css?v=4.23.2');
  loadStyle(ZOOM_DIAGNOSTICS_STYLE_ID, 'modules/stark-zoom-diagnostics.css?v=4.12.1');
  loadStyle(PALM_MATRIX_STYLE_ID, 'modules/palm-matrix.css?v=4.12.1');
  loadStyle(LOCAL_FILES_STYLE_ID, 'modules/local-files.css?v=4.12.1');
  loadStyle(FILE_MESH_STYLE_ID, 'modules/stark-file-mesh.css?v=4.19.0');
  loadStyle(GESTURE_V420_STYLE_ID, 'modules/neural-gesture-v420.css?v=4.20.0');

  await import('./stark-core.js?v=4.12.1');
  await import('./stark-inner-mesh.js?v=4.12.1');
  await import('./neural-live.js?v=4.20.0');
  await import('./neural-input-bus.js?v=4.18.0');
  await import('./neural-command-router.js?v=4.20.0');
  await import('./stark-advanced.js?v=4.12.1');
  await import('./vision-client.js?v=4.23.2');
  await import('./vision-remote-source-v4224.js?v=4.22.4');
  await import('./vision-command-router.js?v=4.17.0');
  await import('./camera-runtime.js?v=4.16.0');
  await import('./camera-external-stream-v4223.js?v=4.22.3');
  await import('./remote-camera-display-v4232.js?v=4.23.2');
  await import('./local-files-client.js?v=4.14.0');
  await import('./local-files-v2.js?v=4.14.0');
  await import('./local-files-ai-bridge.js?v=4.14.0');
  await import('./stark-file-mesh.js?v=4.20.0');
  await import('./file-inspector-v420.js?v=4.20.0');
  await import('./remote-camera-webrtc-hotfix-v4221.js?v=4.24.2');
  await import('./mobile-camera-source.js?v=4.25.0');
  await import('./stark-hand-gesture-v420.js?v=4.20.0');
  await import('./stark-camera-preview.js?v=4.23.2');
  await import('./visual-neural-stream-bridge-v4225.js?v=4.23.0');
  await import('./remote-camera-frame-gate-v4230.js?v=4.23.2');
  await import('./remote-camera-mode-v4232.js?v=4.23.2');
  await import('./palm-matrix-v420.js?v=4.20.0');
  await import('./neural-file-visualizer.js?v=4.20.0');
  await import('./stark-zoom-diagnostics.js?v=4.12.1');
  await import('./stark-production-bridge.js?v=4.12.1');
  await import('./backend-version-check.js?v=4.15.0');
  await import('./neural-parity.js?v=4.18.0');

  loadStyle(NEURAL_FOCUS_STYLE_ID, 'modules/neural-focus-v4250.css?v=4.25.0');
  await import('./neural-spatial-control-v4250.js?v=4.25.0');
  await import('./mobile-link-simple-v4250.js?v=4.25.0');

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
      version: '4.25.0',
      performanceMode: window.ULTRON_PERFORMANCE?.mode || 'full',
      starkCore: Boolean(window.ULTRON_STARK_CORE),
      innerMesh: Boolean(window.ULTRON_STARK_MESH),
      advanced: Boolean(window.ULTRON_STARK_ADVANCED),
      neuralInput: Boolean(window.ULTRON_NEURAL_INPUT),
      neuralCommandRouter: Boolean(window.ULTRON_NEURAL_COMMAND),
      neuralVisualPanel: Boolean(window.ULTRON_VISUAL_PANEL),
      neuralFileVisuals: Boolean(window.ULTRON_NEURAL_FILE_VISUALS),
      neuralSpatial360: Boolean(window.ULTRON_NEURAL_3D),
      vision: Boolean(window.ULTRON_VISION),
      visionDiagnostics: Boolean(window.ULTRON_VISION?.diagnose),
      visionImageFallback: Boolean(window.ULTRON_VISION?.analyzeFile),
      visionRemoteSource: Boolean(window.ULTRON_VISION_REMOTE_SOURCE),
      visionCommandRouter: Boolean(window.ULTRON_VISION_ROUTER),
      handGestures: Boolean(window.ULTRON_HAND_GESTURES),
      handControlModel: 'HAND MOVE=ROTATE 360 / HAND DEPTH=ZOOM / PALM ROTATION=ROLL / INDEX=POINTER / PINCH=SELECT',
      palmMatrix: Boolean(window.ULTRON_PALM_MATRIX),
      cameraPreview: Boolean(window.ULTRON_CAMERA_PREVIEW),
      visualNeuralStreamBridge: Boolean(window.ULTRON_VISUAL_NEURAL_STREAM),
      remoteCameraFrameGate: Boolean(window.ULTRON_REMOTE_CAMERA_FRAME_GATE),
      remoteCameraDisplay: Boolean(window.ULTRON_REMOTE_CAMERA_DISPLAY),
      remoteCameraMode: Boolean(window.ULTRON_REMOTE_CAMERA_MODE),
      cameraRuntime: Boolean(window.ULTRON_CAMERA_RUNTIME),
      externalCameraStreamAdapter: Boolean(window.ULTRON_EXTERNAL_CAMERA_STREAM),
      mobileCamera: Boolean(window.ULTRON_MOBILE_CAMERA),
      mobileCameraBridge: Boolean(window.ULTRON_MOBILE_CAMERA?.smartConnect),
      mobileLinkSimple: Boolean(window.ULTRON_MOBILE_LINK),
      remoteCameraWebRtcHotfix: Boolean(window.__ULTRON_REMOTE_CAMERA_WEBRTC_V4242__),
      cameraDiagnostics: Boolean(window.ULTRON_CAMERA_RUNTIME?.diagnostics),
      zoomDiagnostics: Boolean(window.ULTRON_ZOOM_DIAGNOSTICS),
      productionBridge: Boolean(window.ULTRON_STARK_PRODUCTION),
      localFiles: Boolean(window.ULTRON_LOCAL_FILES),
      localFilesV2: Boolean(window.ULTRON_LOCAL_FILES_V2),
      localRagBridge: Boolean(window.ULTRON_LOCAL_RAG_BRIDGE),
      fileMesh: Boolean(window.ULTRON_FILE_MESH),
      fileInspector: Boolean(window.ULTRON_FILE_INSPECTOR),
      neuralParity: Boolean(window.ULTRON_NEURAL_PARITY),
      backendVersionCheck: Boolean(window.ULTRON_BACKEND_VERSION)
    }
  }));
}