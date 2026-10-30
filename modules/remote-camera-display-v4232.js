const PATCH_KEY = '__ULTRON_REMOTE_CAMERA_DISPLAY_V4232__';

if (!window[PATCH_KEY]) {
  window[PATCH_KEY] = true;

  const sourceVideo = document.getElementById('webcam');
  const output = document.getElementById('output-box');
  let remoteStream = null;

  function log(message, alert = false) {
    if (!output || !message) return;
    const line = document.createElement('p');
    if (alert) line.className = 'alert';
    const time = new Date().toLocaleTimeString('pt-BR', { hour12: false });
    line.textContent = `> [${time}] [REMOTE-DISPLAY] ${message}`;
    output.appendChild(line);
    output.scrollTop = output.scrollHeight;
  }

  function liveVideoTrack(stream) {
    return stream?.getVideoTracks?.().find((track) => track.readyState === 'live') || null;
  }

  function isRemoteBridgeStream(stream, options = {}) {
    const track = liveVideoTrack(stream);
    if (!track) return false;
    const settings = track.getSettings?.() || {};
    const mode = String(window.ULTRON_MOBILE_CAMERA?.state?.mode || '');
    return Boolean(
      options.remote ||
      options.external ||
      mode.startsWith('bridge') ||
      !settings.deviceId ||
      /ULTRON_REMOTE_CAMERA|ultron-camera/i.test(String(track.label || ''))
    );
  }

  async function attach(stream, { source = 'ULTRON_BRIDGE_WEBRTC' } = {}) {
    const track = liveVideoTrack(stream);
    if (!sourceVideo || !track) throw new Error('Stream remoto sem faixa de vídeo ativa.');

    remoteStream = stream;
    try { sourceVideo.pause?.(); } catch {}
    sourceVideo.removeAttribute('src');
    sourceVideo.srcObject = stream;
    sourceVideo.autoplay = true;
    sourceVideo.muted = true;
    sourceVideo.playsInline = true;
    await sourceVideo.play().catch(() => {});

    const preview = document.querySelector('.stark-camera-feed');
    if (preview) {
      preview.srcObject = stream;
      preview.autoplay = true;
      preview.muted = true;
      preview.playsInline = true;
      await preview.play().catch(() => {});
    }

    const controller = window.ULTRON_CAMERA_CONTROLLER;
    if (controller) {
      controller.stopRequested = false;
      controller.stream = stream;
      controller.lastError = null;
    }

    window.ULTRON_CAMERA_PREVIEW?.sync?.();
    window.dispatchEvent(new CustomEvent('ultron:camera-stream', {
      detail: {
        active: true,
        restored: true,
        remote: true,
        source,
        stream,
        label: track.label || 'Ultron Bridge',
        deviceId: null
      }
    }));
    window.dispatchEvent(new CustomEvent('ultron:remote-camera-display', {
      detail: { active: true, source, stream }
    }));

    window.ULTRON_REMOTE_CAMERA_FRAME_GATE?.probe?.(stream, 'remote-display-v4232', 12000).catch(() => {});
    log('Stream do celular anexado diretamente ao Optical Sensor. A webcam do Windows não será usada.');
    return stream;
  }

  function patchController() {
    const controller = window.ULTRON_CAMERA_CONTROLLER;
    if (!controller || controller.__ultronRemoteDisplayPatched) return Boolean(controller?.__ultronRemoteDisplayPatched);

    const nativeActivateStream = controller.activateStream.bind(controller);
    controller.activateStream = async function patchedActivateStream(stream, options = {}) {
      if (!isRemoteBridgeStream(stream, options)) {
        return nativeActivateStream(stream, options);
      }

      this.stopRequested = false;
      this.stream = stream;
      try { this.bindTrackLifecycle?.(stream); } catch {}
      const attached = await attach(stream, { source: 'ULTRON_BRIDGE_WEBRTC' });
      try { this.onState?.('active', stream, { ...options, remote: true }); } catch {}
      return attached;
    };

    controller.__ultronRemoteDisplayPatched = true;
    return true;
  }

  function detach({ stopTracks = false } = {}) {
    const stream = remoteStream;
    remoteStream = null;
    if (sourceVideo?.srcObject === stream) sourceVideo.srcObject = null;
    const preview = document.querySelector('.stark-camera-feed');
    if (preview?.srcObject === stream) preview.srcObject = null;

    const controller = window.ULTRON_CAMERA_CONTROLLER;
    if (controller?.stream === stream) controller.stream = null;
    if (stopTracks) stream?.getTracks?.().forEach((track) => track.stop());

    window.dispatchEvent(new CustomEvent('ultron:remote-camera-display', {
      detail: { active: false, stream: null }
    }));
  }

  if (!patchController()) {
    const timer = setInterval(() => {
      if (patchController()) clearInterval(timer);
    }, 100);
    setTimeout(() => clearInterval(timer), 20000);
  }

  window.ULTRON_REMOTE_CAMERA_DISPLAY = {
    attach,
    detach,
    patchController,
    isRemoteBridgeStream,
    get stream() { return remoteStream; },
    get active() {
      return Boolean(liveVideoTrack(remoteStream) && sourceVideo?.srcObject === remoteStream);
    },
    get version() { return '4.23.2'; }
  };
}
