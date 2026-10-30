const opticalPanel = document.querySelector('.optical-panel');
const video = document.getElementById('webcam');
const output = document.getElementById('output-box');

if (opticalPanel && video) {
  const VIRTUAL_RE = /droidcam|iriun|camo|epoccam|ndi|phone link|virtual/i;
  const NETWORK_KEY = 'ultron_mobile_camera_url_v1';
  let mode = 'automatic';
  let networkUrl = localStorage.getItem(NETWORK_KEY) || '';
  let syntheticStream = null;

  function log(message, alert = false) {
    if (!output) return;
    const line = document.createElement('p');
    if (alert) line.className = 'alert';
    const time = new Date().toLocaleTimeString('pt-BR', { hour12: false });
    line.textContent = `> [${time}] [MOBILE-CAM] ${message}`;
    output.appendChild(line);
    output.scrollTop = output.scrollHeight;
  }

  const ui = document.createElement('div');
  ui.className = 'mobile-camera-source-v420';
  ui.innerHTML = `
    <button type="button" class="hud-button primary" data-mobile-camera-auto>USAR CÂMERA DO CELULAR</button>
    <div class="mobile-camera-row">
      <input type="url" data-mobile-camera-url placeholder="URL HTTPS/WebRTC/browser-playable do stream do celular" inputmode="url">
      <button type="button" class="hud-button" data-mobile-camera-connect>CONECTAR IP</button>
    </div>
    <small data-mobile-camera-status>DroidCam/Iriun: prefira o driver de câmera virtual. Stream IP direto exige formato reproduzível pelo navegador + CORS/HTTPS.</small>
  `;

  const controls = opticalPanel.querySelector('.controls');
  controls?.before(ui);
  const autoButton = ui.querySelector('[data-mobile-camera-auto]');
  const urlInput = ui.querySelector('[data-mobile-camera-url]');
  const connectButton = ui.querySelector('[data-mobile-camera-connect]');
  const status = ui.querySelector('[data-mobile-camera-status]');
  urlInput.value = networkUrl;

  function setStatus(text, alert = false) {
    status.textContent = text;
    status.style.color = alert ? '#ff9a70' : '';
  }

  function isMixedContent(url) {
    try {
      const parsed = new URL(url, location.href);
      return location.protocol === 'https:' && parsed.protocol === 'http:';
    } catch {
      return false;
    }
  }

  function waitForPlayable(timeoutMs = 7000) {
    if (video.readyState >= 2 && video.videoWidth) return Promise.resolve(true);
    return new Promise((resolve) => {
      const started = Date.now();
      const done = () => {
        cleanup();
        resolve(video.readyState >= 2 && video.videoWidth > 0);
      };
      const tick = () => {
        if (video.readyState >= 2 && video.videoWidth) return done();
        if (Date.now() - started > timeoutMs) return done();
        timer = setTimeout(tick, 160);
      };
      const cleanup = () => clearTimeout(timer);
      let timer = setTimeout(tick, 0);
    });
  }

  function syncCompactNetworkPreview(url) {
    const preview = document.querySelector('.stark-camera-feed');
    if (!preview) return;
    try { preview.srcObject = null; } catch {}
    preview.crossOrigin = 'anonymous';
    preview.src = url;
    preview.play().catch(() => {});
  }

  async function useVirtualCamera() {
    const controller = window.ULTRON_CAMERA_CONTROLLER;
    if (!controller) throw new Error('Controlador de câmera ainda não carregado.');
    const devices = await controller.refreshDevices?.({ announce: true }) || [];
    const virtual = devices.find((device) => VIRTUAL_RE.test(device.label || ''));
    if (!virtual) {
      setStatus('Nenhuma câmera virtual do celular detectada. Abra o cliente DroidCam/Iriun no PC e atualize as câmeras.', true);
      log('DroidCam/Iriun não apareceu como videoinput. O app/driver do computador precisa expor a câmera virtual.', true);
      return false;
    }
    video.removeAttribute('src');
    video.load?.();
    mode = 'virtual';
    await controller.selectDevice?.(virtual.deviceId);
    setStatus(`CÂMERA DO CELULAR ONLINE // ${virtual.label}`);
    log(`Sensor principal alterado para ${virtual.label} via câmera virtual.`);
    window.dispatchEvent(new CustomEvent('ultron:mobile-camera-source', {
      detail: { mode, label: virtual.label, deviceId: virtual.deviceId, active: true }
    }));
    return true;
  }

  async function useNetworkUrl(value = urlInput.value) {
    const url = String(value || '').trim();
    if (!url) throw new Error('Informe a URL do stream do celular.');
    let parsed;
    try { parsed = new URL(url); } catch { throw new Error('URL do stream inválida.'); }
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error('Use uma URL HTTP/HTTPS reproduzível pelo navegador. RTSP puro não funciona diretamente no elemento de vídeo.');
    }
    if (isMixedContent(url)) {
      throw new Error('A página do Ultron está em HTTPS e o stream está em HTTP. O navegador pode bloquear Mixed Content. Use DroidCam/Iriun como câmera virtual ou forneça stream HTTPS/WebRTC.');
    }

    const controller = window.ULTRON_CAMERA_CONTROLLER;
    controller?.stop?.({ silent: true });
    syntheticStream?.getTracks?.().forEach((track) => track.stop());
    syntheticStream = null;

    mode = 'network';
    networkUrl = url;
    localStorage.setItem(NETWORK_KEY, url);
    video.pause?.();
    video.srcObject = null;
    video.crossOrigin = 'anonymous';
    video.src = url;
    video.muted = true;
    video.playsInline = true;
    await video.play();
    const ready = await waitForPlayable();
    if (!ready) throw new Error('O navegador não recebeu frames do stream. Confirme formato, CORS, URL e compatibilidade HTML5.');

    try {
      syntheticStream = video.captureStream?.() || video.mozCaptureStream?.() || null;
    } catch {
      syntheticStream = null;
    }
    if (syntheticStream?.getVideoTracks?.().length) {
      controller.stream = syntheticStream;
    }

    syncCompactNetworkPreview(url);
    setStatus(`STREAM DO CELULAR ONLINE // ${video.videoWidth}×${video.videoHeight}`);
    log(`Stream de rede conectado como sensor principal (${video.videoWidth}×${video.videoHeight}).`);
    window.dispatchEvent(new CustomEvent('ultron:camera-stream', {
      detail: {
        active: true,
        restored: false,
        stream: syntheticStream,
        source: 'NETWORK',
        label: 'SMARTPHONE NETWORK STREAM',
        width: video.videoWidth,
        height: video.videoHeight,
        networkUrl: url
      }
    }));
    window.dispatchEvent(new CustomEvent('ultron:mobile-camera-source', {
      detail: { mode, url, active: true, syntheticStream: Boolean(syntheticStream) }
    }));
    window.ULTRON_HAND_GESTURES?.enable?.();
    return true;
  }

  autoButton.addEventListener('click', () => {
    useVirtualCamera().catch((error) => {
      setStatus(error?.message || String(error), true);
      log(error?.message || String(error), true);
    });
  });

  connectButton.addEventListener('click', () => {
    useNetworkUrl().catch((error) => {
      setStatus(error?.message || String(error), true);
      log(error?.message || String(error), true);
    });
  });

  window.ULTRON_MOBILE_CAMERA = {
    useVirtualCamera,
    useNetworkUrl,
    get state() {
      return { mode, networkUrl, active: video.readyState >= 2 && video.videoWidth > 0 };
    }
  };
}
