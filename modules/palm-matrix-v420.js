const stage = document.querySelector('.neural-stage');
const vortex = document.querySelector('.stark-vortex');
const output = document.getElementById('output-box');

if (stage && vortex) {
  let previous = null;
  let yawDeg = 0;
  let pitchDeg = 0;
  let scale = 1;
  let coarseZoom = 0;
  let lastAction = 'standby';
  let lastMetrics = null;
  let zoomPhase = 'idle';

  const hud = document.createElement('div');
  hud.className = 'palm-matrix-hud';
  hud.innerHTML = `
    <div class="palm-matrix-title"><span>PALM MATRIX 4.20</span><strong>STANDBY</strong></div>
    <div class="palm-vector-glyph" aria-hidden="true"><i></i><b></b></div>
    <div class="palm-matrix-data">
      <span data-palm="gesture">GESTURE // --</span>
      <span data-palm="rotation">ROTATION // --</span>
      <span data-palm="zoom">ZOOM // 1.00x</span>
      <span data-palm="speed">SPEED // --</span>
    </div>
  `;
  stage.appendChild(hud);

  const title = hud.querySelector('.palm-matrix-title strong');
  const gestureReadout = hud.querySelector('[data-palm="gesture"]');
  const rotationReadout = hud.querySelector('[data-palm="rotation"]');
  const zoomReadout = hud.querySelector('[data-palm="zoom"]');
  const speedReadout = hud.querySelector('[data-palm="speed"]');

  function log(message) {
    if (!output) return;
    const line = document.createElement('p');
    const time = new Date().toLocaleTimeString('pt-BR', { hour12: false });
    line.textContent = `> [${time}] [PALM-4.20] ${message}`;
    output.appendChild(line);
    output.scrollTop = output.scrollHeight;
  }

  function angleDelta(current, prior) {
    let delta = current - prior;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    return delta;
  }

  function emit(type, detail = {}) {
    lastAction = type;
    title.textContent = type.toUpperCase().replaceAll('-', ' ');
    hud.classList.add('active');
    clearTimeout(emit._timer);
    emit._timer = setTimeout(() => {
      hud.classList.remove('active');
      title.textContent = detail.systemActive === false ? 'WAITING' : 'TRACKING';
    }, 420);
    window.dispatchEvent(new CustomEvent(`ultron:palm-${type}`, { detail }));
  }

  function setScale(next, detail = {}) {
    scale = Math.max(0.86, Math.min(1.68, Number(next) || 1));
    vortex.style.setProperty('--gesture-scale', scale.toFixed(4));
    stage.style.setProperty('--gesture-scale', scale.toFixed(4));
    stage.dataset.gestureZoom = scale.toFixed(2);

    const nextCoarse = scale >= 1.42 ? 2 : scale >= 1.12 ? 1 : 0;
    if (nextCoarse !== coarseZoom) {
      coarseZoom = nextCoarse;
      window.ULTRON_STARK_MESH?.setZoomLevel?.(coarseZoom);
    }

    zoomReadout.textContent = `ZOOM // ${scale.toFixed(2)}x`;
    window.dispatchEvent(new CustomEvent('ultron:stark-continuous-scale', {
      detail: { scale, coarseZoom, ...detail }
    }));
  }

  function rotateSphere(rotationStep, detail) {
    const stepDeg = rotationStep * 180 / Math.PI;
    if (Math.abs(stepDeg) < 0.22) return;
    const gain = Math.min(2.25, 1 + Math.abs(Number(detail.handSpeed || 0)) * 0.18);
    yawDeg += stepDeg * gain;
    pitchDeg = Math.max(-42, Math.min(42, Number(detail.palmNormal?.y || 0) * 34));
    vortex.style.setProperty('--tilt-y', `${yawDeg.toFixed(2)}deg`);
    vortex.style.setProperty('--tilt-x', `${pitchDeg.toFixed(2)}deg`);
    rotationReadout.textContent = `ROTATION // ${Math.round(yawDeg)}°`;
    emit('rotate', {
      ...detail,
      delta: rotationStep,
      degrees: stepDeg,
      yaw: yawDeg,
      pitch: pitchDeg,
      direction: rotationStep >= 0 ? 'clockwise' : 'counterclockwise'
    });
  }

  function zoomFromOpenness(detail) {
    const open = Math.max(0, Math.min(1, Number(detail.openness || 0)));
    const velocity = Number(detail.opennessVelocity || 0);
    const gesture = String(detail.gesture || '');
    const closed = gesture === 'Closed_Fist' || open <= 0.24;
    const clearlyOpen = gesture === 'Open_Palm' || open >= 0.72;

    if (zoomPhase === 'idle') {
      if ((previous?.openness ?? open) <= 0.36 && velocity > 0.20) zoomPhase = 'opening';
      else if ((previous?.openness ?? open) >= 0.64 && velocity < -0.20) zoomPhase = 'closing';
    }

    if (zoomPhase === 'opening') {
      const target = 0.90 + open * 0.76;
      setScale(target, { direction: 'in', openness: open, velocity });
      emit('zoom-in', { ...detail, scale, openness: open, velocity });
      if (clearlyOpen && Math.abs(velocity) < 0.16) zoomPhase = 'idle';
      return;
    }

    if (zoomPhase === 'closing') {
      if (closed) {
        setScale(1, { direction: 'out', centered: true, openness: open, velocity });
        vortex.style.setProperty('--tilt-x', `${pitchDeg.toFixed(2)}deg`);
        emit('zoom-out', { ...detail, scale: 1, openness: open, velocity, centered: true });
        zoomPhase = 'idle';
      } else {
        const target = 0.90 + open * 0.76;
        setScale(target, { direction: 'out', openness: open, velocity });
        emit('zoom-out', { ...detail, scale, openness: open, velocity, centered: false });
      }
    }
  }

  function handleHand(detail = {}) {
    if (!detail.systemActive) {
      title.textContent = 'WAITING';
      return;
    }
    const now = performance.now();
    const rotation = Number(detail.palmRotation || 0);
    const rotationStep = previous ? angleDelta(rotation, previous.rotation) : 0;
    const metrics = {
      ...detail,
      rotation,
      rotationStep,
      scale,
      yaw: yawDeg,
      pitch: pitchDeg,
      zoomPhase
    };
    lastMetrics = metrics;

    gestureReadout.textContent = `GESTURE // ${String(detail.gesture || 'NONE').toUpperCase()} ${Math.round(Number(detail.confidence || 0) * 100)}%`;
    speedReadout.textContent = `SPEED // ${Number(detail.handSpeed || 0).toFixed(2)} · OPEN ${Number(detail.opennessVelocity || 0).toFixed(2)}`;

    if (!detail.pointerActive && !detail.pinch) {
      rotateSphere(rotationStep, metrics);
      zoomFromOpenness(metrics);
    }

    previous = {
      time: now,
      rotation,
      openness: Number(detail.openness || 0)
    };
  }

  window.addEventListener('ultron:neural-gesture-activated', () => {
    stage.classList.add('neural-gesture-v420');
    title.textContent = 'TRACKING';
    log('PALM MATRIX 4.20 ATIVA: rotação 360° + zoom proporcional habilitados.');
  });
  window.addEventListener('ultron:camera-hand', (event) => handleHand(event.detail || {}));

  window.ULTRON_PALM_MATRIX = {
    reset() {
      previous = null;
      yawDeg = 0;
      pitchDeg = 0;
      zoomPhase = 'idle';
      setScale(1, { centered: true });
      vortex.style.setProperty('--tilt-y', '0deg');
      vortex.style.setProperty('--tilt-x', '0deg');
      title.textContent = 'STANDBY';
      lastAction = 'standby';
      lastMetrics = null;
    },
    get state() {
      return {
        active: Boolean(lastMetrics),
        lastAction,
        scale,
        yaw: yawDeg,
        pitch: pitchDeg,
        zoomPhase,
        metrics: lastMetrics
      };
    }
  };
}
