const PATCH_KEY = '__ULTRON_REMOTE_CAMERA_WEBRTC_V4231__';

if (!window[PATCH_KEY] && window.RTCPeerConnection) {
  window[PATCH_KEY] = true;
  // Keep the previous capability marker for existing bootstrap/workflow checks.
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

  function normalizeSdp(sdp = '') {
    let text = String(sdp || '')
      .replace(/^\uFEFF/, '')
      .replace(/\u0000/g, '');

    // Defensive recovery in case escaped line breaks ever arrive literally.
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

    // libwebrtc requires the final SDP line to end with CRLF. Without this,
    // Chrome reports the final a=ssrc line as "Invalid SDP line".
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

  function patchRemoteCameraPeer(peer) {
    if (!peer || peer.__ultronIceRecoveryPatched) return peer;
    peer.__ultronIceRecoveryPatched = true;
    peer.__ultronRemoteCameraPeer = false;

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

    peer.addEventListener('connectionstatechange', (event) => {
      const state = String(peer.connectionState || 'unknown');

      if (peer.__ultronRemoteCameraPeer && state === 'failed') {
        if (!failureTimer) {
          failureStartedAt = performance.now();
          log(`ICE entrou em FAILED transitório. Aguardando ${Math.round(ICE_RECOVERY_GRACE_MS / 1000)}s antes de encerrar a câmera.`);
          window.dispatchEvent(new CustomEvent('ultron:remote-camera-ice-recovery', {
            detail: { state: 'grace', graceMs: ICE_RECOVERY_GRACE_MS }
          }));

          failureTimer = setTimeout(() => {
            failureTimer = null;
            const finalState = String(peer.connectionState || 'unknown');
            if (finalState !== 'failed') return;

            if (remoteCameraFrameReady()) {
              log('ICE ainda reporta FAILED, mas há frame remoto decodificado. Mantendo a sessão para evitar corte prematuro.', true);
              return;
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

      if (peer.__ultronRemoteCameraPeer && failureTimer && state === 'connected') {
        clearTimeout(failureTimer);
        failureTimer = null;
        const elapsed = Math.max(0, Math.round(performance.now() - failureStartedAt));
        log(`ICE da câmera se recuperou em ${elapsed} ms sem derrubar o stream.`);
        window.dispatchEvent(new CustomEvent('ultron:remote-camera-ice-recovery', {
          detail: { state: 'recovered', elapsedMs: elapsed }
        }));
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
    return patchRemoteCameraPeer(new NativeRTCPeerConnection(...args));
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
      if (complete) {
        log(`ICE local completo (${count} candidato${count === 1 ? '' : 's'}). Enviando oferta WebRTC íntegra ao celular.`);
      } else {
        log(`ICE local ainda parcial após ${Math.round(ICE_GATHER_TIMEOUT_MS / 1000)}s (${count} candidato${count === 1 ? '' : 's'}). A conexão continuará com os candidatos disponíveis.`, true);
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
        const repaired = normalizedSdp !== originalSdp;
        log(`Resposta WebRTC aplicada (${normalizedSdp.length} caracteres, ${count} candidato${count === 1 ? '' : 's'} no SDP${repaired ? ', SDP normalizado' : ''}).`);
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

  window.dispatchEvent(new CustomEvent('ultron:remote-camera-webrtc-hotfix-ready', {
    detail: {
      version: '4.23.1',
      iceGatherTimeoutMs: ICE_GATHER_TIMEOUT_MS,
      iceRecoveryGraceMs: ICE_RECOVERY_GRACE_MS,
      automaticRetry: true,
      sdpFinalCrlfGuard: true
    }
  }));
}
