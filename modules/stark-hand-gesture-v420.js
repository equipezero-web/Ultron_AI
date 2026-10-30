const stage = document.querySelector('.neural-stage');
const video = document.getElementById('webcam');
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
  status.textContent = 'NEURAL GESTURES // STANDBY';
  stage.appendChild(status);

  let recognizer = null;
  let delegate = 'unknown';
  let loading = false;
  let enabled = false;
  let running = false;
  let raf = null;
  let lastInferenceAt = 0;
  let lastVideoTime = -1;
  let systemActive = false;
  let activationFrames = 0;
  let smoothX = 0;
  let smoothY = 0;
  let hasSmoothPoint = false;
  let lastTarget = null;
  let lastGesture = 'None';
  let lastConfidence = 0;
  let pinchDown = false;
  let lastSelectAt = 0;
  let previousPrimary = null;
  let drag = null;
  let lastCameraTapAt = 0;

  const perf = () => window.ULTRON_PERFORMANCE?.profile || { handInferenceMs: 78 };

  function log(message, alert = false) {
    if (!output) return;
    const line = document.createElement('p');
    if (alert) line.className = 'alert';
    const time = new Date().toLocaleTimeString('pt-BR', { hour12: false });
    line.textContent = `> [${time}] [GESTURE-4.20] ${message}`;
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
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    return Math.max(maxX - minX, maxY - minY);
  }

  function palmNormal(points = []) {
    if (points.length < 18) return { x: 0, y: 0, z: 0 };
    const a = {
      x: points[5].x - points[0].x,
      y: points[5].y - points[0].y,
      z: (points[5].z || 0) - (points[0].z || 0)
    };
    const b = {
      x: points[17].x - points[0].x,
      y: points[17].y - points[0].y,
      z: (points[17].z || 0) - (points[0].z || 0)
    };
    const cross = {
      x: a.y * b.z - a.z * b.y,
      y: a.z * b.x - a.x * b.z,
      z: a.x * b.y - a.y * b.x
    };
    const length = Math.hypot(cross.x, cross.y, cross.z) || 1;
    return { x: cross.x / length, y: cross.y / length, z: cross.z / length };
  }

  function openness(points = []) {
    if (points.length < 21) return 0;
    const wrist = points[0];
    const palmWidth = Math.max(0.025, distance(points[5], points[17]));
    const tips = [4, 8, 12, 16, 20];
    const avg = tips.reduce((sum, id) => sum + distance(points[id], wrist), 0) / tips.length;
    return Math.max(0, Math.min(1, (avg / palmWidth - 1.28) / 1.32));
  }

  function palmRotation(points = []) {
    if (points.length < 10) return 0;
    return Math.atan2(points[9].y - points[0].y, points[9].x - points[0].x);
  }

  function center(points = []) {
    const ids = [0, 5, 9, 13, 17];
    const items = ids.map((id) => points[id]).filter(Boolean);
    if (!items.length) return { x: 0.5, y: 0.5, z: 0 };
    return items.reduce((acc, point) => ({
      x: acc.x + Number(point.x || 0) / items.length,
      y: acc.y + Number(point.y || 0) / items.length,
      z: acc.z + Number(point.z || 0) / items.length
    }), { x: 0, y: 0, z: 0 });
  }

  async function buildRecognizer() {
    if (recognizer || loading) return recognizer;
    loading = true;
    status.classList.add('visible');
    status.textContent = 'NEURAL GESTURES // LOADING';
    try {
      const { FilesetResolver, GestureRecognizer } = await import(MEDIAPIPE_MODULE);
      const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM);
      let lastError = null;
      for (const candidate of ['GPU', 'CPU']) {
        try {
          recognizer = await GestureRecognizer.createFromOptions(vision, {
            baseOptions: { modelAssetPath: GESTURE_MODEL, delegate: candidate },
            runningMode: 'VIDEO',
            numHands: 2,
            minHandDetectionConfidence: 0.48,
            minHandPresenceConfidence: 0.48,
            minTrackingConfidence: 0.43
          });
          delegate = candidate;
          break;
        } catch (error) {
          lastError = error;
        }
      }
      if (!recognizer) throw lastError || new Error('Gesture Recognizer indisponível.');
      status.textContent = `NEURAL GESTURES // ${delegate}`;
      log(`Modelo carregado (${delegate}) // duas palmas ativam, indicador move, pinça + toque na câmera seleciona.`);
      return recognizer;
    } catch (error) {
      status.textContent = 'NEURAL GESTURES // ERROR';
      log(`Falha ao carregar rastreamento: ${error?.message || error}`, true);
      return null;
    } finally {
      loading = false;
    }
  }

  function stagePoint(landmark, speed = 0) {
    const rect = stage.getBoundingClientRect();
    const targetX = (1 - Number(landmark?.x || 0.5)) * rect.width;
    const targetY = Number(landmark?.y || 0.5) * rect.height;
    const mobile = window.matchMedia?.('(max-width: 650px)')?.matches === true;
    const base = mobile ? 0.82 : 0.72;
    const factor = Math.min(0.96, base + Math.min(0.14, speed * 0.06));

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

  function showCursor(point, pinching = false) {
    cursor.classList.add('visible');
    cursor.classList.toggle('pinching', pinching);
    cursor.style.setProperty('--hand-x', `${point.localX}px`);
    cursor.style.setProperty('--hand-y', `${point.localY}px`);
    if (!pinching) cursor.style.transform = `translate3d(${point.localX}px,${point.localY}px,0) scale(.72)`;
    else cursor.style.removeProperty('transform');
  }

  function hideCursor() {
    cursor.classList.remove('visible', 'pinching', 'dragging', 'frozen');
    cursor.style.transform = 'translate3d(-9999px,-9999px,0) scale(.72)';
    window.ULTRON_STARK_MESH?.clearFocus?.();
    lastTarget = null;
  }

  function focusAt(point) {
    const mobile = window.matchMedia?.('(max-width: 650px)')?.matches === true;
    lastTarget = window.ULTRON_STARK_MESH?.focusAtViewport?.(
      point.clientX,
      point.clientY,
      mobile ? 124 : 96
    ) || null;
    return lastTarget;
  }

  function findTargetNode(target) {
    if (!target) return null;
    const wantedLabel = String(target.label || target.target || '').trim().toUpperCase();
    const wantedId = String(target.fileId || '').trim();
    return [...document.querySelectorAll('.stark-functional-node')].find((node) => {
      const label = String(node.dataset.label || '').trim().toUpperCase();
      const fileId = String(node.dataset.fileId || '').trim();
      return (wantedId && fileId === wantedId) || (wantedLabel && label === wantedLabel);
    }) || null;
  }

  function startDrag(target, point) {
    const node = findTargetNode(target);
    if (!node) return false;
    drag = {
      node,
      startClientX: point.clientX,
      startClientY: point.clientY,
      startX: parseFloat(node.style.getPropertyValue('--x')) || 0,
      startY: parseFloat(node.style.getPropertyValue('--y')) || 0,
      startZ: parseFloat(node.style.getPropertyValue('--z')) || 0,
      moved: false
    };
    node.classList.add('is-dragging');
    cursor.classList.add('dragging');
    return true;
  }

  function dragTo(point) {
    if (!drag) return false;
    const dx = point.clientX - drag.startClientX;
    const dy = point.clientY - drag.startClientY;
    drag.moved ||= Math.hypot(dx, dy) > 6;
    drag.node.style.setProperty('--x', `${drag.startX + dx}px`);
    drag.node.style.setProperty('--y', `${drag.startY + dy}px`);
    drag.node.style.setProperty('--z', `${drag.startZ + Math.max(-48, Math.min(48, -dy * 0.18))}px`);
    return drag.moved;
  }

  function endDrag() {
    if (!drag) return { moved: false };
    const result = { moved: drag.moved, label: drag.node.dataset.label || null };
    drag.node.classList.remove('is-dragging');
    cursor.classList.remove('dragging');
    drag = null;
    return result;
  }

  function activate(reason = 'two-open-palms') {
    if (systemActive) return true;
    systemActive = true;
    stage.classList.add('neural-gesture-v420', 'neural-gesture-active', 'neural-gesture-activation-flash');
    setTimeout(() => stage.classList.remove('neural-gesture-activation-flash'), 760);
    status.classList.add('visible', 'open');
    status.textContent = 'NEURAL INTERFACE // ACTIVE';
    navigator.vibrate?.([24, 34, 42]);
    window.dispatchEvent(new CustomEvent('ultron:neural-gesture-activated', {
      detail: { reason, handCount: 2, confidence: 1 }
    }));
    log('SISTEMA ATIVADO: duas palmas abertas detectadas. Interface holográfica liberada.');
    return true;
  }

  function choosePrimary(result) {
    const candidates = (result?.landmarks || []).map((landmarks, index) => ({
      landmarks,
      gesture: result?.gestures?.[index]?.[0] || null,
      handedness: result?.handedness?.[index]?.[0] || null,
      index
    }));
    if (!candidates.length) return null;
    return candidates.sort((a, b) => {
      const ac = String(a.gesture?.categoryName || '');
      const bc = String(b.gesture?.categoryName || '');
      const ap = ac === 'Pointing_Up' ? 2 : ac === 'Open_Palm' ? 1 : 0;
      const bp = bc === 'Pointing_Up' ? 2 : bc === 'Open_Palm' ? 1 : 0;
      return bp - ap || Number(b.gesture?.score || 0) - Number(a.gesture?.score || 0);
    })[0];
  }

  function checkActivation(result) {
    const landmarksList = result?.landmarks || [];
    const gestures = result?.gestures || [];
    if (landmarksList.length < 2) {
      activationFrames = Math.max(0, activationFrames - 1);
      return;
    }
    let openFacing = 0;
    for (let i = 0; i < Math.min(landmarksList.length, 2); i += 1) {
      const gesture = gestures?.[i]?.[0];
      const points = landmarksList[i];
      const normal = palmNormal(points);
      if (
        String(gesture?.categoryName || '') === 'Open_Palm' &&
        Number(gesture?.score || 0) >= 0.48 &&
        Math.abs(normal.z) >= 0.22
      ) openFacing += 1;
    }
    if (openFacing >= 2) activationFrames = Math.min(5, activationFrames + 1);
    else activationFrames = Math.max(0, activationFrames - 1);
    if (activationFrames >= 2) activate('two-open-palms');
  }

  async function selectTarget(target, confidence, point, touchMetrics) {
    if (!target) return false;
    const now = performance.now();
    if (now - lastSelectAt < 500) return false;
    lastSelectAt = now;
    const detail = {
      label: target.label,
      target: target.label,
      fileId: target.fileId || null,
      confidence,
      gesture: 'pinch-camera-touch',
      cameraTap: true,
      approachRate: touchMetrics.approachRate,
      span: touchMetrics.span,
      x: point.clientX,
      y: point.clientY
    };
    window.dispatchEvent(new CustomEvent('ultron:camera-hand-select', { detail }));

    let handled = false;
    if (window.ULTRON_FILE_INSPECTOR?.open) {
      handled = Boolean(await Promise.resolve(window.ULTRON_FILE_INSPECTOR.open(detail)).catch(() => false));
    }
    if (!handled && window.ULTRON_FILE_MESH?.active) {
      handled = Boolean(window.ULTRON_FILE_MESH.openFileNode?.(target.fileId || target.label));
    }
    if (!handled) {
      window.ULTRON_STARK_CORE?.focus?.(target.label);
      handled = Boolean(window.ULTRON_STARK_CORE?.open?.(target.label));
    }
    navigator.vibrate?.(handled ? 30 : 12);
    if (handled) log(`${target.label}: selecionado por pinça + toque superficial na câmera.`);
    return handled;
  }

  function handleResult(result, now) {
    checkActivation(result);
    const primary = choosePrimary(result);
    if (!primary?.landmarks?.length) {
      if (!pinchDown) hideCursor();
      status.classList.add('visible');
      status.textContent = systemActive ? 'NEURAL GESTURES // SEARCHING' : 'MOSTRE AS DUAS PALMAS PARA ATIVAR';
      previousPrimary = null;
      return;
    }

    const points = primary.landmarks;
    const gesture = primary.gesture;
    const category = String(gesture?.categoryName || 'None');
    const confidence = Number(gesture?.score || 0);
    lastGesture = category;
    lastConfidence = confidence;

    const indexTip = points[8];
    const thumbTip = points[4];
    const palmWidth = Math.max(0.025, distance(points[5], points[17]));
    const pinchRatio = distance(indexTip, thumbTip) / palmWidth;
    const pinching = pinchRatio < 0.39;
    const span = handSpan(points);
    const openValue = openness(points);
    const rotation = palmRotation(points);
    const normal = palmNormal(points);
    const palmCenter = center(points);

    const dt = previousPrimary ? Math.max(0.025, (now - previousPrimary.time) / 1000) : 0.08;
    const dx = previousPrimary ? palmCenter.x - previousPrimary.center.x : 0;
    const dy = previousPrimary ? palmCenter.y - previousPrimary.center.y : 0;
    const handSpeed = Math.hypot(dx, dy) / dt;
    const approachRate = previousPrimary ? (span - previousPrimary.span) / dt : 0;
    const opennessVelocity = previousPrimary ? (openValue - previousPrimary.openness) / dt : 0;

    const isIndexPoint = category === 'Pointing_Up' && confidence >= 0.38;
    const canPoint = systemActive && (isIndexPoint || pinching);
    let point = null;
    let cameraTap = false;

    if (canPoint) {
      point = stagePoint(indexTip, handSpeed);
      lastTarget = focusAt(point);
      showCursor(point, pinching);

      if (pinching) {
        if (!pinchDown) {
          pinchDown = true;
          if (lastTarget) startDrag(lastTarget, point);
        } else {
          dragTo(point);
        }

        const deliberateApproach = approachRate > 0.48 && span >= 0.20;
        const nearLens = span >= 0.46 && approachRate > 0.18;
        const tapCooldown = now - lastCameraTapAt > 700;
        if (lastTarget && tapCooldown && (deliberateApproach || nearLens)) {
          cameraTap = true;
          lastCameraTapAt = now;
          endDrag();
          selectTarget(lastTarget, Math.max(confidence, 0.72), point, { approachRate, span }).catch(() => {});
        }
      } else if (pinchDown) {
        pinchDown = false;
        endDrag();
      }

      status.classList.add('visible');
      status.classList.toggle('pinch', pinching);
      status.classList.add('open');
      status.textContent = pinching
        ? (lastTarget ? `PINCH ARMADA // TOQUE A CÂMERA // ${lastTarget.label}` : 'PINCH ARMADA // SEM ALVO')
        : (lastTarget ? `INDEX POINTER // ${lastTarget.label}` : 'INDEX POINTER // MOVENDO');
    } else {
      if (pinchDown) {
        pinchDown = false;
        endDrag();
      }
      hideCursor();
      status.classList.add('visible');
      status.classList.remove('pinch');
      status.classList.toggle('open', systemActive);
      status.textContent = systemActive ? `HAND // ${category.toUpperCase()}` : 'MOSTRE AS DUAS PALMAS PARA ATIVAR';
    }

    const normalizedLandmarks = points.map((item) => ({
      x: Number(item.x || 0),
      y: Number(item.y || 0),
      z: Number(item.z || 0)
    }));

    window.dispatchEvent(new CustomEvent('ultron:camera-hand', {
      detail: {
        gesture: category,
        confidence,
        pinch: pinching,
        pinchRatio,
        target: lastTarget?.label || null,
        fileId: lastTarget?.fileId || null,
        x: point?.localX ?? smoothX,
        y: point?.localY ?? smoothY,
        handSpan: span,
        palmWidth,
        openness: openValue,
        opennessVelocity,
        palmRotation: rotation,
        palmNormal: normal,
        palmCenter,
        approachRate,
        handSpeed,
        pointerActive: canPoint,
        systemActive,
        handCount: result?.landmarks?.length || 0,
        cameraTap,
        controlMode: pinching ? 'pinch-touch-ready' : (canPoint ? 'pointer' : (systemActive ? 'tracking' : 'activation-wait')),
        landmarks: normalizedLandmarks
      }
    }));

    previousPrimary = { time: now, span, openness: openValue, center: palmCenter, rotation };
  }

  function loop(now = performance.now()) {
    raf = requestAnimationFrame(loop);
    if (document.hidden || !enabled || !recognizer || running) return;
    if (video.readyState < 2 || !video.videoWidth || !video.videoHeight) return;
    const inferenceMs = Math.max(68, Number(perf().handInferenceMs || 78));
    if (now - lastInferenceAt < inferenceMs) return;
    if (video.currentTime === lastVideoTime) return;
    lastInferenceAt = now;
    lastVideoTime = video.currentTime;
    running = true;
    try {
      handleResult(recognizer.recognizeForVideo(video, now), now);
    } catch (error) {
      console.warn('ULTRON gesture v4.20:', error);
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
    status.textContent = systemActive ? `NEURAL GESTURES // ${delegate}` : 'MOSTRE AS DUAS PALMAS PARA ATIVAR';
    if (!raf) raf = requestAnimationFrame(loop);
    return true;
  }

  function disable() {
    enabled = false;
    pinchDown = false;
    endDrag();
    hideCursor();
    status.textContent = 'NEURAL GESTURES // STANDBY';
  }

  video.addEventListener('playing', () => enable());
  video.addEventListener('emptied', () => {
    if (!video.src && !video.srcObject) disable();
  });

  window.addEventListener('beforeunload', () => {
    if (raf) cancelAnimationFrame(raf);
    raf = null;
    try { recognizer?.close?.(); } catch {}
  });

  window.ULTRON_HAND_GESTURES = {
    enable,
    disable,
    activate,
    get enabled() { return enabled; },
    get ready() { return Boolean(recognizer); },
    get state() {
      return {
        enabled,
        ready: Boolean(recognizer),
        delegate,
        systemActive,
        gesture: lastGesture,
        confidence: lastConfidence,
        target: lastTarget?.label || null,
        pinching: pinchDown,
        dragging: drag?.node?.dataset?.label || null,
        inferenceMs: Number(perf().handInferenceMs || 78)
      };
    }
  };

  if (video.readyState >= 2 && video.videoWidth) enable();
}
