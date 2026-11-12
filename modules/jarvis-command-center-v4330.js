import { installStarkCommandCenter } from './stark-command-center-adapter.js?v=4.60.0';
// JARVIS Command Center v4.33.0 — lightweight, functional dashboard.
const stage = document.querySelector('.orb-stage');
if (stage) {
  document.body.classList.add('jarvis-command-center');
  const ui = document.createElement('section');
  ui.className = 'jarvis-command-center-ui';
  ui.setAttribute('aria-label', 'Central holográfica interativa JARVIS');
  ui.innerHTML = `
    <div class="jarvis-cc-top"><span>J.A.R.V.I.S <em> / OPERATIONS</em></span><span class="jarvis-cc-live"><i class="jarvis-cc-dot"></i><span id="jarvis-cc-state">STANDBY</span></span><span class="jarvis-cc-clock" id="jarvis-cc-clock">--:--:--</span></div>
    <aside class="jarvis-cc-sidebar" aria-label="Telemetria JARVIS"><div id="jarvis-cc-gateway-slot"></div>
      <section class="jarvis-cc-widget"><header>EVENT LOG <span>LIVE</span></header><div class="jarvis-cc-log" id="jarvis-cc-log"><p>› CORE // INITIALIZED</p><p>› NETWORK // READY</p><p>› VOICE // STANDBY</p></div></section>
      <section class="jarvis-cc-widget"><header>TELEMETRY <span>LIVE</span></header><div class="jarvis-cc-wave" aria-hidden="true"></div><div class="jarvis-cc-metric">CORE STATUS <b id="jarvis-cc-metric">READY</b></div><div class="jarvis-cc-metric">BRIDGE <b>REMOTE</b></div></section>
      <section class="jarvis-cc-widget"><header>SUBSYSTEMS <span>LINK</span></header><div class="jarvis-cc-metric">VOICE <b>ENABLED</b></div><div class="jarvis-cc-metric">CAMERA <b>ON DEMAND</b></div><div class="jarvis-cc-metric">DEVICES <b>GATEWAY</b></div></section>
    <div id="jarvis-cc-link-slot"></div></aside>
    <div class="jarvis-cc-center"><div class="jarvis-cc-heading">J.A.R.V.I.S. <span>// HOLOGRAPHIC COMMAND</span></div><div class="jarvis-cc-visual"><canvas id="jarvis-cc-canvas" aria-label="Visualização holográfica do globo terrestre" role="img"></canvas><div class="jarvis-cc-orb-label" id="jarvis-cc-visual-label">NEURAL RING</div></div><div class="jarvis-cc-camera-slot" id="jarvis-cc-camera-slot"></div><div class="jarvis-cc-orb-controls"><button type="button" data-visual="ring" aria-pressed="true" title="Exibir anel holográfico">◎</button><button type="button" data-visual="globe" aria-pressed="false" title="Mostrar globo terrestre">◉</button></div></div>
    <aside class="jarvis-cc-right"><div id="jarvis-cc-voice-slot"></div><div id="jarvis-cc-infra-slot"></div></aside><div class="jarvis-cc-bottom"><div class="jarvis-cc-responses"><div class="jarvis-cc-responses-title">J.A.R.V.I.S // RESPOSTAS E EVENTOS</div><div id="jarvis-cc-response-slot"></div></div><div id="jarvis-cc-input-slot"></div><div class="jarvis-cc-actions">
      <button type="button" data-cc="earth">GLOBO 3D</button>
      <button type="button" data-cc="status">SISTEMA</button>
      <button type="button" data-cc="agenda">AGENDA</button>
      <button type="button" data-cc="camera">CÂMERA</button>
      <button type="button" data-cc="devices">DISPOSITIVOS</button>
      <button type="button" data-cc="files">ARQUIVOS</button>
    </div><div class="jarvis-cc-panel" id="jarvis-cc-panel" hidden aria-live="polite"></div></div>`;
  stage.appendChild(ui);
  // Keep the two real sphere-mode controls next to the sphere, above the camera widget.
  // This prevents camera resize from moving buttons between pointerdown and pointerup.
  const sphereControls = ui.querySelector('.jarvis-cc-orb-controls');
  if (sphereControls) ui.querySelector('.jarvis-cc-camera-slot')?.before(sphereControls);
  // Reuse the real controls and their original IDs so existing listeners,
  // voice recognition, gateway status and camera integrations remain intact.
  const relocate = (selector, slot) => {
    const element = document.querySelector(selector);
    const destination = ui.querySelector(slot);
    if (element && destination) destination.appendChild(element);
  };
  relocate('.gateway-panel', '#jarvis-cc-gateway-slot');
  relocate('.bridge-link-panel', '#jarvis-cc-link-slot');
  relocate('.microphone-panel', '#jarvis-cc-voice-slot');
  relocate('.infra-panel', '#jarvis-cc-infra-slot');
  relocate('.optical-panel', '#jarvis-cc-camera-slot');
  relocate('#output-box', '#jarvis-cc-response-slot');
  relocate('.command-row', '#jarvis-cc-input-slot');
  relocate('.quick-actions', '#jarvis-cc-input-slot');
  const textComposer = document.getElementById('command-input');
  if (textComposer) {
    textComposer.setAttribute('enterkeyhint','send');
    textComposer.setAttribute('aria-label','Digite um comando para o Jarvis');
    textComposer.setAttribute('autocapitalize','sentences');
    textComposer.setAttribute('spellcheck','true');
  }
  // All six controls must be reachable without a horizontal swipe.
  // The scrolling quick-actions strip can cancel a click during snap/scroll,
  // so put SYSTEM, AGENDA, CAMERA, DEVICES and FILES into a stable tool grid
  // within the SAME terminal. Earth remains a primary quick action.
  const quickBar=ui.querySelector('#jarvis-cc-input-slot .quick-actions');
  const globeQuickButton=ui.querySelector('[data-cc="earth"]');
  if(quickBar){
    const tools=document.createElement('div');tools.className='jarvis-cc-tool-actions';
    tools.setAttribute('role','group');
    tools.setAttribute('aria-label','Ferramentas do J.A.R.V.I.S.');
    for(const button of [...ui.querySelectorAll('.jarvis-cc-actions [data-cc]')]){
      button.setAttribute('aria-label',button.textContent.trim());
      if(button.dataset.cc==='earth')quickBar.append(button);
      else tools.append(button);
    }
    quickBar.after(tools);
  }
  // A single 3D neural stage. All real sensor/gateway/bridge/infra panels
  // remain functional with their original IDs, moved beside the command composer.
  const bottom = ui.querySelector('.jarvis-cc-bottom');
  const consoleLayout = document.createElement('div');
  consoleLayout.className = 'jarvis-cc-console-layout';
  const consoleTerminal = document.createElement('section');
  consoleTerminal.className = 'jarvis-cc-console-terminal';
  consoleTerminal.setAttribute('aria-label', 'Terminal de comandos e respostas do Jarvis');
  const systemDock = document.createElement('aside');
  systemDock.className = 'jarvis-cc-system-dock';
  systemDock.setAttribute('aria-label', 'Optical Sensor, AI Gateway, computador e celular, infraestrutura');
  const dockHeading = document.createElement('div');
  dockHeading.className = 'jarvis-cc-dock-heading';
  dockHeading.textContent = 'J.A.R.V.I.S // SISTEMAS EM TEMPO REAL';
  systemDock.append(dockHeading);
  const dockGrid = document.createElement('div');
  dockGrid.className = 'jarvis-cc-dock-grid';
  for (const slot of ['#jarvis-cc-camera-slot','#jarvis-cc-gateway-slot','#jarvis-cc-link-slot','#jarvis-cc-infra-slot']) {
    const node = ui.querySelector(slot);
    if (node) {
      node.classList.add('jarvis-cc-dock-module');
      dockGrid.append(node);
    }
  }
  systemDock.append(dockGrid);
  const inputSlot = ui.querySelector('#jarvis-cc-input-slot');
  const responses = ui.querySelector('.jarvis-cc-responses');
  const voiceSlot = ui.querySelector('#jarvis-cc-voice-slot');
  if (inputSlot) consoleTerminal.append(inputSlot);
  if (responses) consoleTerminal.append(responses);
  if (voiceSlot) consoleTerminal.append(voiceSlot);
  const recentEvents = ui.querySelector('#jarvis-cc-log');
  if (recentEvents) {
    recentEvents.classList.add('jarvis-cc-console-events');
    consoleTerminal.append(recentEvents);
  }
  consoleLayout.append(consoleTerminal,systemDock);
  bottom.prepend(consoleLayout);
  // Mirror the same MediaStream without relocating the source video or
  // opening a second camera; preserve modal and canvas-overlay behavior.
  const compactPreview = ui.querySelector('.optical-preview');
  const originalVideo = document.getElementById('webcam');
  if (compactPreview && originalVideo) {
    const mirror = document.createElement('video');
    mirror.className = 'jarvis-cc-camera-mirror';
    mirror.autoplay = true;
    mirror.muted = true;
    mirror.playsInline = true;
    compactPreview.prepend(mirror);
    const sync = () => {
      const stream = originalVideo.srcObject;
      if (mirror.srcObject !== stream) {
        mirror.srcObject = stream;
        if (stream) mirror.play().catch(() => {});
      }
    };
    originalVideo.addEventListener('loadedmetadata', sync);
    originalVideo.addEventListener('playing', sync);
    originalVideo.addEventListener('emptied', sync);
    sync();
  }
  const canvas = ui.querySelector('#jarvis-cc-canvas');
  const visual = ui.querySelector('.jarvis-cc-visual');
  const visualLabel = ui.querySelector('#jarvis-cc-visual-label');
  const clock = ui.querySelector('#jarvis-cc-clock');
  const log = ui.querySelector('#jarvis-cc-log');
  let visualMode = 'ring', ringEngine = null, ringPromise = null;
  visual.dataset.mode = 'ring';
  function report3D(error) {
    const message = error?.message || String(error);
    logEvent('NEURAL 3D // ' + message);
    visual.classList.add('jarvis-ring-fallback');
  }
  async function bootNeuralRing() {
    if (ringEngine) return ringEngine;
    if (ringPromise) return ringPromise;
    ringPromise = import('./jarvis-neural-ring-3d.js?v=4.92.0')
      .then(module => module.createNeuralRing3D(canvas,{onError:report3D}))
      .then(engine => {
        ringEngine = engine;
        visual.classList.remove('jarvis-ring-fallback');
        engine.setVisible(visualMode === 'ring');
        window.ULTRON_NEURAL_RING_3D = {
          engine:'webgl', get active(){return engine.active;}, get rings(){return engine.rings;},
          setVisible:engine.setVisible, resize:engine.resize, reset:engine.reset,
          zoomBy:engine.zoomBy,
          get state(){return engine.state;}
        };
        window.dispatchEvent(new CustomEvent('ultron:neural-ring-3d-ready'));
        return engine;
      })
      .catch(error => {
        report3D(error);
        canvas.hidden = true;
        ringPromise = null;
        return null;
      });
    return ringPromise;
  }
  function setVisualMode(mode) {
    visualMode = mode === 'globe' ? 'globe' : 'ring';
    visual.dataset.mode = visualMode;
    visualLabel.textContent = visualMode === 'globe' ? 'GLOBO TERRESTRE' : 'NEURAL RING // 3D';
    ui.querySelectorAll('[data-visual]').forEach(button => {
      button.setAttribute('aria-pressed',String(button.dataset.visual === visualMode));
    });
    ringEngine?.setVisible(visualMode === 'ring');
    canvas.hidden = visualMode !== 'ring' || (!ringEngine && visual.classList.contains('jarvis-ring-fallback'));
    if (visualMode === 'ring') void bootNeuralRing();
    window.dispatchEvent(new CustomEvent("ultron:visual-mode",{detail:{mode:visualMode}}));
  }
  ui.querySelectorAll('[data-visual]').forEach(button=>{
    let lastPointerAt=0;
    const activate=()=>{
      // Globe must actually start the 3D engine, not only change a label.
      if(button.dataset.visual==='globe'){void actions.earth();return;}
      if(window.ULTRON_EARTH?.state?.visible)window.ULTRON_EARTH.close();
      setVisualMode('ring');
    };
    button.addEventListener('pointerdown',event=>{
      if(event.button!==0)return;
      lastPointerAt=Date.now();activate();
    });
    button.addEventListener('click',()=>{
      if(Date.now()-lastPointerAt<850)return;
      activate();
    });
  });
  // Wheel on the full neural stage controls the active 3D view, NEVER the page.
  // Native WebGL and Mapbox listeners handle gestures directly on their canvases.
  // This handler covers gaps, labels, and overlay controls without stealing
  // scrolling from the Mapbox details sidebar or from the terminal below.
  const neuralStage=ui.querySelector('.jarvis-cc-center');
  neuralStage?.addEventListener('wheel',event=>{
    // Over the active Ring / globe, wheel zooms. Use the independent
    // right-hand page scroll rail (or the native scrollbar) to navigate.
    if(!document.body.classList.contains('jarvis-command-center'))return;
    if(event.target.closest?.('.jarvis-earth-reference-side,.jarvis-geo-visual,.jarvis-neural-news,textarea,input,select,[contenteditable="true"]'))return;
    event.preventDefault();
    event.stopPropagation();
    if(visualMode==='ring'){
      // Ring canvas already handled its wheel; gaps around the ring should zoom too.
      if(event.target!==canvas)ringEngine?.zoomBy?.(event.deltaY);
      return;
    }
    const overNativeMap=Boolean(event.target.closest?.(
      '.mapboxgl-map,.mapboxgl-canvas,.jarvis-earth-globe,.jarvis-earth-renderer'
    ));
    if(!overNativeMap && event.deltaY){
      window.ULTRON_EARTH?.navigate?.(event.deltaY<0?'zoom-in':'zoom-out');
    }
  },{passive:false});
  const updateClock = () => {clock.textContent=new Date().toLocaleTimeString('pt-BR',{hour12:false});};
  updateClock();
  setInterval(()=>{if (!document.hidden) updateClock();},1000);
  document.addEventListener('visibilitychange',()=>{if (!document.hidden) updateClock();});
  void bootNeuralRing();
  function logEvent(message){
    const p=document.createElement('p');p.textContent='› '+message;
    log.prepend(p);while(log.children.length>5)log.lastElementChild.remove();
  }
  const state = ui.querySelector('#jarvis-cc-state');
  function show(title, content, action=null) {
    // In-line actionable results are essential: previously "Configurar TV"
    // and "Atualizar arquivos" were passed as a third argument but ignored.
    const output=document.getElementById('output-box');
    if(!output)return;
    const line=document.createElement('div');
    line.className='jarvis-cc-inline-result';
    line.setAttribute('role','status');
    const message=document.createElement('p');
    message.textContent='> ['+title+'] '+String(content);
    line.append(message);
    if(action&&typeof action.run==='function'&&typeof action.label==='string'){
      const button=document.createElement('button');button.type='button';
      button.className='jarvis-cc-inline-action';
      button.textContent=action.label.slice(0,65);
      button.addEventListener('click',event=>{
        event.stopPropagation();
        if(button.disabled)return;
        button.disabled=true;button.setAttribute('aria-busy','true');
        // Execute synchronously while the user's click is active. This
        // matters for TV pairing, camera permission, and other user gestures.
        let pending;
        try{pending=action.run();}
        catch(error){pending=Promise.reject(error);}
        Promise.resolve(pending).catch(error=>{
          show(title,'Não foi possível executar '+action.label+': '+
            String(error?.message||error).slice(0,140));
        }).finally(()=>{button.disabled=false;button.removeAttribute('aria-busy');});
      });
      line.append(button);
    }
    output.append(line);
    while(output.children.length>90)output.firstElementChild.remove();
    output.scrollTop=output.scrollHeight;
    logEvent(title+' // ATUALIZADO');
  }
  const scrollTo = (selector) => document.querySelector(selector)?.scrollIntoView({behavior:'smooth',block:'center'});
  let openingEarth = false;
  const actions = {
    async earth() {
      if (openingEarth) return;
      openingEarth = true;
      try {
        let earth = window.ULTRON_EARTH;
        if (!earth?.open) {
          await import('./jarvis-earth.js?v=4.94.0');
          earth = window.ULTRON_EARTH;
        }
        if (!earth?.open) throw new Error('Motor terrestre não inicializado');
        const result = await earth.open();
        if (result?.ok === false) throw new Error(result.error || 'Globo indisponível');
        logEvent('EARTH // GLOBO ATIVO NO NEURAL RING');
      } catch (error) {
        logEvent('EARTH // ' + (error?.message || 'globo indisponível'));
      } finally { openingEarth = false; }
    },
    status() {
      const voice=window.ULTRON_VOICE_MATCH?.state;
      show('STATUS DO SISTEMA','Voice Match: '+
        (voice?.monitorActive?'monitor ativo':'monitor inativo')+
        ' · Câmera: '+(document.querySelector('#camera-state')?.textContent||'não informada')+
        ' · Globo: '+(window.ULTRON_EARTH?.state?.visible?'ativo':'em espera')+
        '. Consulte o terminal para diagnósticos detalhados.',
        {label:'Atualizar status',run:()=>actions.status()});
    },
    agenda() {
      const now = new Date();
      show('AGENDA / VISÃO LOCAL', now.toLocaleString('pt-BR',{dateStyle:'full',timeStyle:'short'}) + '. Calendário externo ainda não conectado. Nenhum compromisso é presumido.');
    },
    camera() {
      const cameraButton=document.getElementById('btn-camera');
      if(!cameraButton||cameraButton.disabled){
        show('SENSOR ÓPTICO','O botão da câmera está indisponível ou a câmera já está ativa. Confira o painel Optical Sensor.');
        return;
      }
      // User-initiated click: let the native camera module obtain permission.
      cameraButton.click();
      show('SENSOR ÓPTICO','Solicitação enviada ao módulo de câmera do próprio dispositivo. O acesso depende da permissão do navegador.');
    },
    async files() {
      const api = window.ULTRON_LOCAL_FILES;
      if (!api?.files) {
        show('ARQUIVOS', 'O serviço de arquivos locais ainda não está conectado. Inicie o Local Core para consultar seus arquivos.');
        return;
      }
      try {
        const entries = await api.files();
        const files = Array.isArray(entries) ? entries : Array.isArray(entries?.files) ? entries.files : [];
        const names = files.slice(0, 25).map(item => typeof item === 'string' ? item : item?.path || item?.name || 'Arquivo sem nome');
        show('ARQUIVOS LOCAIS (' + files.length + ')',
          names.length ? names.join(' · ') : 'Nenhum arquivo disponível no Local Core.',
          {label:'Atualizar arquivos',run:()=>actions.files()});
      } catch (error) {
        show('ARQUIVOS', 'Falha ao consultar arquivos locais: ' + (error?.message || 'serviço indisponível'));
      }
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
  // Quick Earth control also activates on pointerdown: layout changes must not eat a click.
  let quickEarthPointerAt = 0;
  globeQuickButton?.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    quickEarthPointerAt = Date.now();
    void actions.earth();
  });
  ui.querySelectorAll('[data-cc]').forEach(button=>{
    // A responsive DOM change can cancel click between pointerdown and up.
    // Handle the initial trusted press, dedupe the later click, and preserve
    // Enter/Space for keyboard activation (which dispatches click only).
    if(button.dataset.cc!=='earth'){
      let lastPressAt=0;
      const activate=()=>actions[button.dataset.cc]?.();
      button.addEventListener('pointerdown',event=>{
        if(event.button!==0)return;
        lastPressAt=Date.now();activate();
      });
      button.addEventListener('click',()=>{
        if(Date.now()-lastPressAt<850)return;
        activate();
      });
    }else{
      button.addEventListener('click',()=>{
        if(Date.now()-quickEarthPointerAt<850)return;
        actions.earth();
      });
    }
  });
  window.addEventListener('ultron:processing-start',()=>{state.textContent='PROCESSANDO';logEvent('CORE // PROCESSING');});
  window.addEventListener('ultron:processing-end',()=>{state.textContent='STANDBY';});
  window.addEventListener('ultron:speech-start',()=>{state.textContent='FALANDO';logEvent('VOICE // OUTPUT');});
  window.addEventListener('ultron:speech-end',()=>{state.textContent='STANDBY';});
  window.JARVIS_COMMAND_CENTER = {version:'4.60.0',setVisualMode,open:(name)=>actions[name]?.(),get active(){return true;}};
  installStarkCommandCenter(ui,window.JARVIS_COMMAND_CENTER);
}
