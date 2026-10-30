import API_CONFIG from "../config.js";
import "./camera-hardening-v422.js";

const opticalPanel = document.querySelector('.optical-panel');
const video = document.getElementById('webcam');
const output = document.getElementById('output-box');
const API_BASE = String(API_CONFIG?.backendUrl || '').replace(/\/$/, '');

if (opticalPanel && video) {
  const BRIDGE_AUTH_KEY = 'ultron_remote_camera_authorized_v1';
  const BRIDGE_ONLINE_MAX_AGE_MS = 20000;
  const AUTO_CONNECT_SESSION_KEY = 'ultron_mobile_camera_auto_v4250';

  let mode = 'automatic';
  let bridgeDeviceId = null;
  let bridgePollTimer = null;
  let bridgePolling = false;
  let peerConnection = null;
  let peerStarting = false;
  let bridgeSessionId = '';
  let remoteDescriptionReady = false;
  let pendingRemoteIce = [];
  let iceMode = 'STUN';

  function log(message, alert = false) {
    if (!output) return;
    const line = document.createElement('p');
    if (alert) line.className = 'alert';
    const time = new Date().toLocaleTimeString('pt-BR', { hour12: false });
    line.textContent = `> [${time}] [MOBILE-CAM] ${message}`;
    output.appendChild(line);
    output.scrollTop = output.scrollHeight;
  }

  function setText(id, value) {
    const element = document.getElementById(id);
    if (element) element.textContent = String(value);
  }

  const ui = document.createElement('div');
  ui.className = 'mobile-camera-source-v420';
  ui.innerHTML = `
    <button type="button" class="hud-button primary" data-mobile-camera-bridge>CONECTAR CÂMERA DO CELULAR</button>
    <small data-mobile-camera-status>Ultron Bridge é a fonte principal. Após o primeiro pareamento, a reconexão é automática.</small>
  `;

  const controls = opticalPanel.querySelector('.controls');
  controls?.before(ui);
  const bridgeButton = ui.querySelector('[data-mobile-camera-bridge]');
  const status = ui.querySelector('[data-mobile-camera-status]');

  function setStatus(text, alert = false) {
    if (!status) return;
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
    if (!response.ok || data?.ok === false) throw new Error(data?.error || `HTTP ${response.status}`);
    return data;
  }

  function deviceAgeMs(device) {
    const lastSeen = Date.parse(device?.lastSeenAt || '') || 0;
    return lastSeen ? Date.now() - lastSeen : Number.POSITIVE_INFINITY;
  }

  async function listMobileDevices() {
    const key = memoryKey();
    if (!key) throw new Error('Identidade do Ultron ainda não carregada.');
    const result = await post('/api/devices/list', { memoryKey: key });
    return (result.devices || [])
      .filter((device) => device?.deviceType === 'mobile' && device?.status !== 'disabled')
      .sort((a, b) => (Date.parse(b?.lastSeenAt || '') || 0) - (Date.parse(a?.lastSeenAt || '') || 0));
  }

  async function selectBridgeDevice() {
    const mobiles = await listMobileDevices();
    if (!mobiles.length) throw new Error('Nenhum celular pareado. Use CONECTAR CELULAR para gerar o código uma única vez.');
    const online = mobiles.find((device) => deviceAgeMs(device) <= BRIDGE_ONLINE_MAX_AGE_MS) || null;
    if (!online) {
      const last = mobiles[0];
      setText('bridge-device-name', last?.deviceName || 'CELULAR PAREADO');
      throw new Error('Celular pareado, mas offline. Abra o Ultron Bridge no celular e toque em INICIAR BRIDGE.');
    }
    bridgeDeviceId = online.id;
    setText('bridge-device-name', online.deviceName || 'ULTRON MOBILE BRIDGE');
    setText('bridge-link-state', 'ONLINE');
    setText('bridge-session-state', 'READY');
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

  async function refreshIceServers() {
    const key = memoryKey();
    if (!key) return { iceServers: [], turnConfigured: false };
    try {
      const result = await post('/api/webrtc/ice', { memoryKey: key });
      const servers = Array.isArray(result?.iceServers) ? result.iceServers : [];
      if (servers.length && window.ULTRON_REMOTE_CAMERA_ICE?.setTurnServers) {
        window.ULTRON_REMOTE_CAMERA_ICE.setTurnServers(servers);
      }
      iceMode = result?.turnConfigured ? 'TURN' : 'STUN';
      setText('turn-state', result?.turnConfigured ? 'TURN READY' : 'STUN DIRECT');
      setText('infra-ice-path', result?.turnConfigured ? 'STUN → TURN AUTO' : 'STUN');
      return result;
    } catch (error) {
      iceMode = 'STUN';
      setText('turn-state', 'STUN FALLBACK');
      setText('infra-ice-path', 'STUN');
      log(`TURN não carregado; mantendo STUN: ${error?.message || error}`, true);
      return { iceServers: [], turnConfigured: false };
    }
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

  function waitForIceGatheringComplete(peer, timeoutMs = 4200) {
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
    if (!stream?.getVideoTracks?.().length) throw new Error('Stream WebRTC chegou sem vídeo.');
    if (!controller) throw new Error('Controlador óptico ainda não carregado.');

    mode = 'bridge';
    video.removeAttribute('src');
    await controller.activateStream(stream, { restored: true });
    localStorage.setItem(BRIDGE_AUTH_KEY, 'yes');
    setStatus(`CÂMERA ONLINE // ${iceMode}`);
    setText('bridge-camera-state', 'ONLINE');
    setText('bridge-session-state', 'STREAMING');
    setText('permission-state', 'MOBILE OPTICAL LINK');
    log(`Câmera do celular conectada ao Optical Sensor por WebRTC (${iceMode}).`);
    window.dispatchEvent(new CustomEvent('ultron:mobile-camera-source', {
      detail: { mode, active: true, source: 'ULTRON_BRIDGE_WEBRTC', deviceId: bridgeDeviceId, iceMode }
    }));
    window.ULTRON_HAND_GESTURES?.enable?.();
  }

  async function beginBridgePeer() {
    if (peerStarting || peerConnection) return;
    if (!window.RTCPeerConnection) throw new Error('WebRTC não está disponível neste navegador.');
    if (!bridgeDeviceId) await selectBridgeDevice();

    peerStarting = true;
    await refreshIceServers();
    bridgeSessionId = crypto.randomUUID?.() || `cam-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    remoteDescriptionReady = false;
    pendingRemoteIce = [];

    const peer = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.cloudflare.com:3478' }],
      bundlePolicy: 'max-bundle',
      iceCandidatePoolSize: 4
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
      setText('infra-webrtc', state.toUpperCase());
      if (state === 'failed') {
        setStatus(iceMode === 'TURN' ? 'WEBRTC FALHOU // RECONECTANDO' : 'P2P FALHOU // TENTANDO RECUPERAR', true);
        setText('bridge-camera-state', 'RECONNECTING');
        log('A conexão WebRTC da câmera falhou. O Ultron manterá a autorização e tentará renegociar.', true);
        closeBridgePeer();
      } else if (state === 'disconnected') {
        setStatus('CÂMERA // RECONECTANDO', true);
        setText('bridge-camera-state', 'RECONNECTING');
      } else if (state === 'connected') {
        setStatus(`CÂMERA ONLINE // ${iceMode}`);
        setText('bridge-camera-state', 'ONLINE');
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
    setStatus(`NEGOCIANDO VÍDEO // ${iceMode}`);
    setText('bridge-session-state', 'NEGOTIATING');
    log(`Oferta WebRTC enviada ao celular (${iceMode}).`);
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
        setStatus('PERMISSÃO SALVA // CONECTANDO');
        beginBridgePeer().catch((error) => {
          peerStarting = false;
          closeBridgePeer();
          setStatus(error?.message || String(error), true);
          log(error?.message || String(error), true);
        });
      } else if (state === 'blocked') {
        setStatus('AUTORIZE A CÂMERA UMA ÚNICA VEZ NO CELULAR', true);
      } else if (state === 'active') {
        setStatus(`CÂMERA ONLINE // ${iceMode}`);
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
      if (remoteDescriptionReady) await peerConnection.addIceCandidate(candidate).catch(() => {});
      else pendingRemoteIce.push(candidate);
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
      if (bridgePolling) bridgePollTimer = setTimeout(pollBridgeCameraEvents, 420);
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
    setStatus(remembered ? 'RECONECTANDO CÂMERA DO CELULAR' : 'PRIMEIRO USO // AUTORIZE NO CELULAR');
    setText('bridge-session-state', 'CONNECTING');
    setText('bridge-camera-state', 'CONNECTING');

    await sendBridgeAction('camera.request', {
      title: 'Ultron Optical Sensor',
      text: remembered ? 'Reconectando câmera remota.' : 'Autorize a câmera uma única vez para o Optical Sensor.'
    });

    log(`Conectando ${device.deviceName || 'Ultron Bridge'} ao Optical Sensor.`);
    return true;
  }

  async function smartConnect({ silent = false } = {}) {
    try {
      return await useBridgeCamera();
    } catch (error) {
      const message = String(error?.message || error);
      if (/Nenhum celular pareado/i.test(message) && window.ULTRON_DEVICES?.startPairing) {
        const result = await window.ULTRON_DEVICES.startPairing('mobile', 'Ultron Mobile Bridge');
        setStatus(`PAREAMENTO: DIGITE ${result.code} NO APP ULTRON BRIDGE`);
        setText('bridge-link-state', 'PAIRING');
        setText('bridge-session-state', `CODE ${result.code}`);
        if (!silent) log(`Primeiro uso: digite ${result.code} no Ultron Bridge. Depois toque em INICIAR BRIDGE; a câmera conectará automaticamente.`);
        return false;
      }
      setStatus(message, true);
      setText('bridge-link-state', 'OFFLINE');
      if (!silent) log(message, true);
      if (silent) return false;
      throw error;
    }
  }

  bridgeButton?.addEventListener('click', () => {
    smartConnect().catch(() => {});
  });

  window.addEventListener('beforeunload', () => {
    bridgePolling = false;
    if (bridgePollTimer) clearTimeout(bridgePollTimer);
    closeBridgePeer({ notify: false });
  });

  window.ULTRON_MOBILE_CAMERA = {
    smartConnect,
    useBridgeCamera,
    async useVirtualCamera() {
      throw new Error('Câmera virtual foi removida do fluxo principal. Use Ultron Bridge.');
    },
    async useNetworkUrl() {
      throw new Error('Conexão manual por URL foi removida do fluxo principal. Use Ultron Bridge.');
    },
    stopBridgeCamera() {
      closeBridgePeer({ notify: true });
      if (mode === 'bridge') window.ULTRON_CAMERA_CONTROLLER?.stop?.({ silent: true });
      mode = 'automatic';
      setText('bridge-camera-state', 'STANDBY');
      setText('bridge-session-state', 'READY');
    },
    refreshIceServers,
    get state() {
      return {
        mode,
        bridgeDeviceId,
        bridgeAuthorized: localStorage.getItem(BRIDGE_AUTH_KEY) === 'yes',
        active: video.readyState >= 2 && video.videoWidth > 0,
        iceMode
      };
    }
  };

  if (localStorage.getItem(BRIDGE_AUTH_KEY) === 'yes' && !sessionStorage.getItem(AUTO_CONNECT_SESSION_KEY)) {
    sessionStorage.setItem(AUTO_CONNECT_SESSION_KEY, '1');
    setTimeout(() => smartConnect({ silent: true }).catch(() => {}), 1400);
  }
}
