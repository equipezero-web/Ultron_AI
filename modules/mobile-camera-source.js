import API_CONFIG from "../config.js";
import "./camera-hardening-v422.js";

const opticalPanel = document.querySelector('.optical-panel');
const video = document.getElementById('webcam');
const output = document.getElementById('output-box');
const API_BASE = String(API_CONFIG?.backendUrl || '').replace(/\/$/, '');

if (opticalPanel && video) {
  const VIRTUAL_RE = /droidcam|iriun|camo|epoccam|ndi|phone link|virtual/i;
  const NETWORK_KEY = 'ultron_mobile_camera_url_v1';
  const BRIDGE_AUTH_KEY = 'ultron_remote_camera_authorized_v1';
  const BRIDGE_ONLINE_MAX_AGE_MS = 15000;

  let mode = 'automatic';
  let networkUrl = localStorage.getItem(NETWORK_KEY) || '';
  let syntheticStream = null;
  let bridgeDeviceId = null;
  let bridgePollTimer = null;
  let bridgePolling = false;
  let peerConnection = null;
  let peerStarting = false;
  let bridgeSessionId = '';
  let remoteDescriptionReady = false;
  let pendingRemoteIce = [];

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
    <button type="button" class="hud-button primary" data-mobile-camera-bridge>CÂMERA ULTRON BRIDGE</button>
    <button type="button" class="hud-button" data-mobile-camera-auto>CÂMERA VIRTUAL (DROIDCAM/IRIUN)</button>
    <div class="mobile-camera-row">
      <input type="url" data-mobile-camera-url placeholder="URL HTTPS/WebRTC/browser-playable do stream do celular" inputmode="url">
      <button type="button" class="hud-button" data-mobile-camera-connect>CONECTAR IP</button>
    </div>
    <small data-mobile-camera-status>Recomendado: Ultron Bridge. A câmera é autorizada uma única vez no Android e depois reutilizada automaticamente.</small>
  `;

  const controls = opticalPanel.querySelector('.controls');
  controls?.before(ui);
  const bridgeButton = ui.querySelector('[data-mobile-camera-bridge]');
  const autoButton = ui.querySelector('[data-mobile-camera-auto]');
  const urlInput = ui.querySelector('[data-mobile-camera-url]');
  const connectButton = ui.querySelector('[data-mobile-camera-connect]');
  const status = ui.querySelector('[data-mobile-camera-status]');
  urlInput.value = networkUrl;

  function setStatus(text, alert = false) {
    status.textContent = text;
    status.style.color = alert ? '#ff9a70' : '';
  }

  function memoryKey() {
    return window.ULTRON_MEMORY?.getMemoryKey?.() || null;
  }

  async function post(path, payload = {}) {
    if (!API_BASE) throw new Error('Backend do Ultron não configurado.');
    const response = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify(payload)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data?.ok === false) {
      throw new Error(data?.error || `HTTP ${response.status}`);
    }
    return data;
  }

  function deviceAgeMs(device) {
    const lastSeen = Date.parse(device?.lastSeenAt || '') || 0;
    return lastSeen ? Date.now() - lastSeen : Number.POSITIVE_INFINITY;
  }

  async function selectBridgeDevice() {
    const key = memoryKey();
    if (!key) throw new Error('Identidade do Ultron ainda não carregada.');
    const result = await post('/api/devices/list', { memoryKey: key });
    const mobiles = (result.devices || [])
      .filter((device) => device?.deviceType === 'mobile' && device?.status !== 'disabled')
      .sort((a, b) => (Date.parse(b?.lastSeenAt || '') || 0) - (Date.parse(a?.lastSeenAt || '') || 0));
    const online = mobiles.find((device) => deviceAgeMs(device) <= BRIDGE_ONLINE_MAX_AGE_MS) || null;
    if (!online) {
      throw new Error('Celular pareado não está online. Abra o Ultron Bridge no celular e toque em INICIAR BRIDGE.');
    }
    bridgeDeviceId = online.id;
    return online;
  }

  async function sendBridgeAction(action, payload = {}) {
    const key = memoryKey();
    if (!key) throw new Error('Identidade do operador indisponível.');
    if (!bridgeDeviceId) await selectBridgeDevice();
    return post('/api/devices/command', {
      memoryKey: key,
      deviceId: bridgeDeviceId,
      command: 'notification.push',
      payload: { action, ...payload }
    });
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

  function closeBridgePeer({ notify = false } = {}) {
    const oldMode = mode;
    peerStarting = false;
    remoteDescriptionReady = false;
    pendingRemoteIce = [];
    bridgeSessionId = '';
    if (peerConnection) {
      try { peerConnection.ontrack = null; } catch {}
      try { peerConnection.close(); } catch {}
      peerConnection = null;
    }
    if (notify && oldMode === 'bridge' && bridgeDeviceId) {
      sendBridgeAction('camera.stop').catch(() => {});
    }
  }

  function waitForIceGatheringComplete(peer, timeoutMs = 3200) {
    if (!peer || peer.iceGatheringState === 'complete') return Promise.resolve();
    return new Promise((resolve) => {
      const started = Date.now();
      const timer = setInterval(() => {
        if (!peer || peer.iceGatheringState === 'complete' || Date.now() - started >= timeoutMs) {
          clearInterval(timer);
          resolve();
        }
      }, 80);
    });
  }

  async function activateRemoteStream(stream) {
    const controller = window.ULTRON_CAMERA_CONTROLLER;
    if (!stream?.getVideoTracks?.().length) throw new Error('Stream WebRTC do celular chegou sem faixa de vídeo.');
    if (!controller) throw new Error('Controlador de câmera ainda não carregado.');

    mode = 'bridge';
    syntheticStream?.getTracks?.().forEach((track) => track.stop());
    syntheticStream = null;
    video.removeAttribute('src');
    await controller.activateStream(stream, { restored: true });
    localStorage.setItem(BRIDGE_AUTH_KEY, 'yes');
    setStatus('CÂMERA DO CELULAR ONLINE // ULTRON BRIDGE WEBRTC');
    log('Câmera do celular conectada diretamente ao Neural Command por WebRTC. A webcam do computador não é necessária.');
    window.dispatchEvent(new CustomEvent('ultron:mobile-camera-source', {
      detail: { mode, active: true, source: 'ULTRON_BRIDGE_WEBRTC', deviceId: bridgeDeviceId }
    }));
    window.ULTRON_HAND_GESTURES?.enable?.();
  }

  async function beginBridgePeer() {
    if (peerStarting || peerConnection) return;
    if (!window.RTCPeerConnection) throw new Error('WebRTC não está disponível neste navegador.');
    if (!bridgeDeviceId) await selectBridgeDevice();

    peerStarting = true;
    bridgeSessionId = crypto.randomUUID?.() || `cam-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    remoteDescriptionReady = false;
    pendingRemoteIce = [];

    const peer = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
      bundlePolicy: 'max-bundle'
    });
    peerConnection = peer;

    peer.ontrack = (event) => {
      const stream = event.streams?.[0] || new MediaStream([event.track]);
      activateRemoteStream(stream).catch((error) => {
        setStatus(error?.message || String(error), true);
        log(error?.message || String(error), true);
      });
    };

    peer.onconnectionstatechange = () => {
      const state = String(peer.connectionState || 'unknown');
      if (state === 'failed') {
        setStatus('WEBRTC FALHOU // TENTE NOVAMENTE', true);
        log('A sessão WebRTC da câmera falhou. A permissão do Android continua salva.', true);
        closeBridgePeer();
      } else if (state === 'disconnected') {
        setStatus('CÂMERA DO CELULAR // RECONECTANDO', true);
      } else if (state === 'connected') {
        setStatus('CÂMERA DO CELULAR ONLINE // WEBRTC');
      }
    };

    peer.addTransceiver('video', { direction: 'recvonly' });
    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    await waitForIceGatheringComplete(peer);

    const local = peer.localDescription;
    if (!local?.sdp) throw new Error('O navegador não gerou uma oferta WebRTC válida.');

    await sendBridgeAction('camera.webrtc.offer', {
      type: 'offer',
      sdp: local.sdp,
      sessionId: bridgeSessionId
    });
    setStatus('ULTRON BRIDGE // NEGOCIANDO VÍDEO WEBRTC');
    log('Oferta WebRTC enviada ao celular. Aguardando a câmera remota.');
    peerStarting = false;
  }

  async function handleCameraEvent(event) {
    if (!event || (bridgeDeviceId && event.deviceId !== bridgeDeviceId)) return;
    const payload = event.payload || {};
    const eventSessionId = String(payload.sessionId || '');
    if (eventSessionId && bridgeSessionId && eventSessionId !== bridgeSessionId) return;

    if (event.eventType === 'camera.status') {
      const state = String(payload.state || 'unknown');
      const detail = String(payload.detail || '').trim();
      if (detail) log(detail, ['blocked', 'error'].includes(state));

      if (state === 'ready') {
        localStorage.setItem(BRIDGE_AUTH_KEY, 'yes');
        setStatus('PERMISSÃO SALVA // CONECTANDO CÂMERA DO CELULAR');
        beginBridgePeer().catch((error) => {
          peerStarting = false;
          closeBridgePeer();
          setStatus(error?.message || String(error), true);
          log(error?.message || String(error), true);
        });
      } else if (state === 'blocked') {
        setStatus('AUTORIZE UMA ÚNICA VEZ NO ULTRON BRIDGE', true);
      } else if (state === 'active') {
        setStatus('CÂMERA DO CELULAR ONLINE // WEBRTC');
      } else if (state === 'error') {
        setStatus(detail || 'ERRO NA CÂMERA DO CELULAR', true);
      }
      return;
    }

    if (event.eventType === 'camera.webrtc.answer') {
      if (!peerConnection || !payload.sdp) return;
      await peerConnection.setRemoteDescription({ type: 'answer', sdp: payload.sdp });
      remoteDescriptionReady = true;
      for (const candidate of pendingRemoteIce.splice(0)) {
        await peerConnection.addIceCandidate(candidate).catch(() => {});
      }
      return;
    }

    if (event.eventType === 'camera.webrtc.ice') {
      if (!peerConnection || !payload.candidate) return;
      const candidate = {
        candidate: payload.candidate,
        sdpMid: payload.sdpMid ?? null,
        sdpMLineIndex: Number(payload.sdpMLineIndex || 0)
      };
      if (remoteDescriptionReady) {
        await peerConnection.addIceCandidate(candidate).catch(() => {});
      } else {
        pendingRemoteIce.push(candidate);
      }
    }
  }

  async function pollBridgeCameraEvents() {
    if (!bridgePolling) return;
    try {
      const key = memoryKey();
      if (!key) return;
      const result = await post('/api/devices/events/poll', {
        memoryKey: key,
        channel: 'camera',
        limit: 30
      });
      for (const event of result.events || []) {
        await handleCameraEvent(event).catch(() => {});
      }
    } catch (error) {
      console.warn('ULTRON remote camera poll:', error);
    } finally {
      if (bridgePolling) bridgePollTimer = setTimeout(pollBridgeCameraEvents, 450);
    }
  }

  function startBridgePolling() {
    if (bridgePolling) return;
    bridgePolling = true;
    pollBridgeCameraEvents();
  }

  async function useBridgeCamera() {
    const device = await selectBridgeDevice();
    const controller = window.ULTRON_CAMERA_CONTROLLER;
    controller?.stop?.({ silent: true });
    closeBridgePeer();
    mode = 'bridge-pending';
    startBridgePolling();

    const remembered = localStorage.getItem(BRIDGE_AUTH_KEY) === 'yes';
    setStatus(
      remembered
        ? 'PERMISSÃO JÁ REGISTRADA // ATIVANDO CÂMERA DO CELULAR'
        : 'PRIMEIRO USO // AUTORIZE A CÂMERA UMA ÚNICA VEZ NO CELULAR'
    );

    await sendBridgeAction('camera.request', {
      title: 'Ultron quer usar a câmera deste celular',
      text: remembered
        ? 'Permissão já registrada. Ative a câmera remota.'
        : 'Autorize a câmera uma única vez para o Neural Command.'
    });

    log(`Solicitação enviada ao ${device.deviceName || 'Ultron Bridge'}. ${remembered ? 'A autorização anterior será reutilizada.' : 'Na primeira vez, confirme a permissão no Android.'}`);
    return true;
  }

  async function useVirtualCamera() {
    closeBridgePeer({ notify: true });
    const controller = window.ULTRON_CAMERA_CONTROLLER;
    if (!controller) throw new Error('Controlador de câmera ainda não carregado.');
    const devices = await controller.refreshDevices?.({ announce: true }) || [];
    const virtual = devices.find((device) => VIRTUAL_RE.test(device.label || ''));
    if (!virtual) {
      setStatus('Nenhuma câmera virtual detectada. Você pode usar CÂMERA ULTRON BRIDGE sem DroidCam/Iriun.', true);
      log('DroidCam/Iriun não apareceu como videoinput. Use CÂMERA ULTRON BRIDGE para conectar o celular diretamente.', true);
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
    closeBridgePeer({ notify: true });
    const url = String(value || '').trim();
    if (!url) throw new Error('Informe a URL do stream do celular.');
    let parsed;
    try { parsed = new URL(url); } catch { throw new Error('URL do stream inválida.'); }
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error('Use uma URL HTTP/HTTPS reproduzível pelo navegador. RTSP puro não funciona diretamente no elemento de vídeo.');
    }
    if (isMixedContent(url)) {
      throw new Error('A página do Ultron está em HTTPS e o stream está em HTTP. Use CÂMERA ULTRON BRIDGE, câmera virtual ou forneça stream HTTPS/WebRTC.');
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

  bridgeButton.addEventListener('click', () => {
    useBridgeCamera().catch((error) => {
      setStatus(error?.message || String(error), true);
      log(error?.message || String(error), true);
    });
  });

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

  window.addEventListener('beforeunload', () => {
    bridgePolling = false;
    if (bridgePollTimer) clearTimeout(bridgePollTimer);
    closeBridgePeer({ notify: false });
  });

  window.ULTRON_MOBILE_CAMERA = {
    useBridgeCamera,
    useVirtualCamera,
    useNetworkUrl,
    stopBridgeCamera() {
      closeBridgePeer({ notify: true });
      if (mode === 'bridge') window.ULTRON_CAMERA_CONTROLLER?.stop?.({ silent: true });
      mode = 'automatic';
    },
    get state() {
      return {
        mode,
        networkUrl,
        bridgeDeviceId,
        bridgeAuthorized: localStorage.getItem(BRIDGE_AUTH_KEY) === 'yes',
        active: video.readyState >= 2 && video.videoWidth > 0
      };
    }
  };
}
