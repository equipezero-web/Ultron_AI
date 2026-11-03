// JARVIS Command Center v4.33.0 — lightweight, functional dashboard.
const stage = document.querySelector('.orb-stage');
if (stage) {
  document.body.classList.add('jarvis-command-center');
  const ui = document.createElement('section');
  ui.className = 'jarvis-command-center-ui';
  ui.setAttribute('aria-label', 'Central holográfica interativa JARVIS');
  ui.innerHTML = `
    <div class="jarvis-cc-top"><span>J.A.R.V.I.S <em> / OPERATIONS</em></span><span class="jarvis-cc-live"><i class="jarvis-cc-dot"></i><span id="jarvis-cc-state">LISTENING</span></span><span class="jarvis-cc-clock" id="jarvis-cc-clock">--:--:--</span></div>
    <aside class="jarvis-cc-sidebar" aria-label="Telemetria JARVIS">
      <section class="jarvis-cc-widget"><header>EVENT LOG <span>LIVE</span></header><div class="jarvis-cc-log" id="jarvis-cc-log"><p>› CORE // INITIALIZED</p><p>› NETWORK // READY</p><p>› VOICE // STANDBY</p></div></section>
      <section class="jarvis-cc-widget"><header>TELEMETRY <span>LIVE</span></header><div class="jarvis-cc-wave" aria-hidden="true"></div><div class="jarvis-cc-metric">CORE STATUS <b id="jarvis-cc-metric">READY</b></div><div class="jarvis-cc-metric">BRIDGE <b>REMOTE</b></div></section>
      <section class="jarvis-cc-widget"><header>SUBSYSTEMS <span>LINK</span></header><div class="jarvis-cc-metric">VOICE <b>ENABLED</b></div><div class="jarvis-cc-metric">CAMERA <b>ON DEMAND</b></div><div class="jarvis-cc-metric">DEVICES <b>GATEWAY</b></div></section>
    </aside>
    <div class="jarvis-cc-center"><div class="jarvis-cc-heading">J.A.R.V.I.S. <span>// HOLOGRAPHIC COMMAND</span></div><div class="jarvis-cc-visual"><canvas id="jarvis-cc-canvas" aria-label="Visualização holográfica do globo terrestre" role="img"></canvas><div class="jarvis-cc-orb-label" id="jarvis-cc-visual-label">NEURAL RING</div></div><div class="jarvis-cc-orb-controls"><button type="button" data-visual="ring" aria-pressed="true" title="Exibir anel holográfico">◎</button><button type="button" data-visual="globe" aria-pressed="false" title="Mostrar globo terrestre">◉</button></div></div>
    <div class="jarvis-cc-bottom"><div class="jarvis-cc-actions">
      <button type="button" data-cc="status">SISTEMA</button>
      <button type="button" data-cc="agenda">AGENDA</button>
      <button type="button" data-cc="camera">CÂMERA</button>
      <button type="button" data-cc="devices">DISPOSITIVOS</button>
    </div><div class="jarvis-cc-panel" id="jarvis-cc-panel" hidden aria-live="polite"></div></div>`;
  stage.appendChild(ui);
  const canvas = ui.querySelector('#jarvis-cc-canvas');
  const ctx = canvas.getContext('2d', {alpha:true});
  const visualLabel = ui.querySelector('#jarvis-cc-visual-label');
  const clock = ui.querySelector('#jarvis-cc-clock');
  const log = ui.querySelector('#jarvis-cc-log');
  let visualMode = 'ring';
  let visualFrame = 0;
  let visualRunning = false;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  function drawVisual() {
    if (!ctx) return;
    const width = canvas.clientWidth || 400;
    const height = canvas.clientHeight || 400;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (canvas.width !== Math.round(width*dpr) || canvas.height !== Math.round(height*dpr)) {
      canvas.width = Math.round(width*dpr); canvas.height = Math.round(height*dpr);
    }
    ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.clearRect(0,0,width,height);
    const cx=width/2, cy=height/2, radius=Math.min(width,height)*0.37;
    const t=reduceMotion.matches ? 0 : performance.now()/1000;
    const red='rgba(231,66,78,', blue='rgba(57,101,166,', silver='rgba(183,199,215,';
    ctx.lineWidth=0.8;
    if (visualMode === 'ring') {
      for (let strand=0;strand<24;strand++) {
        ctx.beginPath();
        for(let i=0;i<=240;i++) {
          const angle=i/240*Math.PI*2;
          const wave=Math.sin(angle*9+strand*.61+t*.8)*6 + Math.cos(angle*15-strand*.42-t*.5)*3;
          const r=radius*.79 + wave + strand*.28;
          const x=cx+Math.cos(angle)*r, y=cy+Math.sin(angle)*r;
          if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);
        }
        ctx.strokeStyle=(strand%4===0?silver:strand%3===0?blue:red)+(strand%4===0?'.54)':'.34)');
        ctx.shadowColor=strand%3===0?'#4872b8':'#e7424e';ctx.shadowBlur=strand%5===0?12:2;ctx.stroke();
      }
    } else {
      const glow=ctx.createRadialGradient(cx-radius*.3,cy-radius*.4,radius*.1,cx,cy,radius*1.15);
      glow.addColorStop(0,'rgba(43,70,115,.32)');glow.addColorStop(.75,'rgba(9,21,43,.38)');glow.addColorStop(1,'rgba(231,66,78,.04)');
      ctx.fillStyle=glow;ctx.beginPath();ctx.arc(cx,cy,radius,0,Math.PI*2);ctx.fill();
      ctx.save();ctx.beginPath();ctx.arc(cx,cy,radius,0,Math.PI*2);ctx.clip();
      for(let lat=-75;lat<=75;lat+=15){
        ctx.beginPath();const phi=lat*Math.PI/180;
        for(let i=0;i<=160;i++){
          const theta=i/160*Math.PI*2;
          const x=cx+radius*Math.cos(phi)*Math.cos(theta+t*.12);
          const y=cy+radius*Math.sin(phi)*.96+radius*Math.cos(phi)*Math.sin(theta+t*.12)*.17;
          if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);
        }ctx.strokeStyle=blue+'.18)';ctx.stroke();
      }
      for(let lon=0;lon<360;lon+=15){
        ctx.beginPath();const a=lon*Math.PI/180+t*.12;
        for(let i=0;i<=100;i++){
          const phi=(i/100-.5)*Math.PI;
          const x=cx+radius*Math.cos(phi)*Math.cos(a);
          const y=cy+radius*Math.sin(phi);
          if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);
        }ctx.strokeStyle=silver+'.22)';ctx.stroke();
      }
      // Stylized continental coastlines, deliberately schematic rather than geographic data.
      const coastlines=[
        [[-.78,-.57],[-.48,-.72],[-.23,-.56],[-.28,-.32],[-.12,-.14],[-.27,.08],[-.37,.32],[-.48,.17],[-.55,-.16],[-.73,-.24]],
        [[-.08,-.2],[.16,-.47],[.43,-.37],[.61,-.1],[.41,.13],[.22,.12],[.16,.52],[-.04,.69],[-.2,.29]],
        [[.56,.3],[.78,.37],[.83,.59],[.62,.68],[.48,.5]]
      ];
      for(const coast of coastlines){ctx.beginPath();coast.forEach(([x,y],i)=>{const xx=cx+x*radius,yy=cy+y*radius;if(i===0)ctx.moveTo(xx,yy);else ctx.lineTo(xx,yy)});ctx.closePath();ctx.strokeStyle=red+'.66)';ctx.lineWidth=1.4;ctx.stroke();}
      ctx.restore();ctx.beginPath();ctx.arc(cx,cy,radius,0,Math.PI*2);ctx.strokeStyle=red+'.75)';ctx.shadowColor='#e7424e';ctx.shadowBlur=18;ctx.stroke();
      ctx.beginPath();ctx.ellipse(cx,cy,radius*1.27,radius*.27,-.24,0,Math.PI*2);ctx.strokeStyle=silver+'.35)';ctx.stroke();
    }
    ctx.shadowBlur=0;
    if(visualRunning)visualFrame=requestAnimationFrame(drawVisual);
  }
  function setVisualMode(mode){
    visualMode=mode==='globe'?'globe':'ring';
    visualLabel.textContent=visualMode==='globe'?'HOLOGRAPHIC GLOBE':'NEURAL RING';
    ui.querySelectorAll('[data-visual]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.visual===visualMode)));
    drawVisual();
  }
  ui.querySelectorAll('[data-visual]').forEach(b=>b.addEventListener('click',()=>setVisualMode(b.dataset.visual)));
  const updateClock=()=>{clock.textContent=new Date().toLocaleTimeString('pt-BR',{hour12:false});};
  updateClock();const clockTimer=setInterval(updateClock,1000);
  const startVisual=()=>{if(visualRunning||document.hidden)return;visualRunning=true;drawVisual();};
  const stopVisual=()=>{visualRunning=false;cancelAnimationFrame(visualFrame);};
  document.addEventListener('visibilitychange',()=>document.hidden?stopVisual():startVisual());
  reduceMotion.addEventListener?.('change',()=>{stopVisual();startVisual();});
  startVisual();
  function logEvent(message){
    const p=document.createElement('p');p.textContent='› '+message;
    log.prepend(p);while(log.children.length>5)log.lastElementChild.remove();
  }
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
  window.addEventListener('ultron:processing-start',()=>{state.textContent='PROCESSANDO';logEvent('CORE // PROCESSING');});
  window.addEventListener('ultron:processing-end',()=>{state.textContent='STANDBY';});
  window.addEventListener('ultron:speech-start',()=>{state.textContent='FALANDO';logEvent('VOICE // OUTPUT');});
  window.addEventListener('ultron:speech-end',()=>{state.textContent='STANDBY';});
  window.JARVIS_COMMAND_CENTER = {version:'4.34.0',setVisualMode,open:(name)=>actions[name]?.(),get active(){return true;}};
}
