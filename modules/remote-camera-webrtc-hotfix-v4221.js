const PATCH_KEY = '__ULTRON_REMOTE_CAMERA_WEBRTC_V4242__';

if (!window[PATCH_KEY] && window.RTCPeerConnection) {
  window[PATCH_KEY] = true;
  // Compatibility markers used by bootstrap/workflow checks from prior releases.
  window.__ULTRON_REMOTE_CAMERA_WEBRTC_V4231__ = true;
  window.__ULTRON_REMOTE_CAMERA_WEBRTC_V4222__ = true;

  const NativeRTCPeerConnection = window.RTCPeerConnection;
  const proto = NativeRTCPeerConnection.prototype;
  const nativeSetLocalDescription = proto.setLocalDescription;
  const nativeSetRemoteDescription = proto.setRemoteDescription;
  const nativeAddIceCandidate = proto.addIceCandidate;
  const ICE_GATHER_TIMEOUT_MS = 12000;
  const ICE_RECOVERY_GRACE_MS = 6500;
  const AUTO_RETRY_COOLDOWN_MS = 12000;
  let lastAutoRetryAt = 0;

  const BASE_ICE_SERVERS = [
    { urls: ['stun:stun.cloudflare.com:3478'] },
    { urls: ['stun:stun.l.google.com:19302'] },
    { urls: ['stun:stun1.l.google.com:19302'] }
  ];

  function log(message, alert = false) {
    const output = document.getElementById('output-box');
    if (!output) return;
    const line = document.createElement('p');
    if (alert) line.className = 'alert';
    const time = new Date().toLocaleTimeString('pt-BR', { hour12: false });
    line.textContent = `> [${time}] [MOBILE-CAM] ${message}`;
    output.appendChild(line);
    output.scrollTop = output.scrollHeight;
  }

  function candidateCount(sdp = '') {
    return (String(sdp).match(/^a=candidate:/gm) || []).length;
  }

  function candidateTypeSummary(sdp = '') {
    const text = String(sdp || '');
    const types = { host: 0, srflx: 0, relay: 0, prflx: 0, other: 0 };
    for (const line of text.split(/\r?\n/)) {
      if (!line.startsWith('a=candidate:')) continue;
      const match = line.match(/\btyp\s+(host|srflx|relay|prflx)\b/i);
      if (match) types[match[1].toLowerCase()] += 1;
      else types.other += 1;
    }
    return types;
  }

  function formatCandidateSummary(sdp = '') {
    const types = candidateTypeSummary(sdp);
    return `host:${types.host} srflx:${types.srflx} relay:${types.relay} prflx:${types.prflx}`;
  }

  function normalizeSdp(sdp = '') {
    let text = String(sdp || '')
      .replace(/^\uFEFF/, '')
      .replace(/\u0000/g, '');

    if (!/[\r\n]/.test(text) && /\\(?:r\\n|n|r)/.test(text)) {
      text = text
        .replace(/\\r\\n/g, '\n')
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '\n');
    }

    text = text
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n');

    const lines = text
      .split('\n')
      .map((line) => line.replace(/[ \t]+$/g, ''));

    while (lines.length && lines[lines.length - 1] === '') lines.pop();
    return `${lines.join('\r\n')}\r\n`;
  }

  function looksLikeRemoteCameraOffer(peer, description) {
    if (description?.type !== 'offer') return false;
    try {
      return peer.getTransceivers?.().some((transceiver) => {
        const kind = transceiver?.receiver?.track?.kind || transceiver?.sender?.track?.kind;
        return kind === 'video' && ['recvonly', 'sendrecv'].includes(transceiver?.direction);
      });
    } catch {
      return true;
    }
  }

  function waitForIceComplete(peer, timeoutMs = ICE_GATHER_TIMEOUT_MS) {
    if (!peer || peer.iceGatheringState === 'complete') return Promise.resolve(true);

    return new Promise((resolve) => {
      let settled = false;
      const finish = (complete) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        peer.removeEventListener?.('icegatheringstatechange', onChange);
        resolve(Boolean(complete));
      };
      const onChange = () => {
        if (peer.iceGatheringState === 'complete') finish(true);
      };
      const timer = setTimeout(() => finish(peer.iceGatheringState === 'complete'), timeoutMs);
      peer.addEventListener?.('icegatheringstatechange', onChange);
      onChange();
    });
  }

  function remoteCameraFrameReady() {
    const state = window.ULTRON_REMOTE_CAMERA_FRAME_GATE?.state;
    const video = document.getElementById('webcam');
    return Boolean(
      state?.frameReady ||
      (video && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth > 0 && video.videoHeight > 0)
    );
  }

  function normalizeIceServer(server) {
    if (!server || !server.urls) return null;
    const urls = Array.isArray(server.urls) ? server.urls.map(String).filter(Boolean) : [String(server.urls)];
    if (!urls.length) return null;
    const normalized = { urls };
    if (server.username) normalized.username = String(server.username);
    if (server.credential) normalized.credential = String(server.credential);
    if (server.credentialType) normalized.credentialType = server.credentialType;
    return normalized;
  }

  function mergeIceServers(existing = []) {
    const dynamic = Array.isArray(window.ULTRON_TURN_CONFIG?.iceServers)
      ? window.ULTRON_TURN_CONFIG.iceServers
      : [];
    const merged = [...BASE_ICE_SERVERS, ...(Array.isArray(existing) ? existing : []), ...dynamic]
      .map(normalizeIceServer)
      .filter(Boolean);

    const seen = new Set();
    return merged.filter((server) => {
      const key = `${server.urls.join('|')}|${server.username || ''}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function hasTurnServer(servers = []) {
    return servers.some((server) => {
      const urls = Array.isArray(server?.urls) ? server.urls : [server?.urls];
      return urls.filter(Boolean).some((url) => /^turns?:/i.test(String(url)));
    });
  }

  async function logSelectedCandidatePair(peer) {
    try {
      const stats = await peer.getStats?.();
      if (!stats) return;
      let selectedPair = null;
      for (const report of stats.values()) {
        if (report.type === 'transport' && report.selectedCandidatePairId) {
          selectedPair = stats.get(report.selectedCandidatePairId) || null;
          break;
        }
        if (report.type === 'candidate-pair' && report.state === 'succeeded' && report.nominated) {
          selectedPair = report;
        }
      }
      if (!selectedPair) return;
      const local = stats.get(selectedPair.localCandidateId);
      const remote = stats.get(selectedPair.remoteCandidateId);
      const localType = local?.candidateType || 'unknown';
      const remoteType = remote?.candidateType || 'unknown';
      const protocol = local?.protocol || remote?.protocol || 'unknown';
      const relayProtocol = local?.relayProtocol || remote?.relayProtocol || '';
      const rtt = Number(selectedPair.currentRoundTripTime || 0);
      log(`ICE estabilizado // caminho ${localType}→${remoteType} // ${protocol}${relayProtocol ? `/${relayProtocol}` : ''}${rtt > 0 ? ` // RTT ${Math.round(rtt * 1000)} ms` : ''}.`);
    } catch {}
  }

  function scheduleAutomaticRetry() {
    const now = Date.now();
    if (now - lastAutoRetryAt < AUTO_RETRY_COOLDOWN_MS) return;
    const api = window.ULTRON_MOBILE_CAMERA;
    const mode = String(api?.state?.mode || '');
    if (!api?.useBridgeCamera || !mode.startsWith('bridge')) return;
    lastAutoRetryAt = now;
    setTimeout(() => {
      const currentMode = String(window.ULTRON_MOBILE_CAMERA?.state?.mode || '');
      if (!currentMode.startsWith('bridge')) return;
      log('A falha ICE persistiu. Iniciando uma nova negociação da câmera automaticamente.');
      window.ULTRON_MOBILE_CAMERA.useBridgeCamera().catch((error) => {
        log(`A renegociação automática da câmera falhou: ${error?.message || error}`, true);
      });
    }, 900);
  }

  function patchRemoteCameraPeer(peer, configuration = {}) {
    if (!peer || peer.__ultronIceRecoveryPatched) return peer;
    peer.__ultronIceRecoveryPatched = true;
    peer.__ultronRemoteCameraPeer = false;
    peer.__ultronTurnAvailable = hasTurnServer(configuration?.iceServers || []);

    const nativeAddTransceiverForPeer = peer.addTransceiver?.bind(peer);
    if (nativeAddTransceiverForPeer) {
      peer.addTransceiver = function patchedAddTransceiver(kind, init = {}) {
        const direction = String(init?.direction || '');
        if (String(kind) === 'video' && direction === 'recvonly') {
          peer.__ultronRemoteCameraPeer = true;
        }
        return nativeAddTransceiverForPeer(kind, init);
      };
    }

    let userConnectionStateHandler = null;
    let failureTimer = null;
    let failureStartedAt = 0;

    Object.defineProperty(peer, 'onconnectionstatechange', {
      configurable: true,
      enumerable: true,
      get() {
        return userConnectionStateHandler;
      },
      set(handler) {
        userConnectionStateHandler = typeof handler === 'function' ? handler : null;
      }
    });

    peer.addEventListener('icecandidateerror', (event) => {
      if (!peer.__ultronRemoteCameraPeer) return;
      const url = String(event?.url || 'STUN/TURN').replace(/\?.*$/, '');
      const code = Number(event?.errorCode || 0);
      const text = String(event?.errorText || 'falha de conectividade ICE');
      log(`ICE SERVER ERROR${code ? ` ${code}` : ''} // ${url} // ${text}`, true);
    });

    peer.addEventListener('connectionstatechange', (event) => {
      const state = String(peer.connectionState || 'unknown');

      if (peer.__ultronRemoteCameraPeer && state === 'failed') {
        if (!failureTimer) {
          failureStartedAt = performance.now();
          const turnHint = peer.__ultronTurnAvailable
            ? 'TURN disponível; aguardando recuperação/relay.'
            : 'Nenhum TURN configurado; se STUN não atravessar o NAT, será necessário relay.';
          log(`ICE entrou em FAILED transitório. Aguardando ${Math.round(ICE_RECOVERY_GRACE_MS / 1000)}s antes de encerrar a câmera. ${turnHint}`, true);
          window.dispatchEvent(new CustomEvent('ultron:remote-camera-ice-recovery', {
            detail: { state: 'grace', graceMs: ICE_RECOVERY_GRACE_MS, turnAvailable: peer.__ultronTurnAvailable }
          }));

          failureTimer = setTimeout(() => {
            failureTimer = null;
            const finalState = String(peer.connectionState || 'unknown');
            if (finalState !== 'failed') return;

            if (remoteCameraFrameReady()) {
              log('ICE ainda reporta FAILED, mas há frame remoto decodificado. Mantendo a sessão para evitar corte prematuro.', true);
              return;
            }

            if (!peer.__ultronTurnAvailable) {
              log('Diagnóstico: candidatos STUN não formaram um caminho viável e não existe candidato TURN/relay. Esta rede precisa de TURN para a câmera remota ficar estável.', true);
            }

            log('A falha ICE permaneceu após a janela de recuperação. Encerrando somente esta sessão e renegociando.', true);
            try {
              userConnectionStateHandler?.call(peer, new Event('connectionstatechange'));
            } finally {
              scheduleAutomaticRetry();
            }
          }, ICE_RECOVERY_GRACE_MS);
        }
        return;
      }

      if (peer.__ultronRemoteCameraPeer && state === 'connected') {
        if (failureTimer) {
          clearTimeout(failureTimer);
          failureTimer = null;
          const elapsed = Math.max(0, Math.round(performance.now() - failureStartedAt));
          log(`ICE da câmera se recuperou em ${elapsed} ms sem derrubar o stream.`);
          window.dispatchEvent(new CustomEvent('ultron:remote-camera-ice-recovery', {
            detail: { state: 'recovered', elapsedMs: elapsed }
          }));
        }
        setTimeout(() => logSelectedCandidatePair(peer), 350);
      }

      userConnectionStateHandler?.call(peer, event);
    });

    const nativeClose = peer.close?.bind(peer);
    if (nativeClose) {
      peer.close = function patchedClose() {
        if (failureTimer) {
          clearTimeout(failureTimer);
          failureTimer = null;
        }
        return nativeClose();
      };
    }

    return peer;
  }

  function UltronRTCPeerConnection(...args) {
    const originalConfig = args[0] && typeof args[0] === 'object' ? args[0] : {};
    const iceServers = mergeIceServers(originalConfig.iceServers || []);
    const enhancedConfig = {
      ...originalConfig,
      iceServers,
      bundlePolicy: originalConfig.bundlePolicy || 'max-bundle',
      rtcpMuxPolicy: originalConfig.rtcpMuxPolicy || 'require',
      iceCandidatePoolSize: Math.max(4, Number(originalConfig.iceCandidatePoolSize || 0))
    };
    args[0] = enhancedConfig;
    return patchRemoteCameraPeer(new NativeRTCPeerConnection(...args), enhancedConfig);
  }
  UltronRTCPeerConnection.prototype = NativeRTCPeerConnection.prototype;
  Object.setPrototypeOf(UltronRTCPeerConnection, NativeRTCPeerConnection);
  window.RTCPeerConnection = UltronRTCPeerConnection;

  proto.setLocalDescription = async function patchedSetLocalDescription(description) {
    const result = await nativeSetLocalDescription.call(this, description);

    if (looksLikeRemoteCameraOffer(this, description)) {
      const complete = await waitForIceComplete(this);
      const localSdp = this.localDescription?.sdp || description?.sdp || '';
      const count = candidateCount(localSdp);
      const summary = formatCandidateSummary(localSdp);
      this.__ultronLocalCandidateSummary = candidateTypeSummary(localSdp);
      if (complete) {
        log(`ICE local completo (${count} candidato${count === 1 ? '' : 's'} // ${summary}). Enviando oferta WebRTC íntegra ao celular.`);
      } else {
        log(`ICE local ainda parcial após ${Math.round(ICE_GATHER_TIMEOUT_MS / 1000)}s (${count} candidato${count === 1 ? '' : 's'} // ${summary}).`, true);
      }
    }

    return result;
  };

  proto.setRemoteDescription = async function patchedSetRemoteDescription(description) {
    const isAnswer = description?.type === 'answer';
    const originalSdp = String(description?.sdp || '');
    const normalizedSdp = isAnswer ? normalizeSdp(originalSdp) : originalSdp;
    const finalDescription = isAnswer
      ? { type: 'answer', sdp: normalizedSdp }
      : description;

    try {
      const result = await nativeSetRemoteDescription.call(this, finalDescription);
      if (isAnswer) {
        const count = candidateCount(normalizedSdp);
        const summary = formatCandidateSummary(normalizedSdp);
        const repaired = normalizedSdp !== originalSdp;
        this.__ultronRemoteCandidateSummary = candidateTypeSummary(normalizedSdp);
        log(`Resposta WebRTC aplicada (${normalizedSdp.length} caracteres, ${count} candidato${count === 1 ? '' : 's'} // ${summary}${repaired ? ' // SDP normalizado' : ''}).`);
        const localRelay = Number(this.__ultronLocalCandidateSummary?.relay || 0);
        const remoteRelay = Number(this.__ultronRemoteCandidateSummary?.relay || 0);
        if (!localRelay && !remoteRelay && !this.__ultronTurnAvailable) {
          log('ICE sem candidatos relay/TURN. Conexão dependerá totalmente de NAT traversal direto (host/srflx).');
        }
      }
      return result;
    } catch (error) {
      if (isAnswer) {
        const line = Number(error?.sdpLineNumber || 0);
        const detail = line > 0 ? ` linha SDP ${line}.` : '';
        log(`Falha ao aplicar a resposta WebRTC do celular (${normalizedSdp.length} caracteres): ${error?.message || error}${detail}`, true);
      }
      throw error;
    }
  };

  proto.addIceCandidate = async function patchedAddIceCandidate(candidate) {
    try {
      return await nativeAddIceCandidate.call(this, candidate);
    } catch (error) {
      log(`Falha ao adicionar candidato ICE remoto: ${error?.message || error}`, true);
      throw error;
    }
  };

  window.ULTRON_REMOTE_CAMERA_ICE = {
    setTurnServers(iceServers = []) {
      window.ULTRON_TURN_CONFIG = { iceServers: Array.isArray(iceServers) ? iceServers : [] };
      return window.ULTRON_TURN_CONFIG.iceServers.length;
    },
    clearTurnServers() {
      window.ULTRON_TURN_CONFIG = { iceServers: [] };
    },
    get turnAvailable() {
      return hasTurnServer(window.ULTRON_TURN_CONFIG?.iceServers || []);
    },
    get version() { return '4.24.2'; }
  };

  window.dispatchEvent(new CustomEvent('ultron:remote-camera-webrtc-hotfix-ready', {
    detail: {
      version: '4.24.2',
      iceGatherTimeoutMs: ICE_GATHER_TIMEOUT_MS,
      iceRecoveryGraceMs: ICE_RECOVERY_GRACE_MS,
      automaticRetry: true,
      sdpFinalCrlfGuard: true,
      cloudflareStun: true,
      turnReady: true,
      turnConfigured: window.ULTRON_REMOTE_CAMERA_ICE.turnAvailable
    }
  }));
}
