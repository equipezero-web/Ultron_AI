const stage = document.querySelector('.neural-stage');
const video = document.getElementById('webcam');
const cameraState = document.getElementById('camera-state');
const output = document.getElementById('output-box');

const MEDIAPIPE_MODULE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/vision_bundle.mjs';
const MEDIAPIPE_WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm';
const GESTURE_MODEL = 'https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task';

if (stage && video) {
  const cursor = document.createElement('div');
  cursor.className = 'stark-hand-cursor';
  cursor.setAttribute('aria-hidden', 'true');
  stage.appendChild(cursor);

  const status = document.createElement('div');
  status.className = 'stark-hand-status';
  status.textContent = 'HAND TRACKING // STANDBY';
  stage.appendChild(status);

  let recognizer = null;
  let loading = false;
  let enabled = false;
  let running = false;
  let raf = null;
  let lastInferenceAt = 0;
  let lastVideoTime = -1;
  let smoothX = 0;
  let smoothY = 0;
  let hasSmoothPoint = false;
  let pinchDown = false;
  let lastPinchAt = 0;
  let openPalmFrames = 0;
  let closedFrames = 0;
  let lastGesture = 'None';
  let lastConfidence = 0;
  let lastTarget = null;
  let delegate = 'unknown';

  function log(message, alert = false) {
    if (!output) return;
    const line = document.createElement('p');
    if (alert) line.className = 'alert';
    const time = new Date().toLocaleTimeString('pt-BR', { hour12: false });
    line.textContent = `> [${time}] [HAND-CTRL] ${message}`;
    output.appendChild(line);
    output.scrollTop = output.scrollHeight;
  }

  function distance(a, b) {
    if (!a || !b) return Infinity;
    return Math.hypot(
      Number(a.x || 0) - Number(b.x || 0),
      Number(a.y || 0) - Number(b.y || 0),
      Number(a.z || 0) - Number(b.z || 0)
    );
  }

  async function buildRecognizer() {
    if (recognizer || loading) return recognizer;
    loading = true;
    status.classList.add('visible');
    status.textContent = 'HAND TRACKING // LOADING MODEL';

    try {
      const { FilesetResolver, GestureRecognizer } = await import(MEDIAPIPE_MODULE);
      const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM);

      let lastError = null;
      for (const candidate of ['GPU', 'CPU']) {
        try {
          recognizer = await GestureRecognizer.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath: GESTURE_MODEL,
              delegate: candidate
            },
            runningMode: 'VIDEO',
            numHands: 1,
            minHandDetectionConfidence: 0.55,
            minHandPresenceConfidence: 0.55,
            minTrackingConfidence: 0.5
          });
          delegate = candidate;
          break;
        } catch (error) {
          lastError = error;
        }
      }

      if (!recognizer) throw lastError || new Error('Gesture Recognizer indisponível.');
      status.textContent = `HAND TRACKING // ${delegate}`;
      log(`Rastreamento de mão carregado localmente (${delegate}).`);
      return recognizer;
    } catch (error) {
      status.textContent = 'HAND TRACKING // ERROR';
      log(`Falha ao iniciar rastreamento de mão: ${error?.message || error}`, true);
      return null;
    } finally {
      loading = false;
    }
  }

  function showCursor(localX, localY, pinching = false) {
    cursor.classList.add('visible');
    cursor.classList.toggle('pinching', pinching);
    cursor.style.setProperty('--hand-x', `${localX}px`);
    cursor.style.setProperty('--hand-y', `${localY}px`);
    if (!pinching) {
      cursor.style.transform = `translate3d(${localX}px,${localY}px,0) scale(.72)`;
    } else {
      cursor.style.removeProperty('transform');
    }
  }

  function hideCursor() {
    cursor.classList.remove('visible', 'pinching');
    cursor.style.transform = 'translate3d(-9999px,-9999px,0) scale(.72)';
    window.ULTRON_STARK_MESH?.clearFocus?.();
    lastTarget = null;
  }

  function setZoom(active) {
    window.ULTRON_STARK_MESH?.zoom?.(active);
    status.classList.toggle('open', active);
  }

  function stagePoint(landmark) {
    const rect = stage.getBoundingClientRect();
    const targetX = (1 - Number(landmark?.x || 0.5)) * rect.width;
    const targetY = Number(landmark?.y || 0.5) * rect.height;

    if (!hasSmoothPoint) {
      smoothX = targetX;
      smoothY = targetY;
      hasSmoothPoint = true;
    } else {
      smoothX += (targetX - smoothX) * 0.34;
      smoothY += (targetY - smoothY) * 0.34;
    }

    return {
      localX: smoothX,
      localY: smoothY,
      clientX: rect.left + smoothX,
      clientY: rect.top + smoothY
    };
  }

  function handleResult(result) {
    const landmarks = result?.landmarks?.[0];
    const gesture = result?.gestures?.[0]?.[0];

    if (!landmarks?.length) {
      closedFrames += 1;
      openPalmFrames = Math.max(0, openPalmFrames - 1);
      if (closedFrames > 3) {
        setZoom(false);
        hideCursor();
        status.textContent = 'HAND TRACKING // SEARCHING';
        status.classList.remove('pinch');
        pinchDown = false;
        hasSmoothPoint = false;
      }
      return;
    }

    closedFrames = 0;
    const category = String(gesture?.categoryName || 'None');
    const confidence = Number(gesture?.score || 0);
    lastGesture = category;
    lastConfidence = confidence;

    const indexTip = landmarks[8];
    const thumbTip = landmarks[4];
    const indexMcp = landmarks[5];
    const pinkyMcp = landmarks[17];
    const palmWidth = Math.max(0.025, distance(indexMcp, pinkyMcp));
    const pinchRatio = distance(indexTip, thumbTip) / palmWidth;
    const pinching = pinchRatio < 0.42;

    const point = stagePoint(indexTip);
    showCursor(point.localX, point.localY, pinching);

    if (category === 'Open_Palm' && confidence >= 0.55) {
      openPalmFrames = Math.min(8, openPalmFrames + 1);
    } else {
      openPalmFrames = Math.max(0, openPalmFrames - 1);
    }

    const zoomed = openPalmFrames >= 2 || window.ULTRON_STARK_MESH?.zoomed;
    if (openPalmFrames >= 2) setZoom(true);
    if (category === 'Closed_Fist' && confidence >= 0.55) {
      openPalmFrames = 0;
      setZoom(false);
    }

    if (zoomed || pinching) {
      lastTarget = window.ULTRON_STARK_MESH?.focusAtViewport?.(
        point.clientX,
        point.clientY,
        zoomed ? 92 : 70
      ) || null;
    }

    status.classList.add('visible');
    status.classList.toggle('pinch', pinching);
    if (pinching) {
      status.textContent = lastTarget
        ? `PINCH // ${lastTarget.label}`
        : 'PINCH // SEM ALVO';
    } else if (openPalmFrames >= 2) {
      status.textContent = lastTarget
        ? `OPEN PALM // ZOOM // ${lastTarget.label}`
        : 'OPEN PALM // ZOOM';
    } else {
      status.textContent = `HAND // ${category.toUpperCase()}`;
    }

    const now = performance.now();
    if (pinching && !pinchDown && now - lastPinchAt > 650) {
      pinchDown = true;
      lastPinchAt = now;
      if (lastTarget && window.ULTRON_STARK_MESH?.openFocused?.()) {
        navigator.vibrate?.(24);
        log(`Pinça detectada: ${lastTarget.label} aberto.`);
        window.dispatchEvent(new CustomEvent('ultron:camera-hand-select', {
          detail: {
            label: lastTarget.label,
            gesture: 'pinch',
            confidence,
            pinchRatio
          }
        }));
      }
    }

    if (!pinching) pinchDown = false;

    window.dispatchEvent(new CustomEvent('ultron:camera-hand', {
      detail: {
        gesture: category,
        confidence,
        pinch: pinching,
        pinchRatio,
        target: lastTarget?.label || null,
        x: point.localX,
        y: point.localY,
        zoomed: Boolean(window.ULTRON_STARK_MESH?.zoomed)
      }
    }));
  }

  function loop(now = performance.now()) {
    raf = requestAnimationFrame(loop);
    if (!enabled || !recognizer || running) return;
    if (!video.srcObject || video.readyState < 2 || !video.videoWidth) return;
    if (now - lastInferenceAt < 78) return;
    if (video.currentTime === lastVideoTime) return;

    lastInferenceAt = now;
    lastVideoTime = video.currentTime;
    running = true;

    try {
      const result = recognizer.recognizeForVideo(video, now);
      handleResult(result);
    } catch (error) {
      console.warn('ULTRON hand tracking:', error);
    } finally {
      running = false;
    }
  }

  async function enable() {
    if (enabled) return true;
    const instance = await buildRecognizer();
    if (!instance) return false;
    enabled = true;
    status.classList.add('visible');
    status.textContent = `HAND TRACKING // ${delegate}`;
    if (!raf) raf = requestAnimationFrame(loop);
    window.ULTRON_TELEMETRY?.push?.({ event: 'hand-tracking-enabled' });
    return true;
  }

  function disable() {
    enabled = false;
    setZoom(false);
    hideCursor();
    status.textContent = 'HAND TRACKING // STANDBY';
    status.classList.remove('open', 'pinch');
    window.ULTRON_TELEMETRY?.push?.({ event: 'hand-tracking-disabled' });
  }

  function syncWithCamera() {
    const online = String(cameraState?.textContent || '').toUpperCase().includes('ONLINE');
    if (online) enable();
    else disable();
  }

  if (cameraState) {
    const observer = new MutationObserver(syncWithCamera);
    observer.observe(cameraState, { childList: true, subtree: true, characterData: true });
  }

  video.addEventListener('playing', () => enable());
  video.addEventListener('emptied', disable);

  window.addEventListener('beforeunload', () => {
    if (raf) cancelAnimationFrame(raf);
    raf = null;
    try { recognizer?.close?.(); } catch {}
  });

  window.ULTRON_HAND_GESTURES = {
    enable,
    disable,
    get enabled() { return enabled; },
    get ready() { return Boolean(recognizer); },
    get state() {
      return {
        enabled,
        ready: Boolean(recognizer),
        delegate,
        gesture: lastGesture,
        confidence: lastConfidence,
        target: lastTarget?.label || null,
        zoomed: Boolean(window.ULTRON_STARK_MESH?.zoomed)
      };
    }
  };

  syncWithCamera();
}
