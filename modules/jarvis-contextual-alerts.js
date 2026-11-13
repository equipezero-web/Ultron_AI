import {buildContextualPriorities,readPriorityLedger,markPriorityReviewed} from "./jarvis-contextual-priority.js";

const STORAGE_KEY="ultron_context_seen_public_ids_v1";
const output=document.getElementById("output-box");
const MIN_MANUAL=10000;
let wakePending=false,wakeTimer=null,worldDone=false,historyDone=false;
let worldUnavailable=false,latestDigest=null,lastManualAt=0,lastSeenNotice="",wakeState=false;
function readSeen(){
 try{return readPriorityLedger(localStorage.getItem(STORAGE_KEY));}
 catch{return readPriorityLedger(null);}
}
function saveSeen(value){
 try{localStorage.setItem(STORAGE_KEY,JSON.stringify(value));}catch{}
}
function log(msg){
 if(!output)return;
 const p=document.createElement("p");
 p.textContent="> [PRIORIDADES] "+String(msg).slice(0,290);
 output.appendChild(p);
 output.scrollTop=output.scrollHeight;
}
function currentData(){
 return {
  continuity:worldUnavailable?null:window.ULTRON_CONTINUITY?.snapshot||null,
  archive:window.ULTRON_INTELLIGENCE?.visualData?.history||null
 };
}
function publish(digest,{wake=false,manual=false}={}){
 const items=digest.items.slice(0,3).map(item=>({
  key:item.key,type:item.type,title:item.title,source:item.source,url:item.url,
  verifiedLabel:item.verifiedLabel,region:item.region,
  publishedAt:item.publishedAt,isNew:item.isNew,
  ...(item.type==="cataloged"&&typeof item.lat==="number"&&typeof item.lng==="number"
    ?{lat:item.lat,lng:item.lng,representative:item.representative===true}: {})
 }));
 window.dispatchEvent(new CustomEvent("ultron:contextual-priorities",{
  detail:{
   ok:true,waking:wake,manual,items,newCount:digest.newCount,
   worldState:digest.worldState,archiveState:digest.archiveState,
   summary:"PRIORIDADES // "+digest.items.length+" registros de fontes verificadas · "+
    digest.newCount+" não exibido(s) na última revisão.",
   disclaimer:digest.disclaimer
  }
 }));
}
function render({wake=false,manual=false,quiet=false}={}){
 const data=currentData();
 const digest=buildContextualPriorities({...data,ledger:readSeen(),now:Date.now()});
 latestDigest=digest;
 const available=(digest.worldState==="healthy"||digest.worldState==="partial"||
   digest.archiveState==="verified");
 if(!available){
  if(!quiet)log("Fontes persistidas não verificadas ou desatualizadas; nenhuma prioridade atual será presumida.");
  publish(digest,{wake,manual});
  return digest;
 }
 if(wake||manual){
  const intro=!digest.hasBaseline?"Primeira revisão dos registros públicos. ":
    digest.newCount+" item(ns) não exibido(s) desde a última revisão. ";
  log((wake?"ATIVADO // ":"CONSULTA // ")+intro+
    digest.items.length+" destaque(s) com fonte e data.");
  for(const item of digest.items.slice(0,6)){
   log((item.isNew?"NOVO NO RESUMO // ":"DESTAQUE // ")+
    item.verifiedLabel+" // "+item.title+" // "+item.region+
    " // publicado: "+item.publishedAt);
  }
  log("Prioridade editorial não é nível de risco. Eventos próximos ao Brasil não significam impacto.");
 }else if(!quiet&&digest.hasBaseline&&digest.newCount){
  const key=digest.items.filter(x=>x.isNew).map(x=>x.key).join("|");
  if(key&&key!==lastSeenNotice){
   lastSeenNotice=key;
   log("NOVOS REGISTROS VERIFICADOS // "+digest.newCount+
    " item(ns) ainda não exibido(s). Use PRIORIDADES para detalhes.");
  }
 }
 publish(digest,{wake});
 if((wake||manual)&&digest.items.length){
  saveSeen(markPriorityReviewed(readSeen(),digest,{now:Date.now()}));
 }
 return digest;
}
function completeWake(){
 if(!wakePending)return;
 wakePending=false;
 if(wakeTimer!==null){clearTimeout(wakeTimer);wakeTimer=null;}
 render({wake:true});
}
function maybeWake(){
 if(wakePending&&worldDone&&historyDone)completeWake();
}
window.addEventListener("ultron:wake-state",event=>{
 const awake=event?.detail?.awake===true;
 if(awake&&!wakeState&&!wakePending){
  wakePending=true;worldDone=false;historyDone=false;
  if(wakeTimer!==null)clearTimeout(wakeTimer);
  // One bounded fallback if either independent read-only collector is offline.
  wakeTimer=setTimeout(completeWake,10500);
 }
 wakeState=awake;
});
window.addEventListener("ultron:continuity-report",event=>{
 const info=event?.detail||{};
 worldUnavailable=info.ok!==true;
 if(info.waking===true)worldDone=true;
 if(wakePending)maybeWake();
 else render({quiet:false});
});
window.addEventListener("ultron:intelligence-visual-update",event=>{
 const info=event?.detail||{};
 if(info.waking===true)historyDone=true;
 if(wakePending)maybeWake();
 else render({quiet:false});
});
async function review(){
 if(Date.now()-lastManualAt<MIN_MANUAL){
  log("Nova revisão bloqueada por alguns segundos para evitar consultas excessivas.");
  return {ok:false,rateLimited:true};
 }
 lastManualAt=Date.now();
 // Call only existing read-only routes (D1 continuity and public 24h archive).
 const tasks=[];
 if(window.ULTRON_CONTINUITY?.refresh){
  tasks.push(window.ULTRON_CONTINUITY.refresh({reason:"manual",force:true}));
 }
 if(window.ULTRON_INTELLIGENCE?.loadHistory){
  tasks.push(window.ULTRON_INTELLIGENCE.loadHistory({force:true}));
 }
 if(tasks.length)await Promise.allSettled(tasks);
 return render({manual:true});
}
function injectButton(){
 const strip=document.querySelector(".quick-actions");
 if(!strip||document.getElementById("btn-jarvis-priorities"))return;
 const button=document.createElement("button");
 button.id="btn-jarvis-priorities";button.type="button";button.textContent="PRIORIDADES";
 let touchAt=0;
 button.addEventListener("pointerdown",event=>{
  if(event.pointerType==="mouse"||event.button!==0)return;
  touchAt=Date.now();void review();
 });
 button.addEventListener("click",()=>{
  if(Date.now()-touchAt<800)return;
  void review();
 });
 strip.appendChild(button);
}
window.ULTRON_CONTEXTUAL={
 review,preview:()=>render({quiet:true}),
 get state(){return {
  available:latestDigest?.worldState==="healthy"||latestDigest?.archiveState==="verified",
  count:latestDigest?.verifiedCount||0,newCount:latestDigest?.newCount||0,
  hasBaseline:latestDigest?.hasBaseline||false,
  worldState:latestDigest?.worldState||"unavailable",
  archiveState:latestDigest?.archiveState||"unavailable"
 }; }
};
injectButton();
