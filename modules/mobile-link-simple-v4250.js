const button = document.getElementById('btn-pair-mobile');
const output = document.getElementById('output-box');

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = String(value);
}

function log(message, alert = false) {
  if (!output) return;
  const line = document.createElement('p');
  if (alert) line.className = 'alert';
  line.textContent = `> [MOBILE LINK] ${message}`;
  output.appendChild(line);
  output.scrollTop = output.scrollHeight;
}

function ageMs(device) {
  const value = Date.parse(device?.lastSeenAt || '') || 0;
  return value ? Date.now() - value : Infinity;
}

async function refresh() {
  try {
    const devices = await window.ULTRON_DEVICES?.listDevices?.();
    const mobiles = (devices || [])
      .filter((device) => device?.deviceType === 'mobile' && device?.status !== 'disabled')
      .sort((a, b) => (Date.parse(b?.lastSeenAt || '') || 0) - (Date.parse(a?.lastSeenAt || '') || 0));
    const online = mobiles.find((device) => ageMs(device) <= 20000) || null;
    const selected = online || mobiles[0] || null;

    if (!selected) {
      setText('bridge-link-state', 'NOT PAIRED');
      setText('bridge-device-name', 'NÃO CONECTADO');
      setText('bridge-session-state', 'AGUARDANDO');
      return { paired: false, online: false };
    }

    setText('bridge-device-name', selected.deviceName || 'ULTRON MOBILE BRIDGE');
    setText('bridge-link-state', online ? 'ONLINE' : 'OFFLINE');
    setText('bridge-session-state', online ? 'READY' : 'OPEN APP');
    return { paired: true, online: Boolean(online), device: selected };
  } catch {
    return { paired: false, online: false };
  }
}

async function connect() {
  if (!window.ULTRON_MOBILE_CAMERA?.smartConnect) {
    log('Módulo de câmera ainda carregando. Tente novamente em um instante.', true);
    return false;
  }
  setText('bridge-session-state', 'CONNECTING');
  try {
    const result = await window.ULTRON_MOBILE_CAMERA.smartConnect();
    await refresh();
    return result;
  } catch (error) {
    log(error?.message || String(error), true);
    await refresh();
    return false;
  }
}

button?.addEventListener('click', (event) => {
  event.preventDefault();
  event.stopImmediatePropagation();
  connect();
}, true);

window.addEventListener('ultron:mobile-camera-source', (event) => {
  if (!event?.detail?.active) return;
  setText('bridge-link-state', 'ONLINE');
  setText('bridge-session-state', 'STREAMING');
  setText('bridge-camera-state', 'ONLINE');
});

window.addEventListener('ultron:remote-camera-ice-recovery', (event) => {
  const state = String(event?.detail?.state || '');
  if (state === 'recovered') setText('bridge-session-state', 'STREAMING');
  else if (state === 'grace') setText('bridge-session-state', 'RECOVERING');
});

setTimeout(refresh, 900);
setInterval(refresh, 7000);

window.ULTRON_MOBILE_LINK = { connect, refresh, version: '4.25.0' };
