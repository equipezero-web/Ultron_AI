const PATCH_FLAG = '__ULTRON_CAMERA_HARDENING_V422__';

if (!window[PATCH_FLAG]) {
  window[PATCH_FLAG] = true;

  const output = document.getElementById('output-box');

  function log(message, alert = false) {
    if (!output || !message) return;
    const line = document.createElement('p');
    if (alert) line.className = 'alert';
    const time = new Date().toLocaleTimeString('pt-BR', { hour12: false });
    line.textContent = `> [${time}] [CAMERA-HARDENING] ${message}`;
    output.appendChild(line);
    output.scrollTop = output.scrollHeight;
  }

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  function minimalConstraints(deviceId) {
    return [
      {
        video: {
          deviceId: { exact: deviceId },
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { ideal: 20, max: 24 }
        },
        audio: false,
        _mode: 'enumerated-compatible'
      },
      {
        video: { deviceId: { exact: deviceId } },
        audio: false,
        _mode: 'enumerated-minimal'
      }
    ];
  }

  async function patchController(controller) {
    if (!controller || controller.__ultronCameraHardeningV422) return false;
    controller.__ultronCameraHardeningV422 = true;

    const originalRequestStream = controller.requestStream.bind(controller);
    const originalFriendlyError = controller.friendlyError.bind(controller);

    controller.requestStream = async function requestStreamHardened() {
      try {
        return await originalRequestStream();
      } catch (primaryError) {
        const primaryName = String(primaryError?.name || 'CameraError');
        if (['NotAllowedError', 'SecurityError'].includes(primaryName)) throw primaryError;

        const devices = await this.refreshDevices?.({ announce: true }).catch(() => []) || [];
        const unique = devices.filter((device, index, list) =>
          device?.deviceId && list.findIndex((item) => item.deviceId === device.deviceId) === index
        );

        let lastError = primaryError;
        if (unique.length) {
          log(`Fallback avançado: testando ${unique.length} videoinput(s) individualmente com constraints mínimas.`);
        }

        for (const device of unique) {
          for (const candidate of minimalConstraints(device.deviceId)) {
            try {
              const stream = await navigator.mediaDevices.getUserMedia({
                video: candidate.video,
                audio: false
              });
              window.dispatchEvent(new CustomEvent('ultron:camera-fallback', {
                detail: {
                  mode: candidate._mode,
                  selectedDeviceId: device.deviceId,
                  label: device.label || 'videoinput'
                }
              }));
              log(`Entrada aberta diretamente: ${device.label || device.deviceId} (${candidate._mode}).`);
              return stream;
            } catch (error) {
              lastError = error;
              const name = String(error?.name || 'CameraError');
              if (['NotAllowedError', 'SecurityError'].includes(name)) throw error;
              await sleep(name === 'NotReadableError' ? 450 : 180);
            }
          }
        }

        for (const candidate of [
          { video: { facingMode: { ideal: 'environment' } }, audio: false, _mode: 'environment' },
          { video: { facingMode: { ideal: 'user' } }, audio: false, _mode: 'user' },
          { video: true, audio: false, _mode: 'last-generic' }
        ]) {
          try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: candidate.video, audio: false });
            window.dispatchEvent(new CustomEvent('ultron:camera-fallback', {
              detail: { mode: candidate._mode, selectedDeviceId: this.selectedDeviceId || '' }
            }));
            return stream;
          } catch (error) {
            lastError = error;
            if (['NotAllowedError', 'SecurityError'].includes(String(error?.name || ''))) throw error;
            await sleep(180);
          }
        }

        throw lastError || primaryError;
      }
    };

    controller.friendlyError = function friendlyErrorHardened(error) {
      const name = String(error?.name || '');
      if (name === 'NotFoundError' && this.devices?.length) {
        return `${this.devices.length} entrada(s) de vídeo existem no Windows, mas o driver não entregou frames ao navegador. O Ultron tentou cada entrada individualmente, além dos fallbacks genéricos. Se for DroidCam/Iriun, abra o cliente/driver no PC ou use CÂMERA ULTRON BRIDGE.`;
      }
      if (name === 'NotReadableError') {
        return 'A entrada de vídeo foi encontrada, mas o Windows/driver recusou a abertura. Feche apps que possam estar usando a câmera e tente CÂMERA ULTRON BRIDGE para usar o celular sem depender da webcam do PC.';
      }
      return originalFriendlyError(error);
    };

    log('Fallback avançado de câmera v4.22 carregado.');
    return true;
  }

  let attempts = 0;
  const attach = () => {
    attempts += 1;
    const controller = window.ULTRON_CAMERA_CONTROLLER;
    if (controller) {
      patchController(controller).catch(() => {});
      return;
    }
    if (attempts < 80) setTimeout(attach, 100);
  };

  attach();
}
