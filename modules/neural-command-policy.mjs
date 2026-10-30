export const NEURAL_ACTION_POLICY = Object.freeze({
  activate: { minConfidence: 0.48, cooldownMs: 900 },
  rotate: { minConfidence: 0.45, cooldownMs: 45 },
  'zoom-in': { minConfidence: 0.45, cooldownMs: 70 },
  'zoom-out': { minConfidence: 0.45, cooldownMs: 70 },
  sweep: { minConfidence: 0.58, cooldownMs: 650 },
  holder: { minConfidence: 0.58, cooldownMs: 1600 },
  'pinch-select': { minConfidence: 0, cooldownMs: 500 }
});

export function normalizeNeuralAction(action) {
  const clean = String(action || '')
    .trim()
    .toLowerCase()
    .replaceAll('_', '-')
    .replace(/\s+/g, '-');

  if (['start', 'activate-system', 'open-palms', 'two-open-palms'].includes(clean)) return 'activate';
  if (['rotate', 'rotation', 'dial', 'palm-rotate'].includes(clean)) return 'rotate';
  if (['zoom-in', 'zoomin', 'expand', 'open-fist'].includes(clean)) return 'zoom-in';
  if (['zoom-out', 'zoomout', 'shrink', 'close-palm', 'return-center'].includes(clean)) return 'zoom-out';
  if (['pinch', 'select', 'pinch-click', 'camera-touch-select'].includes(clean)) return 'pinch-select';
  return clean;
}

export function neuralSignature(action, detail = {}) {
  const normalized = normalizeNeuralAction(action);
  const direction = String(detail.direction || '').toLowerCase();
  const target = String(detail.target || detail.label || '').trim().toUpperCase();
  const bucket = normalized === 'rotate'
    ? (Number(detail.delta || detail.rotationStep || 0) >= 0 ? 'cw' : 'ccw')
    : normalized.startsWith('zoom-')
      ? Math.round(Number(detail.scale || 1) * 10) / 10
      : '';
  return [normalized, direction, target, bucket].filter((value) => value !== '').join(':');
}

export function validateNeuralAction(action, detail = {}) {
  const normalized = normalizeNeuralAction(action);
  const policy = NEURAL_ACTION_POLICY[normalized];
  if (!policy) return { ok: false, action: normalized, reason: 'unsupported-action' };

  const confidence = Number(detail.confidence ?? 1);
  if (!Number.isFinite(confidence) || confidence < policy.minConfidence) {
    return { ok: false, action: normalized, reason: 'low-confidence', confidence, policy };
  }

  if (normalized === 'activate' && Number(detail.handCount ?? 2) < 2) {
    return { ok: false, action: normalized, reason: 'two-hands-required', confidence, policy };
  }

  if (normalized === 'sweep') {
    const direction = String(detail.direction || '').toLowerCase();
    if (!['left', 'right'].includes(direction)) {
      return { ok: false, action: normalized, reason: 'invalid-direction', confidence, policy };
    }
  }

  if (normalized === 'rotate') {
    const delta = Number(detail.delta || detail.rotationStep || 0);
    if (!Number.isFinite(delta) || Math.abs(delta) < 0.0025) {
      return { ok: false, action: normalized, reason: 'weak-rotation', confidence, policy };
    }
  }

  if (normalized === 'zoom-in' || normalized === 'zoom-out') {
    const scale = Number(detail.scale ?? 1);
    const openness = Number(detail.openness ?? 0.5);
    if (!Number.isFinite(scale) || !Number.isFinite(openness)) {
      return { ok: false, action: normalized, reason: 'invalid-zoom-metrics', confidence, policy };
    }
  }

  if (normalized === 'pinch-select') {
    const target = String(detail.target || detail.label || '').trim();
    if (!target) return { ok: false, action: normalized, reason: 'missing-target', confidence, policy };
    if (detail.cameraTap !== true) {
      return { ok: false, action: normalized, reason: 'camera-touch-required', confidence, policy };
    }
  }

  return { ok: true, action: normalized, confidence, policy };
}
