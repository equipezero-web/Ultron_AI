const stage = document.querySelector('.neural-stage');
const output = document.getElementById('output-box');

if (!stage) {
  console.warn('ULTRON Stark-Core: .neural-stage ausente.');
} else {
  const layer = document.createElement('div');
  layer.className = 'stark-core-layer';
  layer.innerHTML = `
    <div class="stark-peripheral" aria-hidden="true">
      <div class="stark-readout lt"><small>VITA-FEED</small><strong id="stark-vitals" class="waiting">WAITING SENSOR</strong></div>
      <div class="stark-readout rt"><small>THREAT / CORE</small><strong id="stark-core-state">NOMINAL</strong></div>
      <div class="stark-readout lb"><small>GESTURE BUS</small><strong id="stark-gesture-state">POINTER READY</strong></div>
      <div class="stark-readout rb"><small>FOCUS TRACK</small><strong id="stark-focus-state">SIMULATED</strong></div>
    </div>
    <div class="stark-vortex" role="application" aria-label="Stark-Core volumetric interaction field">
      <div class="stark-vortex-ring r1"></div>
      <div class="stark-vortex-ring r2"></div>
      <div class="stark-vortex-ring r3"></div>
      <div class="stark-node-field"></div>
      <div class="stark-hud-label"><strong>STARK-CORE</strong><span>NEURAL MESH // READY</span></div>
    </div>
    <div class="stark-gesture-hint">PINCH/DRAG: ROTATE · TAP: EXPAND · SWIPE: WORKSPACE · WHEEL: DEPTH</div>
  `;
  stage.appendChild(layer);

  const vortex = layer.querySelector('.stark-vortex');
  const nodeField = layer.querySelector('.stark-node-field');
  const gestureState = layer.querySelector('#stark-gesture-state');
  const focusState = layer.querySelector('#stark-focus-state');
  const coreState = layer.querySelector('#stark-core-state');

  const NODE_LABELS = ['MEMORY','VISION','VOICE','PLANNER','ROUTER','DEVICE','NEWS','TELEMETRY','SECURITY','TOOLS','CONTEXT','CORE'];
  const nodes = [];
  const nodeCount = 28;

  function createNodes() {
    for (let i = 0; i < nodeCount; i += 1) {
      const angle = (Math.PI * 2 * i) / nodeCount;
      const ring = i % 3;
      const radius = [115, 155, 195][ring];
      const x = Math.cos(angle) * radius + Math.sin(i * 1.7) * 18;
      const y = Math.sin(angle) * radius * 0.58 + Math.cos(i * 1.31) * 26;
      const z = ((i % 7) - 3) * 32;
      const node = document.createElement('button');
      node.type = 'button';
      node.className = 'stark-node';
      node.dataset.label = NODE_LABELS[i % NODE_LABELS.length];
      node.dataset.index = String(i);
      node.style.setProperty('--x', `${x}px`);
      node.style.setProperty('--y', `${y}px`);
      node.style.setProperty('--z', `${z}px`);
      node.setAttribute('aria-label', `Nó ${node.dataset.label}`);
      nodeField.appendChild(node);
      nodes.push(node);
    }
  }

  function log(message) {
    if (!output) return;
    const line = document.createElement('p');
    const time = new Date().toLocaleTimeString('pt-BR', { hour12: false });
    line.textContent = `> [${time}] [STARK-CORE] ${message}`;
    output.appendChild(line);
    output.scrollTop = output.scrollHeight;
  }

  let audioCtx = null;
  function feedback(kind = 'tap') {
    try {
      navigator.vibrate?.(kind === 'confirm' ? 22 : 10);
      audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      const now = audioCtx.currentTime;
      osc.type = 'sine';
      osc.frequency.setValueAtTime(kind === 'confirm' ? 180 : 520, now);
      osc.frequency.exponentialRampToValueAtTime(kind === 'confirm' ? 90 : 320, now + 0.055);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.035, now + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.07);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(now);
      osc.stop(now + 0.075);
    } catch {}
  }

  function ripple(clientX, clientY) {
    const rect = layer.getBoundingClientRect();
    const el = document.createElement('span');
    el.className = 'stark-ripple';
    el.style.left = `${clientX - rect.left}px`;
    el.style.top = `${clientY - rect.top}px`;
    layer.appendChild(el);
    setTimeout(() => el.remove(), 650);
  }

  let tiltX = 0;
  let tiltY = 0;
  let scale = 1;
  let dragging = false;
  let startX = 0;
  let startY = 0;
  let lastX = 0;
  let lastY = 0;
  let pointerDownAt = 0;
  let workspace = 0;

  function applyTransform() {
    vortex.style.setProperty('--tilt-x', `${tiltX}deg`);
    vortex.style.setProperty('--tilt-y', `${tiltY}deg`);
    vortex.style.setProperty('--stark-scale', String(scale));
  }

  function focusNearest(clientX, clientY) {
    let best = null;
    let bestDistance = Infinity;
    for (const node of nodes) {
      const r = node.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const d = Math.hypot(clientX - cx, clientY - cy);
      node.classList.remove('is-focused');
      if (d < bestDistance) { bestDistance = d; best = node; }
    }
    if (best && bestDistance < 95) {
      best.classList.add('is-focused');
      focusState.textContent = best.dataset.label;
    } else {
      focusState.textContent = 'SIMULATED';
    }
  }

  function airTap(target, x, y) {
    const node = target.closest?.('.stark-node');
    ripple(x, y);
    feedback('tap');
    gestureState.textContent = 'AIR TAP';
    if (node) {
      node.classList.toggle('is-focused');
      node.style.setProperty('--node-scale', node.classList.contains('is-focused') ? '1.5' : '1');
      log(`${node.dataset.label}: nó ${node.classList.contains('is-focused') ? 'expandido' : 'recolhido'}.`);
      window.dispatchEvent(new CustomEvent('ultron:stark-node', { detail: { label: node.dataset.label, action: 'toggle' } }));
    }
    setTimeout(() => { gestureState.textContent = 'POINTER READY'; }, 700);
  }

  function sweep(direction) {
    workspace = Math.max(0, workspace + (direction === 'left' ? 1 : -1));
    const cls = direction === 'left' ? 'stark-workspace-shift-left' : 'stark-workspace-shift-right';
    stage.classList.remove('stark-workspace-shift-left','stark-workspace-shift-right');
    void stage.offsetWidth;
    stage.classList.add(cls);
    feedback('confirm');
    gestureState.textContent = `SWEEP ${direction.toUpperCase()}`;
    log(`Workspace neural ${workspace + 1}.`);
    window.dispatchEvent(new CustomEvent('ultron:stark-workspace', { detail: { workspace, direction } }));
    setTimeout(() => { gestureState.textContent = 'POINTER READY'; }, 700);
  }

  vortex.addEventListener('pointerdown', (event) => {
    dragging = true;
    pointerDownAt = performance.now();
    startX = lastX = event.clientX;
    startY = lastY = event.clientY;
    vortex.setPointerCapture?.(event.pointerId);
    gestureState.textContent = 'PINCH HOLD';
  });

  vortex.addEventListener('pointermove', (event) => {
    focusNearest(event.clientX, event.clientY);
    if (!dragging) return;
    const dx = event.clientX - lastX;
    const dy = event.clientY - lastY;
    tiltY = Math.max(-32, Math.min(32, tiltY + dx * 0.18));
    tiltX = Math.max(-24, Math.min(24, tiltX - dy * 0.16));
    lastX = event.clientX;
    lastY = event.clientY;
    applyTransform();
    gestureState.textContent = 'MICRO-PINCH';
  });

  vortex.addEventListener('pointerup', (event) => {
    if (!dragging) return;
    dragging = false;
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    const distance = Math.hypot(dx, dy);
    const elapsed = performance.now() - pointerDownAt;
    if (Math.abs(dx) > 95 && Math.abs(dx) > Math.abs(dy) * 1.5 && elapsed < 850) {
      sweep(dx < 0 ? 'left' : 'right');
    } else if (distance < 12 && elapsed < 420) {
      airTap(event.target, event.clientX, event.clientY);
    } else {
      feedback('tap');
      setTimeout(() => { gestureState.textContent = 'POINTER READY'; }, 450);
    }
  });

  vortex.addEventListener('pointercancel', () => { dragging = false; gestureState.textContent = 'POINTER READY'; });
  vortex.addEventListener('wheel', (event) => {
    event.preventDefault();
    scale = Math.max(0.72, Math.min(1.42, scale - event.deltaY * 0.001));
    applyTransform();
    gestureState.textContent = 'DEPTH ZOOM';
    setTimeout(() => { gestureState.textContent = 'POINTER READY'; }, 350);
  }, { passive: false });

  function setProcessing(active) {
    layer.classList.toggle('is-processing', Boolean(active));
    coreState.textContent = active ? 'SYNTHESIZING' : 'NOMINAL';
  }

  function setAlert(active, label = 'ANOMALY') {
    layer.classList.toggle('is-alert', Boolean(active));
    coreState.textContent = active ? label : 'NOMINAL';
    coreState.classList.toggle('alert', Boolean(active));
  }

  window.addEventListener('ultron:speech-start', () => setProcessing(true));
  window.addEventListener('ultron:speech-end', () => setProcessing(false));
  window.addEventListener('ultron:proactive-alert', (event) => {
    const severity = String(event.detail?.severity || 'info');
    if (severity === 'warning' || severity === 'critical') {
      setAlert(true, severity.toUpperCase());
      setTimeout(() => setAlert(false), 2200);
    }
  });

  createNodes();
  applyTransform();

  window.ULTRON_STARK_CORE = {
    airTap(x, y) { airTap(document.elementFromPoint(x, y) || vortex, x, y); },
    pinch({ dx = 0, dy = 0, scaleDelta = 0 } = {}) {
      tiltY = Math.max(-32, Math.min(32, tiltY + Number(dx) * 0.18));
      tiltX = Math.max(-24, Math.min(24, tiltX - Number(dy) * 0.16));
      scale = Math.max(0.72, Math.min(1.42, scale + Number(scaleDelta)));
      applyTransform();
      gestureState.textContent = 'EXTERNAL PINCH';
    },
    sweep,
    focus(label) {
      const wanted = String(label || '').toUpperCase();
      const node = nodes.find((item) => item.dataset.label === wanted);
      nodes.forEach((item) => item.classList.remove('is-focused'));
      if (node) { node.classList.add('is-focused'); focusState.textContent = wanted; }
      return Boolean(node);
    },
    processing: setProcessing,
    alert: setAlert,
    ingestGesture(event = {}) {
      const type = String(event.type || '').toLowerCase();
      if (type === 'air-tap') return this.airTap(Number(event.x || innerWidth / 2), Number(event.y || innerHeight / 2));
      if (type === 'pinch') return this.pinch(event);
      if (type === 'sweep') return sweep(event.direction === 'right' ? 'right' : 'left');
      if (type === 'focus') return this.focus(event.label);
      return false;
    },
    get state() { return { tiltX, tiltY, scale, workspace }; }
  };

  log('Stark-Core online. Gestos por pointer/touch ativos; barramento externo preparado para EMG/eye-tracking.');
}
