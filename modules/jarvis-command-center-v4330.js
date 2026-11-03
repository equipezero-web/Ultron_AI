// JARVIS Command Center v4.33.0 — lightweight, functional dashboard.
const stage = document.querySelector('.orb-stage');
if (stage) {
  document.body.classList.add('jarvis-command-center');
  const ui = document.createElement('section');
  ui.className = 'jarvis-command-center-ui';
  ui.setAttribute('aria-label', 'Central holográfica interativa JARVIS');
  ui.innerHTML = `
    <div class="jarvis-cc-top"><span>J.A.R.V.I.S. // COMMAND CENTER</span><span class="jarvis-cc-live"><i class="jarvis-cc-dot"></i><span id="jarvis-cc-state">STANDBY</span></span></div>
    <div class="jarvis-cc-orb" aria-hidden="true"><strong>J.A.R.V.I.S.</strong><small>INTERACTIVE CORE</small></div>
    <div style="width:100%">
      <div class="jarvis-cc-actions">
        <button type="button" data-cc="status">SISTEMA</button>
        <button type="button" data-cc="agenda">AGENDA</button>
        <button type="button" data-cc="camera">CÂMERA</button>
        <button type="button" data-cc="devices">DISPOSITIVOS</button>
      </div>
      <div class="jarvis-cc-panel" id="jarvis-cc-panel" hidden aria-live="polite"></div>
    </div>`;
  stage.appendChild(ui);
  const panel = ui.querySelector('#jarvis-cc-panel');
  const state = ui.querySelector('#jarvis-cc-state');
  const escape = (value) => String(value).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function show(title, content, action) {
    panel.hidden = false;
    panel.replaceChildren();
    const heading = document.createElement('h3');
    heading.textContent = title;
    const paragraph = document.createElement('p');
    paragraph.textContent = content;
    panel.append(heading, paragraph);
    if (action) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = action.label;
      button.addEventListener('click', action.run);
      panel.append(button);
    }
  }
  const scrollTo = (selector) => document.querySelector(selector)?.scrollIntoView({behavior:'smooth',block:'center'});
  const actions = {
    status() {
      const voice = window.ULTRON_VOICE_MATCH?.state;
      show('STATUS DO SISTEMA', 'Voice Match: ' + (voice?.monitorActive ? 'monitor ativo' : 'monitor inativo') + ' · Câmera: ' + (document.querySelector('#camera-state')?.textContent || 'não informada') + '. Consulte o terminal para diagnósticos detalhados.');
    },
    agenda() {
      const now = new Date();
      show('AGENDA / VISÃO LOCAL', now.toLocaleString('pt-BR',{dateStyle:'full',timeStyle:'short'}) + '. Calendário externo ainda não conectado. Nenhum compromisso é presumido.');
    },
    camera() {
      show('SENSOR ÓPTICO', 'O sensor utiliza a integração de câmera já existente. A permissão será solicitada pelo navegador quando necessária.', {label:'Abrir painel de câmera',run:()=>scrollTo('.optical-panel')});
    },
    async devices() {
      show('CENTRAL DE DISPOSITIVOS', 'Consultando dispositivos pareados no gateway remoto...');
      try {
        const api = window.ULTRON_DEVICES;
        if (!api?.listDevices) {
          show('CENTRAL DE DISPOSITIVOS', 'Módulo de dispositivos ainda não disponível. Aguarde a inicialização do sistema.');
          return;
        }
        const devices = await api.listDevices();
        if (!Array.isArray(devices) || !devices.length) {
          show('CENTRAL DE DISPOSITIVOS', 'Nenhum dispositivo pareado foi encontrado para este operador.', {label:'Configurar TV',run:()=>document.getElementById('btn-pair-tv')?.click()});
          return;
        }
        const summary = devices.slice(0, 12).map((device) => {
          const name = device.deviceName || device.name || 'Dispositivo';
          const status = device.status !== 'active' ? 'desativado' : device.online === true ? 'online' : device.online === false ? 'offline' : 'estado desconhecido';
          return name + ' (' + (device.deviceType || 'tipo desconhecido') + ') — ' + status;
        }).join(' · ');
        show('DISPOSITIVOS PAREADOS (' + devices.length + ')', summary, {label:'Atualizar lista',run:()=>actions.devices()});
      } catch (error) {
        show('CENTRAL DE DISPOSITIVOS', 'Não foi possível consultar o gateway: ' + (error?.message || 'falha de comunicação') + '.');
      }
    }
  };
  ui.querySelectorAll('[data-cc]').forEach((button) => button.addEventListener('click', () => actions[button.dataset.cc]?.()));
  window.addEventListener('ultron:processing-start',()=>{state.textContent='PROCESSANDO';});
  window.addEventListener('ultron:processing-end',()=>{state.textContent='STANDBY';});
  window.addEventListener('ultron:speech-start',()=>{state.textContent='FALANDO';});
  window.addEventListener('ultron:speech-end',()=>{state.textContent='STANDBY';});
  window.JARVIS_COMMAND_CENTER = {version:'4.33.0',open:(name)=>actions[name]?.(),get active(){return true;}};
}
