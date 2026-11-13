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
    <div class="jarvis-cc-center"><div class="jarvis-cc-heading">NEURAL JARVIS <span>// MATRIZ HOLOGRÁFICA</span></div><div class="jarvis-cc-visual"><canvas id="jarvis-cc-canvas" aria-label="Visualização 3D do Neural Jarvis" role="img"></canvas><div class="jarvis-cc-orb-label" id="jarvis-cc-visual-label">NEURAL JARVIS</div></div><div class="jarvis-cc-camera-slot" id="jarvis-cc-camera-slot"></div><div class="jarvis-cc-orb-controls"><button type="button" data-visual="ring" aria-pressed="true" title="Exibir a matriz holográfica Neural Jarvis">◎</button><button type="button" data-visual="globe" aria-pressed="false" title="Mostrar globo terrestre">◉</button></div></div>
    <aside class="jarvis-cc-right"><div id="jarvis-cc-voice-slot"></div><div id="jarvis-cc-infra-slot"></div></aside><div class="jarvis-cc-bottom"><div class="jarvis-cc-responses"><div class="jarvis-cc-responses-title">J.A.R.V.I.S // RESPOSTAS E EVENTOS</div><div id="jarvis-cc-response-slot"></div></div><div id="jarvis-cc-input-slot"></div><div class="jarvis-cc-actions">
      <button type="button" data-cc="earth">GLOBO 3D</button>
      <button type="button" data-cc="ring">VOLTAR AO NEURAL JARVIS</button>
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
    ringPromise = import('./jarvis-neural-jarvis-3d.js?v=5.31.0')
      .then(module => module.createNeuralJarvis3D(canvas,{onError:report3D}))
      .catch(error=>{
        logEvent('NEURAL JARVIS // WebGL principal não iniciou: '+(error?.message||'desconhecido')+
          ' // tentando motor de reserva');
        return import('./jarvis-neural-ring-3d.js?v=4.92.0')
          .then(module=>module.createNeuralRing3D(canvas,{onError:report3D}));
      })
      .then(engine => {
        ringEngine = engine;
        visual.classList.remove('jarvis-ring-fallback');
        engine.setVisible(visualMode === 'ring');
        window.ULTRON_NEURAL_JARVIS = {
          engine:engine.engine, architecture:engine.architecture||null,
          get active(){return engine.active;},get rings(){return engine.rings;},
          setVisible:engine.setVisible,resize:engine.resize,reset:engine.reset,
          zoomBy:engine.zoomBy,setAudioBands:engine.setAudioBands||(()=>{}),
          setOverdrive:engine.setOverdrive||null,
          setExpanded:engine.setExpanded||null,
          get state(){return engine.state;}
        };
        // Legacy handle and events remain for existing global intelligence modules.
        window.ULTRON_NEURAL_RING_3D=window.ULTRON_NEURAL_JARVIS;
        window.dispatchEvent(new CustomEvent('ultron:neural-jarvis-ready'));
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
    visualLabel.textContent = visualMode === 'globe' ? 'GLOBO TERRESTRE' : 'NEURAL JARVIS // 3D';
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
    for(const item of (Array.isArray(action)?action:[action])){
      if(!item||typeof item.run!=='function'||typeof item.label!=='string')continue;
      const action=item;
      const button=document.createElement('button');button.type='button';
      button.className='jarvis-cc-inline-action';
      button.textContent=action.label.slice(0,65);
      let lastActionPointerAt=0;
      const activateAction=()=>{
        if(button.disabled)return;
        button.disabled=true;button.setAttribute('aria-busy','true');
        // Execute synchronously on the initial press to preserve trusted
        // user activation for TV pairing and camera permission.
        let pending;
        try{pending=action.run();}
        catch(error){pending=Promise.reject(error);}
        Promise.resolve(pending).catch(error=>{
          show(title,'Não foi possível executar '+action.label+': '+
            String(error?.message||error).slice(0,140));
        }).finally(()=>{button.disabled=false;button.removeAttribute('aria-busy');});
      };
      button.addEventListener('pointerdown',event=>{
        if(event.button!==0)return;
        event.stopPropagation();
        lastActionPointerAt=Date.now();activateAction();
      });
      button.addEventListener('click',event=>{
        event.stopPropagation();
        if(Date.now()-lastActionPointerAt<850)return;
        activateAction();
      });
      line.append(button);
    }
    output.append(line);
    while(output.children.length>90)output.firstElementChild.remove();
    output.scrollTop=output.scrollHeight;
    logEvent(title+' // ATUALIZADO');
  }
  // Device-local browsing never scans the filesystem or uploads files
  // silently: the operator must explicitly select each batch in the browser.
  let selectedLocalFiles=[];
  const agendaKey='jarvis_local_agenda_v1';
  const readAgenda=()=>{
    try{
      const raw=JSON.parse(localStorage.getItem(agendaKey)||'[]');
      return Array.isArray(raw)?raw.filter(item=>item&&typeof item.title==='string'&&
        typeof item.at==='string'&&Number.isFinite(Date.parse(item.at))).slice(0,100):[];
    }catch{return [];}
  };
  function chooseLocalFiles(){
    const input=document.createElement('input');
    input.type='file';input.multiple=true;input.style.display='none';
    input.setAttribute('aria-label','Selecionar arquivos do dispositivo');
    input.addEventListener('change',()=>{
      selectedLocalFiles=Array.from(input.files||[]);
      show('ARQUIVOS SELECIONADOS ('+selectedLocalFiles.length+')',
        selectedLocalFiles.length?selectedLocalFiles.slice(0,25).map(f=>f.name).join(' · ')+
        '. Seleção privada nesta página: arquivos NÃO enviados nem indexados automaticamente.':
        'Nenhum arquivo selecionado.',
        [{label:'Escolher outros arquivos',run:chooseLocalFiles},
         {label:'Consultar Local Core',run:()=>actions.files()}]);
      input.remove();
    },{once:true});
    input.addEventListener('cancel',()=>input.remove(),{once:true});
    document.body.append(input);input.click();
  }
  function composeAgenda(){
    const output=document.getElementById('output-box');if(!output)return;
    output.querySelector('.jarvis-cc-agenda-form')?.remove();
    const form=document.createElement('form');form.className='jarvis-cc-agenda-form';
    const label=document.createElement('strong');label.textContent='NOVO COMPROMISSO LOCAL';
    const title=document.createElement('input');title.type='text';title.placeholder='Nome do compromisso';
    title.maxLength=110;title.required=true;title.setAttribute('aria-label','Compromisso');
    const date=document.createElement('input');date.type='datetime-local';
    date.required=true;date.setAttribute('aria-label','Data e hora do compromisso');
    const save=document.createElement('button');save.type='submit';save.textContent='SALVAR NA AGENDA';
    const cancel=document.createElement('button');cancel.type='button';cancel.textContent='CANCELAR';
    cancel.addEventListener('click',()=>form.remove());
    form.addEventListener('submit',event=>{
      event.preventDefault();
      const at=new Date(date.value),name=title.value.trim();
      if(!name||!Number.isFinite(at.getTime()))return;
      try{
        const next=readAgenda().concat({id:String(Date.now()),title:name,at:at.toISOString()})
          .sort((a,b)=>Date.parse(a.at)-Date.parse(b.at)).slice(-100);
        localStorage.setItem(agendaKey,JSON.stringify(next));
        form.remove();actions.agenda();
      }catch(error){show('AGENDA','Não foi possível salvar no navegador: '+String(error?.message||error));}
    });
    // A responsive terminal may shift the button before the browser
    // dispatches click; requestSubmit on pointerdown retains validation.
    save.addEventListener('pointerdown',event=>{
      if(event.button===0)form.requestSubmit(save);
    });
    cancel.addEventListener('pointerdown',event=>{
      if(event.button===0)form.remove();
    });
    form.append(label,title,date,save,cancel);
    output.append(form);form.scrollIntoView({block:'nearest',behavior:'smooth'});
    title.focus({preventScroll:true});
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
        logEvent('EARTH // GLOBO ATIVO NO NEURAL JARVIS');
      } catch (error) {
        logEvent('EARTH // ' + (error?.message || 'globo indisponível'));
      } finally { openingEarth = false; }
    },
    ring(){
      if(window.ULTRON_EARTH?.state?.visible)window.ULTRON_EARTH.close();
      setVisualMode('ring');
      logEvent('NEURAL JARVIS // RESTAURADO');
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
      const now=new Date(),all=readAgenda(),upcoming=all.filter(item=>Date.parse(item.at)>=Date.now());
      const next=upcoming.slice(0,6).map(item=>new Date(item.at).toLocaleString(
        'pt-BR',{dateStyle:'short',timeStyle:'short'})+' — '+item.title).join(' · ');
      show('AGENDA / VISÃO LOCAL',upcoming.length?
        upcoming.length+' compromisso(s) local(is). '+next+
        '. Não sincronizado com Google/Outlook.':
        now.toLocaleString('pt-BR',{dateStyle:'full',timeStyle:'short'})+
        '. Nenhum compromisso local cadastrado. Google/Outlook ainda não estão conectados.',
        [{label:'Adicionar compromisso',run:composeAgenda},
         {label:'Atualizar agenda',run:()=>actions.agenda()}]);
    },
    camera() {
      const video=document.getElementById('webcam');
      const active=Boolean(video?.srcObject&&video.readyState>=2&&video.videoWidth>0);
      if(active){
        show('SENSOR ÓPTICO','Fluxo de vídeo disponível. É possível analisar o quadro atual, mediante comando do operador.',
          {label:'Analisar quadro',run:()=>window.ULTRON_VISION?.analyze?.()});
        return;
      }
      if(window.ULTRON_MOBILE_CAMERA?.smartConnect){
        const request=window.ULTRON_MOBILE_CAMERA.smartConnect();
        show('SENSOR ÓPTICO','Conexão com câmera do celular solicitada. STUN disponível não significa câmera transmitindo; confirme STREAMING e quadro visível.');
        Promise.resolve(request).catch(error=>show('SENSOR ÓPTICO',
          'Não foi possível conectar a câmera: '+String(error?.message||error)));
        return;
      }
      show('SENSOR ÓPTICO','Conector de câmera não inicializado. Verifique se o dispositivo foi pareado.',
        {label:'Conectar celular',run:()=>document.getElementById('btn-pair-mobile')?.click()});
    },
    async files() {
      const api=window.ULTRON_LOCAL_FILES;
      const choices=[
        {label:'Selecionar arquivos manualmente',run:chooseLocalFiles},
        {label:'Testar Local Core novamente',run:()=>actions.files()}
      ];
      if(!api?.health||!api?.files){
        show('ARQUIVOS','Módulo de arquivos não inicializado. Os arquivos do computador não são automaticamente acessíveis pela página.',choices);
        return;
      }
      try{
        const status=await api.health({allowPrompt:true});
        if(!status?.ok){
          const permission=status?.permission;
          const note=permission==='denied'?
            'O navegador bloqueou acesso à rede local. Revise a permissão de dispositivos/rede local no Chrome.':
            'O serviço local não respondeu. No Windows, execute local-core/start.bat e mantenha o terminal aberto. Se estiver no celular, 127.0.0.1 refere-se ao próprio celular, não ao computador.';
          show('ARQUIVOS / LOCAL CORE OFFLINE',note+
            (status?.error?' Diagnóstico: '+String(status.error).slice(0,125):'')+
            (selectedLocalFiles.length?' · '+selectedLocalFiles.length+' arquivo(s) selecionado(s) manualmente.':''),
            choices);
          return;
        }
        const files=await api.files();
        const items=Array.isArray(files)?files:Array.isArray(files?.files)?files.files:[];
        const names=items.slice(0,25).map(item=>typeof item==='string'?item:
          item?.path||item?.name||'Arquivo sem nome');
        show('ARQUIVOS LOCAIS ('+items.length+')',
          names.length?names.join(' · '):'Local Core conectado; a pasta Ultron_Data não contém arquivos indexados.',
          [{label:'Atualizar arquivos',run:()=>actions.files()},
           {label:'Selecionar arquivos manualmente',run:chooseLocalFiles}]);
      }catch(error){
        show('ARQUIVOS / LOCAL CORE','Não foi possível consultar a pasta Ultron_Data. Verifique se local-core/start.bat está em execução e se o navegador autorizou a rede local. '+String(error?.message||error).slice(0,125),choices);
      }
    },
    async devices() {
      show('CENTRAL DE DISPOSITIVOS', 'Consultando dispositivos pareados no gateway remoto...');
      try {
        const api = window.ULTRON_DEVICES;
        const pairingActions=[
          {label:'Conectar celular',run:()=>document.getElementById('btn-pair-mobile')?.click()},
          {label:'Conectar computador',run:()=>document.getElementById('btn-pair-desktop')?.click()},
          {label:'Configurar TV',run:()=>document.getElementById('btn-pair-tv')?.click()}
        ];
        if(!api?.listDevices){
          show('CENTRAL DE DISPOSITIVOS','Módulo de dispositivos não carregou. Atualize a página para carregar o controlador corrigido; nenhum pareamento foi presumido.',
            [{label:'Reverificar módulo',run:()=>actions.devices()}]);
          return;
        }
        if(!window.ULTRON_MEMORY?.getMemoryKey?.()){
          show('CENTRAL DE DISPOSITIVOS','A identidade de memória da sessão ainda não está pronta. Pareamento e consulta exigem essa identidade.',
            [{label:'Verificar novamente',run:()=>actions.devices()}]);
          return;
        }
        const devices=await api.listDevices();
        if(!Array.isArray(devices)||!devices.length){
          show('CENTRAL DE DISPOSITIVOS','Nenhum dispositivo pareado foi encontrado. Para a TV LG, pareie primeiro o celular com o Ultron Bridge.',
            pairingActions);
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
