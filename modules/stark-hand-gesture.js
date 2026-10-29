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
  let openPalmFrames = 0;
  let closedPalmFrames = 0;
  let lostFrames = 0;
  let moveArmed = false;
  let frozen = false;
  let pointerActive = false;
  let controlMode = 'standby';
  let lastGesture = 'None';
  let lastConfidence = 0;
  let lastTarget = null;
  let lastZoomLevel = 0;
  let lastSelectAt = 0;
  let delegate = 'unknown';

  const perf = () => window.ULTRON_PERFORMANCE?.profile || { handInferenceMs: 78 };

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

  function handSpan(landmarks = []) {
    if (!landmarks.length) return 0;
    let minX = 1;
    let maxX = 0;
    let minY = 1;
    let maxY = 0;
    for (const point of landmarks) {
      const x = Number(point.x || 0);
      const y = Number(point.y || 0);
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    return Math.max(maxX - minX, maxY - minY);
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
            baseOptions: { modelAssetPath: GESTURE_MODEL, delegate: candidate },
            runningMode: 'VIDEO',
            numHands: 1,
            minHandDetectionConfidence: 0.5,
            minHandPresenceConfidence: 0.5,
            minTrackingConfidence: 0.45
          });
          delegate = candidate;
          break;
        } catch (error) {
          lastError = error;
        }
      }

      if (!recognizer) throw lastError || new Error('Gesture Recognizer indisponível.');
      status.textContent = `HAND TRACKING // ${delegate}`;
      log(`Rastreamento de mão carregado (${delegate}) // palma abre movimento, punho congela, indicador aponta e pinça seleciona.`);
      return recognizer;
    } catch (error) {
      status.textContent = 'HAND TRACKING // ERROR';
      log(`Falha ao iniciar rastreamento de mão: ${error?.message || error}`, true);
      return null;
    } finally {
      loading = false;
    }
  }

  function emitMode(mode, reason = mode) {
    controlMode = mode;
    window.dispatchEvent(new CustomEvent('ultron:camera-hand-mode', {
      detail: {
        mode,
        reason,
        movementArmed: moveArmed,
        frozen,
        pointerActive,
        target: lastTarget?.label || null
      }
    }));
  }

  function showCursor(localX, localY, pinching = false) {
    cursor.classList.add('visible');
    cursor.classList.toggle('pinching', pinching);
    cursor.style.setProperty('--hand-x', `${localX}px`);
    cursor.style.setProperty('--hand-y', `${localY}px`);
    if (!pinching) cursor.style.transform = `translate3d(${localX}px,${localY}px,0) scale(.72)`;
    else cursor.style.removeProperty('transform');
  }

  function hideCursor({ clearFocus = true } = {}) {
    cursor.classList.remove('visible', 'pinching', 'dragging', 'frozen');
    cursor.style.transform = 'translate3d(-9999px,-9999px,0) scale(.72)';
    if (clearFocus) window.ULTRON_STARK_MESH?.clearFocus?.();
    lastTarget = null;
  }

  function stagePoint(landmark) {
    const rect = stage.getBoundingClientRect();
    const targetX = (1 - Number(landmark?.x || 0.5)) * rect.width;
    const targetY = Number(landmark?.y || 0.5) * rect.height;
    const factor = window.ULTRON_PERFORMANCE?.mode === 'lite' ? 0.5 : 0.38;

    if (!hasSmoothPoint) {
      smoothX = targetX;
      smoothY = targetY;
      hasSmoothPoint = true;
    } else {
      smoothX += (targetX - smoothX) * factor;
      smoothY += (targetY - smoothY) * factor;
    }

    return {
      localX: smoothX,
      localY: smoothY,
      clientX: rect.left + smoothX,
      clientY: rect.top + smoothY
    };
  }

  function currentPoint() {
    const rect = stage.getBoundingClientRect();
    return {
      localX: smoothX,
      localY: smoothY,
      clientX: rect.left + smoothX,
      clientY: rect.top + smoothY
    };
  }

  function armMove(reason = 'open-palm') {
    const changed = !moveArmed || frozen;
    moveArmed = true;
    frozen = false;
    pointerActive = false;
    cursor.classList.remove('frozen');
    status.classList.remove('frozen', 'pinch');
    status.classList.add('open', 'visible');
    status.textContent = 'MOVE ARMED // USE O INDICADOR';
    emitMode('move-armed', reason);
    if (changed) {
      navigator.vibrate?.(12);
      log('PALMA ABERTA: movimento armado. Use o indicador para mover a pinça.');
    }
    return true;
  }

  function releasePinch() {
    if (!pinchDown) return;
    pinchDown = false;
    cursor.classList.remove('pinching');
    status.classList.remove('pinch');
  }

  function freezeMotion(reason = 'closed-fist') {
    const changed = !frozen;
    releasePinch();
    window.ULTRON_STARK_MESH?.endDrag?.({ persist: true });
    moveArmed = false;
    frozen = true;
    pointerActive = false;
    cursor.classList.remove('pinching', 'dragging');
    if (hasSmoothPoint) {
      showCursor(smoothX, smoothY, false);
      cursor.classList.add('frozen');
    }
    status.classList.remove('open', 'pinch');
    status.classList.add('visible', 'frozen');
    status.textContent = 'FROZEN // POSIÇÃO TRAVADA';
    emitMode('frozen', reason);
    if (changed) {
      navigator.vibrate?.([18, 24, 18]);
      log('PALMA FECHADA: posição congelada. Nada será movido até uma nova palma aberta.');
    }
    return true;
  }

  function focusAt(point) {
    const mobile = window.matchMedia?.('(max-width: 650px)')?.matches === true;
    lastTarget = window.ULTRON_STARK_MESH?.focusAtViewport?.(
      point.clientX,
      point.clientY,
      mobile ? 118 : 94
    ) || null;
    return lastTarget;
  }

  function selectTarget(target, confidence = 1) {
    const label = String(target?.label || target || '').trim();
    if (!label) return false;

    const now = performance.now();
    if (now - lastSelectAt < 420) return false;
    lastSelectAt = now;

    const fileMesh = window.ULTRON_FILE_MESH;
    let handled = false;

    if (fileMesh?.active) {
      handled = Boolean(fileMesh.openFileNode?.(target?.fileId || label));
    } else {
      window.ULTRON_STARK_CORE?.focus?.(label);
      handled = Boolean(window.ULTRON_STARK_MESH?.openFocused?.());
      if (!handled) handled = Boolean(window.ULTRON_STARK_CORE?.open?.(label));
    }

    navigator.vibrate?.(handled ? 26 : 12);
    window.dispatchEvent(new CustomEvent('ultron:camera-hand-select', {
      detail: {
        label,
        target: label,
        fileId: target?.fileId || null,
        confidence,
        gesture: 'pinch-click',
        handled
      }
    }));

    if (handled) log(`${label}: selecionado pela pinça indicador + polegar.`);
    return handled;
  }

  function handleResult(result) {
    const landmarks = result?.landmarks?.[0];
    const gesture = result?.gestures?.[0]?.[0];

    if (!landmarks?.length) {
      lostFrames += 1;
      openPalmFrames = Math.max(0, openPalmFrames - 1);
      closedPalmFrames = Math.max(0, closedPalmFrames - 1);
      pointerActive = false;
      if (lostFrames > 3) {
        releasePinch();
        if (!frozen) hideCursor();
        status.textContent = 'HAND TRACKING // SEARCHING';
        status.classList.remove('pinch', 'open');
      }
      return;
    }

    lostFrames = 0;
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
    const pinching = pinchRatio < 0.39;
    const span = handSpan(landmarks);

    const isOpenPalm = category === 'Open_Palm' && confidence >= 0.55;
    const isClosedPalm = category === 'Closed_Fist' && confidence >= 0.58;
    const isIndexPoint = category === 'Pointing_Up' && confidence >= 0.42;

    if (isOpenPalm) openPalmFrames = Math.min(8, openPalmFrames + 1);
    else openPalmFrames = Math.max(0, openPalmFrames - 1);

    if (isClosedPalm) closedPalmFrames = Math.min(8, closedPalmFrames + 1);
    else closedPalmFrames = Math.max(0, closedPalmFrames - 1);

    if (closedPalmFrames >= 2) {
      freezeMotion('closed-fist');
    } else if (openPalmFrames >= 2 && (!moveArmed || frozen)) {
      armMove('open-palm');
    }

    const canPoint = moveArmed && !frozen && (isIndexPoint || pinching);
    let point = hasSmoothPoint ? currentPoint() : null;

    if (canPoint) {
      point = stagePoint(indexTip);
      pointerActive = true;
      cursor.classList.remove('frozen');
      lastTarget = focusAt(point);
      showCursor(point.localX, point.localY, pinching);

      if (pinching && !pinchDown) {
        pinchDown = true;
        status.classList.add('pinch');
        status.textContent = lastTarget ? `PINCH SELECT // ${lastTarget.label}` : 'PINCH SELECT // SEM ALVO';
        emitMode('pinch-select', 'thumb-index-touch');
        if (lastTarget) selectTarget(lastTarget, Math.max(confidence, 0.7));
      } else if (!pinching && pinchDown) {
        releasePinch();
      }

      if (!pinching) {
        status.classList.remove('pinch', 'frozen');
        status.classList.add('open', 'visible');
        status.textContent = lastTarget
          ? `INDEX POINTER // ${lastTarget.label}`
          : 'INDEX POINTER // MOVENDO';
        emitMode('pointer', 'index-finger');
      }
    } else {
      pointerActive = false;
      if (!pinching && pinchDown) releasePinch();

      if (frozen) {
        if (hasSmoothPoint) {
          showCursor(smoothX, smoothY, false);
          cursor.classList.add('frozen');
        }
        status.classList.add('visible', 'frozen');
        status.classList.remove('open', 'pinch');
        status.textContent = 'FROZEN // POSIÇÃO TRAVADA';
      } else if (moveArmed) {
        cursor.classList.remove('frozen', 'pinching');
        status.classList.add('visible', 'open');
        status.classList.remove('frozen', 'pinch');
        status.textContent = isOpenPalm
          ? 'MOVE ARMED // PALMA DETECTADA'
          : 'MOVE ARMED // MOSTRE O INDICADOR';
      } else {
        status.classList.add('visible');
        status.classList.remove('open', 'pinch', 'frozen');
        status.textContent = `HAND // ${category.toUpperCase()}`;
      }
    }

    lastZoomLevel = Number(window.ULTRON_STARK_MESH?.zoomLevel || lastZoomLevel || 0);
    const normalizedLandmarks = landmarks.map((pointItem) => ({
      x: Number(pointItem.x || 0),
      y: Number(pointItem.y || 0),
      z: Number(pointItem.z || 0)
    }));

    window.dispatchEvent(new CustomEvent('ultron:camera-hand', {
      detail: {
        gesture: category,
        confidence,
        pinch: pinching,
        pinchRatio,
        target: lastTarget?.label || null,
        x: point?.localX ?? smoothX,
        y: point?.localY ?? smoothY,
        zoomLevel: lastZoomLevel,
        handSpan: span,
        palmWidth,
        movementArmed: moveArmed,
        frozen,
        pointerActive,
        controlMode,
        landmarks: normalizedLandmarks
      }
    }));
  }

  function loop(now = performance.now()) {
    raf = requestAnimationFrame(loop);
    if (document.hidden || !enabled || !recognizer || running) return;
    if (!video.srcObject || video.readyState < 2 || !video.videoWidth) return;
    const inferenceMs = Math.max(68, Number(perf().handInferenceMs || 78));
    if (now - lastInferenceAt < inferenceMs) return;
    if (video.currentTime === lastVideoTime) return;

    lastInferenceAt = now;
    lastVideoTime = video.currentTime;
    running = true;
    try {
      handleResult(recognizer.recognizeForVideo(video, now));
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
    emitMode('tracking', 'camera-online');
    status.classList.add('visible');
    status.textContent = `HAND TRACKING // ${delegate} // ${window.ULTRON_PERFORMANCE?.mode || 'FULL'}`;
    if (!raf) raf = requestAnimationFrame(loop);
    return true;
  }

  function disable() {
    enabled = false;
    releasePinch();
    moveArmed = false;
    frozen = false;
    pointerActive = false;
    openPalmFrames = 0;
    closedPalmFrames = 0;
    hideCursor();
    controlMode = 'standby';
    status.textContent = 'HAND TRACKING // STANDBY';
    status.classList.remove('open', 'pinch', 'frozen');
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
  window.addEventListener('ultron:stark-zoom-level', (event) => {
    lastZoomLevel = Number(event.detail?.level || 0);
  });

  window.addEventListener('beforeunload', () => {
    if (raf) cancelAnimationFrame(raf);
    raf = null;
    try { recognizer?.close?.(); } catch {}
  });

  window.ULTRON_HAND_GESTURES = {
    enable,
    disable,
    armMove,
    freeze: freezeMotion,
    resume: armMove,
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
        zoomLevel: lastZoomLevel,
        movementArmed: moveArmed,
        frozen,
        pointerActive,
        pinching: pinchDown,
        controlMode,
        inferenceMs: Number(perf().handInferenceMs || 78)
      };
    }
  };

  syncWithCamera();
}
