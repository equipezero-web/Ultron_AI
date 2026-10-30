const PATCH_KEY = '__ULTRON_MOBILE_SENSOR_FUSION_V4240__';

if (!window[PATCH_KEY]) {
  window[PATCH_KEY] = true;

  const root = document.documentElement;
  const mobile = window.matchMedia?.('(pointer: coarse)')?.matches === true || Math.min(innerWidth || 9999, screen?.width || 9999) <= 900;
  let enabled = false;
  let lastEmitAt = 0;
  let beta = 0;
  let gamma = 0;
  let accel = 0;
  let rotation = 0;
  let stability = 100;

  function profile() {
    return window.ULTRON_PERFORMANCE?.profile || { sensorIntervalMs: 50, sensorSmoothing: 0.22 };
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, Number(value || 0)));
  }

  function smooth(current, next) {
    const alpha = clamp(profile().sensorSmoothing || 0.22, 0.08, 0.5);
    return current + (Number(next || 0) - current) * alpha;
  }

  function emit(now = performance.now()) {
    const interval = Math.max(28, Number(profile().sensorIntervalMs || 50));
    if (now - lastEmitAt < interval || document.hidden) return;
    lastEmitAt = now;

    const tiltX = clamp(gamma * 0.10, -4, 4);
    const tiltY = clamp(beta * 0.055, -4, 4);
    const movement = clamp(accel * 18 + rotation * 0.75, 0, 100);
    stability = smooth(stability, 100 - movement);

    root.style.setProperty('--ultron-tilt-x', `${tiltX.toFixed(2)}px`);
    root.style.setProperty('--ultron-tilt-y', `${tiltY.toFixed(2)}px`);
    root.dataset.ultronDeviceMotion = 'true';

    window.dispatchEvent(new CustomEvent('ultron:mobile-sensors', {
      detail: {
        beta,
        gamma,
        acceleration: accel,
        rotation,
        movement,
        stability: clamp(stability, 0, 100),
        intervalMs: interval,
        version: '4.24.0'
      }
    }));
  }

  function onOrientation(event) {
    if (!enabled || document.hidden) return;
    beta = smooth(beta, clamp(event.beta, -70, 70));
    gamma = smooth(gamma, clamp(event.gamma, -55, 55));
    emit();
  }

  function onMotion(event) {
    if (!enabled || document.hidden) return;
    const a = event.acceleration || event.accelerationIncludingGravity || {};
    const x = Number(a.x || 0);
    const y = Number(a.y || 0);
    const z = Number(a.z || 0);
    const magnitude = Math.sqrt(x * x + y * y + z * z);
    const normalized = event.acceleration ? magnitude : Math.max(0, Math.abs(magnitude - 9.81));
    accel = smooth(accel, clamp(normalized, 0, 6));

    const r = event.rotationRate || {};
    const rotationMagnitude = Math.sqrt(
      Number(r.alpha || 0) ** 2 +
      Number(r.beta || 0) ** 2 +
      Number(r.gamma || 0) ** 2
    );
    rotation = smooth(rotation, clamp(rotationMagnitude, 0, 80));
    emit();
  }

  function attach() {
    if (!mobile || enabled) return false;
    enabled = true;
    window.addEventListener('deviceorientation', onOrientation, { passive: true });
    window.addEventListener('devicemotion', onMotion, { passive: true });
    return true;
  }

  function detach() {
    if (!enabled) return;
    enabled = false;
    window.removeEventListener('deviceorientation', onOrientation);
    window.removeEventListener('devicemotion', onMotion);
    root.dataset.ultronDeviceMotion = 'false';
    root.style.removeProperty('--ultron-tilt-x');
    root.style.removeProperty('--ultron-tilt-y');
  }

  async function requestPermission() {
    const orientationRequest = window.DeviceOrientationEvent?.requestPermission;
    const motionRequest = window.DeviceMotionEvent?.requestPermission;
    try {
      if (typeof orientationRequest === 'function') {
        const result = await orientationRequest.call(window.DeviceOrientationEvent);
        if (result !== 'granted') return false;
      }
      if (typeof motionRequest === 'function') {
        const result = await motionRequest.call(window.DeviceMotionEvent);
        if (result !== 'granted') return false;
      }
      return attach();
    } catch {
      return false;
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      root.style.setProperty('--ultron-tilt-x', '0px');
      root.style.setProperty('--ultron-tilt-y', '0px');
    }
  });

  const requiresGesturePermission = typeof window.DeviceOrientationEvent?.requestPermission === 'function' || typeof window.DeviceMotionEvent?.requestPermission === 'function';
  if (mobile && !requiresGesturePermission) attach();

  window.ULTRON_MOBILE_SENSORS = {
    attach,
    detach,
    requestPermission,
    get enabled() { return enabled; },
    get state() {
      return { beta, gamma, acceleration: accel, rotation, stability, mobile };
    },
    get version() { return '4.24.0'; }
  };
}
