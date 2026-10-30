const PATCH_KEY = '__ULTRON_VISION_REMOTE_SOURCE_V4224__';

if (!window[PATCH_KEY]) {
  window[PATCH_KEY] = true;

  const output = document.getElementById('output-box');

  function log(message, alert = false) {
    if (!output) return;
    const line = document.createElement('p');
    if (alert) line.className = 'alert';
    line.textContent = `> [VISION-REMOTE] ${message}`;
    output.appendChild(line);
    output.scrollTop = output.scrollHeight;
  }

  function hasLiveVideoTrack(stream) {
    return stream?.getVideoTracks?.().some((track) => track.readyState === 'live') === true;
  }

  function isPlayable(video) {
    return Boolean(video && video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0);
  }

  function waitForFrame(video, timeoutMs = 5000) {
    if (isPlayable(video)) return Promise.resolve(true);
    return new Promise((resolve) => {
      const started = Date.now();
      const tick = () => {
        if (isPlayable(video)) return resolve(true);
        if (Date.now() - started >= timeoutMs) return resolve(false);
        setTimeout(tick, 120);
      };
      tick();
    });
  }

  function resolveRemoteStream() {
    const controller = window.ULTRON_CAMERA_CONTROLLER;
    const webcam = document.getElementById('webcam');
    const preview = document.querySelector('.stark-camera-feed');

    const candidates = [
      controller?.stream,
      webcam?.srcObject,
      preview?.srcObject
    ];

    return candidates.find((stream) => hasLiveVideoTrack(stream)) || null;
  }

  async function prepareRemoteSource() {
    const webcam = document.getElementById('webcam');
    const controller = window.ULTRON_CAMERA_CONTROLLER;
    if (!webcam || !controller) return { ok: false, reason: 'runtime-missing' };

    const stream = resolveRemoteStream();
    if (!stream) return { ok: false, reason: 'no-live-stream' };

    const track = stream.getVideoTracks?.()[0];
    const settings = track?.getSettings?.() || {};
    const remoteLike = !settings.deviceId || window.ULTRON_MOBILE_CAMERA?.state?.mode === 'bridge';
    if (!remoteLike && webcam.srcObject !== stream) {
      return { ok: false, reason: 'local-stream-only' };
    }

    controller.stopRequested = false;
    controller.stream = stream;

    if (webcam.srcObject !== stream) {
      webcam.srcObject = stream;
    }
    webcam.muted = true;
    webcam.playsInline = true;
    await webcam.play().catch(() => {});

    const ready = await waitForFrame(webcam);
    if (!ready) {
      return { ok: false, reason: 'remote-no-frame', stream };
    }

    window.ULTRON_CAMERA_PREVIEW?.sync?.();
    window.dispatchEvent(new CustomEvent('ultron:camera-stream', {
      detail: {
        active: true,
        restored: true,
        stream,
        source: 'ULTRON_BRIDGE_WEBRTC',
        label: track?.label || 'SMARTPHONE WEBRTC',
        width: webcam.videoWidth || settings.width || null,
        height: webcam.videoHeight || settings.height || null,
        remote: true
      }
    }));

    return {
      ok: true,
      stream,
      width: webcam.videoWidth,
      height: webcam.videoHeight,
      label: track?.label || 'SMARTPHONE WEBRTC'
    };
  }

  const vision = window.ULTRON_VISION;
  if (vision?.analyze && !vision.__remoteSourceWrapped) {
    const originalAnalyze = vision.analyze.bind(vision);
    const originalDiagnose = vision.diagnose?.bind(vision);

    vision.analyze = async function analyzeWithRemotePriority(prompt = '') {
      const prepared = await prepareRemoteSource().catch((error) => {
        log(`Falha ao preparar o stream remoto: ${error?.message || error}`, true);
        return { ok: false, reason: 'prepare-error' };
      });

      if (prepared?.ok) {
        log(`Usando primeiro o stream WebRTC já ativo do Ultron Bridge (${prepared.width}×${prepared.height}). A webcam local não será reiniciada.`);
      }

      return originalAnalyze(prompt);
    };

    if (originalDiagnose) {
      vision.diagnose = async function diagnoseWithRemotePriority() {
        await prepareRemoteSource().catch(() => null);
        return originalDiagnose();
      };
    }

    Object.defineProperty(vision, '__remoteSourceWrapped', {
      value: true,
      configurable: false,
      enumerable: false,
      writable: false
    });
  }

  window.ULTRON_VISION_REMOTE_SOURCE = {
    prepare: prepareRemoteSource,
    resolveRemoteStream,
    get version() { return '4.22.4'; }
  };

  window.dispatchEvent(new CustomEvent('ultron:vision-remote-source-ready', {
    detail: { version: '4.22.4' }
  }));
}
