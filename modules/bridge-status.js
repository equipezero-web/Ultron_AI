// Canonical bridge heartbeat interpretation shared across camera, microphone,
// pairing UI, and device diagnostics. Cloudflare D1 CURRENT_TIMESTAMP is UTC
// but omits a timezone suffix ("YYYY-MM-DD HH:MM:SS").
// Never interpret that value in the browser's local timezone.
export const BRIDGE_ONLINE_MAX_AGE_MS = 45_000;

export function bridgeTimestampMs(value) {
  const raw = String(value || '').trim();
  if (!raw) return NaN;
  const iso = raw.replace(' ', 'T');
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?$/i.test(iso)) return NaN;
  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(iso);
  return Date.parse(hasZone ? iso : iso + 'Z');
}

export function bridgeAgeMs(device, now = Date.now()) {
  const at = bridgeTimestampMs(device?.lastSeenAt);
  return Number.isFinite(at) ? Math.max(0, now - at) : Number.POSITIVE_INFINITY;
}

export function bridgeIsOnline(device, now = Date.now()) {
  if (!device || device.status !== 'active') return false;
  // Cloud backend computes this field from the authoritative D1 timestamp.
  if (typeof device.online === 'boolean') return device.online;
  return bridgeAgeMs(device, now) <= BRIDGE_ONLINE_MAX_AGE_MS;
}

export function sortMobileBridges(devices) {
  return (Array.isArray(devices) ? devices : [])
    .filter(device => device?.deviceType === 'mobile' && device.status === 'active')
    .sort((a, b) => (bridgeIsOnline(b) ? 1 : 0) - (bridgeIsOnline(a) ? 1 : 0) ||
      (bridgeTimestampMs(b?.lastSeenAt) || 0) - (bridgeTimestampMs(a?.lastSeenAt) || 0));
}

export function mobileBridgeSummary(devices, { streaming = false } = {}) {
  const mobiles = sortMobileBridges(devices);
  const online = mobiles.find(device => bridgeIsOnline(device)) || null;
  const selected = online || mobiles[0] || null;
  if (!selected) {
    return { status: 'not-paired', paired: false, online: false, device: null,
      label: 'NOT PAIRED', session: 'AGUARDANDO' };
  }
  return {
    status: online ? 'online' : 'offline',
    paired: true, online: Boolean(online), device: selected,
    label: online ? 'ONLINE' : 'OFFLINE',
    session: online ? (streaming ? 'STREAMING' : 'READY') : 'ABRIR APP'
  };
}
