const stage = document.querySelector('.neural-stage');
const vortex = document.querySelector('.stark-vortex');
const output = document.getElementById('output-box');

if (stage && vortex) {
  const hud = document.createElement('div');
  hud.className = 'palm-matrix-hud';
  hud.innerHTML = `
    <div class="palm-matrix-title"><span>PALM-TRACKING MATRIX</span><strong>STANDBY</strong></div>
    <div class="palm-vector-glyph" aria-hidden="true"><i></i><b></b></div>
    <div class="palm-matrix-data">
      <span data-palm="gesture">GESTURE // --</span>
      <span data-palm="vector">NORMAL // --</span>
      <span data-palm="velocity">VELOCITY // --</span>
      <span data-palm="rotation">DIAL // --</span>
    </div>
  `;
  stage.appendChild(hud);

  const title = hud.querySelector('.palm-matrix-title strong');
  const vectorGlyph = hud.querySelector('.palm-vector-glyph');
  const gestureReadout = hud.querySelector('[data-palm="gesture"]');
  const vectorReadout = hud.querySelector('[data-palm="vector"]');
  const velocityReadout = hud.querySelector('[data-palm="velocity"]');
  const rotationReadout = hud.querySelector('[data-palm="rotation"]');

  let previous = null;
  let dialAccumulator = 0;
  let meshYaw = 0;
  let lastPalmEvent = 0;
  let lastAction = 'standby';
  let lastMetrics = null;
  let moveReady = false;
  let pushIntentFrames = 0;
  let closedIntentFrames = 0;
  const cooldowns = new Map();

  function log(message) {
    if (!output) return;
    const line = document.createElement('p');
    const time = new Date().toLocaleTimeString('pt-BR', { hour12: false });
    line.textContent = `> [${time}] [PALM-MATRIX] ${message}`;
    output.appendChild(line);
    output.scrollTop = output.scrollHeight;
  }

  function vsub(a, b) {
    return { x: a.x - b.x, y: a.y - b.y, z: (a.z || 0) - (b.z || 0) };
  }

  function cross(a, b) {
    return {
      x: a.y * b.z - a.z * b.y,
      y: a.z * b.x - a.x * b.z,
      z: a.x * b.y - a.y * b.x
    };
  }

  function normalize(v) {
    const length = Math.hypot(v.x, v.y, v.z) || 1;
    return { x: v.x / length, y: v.y / length, z: v.z / length };
  }

  function center(points) {
    const ids = [0, 5, 9, 13, 17];
    const items = ids.map((id) => points[id]).filter(Boolean);
    if (!items.length) return { x: 0.5, y: 0.5, z: 0 };
    return items.reduce((acc, point) => ({
      x: acc.x + point.x / items.length,
      y: acc.y + point.y / items.length,
      z: acc.z + (point.z || 0) / items.length
    }), { x: 0, y: 0, z: 0 });
  }

  function angleDelta(current, prior) {
    let delta = current - prior;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    return delta;
  }

  function canFire(key, ms) {
    const now = performance.now();
    const last = cooldowns.get(key) || 0;
    if (now - last < ms) return false;
    cooldowns.set(key, now);
    return true;
  }

  function emit(type, detail = {}) {
    lastPalmEvent = Date.now();
    lastAction = type;
    title.textContent = type.toUpperCase().replaceAll('-', ' ');
    hud.classList.add('active');
    clearTimeout(emit._timer);
    emit._timer = setTimeout(() => {
      hud.classList.remove('active');
      title.textContent = moveReady ? 'MOVE READY' : 'TRACKING';
    }, 720);
    window.dispatchEvent(new CustomEvent(`ultron:palm-${type}`, { detail }));
  }

  function triggerExplosion() {
    stage.classList.remove('stark-file-explosion');
    void stage.offsetWidth;
    stage.classList.add('stark-file-explosion');
    setTimeout(() => stage.classList.remove('stark-file-explosion'), 760);
  }

  function doPush(metrics) {
    emit('push', metrics);
    triggerExplosion();

    const fileMesh = window.ULTRON_FILE_MESH;
    if (fileMesh?.active) {
      fileMesh.refresh?.({ requestLocal: false });
    } else if (fileMesh?.enter) {
      Promise.resolve(fileMesh.enter()).catch(() => {});
    } else {
      window.ULTRON_STARK_CORE?.open?.('ARQUIVOS');
    }

    log('PALM EXPLOSION: esfera de arquivos aberta.');
  }

  function doSweep(direction, metrics) {
    emit('sweep', { ...metrics, direction });
    if (window.ULTRON_FILE_LAB?.active) {
      window.ULTRON_FILE_LAB.sweep?.(direction);
    } else {
      meshYaw += direction === 'right' ? 26 : -26;
      vortex.style.setProperty('--tilt-y', `${meshYaw}deg`);
    }
    log(`THE SWEEP: workspace ${direction === 'right' ? 'direita' : 'esquerda'}.`);
  }

  function doFreeze(metrics) {
    emit('freeze', metrics);
    window.ULTRON_HAND_GESTURES?.freeze?.('palm-matrix');
    window.ULTRON_STARK_MESH?.endDrag?.({ persist: true });
    log('PALM FREEZE: posição mantida exatamente onde está.');
  }

  function doDial(delta, metrics) {
    const direction = delta > 0 ? 'clockwise' : 'counterclockwise';
    emit('dial', { ...metrics, delta, direction });
    if (window.ULTRON_FILE_LAB?.active) {
      window.ULTRON_FILE_LAB.dial?.(delta);
    } else {
      const level = window.ULTRON_STARK_MESH?.zoomLevel || 0;
      if (dialAccumulator > 0.22 && level < 2) {
        window.ULTRON_STARK_MESH?.setZoomLevel?.(level + 1);
        dialAccumulator = 0;
      } else if (dialAccumulator < -0.22 && level > 0) {
        window.ULTRON_STARK_MESH?.setZoomLevel?.(level - 1);
        dialAccumulator = 0;
      }
    }
  }

  function doHolder(metrics) {
    emit('holder', metrics);
    window.ULTRON_FILE_LAB?.showTable?.();
    log('HOLDER: mesa de dados chamada.');
  }

  function updateHud(metrics) {
    const { gesture, normal, speed, rotation, approachRate, confidence, controlMode } = metrics;
    const mode = String(controlMode || '').toUpperCase().replaceAll('-', ' ');
    gestureReadout.textContent = `GESTURE // ${gesture.toUpperCase()} ${(confidence * 100).toFixed(0)}%${mode ? ` · ${mode}` : ''}`;
    vectorReadout.textContent = `NORMAL // ${normal.x.toFixed(2)} ${normal.y.toFixed(2)} ${normal.z.toFixed(2)}`;
    velocityReadout.textContent = `VELOCITY // ${speed.toFixed(2)} · PUSH ${approachRate.toFixed(2)}`;
    rotationReadout.textContent = `DIAL // ${(rotation * 180 / Math.PI).toFixed(0)}°`;
    vectorGlyph.style.setProperty('--palm-rx', `${normal.y * 28}deg`);
    vectorGlyph.style.setProperty('--palm-ry', `${-normal.x * 28}deg`);
    vectorGlyph.style.setProperty('--palm-power', String(Math.min(1, Math.abs(normal.z))));
  }

  function handleHand(detail = {}) {
    const points = Array.isArray(detail.landmarks) ? detail.landmarks : [];
    if (points.length < 18) return;

    const now = performance.now();
    const palmCenter = center(points);
    const normal = normalize(cross(vsub(points[5], points[0]), vsub(points[17], points[0])));
    const rotation = Math.atan2(points[9].y - points[0].y, points[9].x - points[0].x);
    const gesture = String(detail.gesture || 'None');
    const confidence = Number(detail.confidence || 0);
    const span = Number(detail.handSpan || 0);
    const open = gesture === 'Open_Palm' && confidence >= 0.55;
    const closed = gesture === 'Closed_Fist' && confidence >= 0.58;

    const dt = previous ? Math.max(0.025, (now - previous.time) / 1000) : 0.08;
    const vx = previous ? (palmCenter.x - previous.center.x) / dt : 0;
    const vy = previous ? (palmCenter.y - previous.center.y) / dt : 0;
    const speed = Math.hypot(vx, vy);
    const approachRate = previous ? (span - previous.span) / dt : 0;
    const rotationStep = previous ? angleDelta(rotation, previous.rotation) : 0;
    dialAccumulator += rotationStep;

    const metrics = {
      gesture,
      confidence,
      center: palmCenter,
      normal,
      velocity: { x: vx, y: vy },
      speed,
      span,
      approachRate,
      rotation,
      rotationStep,
      zoomLevel: Number(detail.zoomLevel || 0),
      target: detail.target || null,
      movementArmed: Boolean(detail.movementArmed),
      frozen: Boolean(detail.frozen),
      pointerActive: Boolean(detail.pointerActive),
      controlMode: detail.controlMode || null
    };
    lastMetrics = metrics;
    updateHud(metrics);

    if (open) {
      moveReady = true;
      title.textContent = 'MOVE READY';
    }

    if (closed) closedIntentFrames = Math.min(4, closedIntentFrames + 1);
    else closedIntentFrames = 0;

    const facingPanel = Math.abs(normal.z) >= 0.34;
    const spanStable = Math.abs(approachRate) < 0.33;
    const deliberatePush = open && facingPanel && approachRate > 0.5 && !detail.frozen;

    if (deliberatePush) pushIntentFrames = Math.min(4, pushIntentFrames + 1);
    else pushIntentFrames = Math.max(0, pushIntentFrames - 1);

    if (closedIntentFrames >= 2 && canFire('freeze', 720)) {
      doFreeze(metrics);
      pushIntentFrames = 0;
    } else if (pushIntentFrames >= 2 && canFire('push', 1200)) {
      doPush(metrics);
      pushIntentFrames = 0;
    } else if (open && spanStable && Math.abs(vx) > 0.88 && Math.abs(vx) > Math.abs(vy) * 1.5 && canFire('sweep', 760)) {
      doSweep(vx > 0 ? 'right' : 'left', metrics);
    } else if (open && speed < 0.22 && Math.abs(rotationStep) > 0.04 && canFire('dial', 120)) {
      doDial(rotationStep, metrics);
    } else {
      const mcpSlope = Math.abs(points[5].y - points[17].y);
      if (open && speed < 0.14 && mcpSlope < 0.035 && Math.abs(normal.z) > 0.38 && canFire('holder', 2200)) {
        doHolder(metrics);
      }
    }

    previous = { time: now, center: palmCenter, rotation, span };
  }

  window.addEventListener('ultron:camera-hand', (event) => handleHand(event.detail || {}));
  window.addEventListener('ultron:camera-hand-mode', (event) => {
    const mode = String(event.detail?.mode || '');
    if (mode === 'move-armed') {
      moveReady = true;
      title.textContent = 'MOVE READY';
    }
    if (mode === 'frozen') {
      moveReady = false;
      title.textContent = 'FROZEN';
    }
  });

  window.ULTRON_PALM_MATRIX = {
    get state() {
      return {
        active: Boolean(lastMetrics),
        lastAction,
        lastPalmEvent,
        moveReady,
        metrics: lastMetrics
      };
    },
    reset() {
      previous = null;
      dialAccumulator = 0;
      pushIntentFrames = 0;
      closedIntentFrames = 0;
      moveReady = false;
      lastAction = 'standby';
      lastMetrics = null;
      title.textContent = 'STANDBY';
    }
  };
}
