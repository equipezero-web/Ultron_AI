import {parseAdvancedCommand,verifiedDigest,makeProactiveSuggestion,
 readOperationalMemory,updateOperationalMemory,analyzeSpecialists,
 selectVerifiedGeoSource,ROUTINE_INTERVAL} from "./jarvis-integrated-intelligence-model.js";

// XV–XIX: a read-only in-browser assistant, never a general purpose executor.
const output=document.getElementById("output-box");
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
let selectedMap=null, mapEpoch=0;
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
// Reuse the Phase X live map. The map validates coordinates, source and
// freshness a second time. Never fabricate a field, severity or heat map.
async function openVerifiedMap(mode){
 const source=selectVerifiedGeoSource(currentDigest(),currentSelection());
 if(!source.ok){
  report("Não existem coordenadas verificadas para este evento. "+
   "Visualização recusada: "+source.reason);
  return {handled:true,...source};
 }
 const map=window.ULTRON_CONTEXTUAL_MAP;
 if(typeof map?.open!=="function"){
  report("Motor geográfico indisponível. Não vou simular dados.");
  return {handled:true,ok:false,reason:"VERIFIED_MAP_UNAVAILABLE"};
 }
 const ticket=++mapEpoch;
 try{
  const result=await map.open({view:mode,focusKey:source.key});
  if(ticket!==mapEpoch)return {handled:true,ok:false,reason:"CANCELLED"};
  if(result?.ok!==true||!["2d","3d"].includes(result.view)||
   !result.selectedPoint){
   report("Mapa não confirmou a abertura de dados verificados.");
   return {handled:true,ok:false,reason:result?.reason||"MAP_NOT_CONFIRMED"};
  }
  // The map can legitimately fall back from 3D to 2D; do not claim 3D success.
  selectedMap={key:source.key,mode:result.view,url:source.url};
  report("MAPA "+result.view.toUpperCase()+" // "+source.title+
   " // Fonte: "+source.source+" // publicado: "+source.publishedAt+
   (result.view!==mode?" // 3D indisponível: fallback 2D confirmado.":"")+
   ". Somente localizações publicadas, sem previsão de áreas afetadas.",source.url);
  audit("phase19-verified-map","source-backed-"+result.view);
  return {handled:true,ok:true,mode:result.view,selectedPoint:result.selectedPoint,
   sourceUrl:source.url,fallback3d:result.view!==mode};
 }catch{
  report("Falha na abertura do mapa verificado. Nenhuma visualização sintética será exibida.");
  return {handled:true,ok:false,reason:"VERIFIED_MAP_ERROR"};
 }
}
function rejectSimulation(){
 report("Simulações hipotéticas foram desativadas. Para visualizar observações "+
  "publicadas, selecione um evento com fonte e use 'mostrar dados reais em 2D' ou 'em 3D'.");
 return {handled:true,ok:false,reason:"REAL_DATA_ONLY"};
}
function stop(reason="P0_STOP"){
 disableRoutine(reason);mapEpoch++;selectedMap=null;routineEpoch++;
 lastProactive=null;lastSuggestion=null;report("Parada P0: rotina e novas solicitações de mapas suspensas.");
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
 if(cmd.type==="verified-map")return openVerifiedMap(cmd.mode);
 if(cmd.type==="no-simulation")return rejectSimulation();
 if(cmd.type==="status"){
  const m=memory();
  report("XV sugestões verificadas | XVI memória "+(m.consented?"autorizada":"desativada")+
   " | XVII 3 especialistas locais | XVIII rotina "+(routineEnabled?"ativa":"desativada")+
   " | XIX mapa verificado "+(selectedMap?selectedMap.mode.toUpperCase():"não solicitado")+".");
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
 get state(){return {routineEnabled,routineBusy,verifiedMap:selectedMap?{...selectedMap}:null,
  memoryConsented:memory().consented,log:logbook.map(x=>({...x}))};}};
