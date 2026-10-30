const PATCH_KEY = '__ULTRON_EXTERNAL_CAMERA_STREAM_V4223__';

if (!window[PATCH_KEY]) {
  window[PATCH_KEY] = true;

  function isExternalVideoStream(stream) {
    const track = stream?.getVideoTracks?.()[0];
    if (!track) return false;
    const settings = track.getSettings?.() || {};
    // Remote WebRTC tracks do not expose a local camera deviceId.
    return !settings.deviceId;
  }

  async function adoptExternalStream(stream, { source = 'external', restored = true } = {}) {
    const controller = window.ULTRON_CAMERA_CONTROLLER;
    if (!controller) throw new Error('Controlador de câmera ainda não carregado.');
    if (!stream?.getVideoTracks?.().some((track) => track.readyState === 'live')) {
      throw new Error('Stream externo não possui faixa de vídeo ativa.');
    }

    controller.stopRequested = false;
    const adopted = await controller.activateStream(stream, { restored, external: true });
    window.ULTRON_CAMERA_PREVIEW?.sync?.();

    window.dispatchEvent(new CustomEvent('ultron:external-camera-adopted', {
      detail: {
        source,
        stream: adopted,
        trackLabel: adopted?.getVideoTracks?.()[0]?.label || null
      }
    }));

    return adopted;
  }

  function patchController() {
    const controller = window.ULTRON_CAMERA_CONTROLLER;
    if (!controller || controller.__ultronExternalStreamPatched) return false;

    const nativeActivateStream = controller.activateStream.bind(controller);
    controller.activateStream = async function patchedActivateStream(stream, options = {}) {
      const external = Boolean(options.external) || isExternalVideoStream(stream);
      if (external) this.stopRequested = false;

      const result = await nativeActivateStream(stream, {
        ...options,
        external
      });

      if (external) {
        requestAnimationFrame(() => {
          window.ULTRON_CAMERA_PREVIEW?.sync?.();
          window.dispatchEvent(new CustomEvent('ultron:external-camera-adopted', {
            detail: {
              source: 'ULTRON_BRIDGE_WEBRTC',
              stream: result,
              trackLabel: result?.getVideoTracks?.()[0]?.label || null
            }
          }));
        });
      }

      return result;
    };

    controller.__ultronExternalStreamPatched = true;
    return true;
  }

  if (!patchController()) {
    const timer = setInterval(() => {
      if (patchController()) clearInterval(timer);
    }, 100);
    setTimeout(() => clearInterval(timer), 15000);
  }

  window.ULTRON_EXTERNAL_CAMERA_STREAM = {
    adopt: adoptExternalStream,
    patchController,
    get version() { return '4.22.3'; }
  };

  window.dispatchEvent(new CustomEvent('ultron:external-camera-stream-ready', {
    detail: { version: '4.22.3' }
  }));
}
