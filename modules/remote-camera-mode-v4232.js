const PATCH_KEY = '__ULTRON_REMOTE_CAMERA_MODE_V4232__';

if (!window[PATCH_KEY]) {
  window[PATCH_KEY] = true;

  const output = document.getElementById('output-box');
  const input = document.getElementById('command-input');
  const sendButton = document.getElementById('btn-send');
  const btnCamera = document.getElementById('btn-camera');
  const btnStop = document.getElementById('btn-stop-camera');
  const screenModal = document.getElementById('screen-modal');
  const sourceVideo = document.getElementById('webcam');

  let bypassSendCapture = false;
  let visionPatched = false;

  function log(message, alert = false) {
    if (!output || !message) return;
    const line = document.createElement('p');
    if (alert) line.className = 'alert';
    const time = new Date().toLocaleTimeString('pt-BR', { hour12: false });
    line.textContent = `> [${time}] [REMOTE-MODE] ${message}`;
    output.appendChild(line);
    output.scrollTop = output.scrollHeight;
  }

  function normalize(text) {
    return String(text || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  }

  function isExplicitRemoteCameraAction(text) {
    const value = normalize(text);
    if (!value) return false;
    if (value === 'camera' || value === 'mostrar tela') return true;
    const hasCamera = /\b(camera|sensor visual|optical sensor|visual sensor|ultron bridge)\b/.test(value);
    const hasAction = /\b(mostrar|mostre|abrir|abra|ativar|ative|ligar|ligue|conectar|conecte|usar|use|ver|exibir|exiba)\b/.test(value);
    return hasCamera && hasAction;
  }

  function isCameraQuestion(text) {
    const value = normalize(text);
    if (!/\b(camera|ultron bridge|sensor visual|optical sensor|visual sensor)\b/.test(value)) return false;
    return /^(por que|porque|pq|como|qual|quando|onde|o que|e por que|e porque)\b/.test(value) || value.includes('?');
  }

  function rewriteCameraQuestion(text) {
    return String(text || '')
      .replace(/câmera ultron bridge/gi, 'sensor visual remoto do Ultron Bridge')
      .replace(/camera ultron bridge/gi, 'sensor visual remoto do Ultron Bridge')
      .replace(/câmera/gi, 'sensor visual remoto')
      .replace(/camera/gi, 'sensor visual remoto');
  }

  function openSensorPanel() {
    screenModal?.classList.add('open');
    screenModal?.setAttribute('aria-hidden', 'false');
  }

  async function showRemoteCamera({ openPanel = true } = {}) {
    if (openPanel) openSensorPanel();

    const display = window.ULTRON_REMOTE_CAMERA_DISPLAY;
    if (display?.active && display.stream) {
      await display.attach(display.stream).catch(() => {});
      log('Optical Sensor usando a câmera do celular já conectada.');
      return true;
    }

    const mobile = window.ULTRON_MOBILE_CAMERA;
    if (!mobile?.useBridgeCamera) {
      log('Ultron Bridge ainda não ficou disponível nesta página.', true);
      return false;
    }

    log('Ativando a câmera do celular para exibição no Optical Sensor. A webcam do Windows permanecerá desligada.');
    await mobile.useBridgeCamera();
    return true;
  }

  function stopRemoteCamera() {
    try { window.ULTRON_MOBILE_CAMERA?.stopBridgeCamera?.(); } catch {}
    try { window.ULTRON_REMOTE_CAMERA_DISPLAY?.detach?.({ stopTracks: true }); } catch {}
    screenModal?.classList.remove('open');
    screenModal?.setAttribute('aria-hidden', 'true');
    log('Câmera remota do celular desligada pelo operador.');
  }

  function waitForRemoteFrame(timeoutMs = 14000) {
    if (sourceVideo?.readyState >= 2 && sourceVideo.videoWidth > 0 && window.ULTRON_REMOTE_CAMERA_DISPLAY?.active) {
      return Promise.resolve(true);
    }
    return new Promise((resolve) => {
      const started = Date.now();
      const timer = setInterval(() => {
        const ready = Boolean(
          sourceVideo?.readyState >= 2 &&
          sourceVideo.videoWidth > 0 &&
          sourceVideo.videoHeight > 0 &&
          window.ULTRON_REMOTE_CAMERA_DISPLAY?.active
        );
        if (ready || Date.now() - started >= timeoutMs) {
          clearInterval(timer);
          resolve(ready);
        }
      }, 150);
    });
  }

  function patchVisionRuntime() {
    const vision = window.ULTRON_VISION;
    if (!vision?.analyze || vision.__ultronRemoteCameraModePatched) return false;

    const nativeAnalyze = vision.analyze.bind(vision);
    vision.analyze = async function analyzeRemoteFirst(prompt = '') {
      const readyNow = Boolean(
        sourceVideo?.readyState >= 2 &&
        sourceVideo.videoWidth > 0 &&
        sourceVideo.videoHeight > 0 &&
        window.ULTRON_REMOTE_CAMERA_DISPLAY?.active
      );

      if (!readyNow) {
        await showRemoteCamera({ openPanel: false }).catch((error) => {
          log(error?.message || String(error), true);
        });
        const ready = await waitForRemoteFrame();
        if (!ready) {
          log('O Bridge está conectado, mas nenhum frame remoto chegou ao Optical Sensor. A webcam do Windows não será usada como fallback.', true);
          return null;
        }
      }

      return nativeAnalyze(prompt);
    };

    vision.__ultronRemoteCameraModePatched = true;
    visionPatched = true;
    return true;
  }

  function cameraStatusText() {
    const display = window.ULTRON_REMOTE_CAMERA_DISPLAY;
    const state = window.ULTRON_MOBILE_CAMERA?.state || {};
    if (display?.active && sourceVideo?.videoWidth) {
      return `ULTRON BRIDGE ONLINE // ${sourceVideo.videoWidth}×${sourceVideo.videoHeight}`;
    }
    if (String(state.mode || '').startsWith('bridge')) return 'ULTRON BRIDGE // CONECTANDO';
    return 'ULTRON BRIDGE // STANDBY';
  }

  document.addEventListener('click', (event) => {
    const target = event.target?.closest?.('button');
    if (!target) return;

    if (target === btnCamera || target.matches('[data-command="camera"]')) {
      event.preventDefault();
      event.stopImmediatePropagation();
      showRemoteCamera().catch((error) => log(error?.message || String(error), true));
      return;
    }

    if (target === btnStop) {
      event.preventDefault();
      event.stopImmediatePropagation();
      stopRemoteCamera();
      return;
    }

    if (target === sendButton && !bypassSendCapture) {
      const command = String(input?.value || '').trim();
      if (!command) return;

      if (isExplicitRemoteCameraAction(command)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (input) input.value = '';
        log(`OPERATOR: ${command}`);
        showRemoteCamera().catch((error) => log(error?.message || String(error), true));
        return;
      }

      if (isCameraQuestion(command)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (input) input.value = rewriteCameraQuestion(command);
        bypassSendCapture = true;
        queueMicrotask(() => {
          try { sendButton?.click(); } finally { bypassSendCapture = false; }
        });
      }
    }
  }, true);

  input?.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' || event.shiftKey) return;
    const command = String(input.value || '').trim();
    if (!command) return;

    if (isExplicitRemoteCameraAction(command)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      input.value = '';
      log(`OPERATOR: ${command}`);
      showRemoteCamera().catch((error) => log(error?.message || String(error), true));
      return;
    }

    if (isCameraQuestion(command)) {
      input.value = rewriteCameraQuestion(command);
    }
  }, true);

  window.addEventListener('ultron:camera-frame-ready', (event) => {
    const detail = event.detail || {};
    if (!window.ULTRON_REMOTE_CAMERA_DISPLAY?.active) return;
    const cameraState = document.getElementById('camera-state');
    const permissionState = document.getElementById('permission-state');
    if (cameraState) cameraState.textContent = 'ONLINE';
    if (permissionState) permissionState.textContent = 'REMOTE BRIDGE';
    log(`Frame remoto visível no painel (${detail.width || sourceVideo?.videoWidth || '?'}×${detail.height || sourceVideo?.videoHeight || '?'}).`);
  });

  const visionPatchTimer = setInterval(() => {
    if (patchVisionRuntime()) clearInterval(visionPatchTimer);
  }, 100);
  setTimeout(() => clearInterval(visionPatchTimer), 20000);
  patchVisionRuntime();

  window.ULTRON_REMOTE_CAMERA_MODE = {
    show: showRemoteCamera,
    stop: stopRemoteCamera,
    status: cameraStatusText,
    isExplicitRemoteCameraAction,
    isCameraQuestion,
    get visionPatched() { return visionPatched; },
    get version() { return '4.23.2'; }
  };
}
