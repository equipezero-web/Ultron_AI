const PATCH_KEY = '__ULTRON_REMOTE_CAMERA_FRAME_GATE_V4230__';

if (!window[PATCH_KEY]) {
  window[PATCH_KEY] = true;

  const sourceVideo = document.getElementById('webcam');
  const output = document.getElementById('output-box');
  const cameraState = document.getElementById('camera-state');
  const resolution = document.getElementById('camera-resolution');
  const fpsOutput = document.getElementById('fps');

  let activeStream = null;
  let probeToken = 0;
  let frameReady = false;
  let lastFrameAt = 0;
  let frameSamples = [];
  let monitorTimer = null;

  function log(message, alert = false) {
    if (!output || !message) return;
    const line = document.createElement('p');
    if (alert) line.className = 'alert';
    const time = new Date().toLocaleTimeString('pt-BR', { hour12: false });
    line.textContent = `> [${time}] [CAMERA-FRAME] ${message}`;
    output.appendChild(line);
    output.scrollTop = output.scrollHeight;
  }

  function hasLiveTrack(stream) {
    return Boolean(stream?.getVideoTracks?.().some((track) => track.readyState === 'live'));
  }

  function actualFrame(video = sourceVideo) {
    return Boolean(
      video &&
      video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
      Number(video.videoWidth || 0) > 0 &&
      Number(video.videoHeight || 0) > 0
    );
  }

  function streamCandidate(detailStream = null) {
    const preview = document.querySelector('.stark-camera-feed');
    const controller = window.ULTRON_CAMERA_CONTROLLER;
    const candidates = [
      detailStream,
      activeStream,
      controller?.stream,
      sourceVideo?.srcObject,
      preview?.srcObject,
      window.ULTRON_VISUAL_NEURAL_STREAM?.stream
    ];
    return candidates.find((stream) => hasLiveTrack(stream)) || null;
  }

  async function bindVideo(video, stream) {
    if (!video || !stream) return false;
    if (video.srcObject !== stream) {
      try { video.pause?.(); } catch {}
      try { video.removeAttribute('src'); } catch {}
      video.srcObject = stream;
    }
    video.autoplay = true;
    video.muted = true;
    video.playsInline = true;
    await video.play().catch(() => {});
    return true;
  }

  function updateFps(timestamp) {
    if (!timestamp) return;
    frameSamples.push(timestamp);
    const min = timestamp - 2000;
    frameSamples = frameSamples.filter((value) => value >= min);
    if (frameSamples.length < 2) return;
    const elapsed = frameSamples[frameSamples.length - 1] - frameSamples[0];
    if (elapsed <= 0) return;
    const fps = ((frameSamples.length - 1) * 1000) / elapsed;
    if (fpsOutput) fpsOutput.textContent = `${Math.max(1, Math.round(fps))} FPS`;
  }

  async function confirmFrame(stream, reason = 'frame') {
    if (!stream || !actualFrame(sourceVideo)) return false;
    activeStream = stream;
    frameReady = true;
    lastFrameAt = performance.now();

    const preview = document.querySelector('.stark-camera-feed');
    if (preview) {
      await bindVideo(preview, stream);
      preview.style.display = 'block';
      preview.style.visibility = 'visible';
      preview.style.opacity = '1';
    }

    window.ULTRON_CAMERA_PREVIEW?.sync?.();
    try { await window.ULTRON_HAND_GESTURES?.enable?.(); } catch {}

    const width = Number(sourceVideo.videoWidth || preview?.videoWidth || 0);
    const height = Number(sourceVideo.videoHeight || preview?.videoHeight || 0);
    if (cameraState) cameraState.textContent = 'ONLINE';
    if (resolution) resolution.textContent = width && height ? `${width}×${height}` : 'FRAME OK';

    window.dispatchEvent(new CustomEvent('ultron:camera-frame-ready', {
      detail: {
        stream,
        width,
        height,
        reason,
        neuralEnabled: Boolean(window.ULTRON_HAND_GESTURES?.enabled)
      }
    }));

    log(`Primeiro frame remoto confirmado no navegador (${width || '?'}×${height || '?'} // ${reason}). Optical Sensor e Neural liberados.`);
    return true;
  }

  function startFrameMonitor(stream) {
    if (!stream || !sourceVideo) return;
    if (monitorTimer) clearInterval(monitorTimer);
    monitorTimer = setInterval(() => {
      if (!hasLiveTrack(stream) || sourceVideo.srcObject !== stream) return;
      if (actualFrame(sourceVideo)) {
        lastFrameAt = performance.now();
      }
    }, 500);
  }

  function armVideoFrameCallback(stream, token) {
    if (!sourceVideo?.requestVideoFrameCallback) return;
    const loop = (now) => {
      if (token !== probeToken || sourceVideo.srcObject !== stream || !hasLiveTrack(stream)) return;
      if (actualFrame(sourceVideo)) {
        lastFrameAt = now;
        updateFps(now);
        if (!frameReady) confirmFrame(stream, 'requestVideoFrameCallback').catch(() => {});
      }
      sourceVideo.requestVideoFrameCallback(loop);
    };
    sourceVideo.requestVideoFrameCallback(loop);
  }

  async function probeRemoteFrames(stream = null, reason = 'probe', timeoutMs = 11000) {
    const resolved = streamCandidate(stream);
    if (!resolved || !sourceVideo) return false;

    activeStream = resolved;
    frameReady = false;
    frameSamples = [];
    const token = ++probeToken;

    await bindVideo(sourceVideo, resolved);
    const preview = document.querySelector('.stark-camera-feed');
    if (preview) await bindVideo(preview, resolved);

    if (cameraState) cameraState.textContent = 'WAITING FRAME';
    if (resolution) resolution.textContent = 'WAITING FRAME';
    if (fpsOutput) fpsOutput.textContent = '-- FPS';

    const track = resolved.getVideoTracks?.()[0];
    if (track) {
      track.onunmute = () => {
        if (token !== probeToken) return;
        bindVideo(sourceVideo, resolved).catch(() => {});
      };
    }

    armVideoFrameCallback(resolved, token);
    startFrameMonitor(resolved);

    const started = performance.now();
    while (token === probeToken && performance.now() - started < timeoutMs) {
      if (actualFrame(sourceVideo)) {
        return confirmFrame(resolved, reason);
      }
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 120));
    }

    if (token !== probeToken) return false;
    frameReady = false;
    if (cameraState) cameraState.textContent = 'NO FRAME';
    if (resolution) resolution.textContent = 'NO SIGNAL';
    if (fpsOutput) fpsOutput.textContent = '-- FPS';
    window.ULTRON_HAND_GESTURES?.disable?.();

    const muted = Boolean(track?.muted);
    log(
      `WebRTC possui track ${track?.readyState || 'unknown'}, mas nenhum frame decodificado chegou em ${Math.round(timeoutMs / 1000)}s (muted=${muted}). O Neural foi mantido em standby para não operar sobre vídeo vazio.`,
      true
    );
    window.dispatchEvent(new CustomEvent('ultron:camera-frame-timeout', {
      detail: { stream: resolved, reason, muted, readyState: track?.readyState || 'unknown' }
    }));
    return false;
  }

  function attachFromEvent(event, reason) {
    const stream = event?.detail?.stream || null;
    const resolved = streamCandidate(stream);
    if (!resolved) return;
    probeRemoteFrames(resolved, reason).catch(() => {});
  }

  window.addEventListener('ultron:external-camera-adopted', (event) => attachFromEvent(event, 'external-camera-adopted'));
  window.addEventListener('ultron:camera-stream', (event) => {
    if (event.detail?.active) attachFromEvent(event, 'camera-stream');
  });
  window.addEventListener('ultron:visual-neural-stream-synced', (event) => attachFromEvent(event, 'visual-neural-sync'));

  sourceVideo?.addEventListener('loadeddata', () => {
    const stream = streamCandidate(sourceVideo.srcObject);
    if (stream && !frameReady) confirmFrame(stream, 'loadeddata').catch(() => {});
  });
  sourceVideo?.addEventListener('canplay', () => {
    const stream = streamCandidate(sourceVideo.srcObject);
    if (stream && !frameReady) confirmFrame(stream, 'canplay').catch(() => {});
  });

  const healthTimer = setInterval(() => {
    const stream = streamCandidate();
    if (!stream || !hasLiveTrack(stream)) return;
    if (!actualFrame(sourceVideo)) {
      if (frameReady && performance.now() - lastFrameAt > 2500) {
        frameReady = false;
        if (cameraState) cameraState.textContent = 'FRAME LOST';
        window.ULTRON_HAND_GESTURES?.disable?.();
        log('O stream continua conectado, mas os frames pararam. Reiniciando validação do vídeo remoto.', true);
        probeRemoteFrames(stream, 'frame-recovery', 8000).catch(() => {});
      }
      return;
    }
    if (!frameReady) confirmFrame(stream, 'health-check').catch(() => {});
  }, 900);

  window.addEventListener('beforeunload', () => {
    clearInterval(healthTimer);
    if (monitorTimer) clearInterval(monitorTimer);
  }, { once: true });

  window.ULTRON_REMOTE_CAMERA_FRAME_GATE = {
    probe: probeRemoteFrames,
    get stream() { return activeStream; },
    get state() {
      return {
        frameReady,
        width: Number(sourceVideo?.videoWidth || 0),
        height: Number(sourceVideo?.videoHeight || 0),
        readyState: Number(sourceVideo?.readyState || 0),
        trackState: activeStream?.getVideoTracks?.()[0]?.readyState || null,
        trackMuted: activeStream?.getVideoTracks?.()[0]?.muted ?? null,
        neuralEnabled: Boolean(window.ULTRON_HAND_GESTURES?.enabled)
      };
    },
    get version() { return '4.23.0'; }
  };

  setTimeout(() => {
    const stream = streamCandidate();
    if (stream) probeRemoteFrames(stream, 'bootstrap-recover', 8000).catch(() => {});
  }, 400);
}
