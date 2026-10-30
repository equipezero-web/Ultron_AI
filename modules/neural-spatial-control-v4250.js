const stage = document.querySelector('.neural-stage');
const orbStage = document.querySelector('.orb-stage');
const body = document.body;

if (stage && orbStage) {
  body.classList.add('ultron-neural-focus');

  const state = {
    rx: 0,
    ry: 0,
    rz: 0,
    scale: 1,
    depth: 0,
    targetRx: 0,
    targetRy: 0,
    targetRz: 0,
    targetScale: 1,
    targetDepth: 0,
    handCount: 0,
    gesture: 'NONE',
    source: 'IDLE',
    dragging: false,
    lastPointerX: 0,
    lastPointerY: 0,
    lastHandCenter: null,
    lastHandRotation: null,
    lastHandAt: 0,
    lastFrameAt: performance.now()
  };

  const readouts = {
    azimuth: document.getElementById('orb-azimuth'),
    elevation: document.getElementById('orb-elevation'),
    depth: document.getElementById('orb-depth'),
    hands: document.getElementById('orb-hands'),
    gesture: document.getElementById('optical-gesture'),
    handCount: document.getElementById('optical-hands')
  };

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function wrap360(value) {
    const next = Number(value || 0) % 360;
    return next < 0 ? next + 360 : next;
  }

  function shortestAngleDelta(next, previous) {
    let delta = next - previous;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    return delta;
  }

  function updateReadouts() {
    if (readouts.azimuth) readouts.azimuth.textContent = `${Math.round(wrap360(state.ry))}°`;
    if (readouts.elevation) readouts.elevation.textContent = `${Math.round(state.rx)}°`;
    if (readouts.depth) readouts.depth.textContent = `${Math.round(state.scale * 100)}%`;
    if (readouts.hands) readouts.hands.textContent = `${state.handCount}`;
    if (readouts.gesture) readouts.gesture.textContent = state.gesture || 'TRACKING';
    if (readouts.handCount) readouts.handCount.textContent = `${state.handCount}`;
  }

  function setAngle(name, value) {
    body.style.setProperty(name, `${Number(value || 0).toFixed(2)}deg`);
  }

  function applyCss() {
    setAngle('--orb-rx', state.rx);
    setAngle('--orb-ry', state.ry);
    setAngle('--orb-rz', state.rz);
    setAngle('--orb-rx-grid', state.rx * -0.18);
    setAngle('--orb-ry-grid', state.ry * -0.18);
    setAngle('--orb-rx-h1', state.rx * 0.28);
    setAngle('--orb-ry-h1', state.ry * 0.28);
    setAngle('--orb-rx-h2', state.rx * -0.18);
    setAngle('--orb-ry-h2', state.ry * -0.22);
    setAngle('--orb-rz-h2', state.rz * -0.65);
    setAngle('--orb-rx-h3', state.rx * 0.12);
    setAngle('--orb-ry-h3', state.ry * 0.16);
    setAngle('--orb-rz-h3', state.rz * 0.42);
    setAngle('--orb-rx-o1', state.rx * 0.35);
    setAngle('--orb-ry-o1', state.ry * 0.32);
    setAngle('--orb-rx-o2', state.rx * -0.22);
    setAngle('--orb-ry-o2', state.ry * 0.20);
    setAngle('--orb-rx-o3', state.rx * 0.18);
    setAngle('--orb-ry-o3', state.ry * -0.18);
    body.style.setProperty('--orb-scale', state.scale.toFixed(4));
    body.style.setProperty('--orb-depth', `${state.depth.toFixed(1)}px`);
    const brightness = clamp(1.02 + Math.abs(state.scale - 1) * .28 + state.handCount * .025, 1.02, 1.2);
    body.style.setProperty('--orb-brightness', brightness.toFixed(3));
    updateReadouts();
  }

  function animate(now = performance.now()) {
    const dt = Math.min(32, Math.max(8, now - state.lastFrameAt));
    state.lastFrameAt = now;
    const alpha = 1 - Math.pow(0.001, dt / 1000);
    const fast = Math.min(.32, Math.max(.12, alpha * 3.4));

    state.rx += (state.targetRx - state.rx) * fast;
    state.ry += (state.targetRy - state.ry) * fast;
    state.rz += (state.targetRz - state.rz) * fast;
    state.scale += (state.targetScale - state.scale) * fast;
    state.depth += (state.targetDepth - state.depth) * fast;

    applyCss();
    requestAnimationFrame(animate);
  }

  function handleHand(event) {
    const detail = event?.detail || {};
    const center = detail.palmCenter;
    const rotation = Number(detail.palmRotation || 0);
    const span = Number(detail.handSpan || 0);
    const openness = Number(detail.openness || 0);
    const count = Number(detail.handCount || 0);

    state.handCount = count;
    state.gesture = String(detail.gesture || 'TRACKING').replaceAll('_', ' ').toUpperCase();
    state.source = 'OPTICAL_HAND';
    state.lastHandAt = performance.now();

    if (center && Number.isFinite(center.x) && Number.isFinite(center.y)) {
      if (state.lastHandCenter) {
        const dx = Number(center.x) - state.lastHandCenter.x;
        const dy = Number(center.y) - state.lastHandCenter.y;
        const speed = clamp(Number(detail.handSpeed || 0), 0, 2.6);
        const gain = 210 + speed * 95;
        state.targetRy = wrap360(state.targetRy - dx * gain);
        state.targetRx = clamp(state.targetRx + dy * gain * .72, -82, 82);
      }
      state.lastHandCenter = { x: Number(center.x), y: Number(center.y) };
    }

    if (state.lastHandRotation !== null && Number.isFinite(rotation)) {
      const deltaRotation = shortestAngleDelta(rotation, state.lastHandRotation);
      state.targetRz = wrap360(state.targetRz + deltaRotation * (180 / Math.PI) * .72);
    }
    state.lastHandRotation = rotation;

    if (span > 0) {
      const baseScale = .88 + clamp((span - .12) * 1.35, 0, .48);
      const openBoost = clamp((openness - .45) * .12, -.04, .08);
      state.targetScale = clamp(baseScale + openBoost, .82, 1.38);
      state.targetDepth = clamp((state.targetScale - 1) * 110, -28, 48);
    }

    if (detail.pinch) state.targetScale = clamp(state.targetScale + .018, .82, 1.42);
  }

  function resetHandAnchor() {
    if (performance.now() - state.lastHandAt > 260) {
      state.lastHandCenter = null;
      state.lastHandRotation = null;
      state.handCount = 0;
      if (!state.dragging) state.source = 'IDLE';
    }
  }

  function pointerDown(event) {
    if (event.button !== undefined && event.button !== 0) return;
    state.dragging = true;
    state.source = 'POINTER';
    state.lastPointerX = event.clientX;
    state.lastPointerY = event.clientY;
    orbStage.setPointerCapture?.(event.pointerId);
  }

  function pointerMove(event) {
    if (!state.dragging) return;
    const dx = event.clientX - state.lastPointerX;
    const dy = event.clientY - state.lastPointerY;
    state.lastPointerX = event.clientX;
    state.lastPointerY = event.clientY;
    state.targetRy = wrap360(state.targetRy + dx * .48);
    state.targetRx = clamp(state.targetRx - dy * .36, -82, 82);
  }

  function pointerUp(event) {
    state.dragging = false;
    orbStage.releasePointerCapture?.(event.pointerId);
  }

  function wheel(event) {
    event.preventDefault();
    state.targetScale = clamp(state.targetScale - event.deltaY * .00055, .78, 1.48);
    state.targetDepth = clamp((state.targetScale - 1) * 120, -34, 54);
  }

  function reset() {
    state.targetRx = 0;
    state.targetRy = 0;
    state.targetRz = 0;
    state.targetScale = 1;
    state.targetDepth = 0;
    state.lastHandCenter = null;
    state.lastHandRotation = null;
  }

  window.addEventListener('ultron:camera-hand', handleHand);
  window.addEventListener('ultron:camera-stream', (event) => {
    if (event?.detail?.active) {
      state.source = 'OPTICAL_CAMERA';
      stage.classList.add('optical-linked');
    } else {
      stage.classList.remove('optical-linked');
    }
  });
  window.addEventListener('ultron:mobile-camera-source', (event) => {
    if (event?.detail?.active) stage.classList.add('optical-linked');
  });

  orbStage.addEventListener('pointerdown', pointerDown);
  orbStage.addEventListener('pointermove', pointerMove);
  orbStage.addEventListener('pointerup', pointerUp);
  orbStage.addEventListener('pointercancel', pointerUp);
  orbStage.addEventListener('wheel', wheel, { passive: false });
  orbStage.addEventListener('dblclick', reset);

  setInterval(resetHandAnchor, 180);
  requestAnimationFrame(animate);

  window.ULTRON_NEURAL_3D = {
    reset,
    rotateBy({ x = 0, y = 0, z = 0 } = {}) {
      state.targetRx = clamp(state.targetRx + Number(x || 0), -82, 82);
      state.targetRy = wrap360(state.targetRy + Number(y || 0));
      state.targetRz = wrap360(state.targetRz + Number(z || 0));
      return { ...state };
    },
    zoom(value = 1) {
      state.targetScale = clamp(Number(value || 1), .78, 1.48);
      state.targetDepth = clamp((state.targetScale - 1) * 120, -34, 54);
      return state.targetScale;
    },
    get state() {
      return {
        rx: state.rx,
        ry: wrap360(state.ry),
        rz: wrap360(state.rz),
        scale: state.scale,
        depth: state.depth,
        handCount: state.handCount,
        gesture: state.gesture,
        source: state.source
      };
    }
  };

  window.dispatchEvent(new CustomEvent('ultron:neural-spatial-ready', {
    detail: { version: '4.25.0', hand360: true, pointer360: true, wheelDepth: true }
  }));
}
