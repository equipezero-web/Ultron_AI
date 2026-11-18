import {activateRemotePush,deactivateRemotePush,checkRemotePush,remotePushState} from "./jarvis-communication-push-client.js?v=5.53.0";
// Operator-consented notifications for fresh verified briefings while the page is running.
// Background Web Push requires a separate authenticated subscription/sender; never claim it is enabled.
const KEY="jarvis_communication_notifications_opt_in_v1";
const SEEN="jarvis_communication_notifications_seen_v1";
const controls=document.querySelector(".jarvis-intel-controls");
const button=document.createElement("button");
button.type="button";button.title="Notificações apenas com consentimento; entrega fora do navegador depende de push configurado.";
button.setAttribute("aria-label","Ativar ou desativar notificações de notícias e avisos");
let opted=false,registration=null,lastError=null,seen=[];
try{opted=localStorage.getItem(KEY)==="on";const list=JSON.parse(localStorage.getItem(SEEN)||"[]");
 if(Array.isArray(list))seen=list.filter(x=>typeof x==="string").slice(-70);}catch{}
const available=()=>typeof window.Notification!=="undefined"&&window.isSecureContext===true;
const permission=()=>available()?window.Notification.permission:"unsupported";
const enabled=()=>opted&&permission()==="granted";
function render(){
 button.textContent=!available()?"NOTIFICAÇÕES INDISPONÍVEIS":permission()==="denied"?"NOTIFICAÇÕES BLOQUEADAS":
  enabled()?(remotePushState().registered?"PUSH OFICIAL: ATIVO":"NOTIFICAÇÕES: SESSÃO"):"ATIVAR NOTIFICAÇÕES";
 button.setAttribute("aria-pressed",String(enabled()));
 button.disabled=!available();
}
function store(){
 try{localStorage.setItem(KEY,opted?"on":"off");}catch{}
 render();
}
async function serviceWorker(){
 if(registration)return registration;
 if(!("serviceWorker" in navigator))return null;
 try{
  registration=await navigator.serviceWorker.register("./jarvis-notification-sw.js",{scope:"./"});
  return registration;
 }catch(error){lastError=String(error?.message||error).slice(0,100);return null;}
}
async function enable({userGesture=false}={}){
 if(!available())return {ok:false,reason:"secure-context-or-notification-api-unavailable"};
 let p=permission();
 if(p==="denied")return {ok:false,reason:"permission-denied-in-browser-settings"};
 if(p!=="granted"){
  if(!userGesture)return {ok:false,reason:"click-notification-button-to-authorize"};
  try{p=await window.Notification.requestPermission();}catch{return {ok:false,reason:"permission-request-failed"};}
 }
 if(p!=="granted")return {ok:false,reason:"permission-not-granted"};
 opted=true;store();
 const worker=await serviceWorker();
 const remote=await activateRemotePush(worker,{userGesture});
 render();
 return {ok:true,enabled:true,foregroundOnly:true,backgroundPush:remote.backgroundPush===true,
  remoteReason:remote.ok?null:remote.reason};
}
async function disable(){
 opted=false;store();
 const remote=await deactivateRemotePush(registration);
 render();return {ok:true,enabled:false,backgroundPush:false,...remote};
}
function status(){return {ok:true,enabled:enabled(),permission:permission(),foregroundOnly:true,
 backgroundPush:enabled()&&remotePushState().registered,
 reason:lastError||remotePushState().lastError||"Push remoto depende de conta autenticada e VAPID configurado."};}
const safeUrl=value=>{
 try{const u=new URL(value);return u.protocol==="https:"&&!u.username&&!u.password&&
  !/^(?:localhost|127\.0\.0\.1|0\.0\.0\.0)$/.test(u.hostname)?u.href:null;}catch{return null;}
};
function remember(id){
 if(seen.includes(id))return false;
 seen.push(id);seen=seen.slice(-70);
 try{localStorage.setItem(SEEN,JSON.stringify(seen));}catch{}
 return true;
}
async function notify({id,title,body,url}){
 if(!enabled()||!document.hidden||!remember(id))return false;
 const href=safeUrl(url);
 if(!href)return false;
 const options={body:String(body||"Fonte verificada; confira o link.").slice(0,180),
  tag:"jarvis-"+id.slice(0,45),renotify:false,requireInteraction:false,data:{url:href}};
 try{
  const worker=await serviceWorker();
  if(worker?.showNotification){await worker.showNotification(String(title).slice(0,110),options);return true;}
  const notice=new window.Notification(String(title).slice(0,110),options);
  notice.onclick=()=>{window.open(href,"_blank","noopener,noreferrer");notice.close();};
  return true;
 }catch(error){lastError=String(error?.message||error).slice(0,100);return false;}
}
async function onIntelligenceUpdate(event){
 const d=event?.detail||{},stamp=Date.parse(d.fetchedAt);
 if(!enabled()||!document.hidden||d.partial===true||!Number.isFinite(stamp)||
  Date.now()-stamp>15*60*1000||stamp>Date.now()+5*60*1000)return;
 const bulletin=window.ULTRON_INTELLIGENCE?.visualData?.briefing;
 if(!remotePushState().registered&&bulletin?.alerts?.checked===true){
  for(const warning of (bulletin.alerts.warnings||[]).slice(0,2)){
   const href=safeUrl(warning.url),id=href&&"inmet:"+href+":"+String(warning.title||"");
   if(id&&warning.title)await notify({id,title:"INMET · aviso publicado",
    body:String(warning.title).slice(0,140)+" · confira validade e região afetada",url:href});
  }
 }
 if(Number(d.newStories)>0){
  const first=(d.verifiedNewStories||[]).find(a=>safeUrl(a.url));
  if(first)await notify({id:"news:"+safeUrl(first.url),title:"J.A.R.V.I.S. · notícia nova",
   body:first.title,url:first.url});
 }
}
button.addEventListener("click",()=>{if(enabled())void disable();else void enable({userGesture:true}).then(render);});
if(controls)controls.append(button);
window.addEventListener("ultron:intelligence-update",event=>{void onIntelligenceUpdate(event);});
window.addEventListener("focus",render);
if(enabled())void serviceWorker().then(worker=>checkRemotePush(worker)).then(render);
window.JARVIS_COMM_NOTIFICATIONS={enable,disable,status,get state(){return status();}};
render();
