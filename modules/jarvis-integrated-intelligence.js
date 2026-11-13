import {parseAdvancedCommand,verifiedDigest,makeProactiveSuggestion,
 readOperationalMemory,updateOperationalMemory,analyzeSpecialists,
 selectSimulationSource,hypotheticalCurve,ROUTINE_INTERVAL} from "./jarvis-integrated-intelligence-model.js";

// XV–XIX: a read-only in-browser assistant, never a general purpose executor.
const output=document.getElementById("output-box");
const stage=document.querySelector(".jarvis-cc-center");
const MEMORY_KEY="jarvis_operational_preferences_v1";
const ROUTINE_KEY="jarvis_public_readonly_monitor_optin_v1";
const logbook=[];
const currentDigest=()=>{try{return window.ULTRON_CONTEXTUAL?.preview?.()||null;}catch{return null;}};
const currentSelection=()=>{try{return window.ULTRON_MULTIMODAL?.current||null;}catch{return null;}};
const storageGet=k=>{try{return localStorage.getItem(k);}catch{return null;}};
const storageSet=(k,v)=>{try{localStorage.setItem(k,v);return true;}catch{return false;}};
const storageRemove=k=>{try{localStorage.removeItem(k);return true;}catch{return false;}};
let routineEnabled=storageGet(ROUTINE_KEY)==="true";
let routineBusy=false, routineEpoch=0, lastChecked=0;
let lastProactive=null, lastProactiveAt=0, lastSuggestion=null, scanning=false;
let panel=null,canvas=null,heading=null,metadata=null,slider=null,modeButtons=null;
let simulation=null;
function audit(kind,outcome){
 logbook.push({kind,outcome,at:new Date().toISOString()});
 if(logbook.length>20)logbook.shift();
}
function report(message,url=null){
 const line=document.createElement("p");
 line.textContent="> [J.A.R.V.I.S. XV–XIX] "+String(message).slice(0,450);
 if(url){
  const link=document.createElement("a");
  link.href=url;link.textContent=" · FONTE";link.target="_blank";link.rel="noopener noreferrer";
  line.append(link);
 }
 output?.append(line);if(output)output.scrollTop=output.scrollHeight;
}
function memory(){return readOperationalMemory(storageGet(MEMORY_KEY));}
function suggest({automatic=false}={}){
 const data=currentDigest();
 const prefs=memory();
 const suggestion=makeProactiveSuggestion(data,{preference:prefs.preference,
  previousKey:automatic?lastProactive:null});
 if(!suggestion.ok){
  if(!automatic)report("Sem sugestão com fonte atual: "+suggestion.reason+".");
  return {handled:true,...suggestion};
 }
 if(automatic&&Date.now()-lastProactiveAt<20*60000)return {handled:true,ok:false,reason:"COOLDOWN"};
 lastProactive=suggestion.key;lastProactiveAt=Date.now();lastSuggestion=suggestion;
 report((automatic?"SUGESTÃO AUTOMÁTICA (sem execução): ":"SUGESTÃO: ")+suggestion.message,suggestion.url);
 audit("phase15-suggestion","source-verified");
 return {handled:true,...suggestion};
}
async function refreshPublicFeeds({manual=false}={}){
 if(routineBusy)return {handled:true,ok:false,reason:"ALREADY_RUNNING"};
 if(!manual&&(!routineEnabled||document.hidden))return {handled:true,ok:false,reason:"INACTIVE"};
 const tasks=[];
 if(typeof window.ULTRON_CONTINUITY?.refresh==="function")
  tasks.push(window.ULTRON_CONTINUITY.refresh({reason:"routine-readonly",force:false}));
 if(typeof window.ULTRON_INTELLIGENCE?.loadHistory==="function")
  tasks.push(window.ULTRON_INTELLIGENCE.loadHistory({force:false}));
 if(!tasks.length)return {handled:true,ok:false,reason:"NO_PUBLIC_COLLECTORS"};
 const ticket=++routineEpoch;routineBusy=true;lastChecked=Date.now();
 try{
  await Promise.allSettled(tasks);
  if(ticket!==routineEpoch)return {handled:true,ok:false,reason:"CANCELLED"};
  const verified=verifiedDigest(currentDigest());
  const result={handled:true,ok:verified.ok,count:verified.items.length,reason:verified.reason};
  report(verified.ok?
   "Rotina somente leitura: "+verified.items.length+" registro(s) públicos verificados. Não executou ações externas.":
   "Rotina: dados não confirmados ou desatualizados. "+verified.reason);
  audit("phase18-check",verified.reason);
  return result;
 }finally{if(ticket===routineEpoch)routineBusy=false;}
}
const tick=()=>{
 if(!routineEnabled||routineBusy||document.hidden||Date.now()-lastChecked<ROUTINE_INTERVAL)return;
 void refreshPublicFeeds();
};
window.setInterval(tick,60000);
function disableRoutine(reason){
 routineEpoch++;routineEnabled=false;routineBusy=false;
 storageRemove(ROUTINE_KEY);audit("phase18-disable",reason);
}
function showAgents(){
 const value=analyzeSpecialists(currentDigest(),{current:currentSelection()});
 if(!value.ok){report("Especialistas sem fontes verificadas: "+value.reason);return {handled:true,...value};}
 for(const a of value.agents)
  report(a.label+": "+a.count+" registro(s) verificável(is).",a.evidence);
 report(value.caveat);audit("phase17-specialists","source-verified");
 return {handled:true,...value};
}
function createPanel(){
 if(panel||!stage)return Boolean(panel);
 panel=document.createElement("section");panel.className="jarvis-advanced-scenario";
 panel.hidden=true;panel.setAttribute("role","region");panel.setAttribute("aria-label","Cenário matemático ilustrativo JARVIS");
 const head=document.createElement("div");head.className="jarvis-advanced-scenario-head";
 heading=document.createElement("strong");heading.textContent="CENÁRIO ILUSTRATIVO · NÃO É PREVISÃO";
 const close=document.createElement("button");close.type="button";close.textContent="×";
 close.setAttribute("aria-label","Fechar cenário");
 close.addEventListener("click",closeSimulation);
 head.append(heading,close);
 metadata=document.createElement("p");metadata.className="jarvis-advanced-scenario-meta";
 const controls=document.createElement("div");controls.className="jarvis-advanced-scenario-controls";
 modeButtons=document.createElement("div");
 for(const mode of ["2d","3d"]){
  const button=document.createElement("button");button.type="button";
  button.textContent=mode.toUpperCase();button.dataset.mode=mode;
  button.addEventListener("click",()=>{
   if(!simulation)return;
   const v=selectSimulationSource(currentDigest(),currentSelection());
   if(!v.ok||v.key!==simulation.source.key||v.url!==simulation.source.url){
    closeSimulation();report("O contexto de origem mudou. Simulação encerrada.");return;
   }
   simulation.mode=mode;draw();
  });
  modeButtons.append(button);
 }
 slider=document.createElement("input");slider.type="range";slider.min="1";slider.max="5";
 slider.step="0.5";slider.value="2";slider.setAttribute("aria-label","Escala hipotética, sem unidade física");
 slider.addEventListener("input",()=>{if(simulation)draw();});
 controls.append(modeButtons,slider);
 canvas=document.createElement("canvas");canvas.width=560;canvas.height=318;
 canvas.setAttribute("role","img");
 canvas.setAttribute("aria-label","Perfil hipotético relativo representado em duas ou três dimensões");
 const caveat=document.createElement("p");caveat.className="jarvis-advanced-scenario-disclaimer";
 caveat.textContent="Curva matemática sem unidade física, área afetada ou intensidade real. Coordenadas apenas identificam a fonte. Não use para avaliar riscos.";
 panel.append(head,metadata,controls,canvas,caveat);
 stage.append(panel);return true;
}
function draw(){
 if(!simulation||!canvas)return;
 const w=560,h=318,ctx=canvas.getContext("2d");
 if(!ctx){report("Canvas indisponível para cenário ilustrativo.");return;}
 ctx.clearRect(0,0,w,h);
 ctx.fillStyle="#07131c";ctx.fillRect(0,0,w,h);
 const scale=Number(slider.value);
 metadata.textContent=simulation.source.title+" · "+simulation.source.source+
  " · lat "+simulation.source.lat.toFixed(2)+", lon "+simulation.source.lng.toFixed(2);
 for(const button of modeButtons.querySelectorAll("button"))
  button.setAttribute("aria-pressed",String(button.dataset.mode===simulation.mode));
 ctx.lineWidth=1;
 if(simulation.mode==="2d"){
  ctx.strokeStyle="rgba(142,196,225,.20)";
  for(let i=0;i<6;i++){
   const x=46+i*93;ctx.beginPath();ctx.moveTo(x,34);ctx.lineTo(x,273);ctx.stroke();
  }
  for(let i=0;i<5;i++){
   const y=51+i*55;ctx.beginPath();ctx.moveTo(44,y);ctx.lineTo(522,y);ctx.stroke();
  }
  ctx.strokeStyle="#67dce3";ctx.lineWidth=3;ctx.beginPath();
  for(const [i,p] of hypotheticalCurve({scale,samples:101}).entries()){
   const x=46+(p.distance/5)*465,y=273-p.normalized*214;
   if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);
  }
  ctx.stroke();
  ctx.fillStyle="#daeef5";ctx.font="15px system-ui";ctx.fillText("VALOR NORMALIZADO (0–1)",46,23);
  ctx.fillText("DISTÂNCIA RELATIVA · SEM UNIDADE",178,302);
 }else{
  // Genuine 3D mathematical surface projected with a perspective camera onto
  // 2D canvas: this is NOT a simulation of any real geospatial hazard.
  const project=(x,z)=>{
   const y=2*Math.exp(-(x*x+z*z)/(scale*scale));
   const c=Math.cos(.76),s=Math.sin(.76),rx=x*c-z*s,rz=x*s+z*c;
   const perspective=1/(1+(rz+8)*.045);
   return {x:280+rx*39*perspective,
    y:263+rz*13*perspective-y*88*perspective};
  };
  for(let z=-5;z<=5;z+=.5){
   ctx.beginPath();ctx.strokeStyle="rgba(80,211,232,.62)";
   for(let x=-5;x<=5;x+=.25){
    const p=project(x,z);if(x===-5)ctx.moveTo(p.x,p.y);else ctx.lineTo(p.x,p.y);
   }ctx.stroke();
  }
  for(let x=-5;x<=5;x+=.5){
   ctx.beginPath();ctx.strokeStyle="rgba(223,185,110,.55)";
   for(let z=-5;z<=5;z+=.25){
    const p=project(x,z);if(z===-5)ctx.moveTo(p.x,p.y);else ctx.lineTo(p.x,p.y);
   }ctx.stroke();
  }
  ctx.fillStyle="#daeef5";ctx.font="15px system-ui";
  ctx.fillText("PROJEÇÃO 3D DE SUPERFÍCIE MATEMÁTICA",34,26);
  ctx.fillText("NÃO REPRESENTA TERRENO NEM IMPACTO",98,301);
 }
 ctx.fillStyle="#f4cc8c";ctx.font="13px system-ui";
 ctx.fillText("ESCALA HIPOTÉTICA: "+scale.toFixed(1),343,49);
}
function closeSimulation(){
 simulation=null;if(panel)panel.hidden=true;audit("phase19-simulation","closed");
}
function openSimulation(mode){
 if(!createPanel())return {handled:true,ok:false,reason:"NO_NEURAL_RING"};
 const source=selectSimulationSource(currentDigest(),currentSelection());
 if(!source.ok){report("Selecione primeiro um evento com coordenada e fonte verificadas. "+source.reason);
  return {handled:true,...source};}
 simulation={mode,source};panel.hidden=false;draw();
 audit("phase19-simulation",mode);
 report("Visualização "+mode.toUpperCase()+" de curva puramente hipotética, sem previsão de impacto; fonte do ponto publicada no painel.",source.url);
 return {handled:true,ok:true,mode,source:{key:source.key,url:source.url}};
}
function stop(reason="P0_STOP"){
 disableRoutine(reason);closeSimulation();routineEpoch++;
 lastProactive=null;lastSuggestion=null;report("Parada P0: rotina e cenário suspensos.");
 return {ok:true,reason};
}
async function execute(raw,{source="terminal"}={}){
 const cmd=parseAdvancedCommand(raw);
 if(!cmd)return {handled:false};
 if(cmd.type==="proactive")return suggest();
 if(cmd.type==="agents")return showAgents();
 if(cmd.type==="memory"){
  const m=memory();
  report("Memória local "+(m.consented?"autorizada":"não autorizada")+
   "; preferência "+m.preference+"; avaliações +"+m.feedback.positive+
   " / −"+m.feedback.negative+". Expira após 30 dias.");
  return {handled:true,ok:true,memory:m};
 }
 if(cmd.type==="set-preference"){
  const updated=updateOperationalMemory(storageGet(MEMORY_KEY),{preference:cmd.value});
  if(!updated.ok||!storageSet(MEMORY_KEY,JSON.stringify(updated.value)))
   return {handled:true,ok:false,reason:"STORAGE_UNAVAILABLE"};
  report("Preferência visual armazenada somente neste navegador, por até 30 dias: "+cmd.value);
  audit("phase16-preference","explicit-consent");
  return {handled:true,ok:true,preference:cmd.value};
 }
 if(cmd.type==="clear-preference"){
  storageRemove(MEMORY_KEY);report("Preferências locais do módulo XVI apagadas.");
  audit("phase16-clear","operator-command");return {handled:true,ok:true};
 }
 if(cmd.type==="feedback"){
  if(!lastSuggestion)return {handled:true,ok:false,reason:"NO_SUGGESTION_TO_RATE"};
  const updated=updateOperationalMemory(storageGet(MEMORY_KEY),{feedback:cmd.value});
  if(!updated.ok)return {handled:true,...updated};
  if(!storageSet(MEMORY_KEY,JSON.stringify(updated.value)))
   return {handled:true,ok:false,reason:"STORAGE_UNAVAILABLE"};
  lastSuggestion=null;report("Avaliação recebida. Nenhum dado de conta ou transcrição foi memorizado.");
  audit("phase16-feedback","operator-command");return {handled:true,ok:true};
 }
 if(cmd.type==="routine-start"){
  const exists=typeof window.ULTRON_CONTINUITY?.refresh==="function"||
   typeof window.ULTRON_INTELLIGENCE?.loadHistory==="function";
  if(!exists)return {handled:true,ok:false,reason:"NO_PUBLIC_COLLECTORS"};
  if(!storageSet(ROUTINE_KEY,"true"))return {handled:true,ok:false,reason:"STORAGE_UNAVAILABLE"};
  routineEnabled=true;lastChecked=0;report("Monitoramento público somente leitura autorizado: verificações a cada 15 minutos com a aba visível. Sem monitoramento com a aba fechada.");
  audit("phase18-enable","operator-command");return {handled:true,ok:true,intervalMinutes:15};
 }
 if(cmd.type==="routine-stop"){
  disableRoutine("OPERATOR_COMMAND");report("Rotina de monitoramento desativada.");
  return {handled:true,ok:true};
 }
 if(cmd.type==="routine-check")return refreshPublicFeeds({manual:true});
 if(cmd.type==="routine-status"){
  report("Rotina "+(routineEnabled?"ativada":"desativada")+"; "+(routineBusy?"consulta em curso":"sem consulta em curso")+
   "; última verificação: "+(lastChecked?new Date(lastChecked).toLocaleString("pt-BR"):"nenhuma")+
   ". Funciona somente com a aba visível.");
  return {handled:true,ok:true,enabled:routineEnabled,busy:routineBusy,lastChecked};
 }
 if(cmd.type==="simulation")return openSimulation(cmd.mode);
 if(cmd.type==="simulation-close"){
  closeSimulation();report("Visualização encerrada.");return {handled:true,ok:true};
 }
 if(cmd.type==="status"){
  const m=memory();
  report("XV sugestões verificadas | XVI memória "+(m.consented?"autorizada":"desativada")+
   " | XVII 3 especialistas locais | XVIII rotina "+(routineEnabled?"ativa":"desativada")+
   " | XIX cenário "+(simulation?simulation.mode.toUpperCase():"fechado")+".");
  return {handled:true,ok:true};
 }
 return {handled:false};
}
window.addEventListener("ultron:contextual-priorities",event=>{
 if(scanning)return;
 const detail=event?.detail||{};
 if(detail.waking!==true&&!detail.items?.some?.(x=>x.isNew===true))return;
 scanning=true;try{suggest({automatic:true});}finally{scanning=false;}
});
window.addEventListener("ultron:emergency-stop",()=>stop("P0_STOP"));
window.ULTRON_INTEGRATED_INTELLIGENCE={parse:parseAdvancedCommand,execute,stop,
 get state(){return {routineEnabled,routineBusy,simulating:simulation?.mode||null,
  memoryConsented:memory().consented,log:logbook.map(x=>({...x}))};}};
