const PATCH_KEY = '__ULTRON_VISUAL_NEURAL_STREAM_BRIDGE_V4230__';

if (!window[PATCH_KEY]) {
  window[PATCH_KEY] = true;

  const sourceVideo = document.getElementById('webcam');
  const output = document.getElementById('output-box');
  let activeRemoteStream = null;
  let lastSyncAt = 0;

  function log(message, alert = false) {
    if (!output || !message) return;
    const line = document.createElement('p');
    if (alert) line.className = 'alert';
    const time = new Date().toLocaleTimeString('pt-BR', { hour12: false });
    line.textContent = `> [${time}] [VISUAL-NEURAL] ${message}`;
    output.appendChild(line);
    output.scrollTop = output.scrollHeight;
  }

  function hasLiveVideoTrack(stream) {
    return Boolean(stream?.getVideoTracks?.().some((track) => track.readyState === 'live'));
  }

  function hasDecodedFrame(video = sourceVideo) {
    return Boolean(
      video &&
      video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
      Number(video.videoWidth || 0) > 0 &&
      Number(video.videoHeight || 0) > 0
    );
  }

  function candidateStream(eventStream = null) {
    const controller = window.ULTRON_CAMERA_CONTROLLER;
    const preview = document.querySelector('.stark-camera-feed');
    const candidates = [
      eventStream,
      activeRemoteStream,
      controller?.stream,
      sourceVideo?.srcObject,
      preview?.srcObject
    ];
    return candidates.find((stream) => hasLiveVideoTrack(stream)) || null;
  }

  async function playVideo(video, stream) {
    if (!video || !stream) return false;
    if (video.srcObject !== stream) {
      try { video.removeAttribute('src'); } catch {}
      video.srcObject = stream;
    }
    video.autoplay = true;
    video.muted = true;
    video.playsInline = true;
    await video.play().catch(() => {});
    return hasDecodedFrame(video);
  }

  async function syncRemoteStream(stream = null, reason = 'sync') {
    const resolved = candidateStream(stream);
    if (!resolved) return false;

    activeRemoteStream = resolved;
    await playVideo(sourceVideo, resolved);

    const preview = document.querySelector('.stark-camera-feed');
    if (preview) {
      await playVideo(preview, resolved);
      preview.style.opacity = '1';
      preview.style.visibility = 'visible';
      preview.style.display = 'block';
    }

    window.ULTRON_CAMERA_PREVIEW?.sync?.();
    const frameReady = hasDecodedFrame(sourceVideo);
    if (frameReady) {
      try { await window.ULTRON_HAND_GESTURES?.enable?.(); } catch {}
    }

    const now = Date.now();
    if (now - lastSyncAt > 1200) {
      lastSyncAt = now;
      const track = resolved.getVideoTracks?.()[0];
      const settings = track?.getSettings?.() || {};
      if (frameReady) {
        log(`Stream remoto com frame real sincronizado (${sourceVideo.videoWidth || settings.width || '?'}×${sourceVideo.videoHeight || settings.height || '?'} // ${reason}).`);
      } else {
        log(`Track WebRTC vinculado ao VISUAL SENSOR (${reason}); aguardando primeiro frame real antes de liberar o Neural.`);
      }
    }

    window.dispatchEvent(new CustomEvent('ultron:visual-neural-stream-synced', {
      detail: {
        stream: resolved,
        reason,
        frameReady,
        visualReady: Boolean(preview?.srcObject === resolved && (preview.videoWidth || sourceVideo?.videoWidth)),
        neuralReady: Boolean(frameReady && window.ULTRON_HAND_GESTURES?.enabled)
      }
    }));

    return true;
  }

  window.addEventListener('ultron:external-camera-adopted', (event) => {
    syncRemoteStream(event.detail?.stream || null, 'external-camera-adopted').catch(() => {});
  });

  window.addEventListener('ultron:camera-stream', (event) => {
    if (!event.detail?.active) return;
    syncRemoteStream(event.detail?.stream || null, 'camera-stream').catch(() => {});
  });

  window.addEventListener('ultron:mobile-camera-source', (event) => {
    if (event.detail?.active && String(event.detail?.source || '').includes('ULTRON_BRIDGE')) {
      syncRemoteStream(null, 'mobile-camera-source').catch(() => {});
    }
  });

  window.addEventListener('ultron:camera-frame-ready', (event) => {
    const stream = event.detail?.stream || candidateStream();
    if (!stream) return;
    activeRemoteStream = stream;
    window.ULTRON_CAMERA_PREVIEW?.sync?.();
    window.ULTRON_HAND_GESTURES?.enable?.().catch?.(() => {});
  });

  const selfHeal = setInterval(() => {
    const stream = candidateStream();
    if (!stream) return;
    const preview = document.querySelector('.stark-camera-feed');
    const visualMissing = preview && preview.srcObject !== stream;
    const sourceMissing = sourceVideo && sourceVideo.srcObject !== stream;
    const frameReady = hasDecodedFrame(sourceVideo);
    const neuralOff = frameReady && window.ULTRON_HAND_GESTURES && !window.ULTRON_HAND_GESTURES.enabled;
    if (visualMissing || sourceMissing || neuralOff) {
      syncRemoteStream(stream, 'self-heal').catch(() => {});
    }
  }, 900);

  window.addEventListener('beforeunload', () => clearInterval(selfHeal), { once: true });

  window.ULTRON_VISUAL_NEURAL_STREAM = {
    sync: syncRemoteStream,
    get stream() { return activeRemoteStream; },
    get state() {
      const preview = document.querySelector('.stark-camera-feed');
      const frameReady = hasDecodedFrame(sourceVideo);
      return {
        active: hasLiveVideoTrack(activeRemoteStream),
        frameReady,
        sourceBound: Boolean(sourceVideo?.srcObject && sourceVideo.srcObject === activeRemoteStream),
        visualBound: Boolean(preview?.srcObject && preview.srcObject === activeRemoteStream),
        neuralEnabled: Boolean(frameReady && window.ULTRON_HAND_GESTURES?.enabled),
        width: Number(sourceVideo?.videoWidth || 0),
        height: Number(sourceVideo?.videoHeight || 0)
      };
    },
    get version() { return '4.23.0'; }
  };

  setTimeout(() => syncRemoteStream(null, 'bootstrap-recover').catch(() => {}), 250);
}
