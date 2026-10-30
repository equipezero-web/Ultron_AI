const PATCH_KEY = '__ULTRON_EXTERNAL_CAMERA_STREAM_V4223__';

if (!window[PATCH_KEY]) {
  window[PATCH_KEY] = true;

  async function adoptExternalStream(stream, { source = 'external', restored = true } = {}) {
    const controller = window.ULTRON_CAMERA_CONTROLLER;
    if (!controller) throw new Error('Controlador de câmera ainda não carregado.');
    if (!stream?.getVideoTracks?.().some((track) => track.readyState === 'live')) {
      throw new Error('Stream externo não possui faixa de vídeo ativa.');
    }

    // stop({silent:true}) é usado na troca de fonte e deixa stopRequested=true.
    // Para um stream WebRTC, isso significa somente troca de origem, não cancelamento.
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

  window.ULTRON_EXTERNAL_CAMERA_STREAM = {
    adopt: adoptExternalStream,
    get version() { return '4.22.3'; }
  };

  window.dispatchEvent(new CustomEvent('ultron:external-camera-stream-ready', {
    detail: { version: '4.22.3' }
  }));
}
