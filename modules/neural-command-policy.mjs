export const NEURAL_ACTION_POLICY = Object.freeze({
  push: { minConfidence: 0.60, cooldownMs: 1100 },
  sweep: { minConfidence: 0.58, cooldownMs: 650 },
  freeze: { minConfidence: 0.60, cooldownMs: 520 },
  dial: { minConfidence: 0.55, cooldownMs: 90 },
  holder: { minConfidence: 0.58, cooldownMs: 1600 },
  'pinch-select': { minConfidence: 0, cooldownMs: 420 }
});

export function normalizeNeuralAction(action) {
  const clean = String(action || '')
    .trim()
    .toLowerCase()
    .replaceAll('_', '-')
    .replace(/\s+/g, '-');

  if (['fist', 'anchor', 'fistanchor', 'fist-anchor', 'closed-fist', 'closed-palm', 'stop'].includes(clean)) return 'freeze';
  if (clean === 'pinch' || clean === 'select' || clean === 'pinch-click') return 'pinch-select';
  if (clean === 'rotate' || clean === 'rotation') return 'dial';
  return clean;
}

export function neuralSignature(action, detail = {}) {
  const normalized = normalizeNeuralAction(action);
  const direction = String(detail.direction || '').toLowerCase();
  const target = String(detail.target || detail.label || '').trim().toUpperCase();
  const bucket = normalized === 'dial'
    ? (Number(detail.delta || detail.rotationStep || 0) >= 0 ? 'cw' : 'ccw')
    : '';
  return [normalized, direction, target, bucket].filter(Boolean).join(':');
}

export function validateNeuralAction(action, detail = {}) {
  const normalized = normalizeNeuralAction(action);
  const policy = NEURAL_ACTION_POLICY[normalized];
  if (!policy) return { ok: false, action: normalized, reason: 'unsupported-action' };

  const confidence = Number(detail.confidence ?? 1);
  if (!Number.isFinite(confidence) || confidence < policy.minConfidence) {
    return { ok: false, action: normalized, reason: 'low-confidence', confidence, policy };
  }

  if (normalized === 'sweep') {
    const direction = String(detail.direction || '').toLowerCase();
    if (!['left', 'right'].includes(direction)) {
      return { ok: false, action: normalized, reason: 'invalid-direction', confidence, policy };
    }
  }

  if (normalized === 'dial') {
    const delta = Number(detail.delta || detail.rotationStep || 0);
    if (!Number.isFinite(delta) || Math.abs(delta) < 0.01) {
      return { ok: false, action: normalized, reason: 'weak-dial', confidence, policy };
    }
  }

  if (normalized === 'pinch-select') {
    const target = String(detail.target || detail.label || '').trim();
    if (!target) return { ok: false, action: normalized, reason: 'missing-target', confidence, policy };
  }

  return { ok: true, action: normalized, confidence, policy };
}
