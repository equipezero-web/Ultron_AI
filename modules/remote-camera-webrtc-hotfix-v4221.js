const PATCH_KEY = '__ULTRON_REMOTE_CAMERA_WEBRTC_V4221__';

if (!window[PATCH_KEY] && window.RTCPeerConnection) {
  window[PATCH_KEY] = true;

  const proto = window.RTCPeerConnection.prototype;
  const nativeSetLocalDescription = proto.setLocalDescription;
  const nativeSetRemoteDescription = proto.setRemoteDescription;
  const nativeAddIceCandidate = proto.addIceCandidate;
  const ICE_GATHER_TIMEOUT_MS = 12000;

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
    try {
      const result = await nativeSetRemoteDescription.call(this, description);
      if (description?.type === 'answer') {
        const length = String(description?.sdp || '').length;
        const count = candidateCount(description?.sdp || '');
        log(`Resposta WebRTC aplicada (${length} caracteres, ${count} candidato${count === 1 ? '' : 's'} no SDP).`);
      }
      return result;
    } catch (error) {
      if (description?.type === 'answer') {
        const length = String(description?.sdp || '').length;
        log(`Falha ao aplicar a resposta WebRTC do celular (${length} caracteres): ${error?.message || error}`, true);
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
    detail: { version: '4.22.1', iceGatherTimeoutMs: ICE_GATHER_TIMEOUT_MS }
  }));
}
