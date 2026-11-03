const KEY = '__JARVIS_PERFORMANCE_GOVERNOR_V4320__';

if (!window[KEY]) {
  window[KEY] = true;

  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false;
  const lowMemory = Number(navigator.deviceMemory || 8) <= 4;
  const lowCpu = Number(navigator.hardwareConcurrency || 8) <= 4;
  const dataSaver = Boolean(connection?.saveData);
  const mobile = window.matchMedia?.('(max-width: 820px)').matches || false;

  const listeners = new Set();
  const state = {
    visible: !document.hidden,
    active: true,
    interacting: false,
    speaking: false,
    filespace: false,
    lastInteractionAt: performance.now(),
    tier: reducedMotion || dataSaver || (lowMemory && lowCpu) ? 'eco' : (mobile || lowMemory || lowCpu ? 'balanced' : 'full'),
    targetFps: 60,
    dprCap: 2,
    particleScale: 1
  };

  let idleTimer = 0;

  function recompute(reason = 'state') {
    const busy = state.interacting || state.speaking || state.filespace;
    if (!state.visible) {
      state.targetFps = 4;
      state.dprCap = 1;
      state.particleScale = 0.2;
    } else if (state.tier === 'eco') {
      state.targetFps = busy ? 30 : 20;
      state.dprCap = 1;
      state.particleScale = 0.45;
    } else if (state.tier === 'balanced') {
      state.targetFps = busy ? 45 : 30;
      state.dprCap = 1.35;
      state.particleScale = 0.7;
    } else {
      state.targetFps = busy ? 60 : 36;
      state.dprCap = busy ? 1.75 : 1.5;
      state.particleScale = busy ? 1 : 0.8;
    }

    const detail = { ...state, reason };
    listeners.forEach((listener) => {
      try { listener(detail); } catch {}
    });
    window.dispatchEvent(new CustomEvent('jarvis:performance-change', { detail }));
  }

  function markInteraction(reason = 'operator') {
    state.interacting = true;
    state.lastInteractionAt = performance.now();
    clearTimeout(idleTimer);
    recompute(reason);
    idleTimer = setTimeout(() => {
      state.interacting = false;
      recompute('idle');
    }, 2400);
  }

  document.addEventListener('visibilitychange', () => {
    state.visible = !document.hidden;
    recompute(state.visible ? 'foreground' : 'background');
  });

  ['pointerdown', 'wheel', 'keydown', 'touchstart'].forEach((type) => {
    window.addEventListener(type, () => markInteraction(type), { passive: true });
  });

  window.addEventListener('ultron:speech-start', () => { state.speaking = true; recompute('speech-start'); });
  window.addEventListener('ultron:speech-end', () => { state.speaking = false; recompute('speech-end'); });
  window.addEventListener('ultron:neural-filespace-enter', () => { state.filespace = true; recompute('filespace-enter'); });
  window.addEventListener('ultron:neural-filespace-exit', () => { state.filespace = false; recompute('filespace-exit'); });

  window.JARVIS_PERFORMANCE = {
    version: '4.32.0',
    state,
    markInteraction,
    subscribe(listener) {
      if (typeof listener !== 'function') return () => {};
      listeners.add(listener);
      listener({ ...state, reason: 'subscribe' });
      return () => listeners.delete(listener);
    },
    shouldRender(lastFrameAt, now = performance.now()) {
      if (!state.visible && now - lastFrameAt < 240) return false;
      return now - lastFrameAt >= (1000 / Math.max(1, state.targetFps));
    },
    get dprCap() { return state.dprCap; },
    get particleScale() { return state.particleScale; },
    get targetFps() { return state.targetFps; }
  };
  window.ULTRON_PERFORMANCE_GOVERNOR = window.JARVIS_PERFORMANCE;
  recompute('boot');
}