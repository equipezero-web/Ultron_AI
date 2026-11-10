/* Native Stark compatibility on the current Command Center: no legacy vortex. */
export function installStarkCommandCenter(ui, centerApi){
  if(!ui?.isConnected||!centerApi?.active)return false;
  const center=ui.querySelector('.jarvis-cc-center');
  const status=ui.querySelector('#jarvis-cc-state');
  if(!center||!status)return false;
  const labels={COMANDOS:'command',COMMANDS:'command',SISTEMA:'status',STATUS:'status',AGENDA:'agenda','CÂMERA':'camera',CAMERA:'camera','VISÃO':'camera',DISPOSITIVOS:'devices',ARQUIVOS:'files',GLOBO:'earth','GLOBO 3D':'earth','NEURAL RING':'ring'};
  const norm=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();
  const actionOf=v=>Object.entries(labels).find(([key])=>norm(key)===norm(v))?.[1]||String(v||'').toLowerCase();
  const targetOf=a=>a==='command'?ui.querySelector('#command-input'):a==='ring'?ui.querySelector('[data-visual="ring"]'):a==='globe'?ui.querySelector('[data-visual="globe"]'):ui.querySelector('[data-cc="'+CSS.escape(a)+'"]');
  const visible=el=>{const r=el?.getBoundingClientRect();return !!r&&r.width>0&&r.height>0&&getComputedStyle(el).visibility!=='hidden';};
  let focused=null,processing=false,alert=null,level=0,production=[];
  const clearFocus=()=>{ui.querySelectorAll('[data-stark-focused]').forEach(el=>el.removeAttribute('data-stark-focused'));focused=null;};
  const focus=label=>{const a=actionOf(label),target=targetOf(a);clearFocus();if(!target)return false;focused=a;target.dataset.starkFocused='true';return true;};
  const open=label=>{
    const a=actionOf(label);
    if(!targetOf(a))return false;
    focus(a);
    if(a==='command')targetOf(a).focus({preventScroll:true});
    else if(a==='globe')centerApi.open('earth');
    else if(a==='ring'){window.ULTRON_EARTH?.close?.();centerApi.setVisualMode('ring');}
    else centerApi.open(a);
    return true;
  };
  const ring=()=>window.ULTRON_NEURAL_RING_3D;
  const style=document.createElement('style');style.textContent='.jarvis-command-center-ui [data-stark-focused]{outline:2px solid #70dfff;outline-offset:2px}';ui.append(style);
  const setProcessing=active=>{processing=Boolean(active);status.textContent=alert|| (processing?'PROCESSANDO':'STANDBY');};
  const core={
    mode:'command-center',get active(){return ui.isConnected&&!!centerApi.active;},
    focus,open,close(){clearFocus();window.ULTRON_NEURAL_ANSWER?.clear?.();},
    processing:setProcessing,
    alert(active,label='ANOMALY'){alert=active?String(label):null;setProcessing(processing);},
    addProductionImage(src,alt='Imagem'){try{const u=new URL(src);if(!['https:','http:'].includes(u.protocol))return false;production=[{src:u.href,alt},...production.filter(x=>x.src!==u.href)].slice(0,12);return true;}catch{return false;}},
    get production(){return production.map(x=>({...x}));},
    airTap(x,y){const hit=mesh.focusAtViewport(x,y);return hit?mesh.openFocused():false;},
    pinch({scaleDelta=0}={}){if(!ring()?.active||!Number(scaleDelta))return false;ring().zoomBy(-Number(scaleDelta)*400);return true;},
    ingestGesture(e={}){if(e.type==='focus')return focus(e.label);if(e.type==='open-node')return open(e.label||e.action);if(e.type==='air-tap')return this.airTap(e.x,e.y);if(e.type==='pinch')return this.pinch(e);return false;},
    get state(){return {mode:'command-center',processing,focused,alert,ring:ring()?.state||null,panelOpen:!!window.ULTRON_NEURAL_ANSWER?.visible};}
  };
  const mesh={
    mode:'command-center',get active(){return ui.isConnected&&center.isConnected;},
    refresh(){if(focused&&!targetOf(focused))clearFocus();return this.nodes;},
    layout(){ring()?.resize?.();return this.nodes;},
    get nodes(){return [...ui.querySelectorAll('[data-cc],[data-visual],#command-input')].filter(visible).map(el=>({label:el.textContent?.trim()||el.getAttribute('aria-label')||'COMANDOS',action:el.dataset.cc||el.dataset.visual||'command'}));},
    focusAtViewport(x,y,maxDistance=82){
      let best=null,distance=Infinity;
      for(const el of ui.querySelectorAll('[data-cc],[data-visual],#command-input')){
        if(!visible(el))continue;
        const r=el.getBoundingClientRect(),d=Math.hypot(x-(r.left+r.width/2),y-(r.top+r.height/2));
        if(d<distance){best=el;distance=d;}
      }
      if(!best||distance>maxDistance){clearFocus();return null;}
      const action=best.dataset.cc||best.dataset.visual||'command';
      if(!focus(action))return null;
      return {label:best.textContent?.trim()||'COMANDOS',action,distance};
    },
    openFocused(){return focused?open(focused):false;},
    clearFocus,
    setZoomLevel(next){const n=Math.max(0,Math.min(2,Number(next)||0));if(!ring()?.active)return false;ring().zoomBy((level-n)*220);level=n;return true;},
    zoom(v){return this.setZoomLevel(typeof v==='boolean'?(v?2:0):v);},
    resetPositions(){clearFocus();level=0;ring()?.reset?.();this.layout();},
    // Dock controls are fixed by responsive CSS, not movable legacy orbital nodes.
    beginDrag(){return false;},dragTo(){return false;},endDrag(){return {moved:false,label:null};},togglePinned(){return false;},
    get focused(){return focused;},get zoomLevel(){return level;},get zoomed(){return level>0;},get dragging(){return null;}
  };
  window.ULTRON_STARK_CORE=core;
  window.ULTRON_STARK_MESH=mesh;
  window.addEventListener('ultron:question-start',()=>setProcessing(true));
  for(const type of ['ultron:answer','ultron:answer-error'])window.addEventListener(type,()=>setProcessing(false));
  window.dispatchEvent(new CustomEvent('ultron:stark-current-ready'));
  return true;
}
