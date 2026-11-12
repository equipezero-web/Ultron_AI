import { mobileBridgeSummary } from './bridge-status.js?v=5.15.0';
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

let lastGatewayAlertAt = 0;
let lastResult = { status: 'checking', online: false, paired: false };
let pairingDeadlineAt = 0;
let isRefreshing = false;

async function refresh() {
  if(isRefreshing) return lastResult;
  isRefreshing = true;
  try {
    const api = window.ULTRON_DEVICES;
    if (typeof api?.listDevices !== 'function') {
      throw new Error('Módulo de dispositivos ainda não inicializado.');
    }
    // Never mistake network errors for "no paired devices".
    const devices = await api.listDevices();
    if (!Array.isArray(devices)) throw new Error('Gateway retornou uma lista inválida.');
    const streaming = window.ULTRON_MOBILE_CAMERA?.state?.active === true;
    const result = mobileBridgeSummary(devices, { streaming });
    lastResult = result;
    if (result.paired) pairingDeadlineAt = 0;
    if (!result.paired) {
      const code = String(document.getElementById('bridge-session-state')?.textContent || '');
      const pairing = String(document.getElementById('bridge-link-state')?.textContent || '') === 'PAIRING';
      if (pairing && /^CODE \d{6}$/.test(code)) {
        if (!pairingDeadlineAt) pairingDeadlineAt = Date.now() + 10 * 60_000;
        if (Date.now() < pairingDeadlineAt) {
          lastResult = { ...result, status: 'pairing', label: 'PAIRING', session: code };
          return lastResult;
        }
      }
      pairingDeadlineAt = 0;
    }
    setText('bridge-link-state', result.label);
    setText('bridge-device-name', result.device?.deviceName || 'NÃO CONECTADO');
    setText('bridge-session-state', result.session);
    if (!result.online) setText('bridge-camera-state', 'STANDBY');
    return result;
  } catch(error) {
    const message = String(error?.message || error || 'Falha desconhecida').slice(0,160);
    lastResult = { status: 'gateway-error', online: false, paired: null, error: message };
    setText('bridge-link-state', 'GATEWAY OFF');
    setText('bridge-session-state', 'SEM RESPOSTA');
    setText('bridge-device-name', 'NÃO VERIFICADO');
    setText('bridge-camera-state', 'STANDBY');
    if (Date.now() - lastGatewayAlertAt > 60_000) {
      log('Não foi possível consultar dispositivos no backend: ' + message, true);
      lastGatewayAlertAt = Date.now();
    }
    return lastResult;
  } finally {
    isRefreshing = false;
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
    if (result !== false) await refresh();
    else if (String(document.getElementById('bridge-link-state')?.textContent) !== 'PAIRING') await refresh();
    return result;
  } catch (error) {
    log(error?.message || String(error), true);
    await refresh();
    return false;
  }
}

let lastMobilePointerAt=0;
button?.addEventListener('pointerdown',event=>{
  if(event.button!==0)return;
  lastMobilePointerAt=Date.now();
  void connect();
},true);
button?.addEventListener('click',event=>{
  event.preventDefault();
  event.stopImmediatePropagation();
  if(Date.now()-lastMobilePointerAt<850)return;
  void connect();
},true);

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

window.ULTRON_MOBILE_LINK = { connect, refresh, version: '5.15.0', get state(){ return lastResult; } };
