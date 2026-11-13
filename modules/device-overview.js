// A server-side device record is not proof that the physical device is online.
// Keep pairing, freshness and capabilities separate, without issuing commands.
export function describeDevice(device) {
  const type = String(device?.deviceType || "unknown").toLowerCase();
  const label = type === "mobile" ? "CELULAR" : type === "desktop" ? "COMPUTADOR" : type === "tv" ? "TV" : "DISPOSITIVO";
  const status = String(device?.status || "").toLowerCase();
  const paired = status === "active";
  // Never turn an absent/ambiguous online field into a successful connection.
  const online = paired && device?.online === true;
  const state = status === "disabled" || status === "revoked"
    ? "DESATIVADO"
    : online ? "ONLINE" : paired ? "PAREADO / OFFLINE" : "NÃO ATIVO";
  const capabilities = Array.isArray(device?.capabilities)
    ? device.capabilities.filter(value => typeof value === "string").slice(0, 6)
    : [];
  return {
    id: String(device?.id || ""),
    label,
    name: String(device?.deviceName || label).slice(0, 80),
    type,
    state,
    paired,
    online,
    lastSeenAt: device?.lastSeenAt || null,
    capabilities
  };
}

export function summarizeDevices(devices) {
  if (!Array.isArray(devices)) throw new TypeError("Lista de dispositivos inválida.");
  const items = devices.map(describeDevice);
  return {
    total: items.length,
    online: items.filter(item => item.online).length,
    pairedOffline: items.filter(item => item.paired && !item.online).length,
    inactive: items.filter(item => !item.paired).length,
    items
  };
}
