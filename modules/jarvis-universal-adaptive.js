import {classifyJarvisDevice,classifyJarvisNetwork,deriveJarvisProfile,
 jarvisNetworkMessage} from "./jarvis-universal-adaptive-model.js";

// All browser network labels are hints. navigator.onLine does NOT prove that
// JARVIS servers or external providers are reachable.
const mediaQuery=(query)=>{try{return matchMedia(query)}catch{return {matches:false}}};
const connection=navigator.connection||navigator.mozConnection||
 navigator.webkitConnection||null;
const coarse=mediaQuery("(pointer:coarse)");
const reduced=mediaQuery("(prefers-reduced-motion:reduce)");
let current=null,token=0,lastSignature="",lastNetworkTier=null;
const listeners=[];
const schedule=()=>{
 if(token)return;
 token=requestAnimationFrame(()=>{token=0;refresh();});
};
function snapshot(){
 const device=classifyJarvisDevice({
  width:innerWidth,height:innerHeight,
  coarsePointer:!!coarse.matches||navigator.maxTouchPoints>0,
  deviceMemory:navigator.deviceMemory??null,
  hardwareConcurrency:navigator.hardwareConcurrency??null,
  reducedMotion:reduced.matches
 });
 const network=classifyJarvisNetwork({
  online:navigator.onLine!==false,
  effectiveType:connection?.effectiveType??"",
  downlink:connection?.downlink??null,
  rtt:connection?.rtt??null,
  saveData:connection?.saveData===true
 });
 return {device,network,profile:deriveJarvisProfile(device,network)};
}
function publish(next){
 current=next;
 const {device,network,profile}=next;
 const root=document.body;
 root.dataset.jarvisLayout=device.layout;
 root.dataset.jarvisOrientation=device.landscape?"landscape":"portrait";
 root.dataset.jarvisPower=profile.tier;
 root.dataset.jarvisNetwork=network.tier;
 root.dataset.jarvisMotion=device.reducedMotion?"reduced":"normal";
 // Compatible with older WebGL fallback without claiming support it lacks.
 window.ULTRON_NEURAL_JARVIS?.setPerformanceProfile?.(profile);
 const indicator=document.getElementById("connection-state");
 if(indicator)indicator.textContent=jarvisNetworkMessage(network);
 const signature=[device.layout,device.landscape,device.width,device.height,
  device.reducedMotion,profile.tier,network.tier,network.saveData,
  network.effectiveType].join("/");
 if(signature!==lastSignature){
  lastSignature=signature;
  window.dispatchEvent(new CustomEvent("ultron:adaptive-profile",{
   detail:{device,network,profile}
  }));
 }
 // Only announce an actual browser offline transition, no fake API outage.
 if(network.tier==="offline"&&lastNetworkTier!=="offline"){
  const output=document.getElementById("output-box");
  if(output){
   const p=document.createElement("p");
   p.textContent="> [REDE] Navegador sem conexão. Terminal e arquivos locais "+
    "continuam disponíveis; mapas, notícias e serviços remotos dependem de rede.";
   output.append(p);output.scrollTop=output.scrollHeight;
  }
 }
 lastNetworkTier=network.tier;
 return next;
}
function refresh(){
 const s=snapshot();publish(s);return s;
}
function bind(target,type,callback,options){
 if(!target?.addEventListener)return;
 target.addEventListener(type,callback,options);
 listeners.push(()=>target.removeEventListener(type,callback,options));
}
bind(window,"online",schedule);
bind(window,"offline",schedule);
bind(window,"resize",schedule,{passive:true});
bind(window,"orientationchange",schedule);
bind(window.visualViewport,"resize",schedule,{passive:true});
bind(window.visualViewport,"scroll",schedule,{passive:true});
bind(connection,"change",schedule);
bind(coarse,"change",schedule);
bind(reduced,"change",schedule);
bind(window,"ultron:neural-jarvis-ready",schedule);
refresh();
window.ULTRON_UNIVERSAL_ADAPTIVE={
 get state(){return current;},
 refresh,
 destroy(){
  for(const unsubscribe of listeners)unsubscribe();
  listeners.length=0;
  if(token)cancelAnimationFrame(token);
  token=0;
 }
};
