import API_CONFIG from "../config.js";
import {continuityView} from "./jarvis-continuity-model.js";

const base=String(API_CONFIG?.backendUrl||"").replace(/\/+$/,"");
const INTERVAL=10*60_000,MIN_MANUAL_INTERVAL=10_000;
const output=document.getElementById("output-box");
let inflight=null,latest=null,lastCheckAt=0,lastRequestAt=0,lastWakeAt=0,awake=false;
let errorCode=null,lastNotice="";
function log(text){
  if(!output)return;
  const line=document.createElement("p");
  line.textContent="> [CONTINUIDADE] "+String(text).slice(0,300);
  output.appendChild(line);output.scrollTop=output.scrollHeight;
}
function publish(view,{wake=false}={}){
  window.dispatchEvent(new CustomEvent("ultron:continuity-report",{
    detail:{ok:view.ok,ring:view.ring,
      world:view.status?.world||"unavailable",
      weather:view.status?.weather||"unavailable",waking:wake}
  }));
}
function say(report,{details=false}={}){
  const view=continuityView(report);
  const notice=view.ring;
  if(details){
    for(const line of view.lines)log(line);
  }else if(notice!==lastNotice){
    log(view.text);
    lastNotice=notice;
  }
  return view;
}
async function refresh({force=false,reason="periodic"}={}){
  if(inflight)return inflight;
  const now=Date.now(),manual=reason==="manual";
  if(!force&&latest&&now-lastCheckAt<INTERVAL){
    return {ok:true,cached:true,view:continuityView(latest)};
  }
  if(manual&&lastRequestAt&&now-lastRequestAt<MIN_MANUAL_INTERVAL){
    log("Atualização recente. A consulta ao backend foi limitada para evitar excesso de requisições.");
    return {ok:false,rateLimited:true};
  }
  if(typeof navigator!=="undefined"&&navigator.onLine===false){
    errorCode="BROWSER_OFFLINE";
    log("Navegador offline. Os dados anteriores não serão anunciados como atuais.");
    publish({ok:false,ring:"CONTINUIDADE · SEM CONEXÃO"});
    return {ok:false,errorCode};
  }
  lastRequestAt=now;
  inflight=(async()=>{
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),6500);
    try{
      if(!base)throw Error("BACKEND_NOT_CONFIGURED");
      const response=await fetch(base+"/api/intelligence/continuity",{
        method:"GET",cache:"no-store",credentials:"omit",
        headers:{Accept:"application/json"},signal:controller.signal
      });
      if(!response.ok)throw Error("BACKEND_HTTP_"+response.status);
      const report=await response.json();
      const view=continuityView(report);
      if(!view.ok)throw Error("INVALID_CONTINUITY_REPORT");
      latest=report;lastCheckAt=Date.now();errorCode=null;
      say(report,{details:manual});
      publish(view,{wake:reason==="wake"});
      return {ok:true,view,report};
    }catch(error){
      errorCode=String(error?.message||"UNAVAILABLE").slice(0,60);
      log("Sem coleta persistida confirmada nesta consulta ("+errorCode+"). A coleta agendada do backend não foi alterada.");
      publish({ok:false,ring:"CONTINUIDADE · CONSULTA INDISPONÍVEL"},{wake:reason==="wake"});
      return {ok:false,errorCode};
    }finally{clearTimeout(timer);inflight=null;}
  })();
  return inflight;
}
async function report({force=false}={}){
  const outcome=await refresh({force,reason:"manual"});
  if(outcome.cached&&latest){
    say(latest,{details:true});
    return {ok:true,cached:true,view:continuityView(latest)};
  }
  return outcome;
}
function injectButton(){
  const strip=document.querySelector(".quick-actions");
  if(!strip||document.getElementById("btn-jarvis-continuity"))return;
  const button=document.createElement("button");
  button.id="btn-jarvis-continuity";button.type="button";button.textContent="CONTINUIDADE";
  let touch=0;
  button.addEventListener("pointerdown",event=>{
    if(event.pointerType==="mouse"||event.button!==0)return;
    touch=Date.now();void report({force:true});
  });
  button.addEventListener("click",()=>{
    if(Date.now()-touch<800)return;
    void report({force:true});
  });
  strip.appendChild(button);
}
window.addEventListener("ultron:wake-state",event=>{
  const next=event?.detail?.awake===true;
  const now=Date.now();
  if(next&&!awake&&now-lastWakeAt>12_000){
    lastWakeAt=now;
    // The Cron already collected on the server; waking requests only cached D1 facts.
    void refresh({force:true,reason:"wake"});
  }
  awake=next;
});
document.addEventListener("visibilitychange",()=>{
  if(!document.hidden)void refresh({reason:"visibility"});
});
window.addEventListener("online",()=>{void refresh({reason:"reconnect"});});
window.ULTRON_CONTINUITY={
  refresh,report,
  get state(){return {available:Boolean(latest),lastCheckAt:lastCheckAt?new Date(lastCheckAt).toISOString():null,
    errorCode,loading:Boolean(inflight),world:latest?.world?.state||"unavailable",
    weather:latest?.weather?.state||"unavailable"};}
};
injectButton();
if(document.visibilityState!=="hidden")setTimeout(()=>{void refresh({reason:"startup"});},4500);
setInterval(()=>{if(!document.hidden&&navigator.onLine!==false)
  void refresh({reason:"periodic"});},INTERVAL);
