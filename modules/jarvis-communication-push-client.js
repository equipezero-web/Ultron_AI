import API_CONFIG from "../config.js";
// Browser Push API bridge. All endpoints are authenticated by Cloudflare Access.
// Never send subscription keys to any host except the configured J.A.R.V.I.S. Worker.
const BASE=String(API_CONFIG?.backendUrl||"").replace(/\/+$/,"");
let registered=false,lastError=null;
const decode=value=>{
 const str=atob(String(value||"").replace(/-/g,"+").replace(/_/g,"/")+"=".repeat((4-value.length%4)%4));
 return Uint8Array.from(str,c=>c.charCodeAt(0));
};
async function api(body){
 if(!BASE)throw Error("backend-not-configured");
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),7000);
 try{
  const response=await fetch(BASE+"/api/account/push",{
   method:body?"POST":"GET",credentials:"include",mode:"cors",cache:"no-store",redirect:"error",
   signal:controller.signal,...(body?{headers:{"Content-Type":"application/json"},body:JSON.stringify(body)}:{})
  });
  const result=await response.json().catch(()=>({ok:false,error:"invalid-server-response"}));
  if(!response.ok||!result?.ok)throw Error(String(result?.error||"HTTP "+response.status).slice(0,100));
  return result;
 }finally{clearTimeout(timer);}
}
export async function activateRemotePush(registration,{userGesture=false}={}){
 if(!userGesture||!registration?.pushManager)return {ok:false,reason:"user-gesture-or-push-api-unavailable"};
 try{
  const config=await api();
  if(!config.configured||!config.publicKey)return {ok:false,reason:"server-vapid-not-configured"};
  let subscription=await registration.pushManager.getSubscription();
  let created=false;
  if(!subscription){
   subscription=await registration.pushManager.subscribe({
    userVisibleOnly:true,applicationServerKey:decode(config.publicKey)
   });created=true;
  }
  try{
   const result=await api({action:"subscribe",subscription:subscription.toJSON()});
   registered=result.registered===true;lastError=null;
   return {ok:registered,backgroundPush:registered,source:"INMET",cadenceMinutes:15};
  }catch(error){
   if(created)await subscription.unsubscribe().catch(()=>{});
   throw error;
  }
 }catch(error){
  registered=false;lastError=String(error?.message||error).slice(0,100);
  return {ok:false,reason:lastError};
 }
}
export async function deactivateRemotePush(registration){
 let localRemoved=false,remoteRemoved=false;
 try{
  const subscription=await registration?.pushManager?.getSubscription?.();
  if(subscription){
   try{const result=await api({action:"unsubscribe",endpoint:subscription.endpoint});
    remoteRemoved=result.ok===true;}catch(error){lastError=String(error?.message||error).slice(0,100);}
   localRemoved=await subscription.unsubscribe();
  }
 }catch(error){lastError=String(error?.message||error).slice(0,100);}
 registered=false;
 return {ok:true,backgroundPush:false,localRemoved,remoteRemoved};
}
export async function checkRemotePush(registration){
 try{
  const subscription=await registration?.pushManager?.getSubscription?.();
  if(!subscription){registered=false;return {ok:true,backgroundPush:false};}
  const result=await api();
  registered=result.configured===true&&result.subscriptions>0;
  return {ok:true,backgroundPush:registered};
 }catch(error){registered=false;lastError=String(error?.message||error).slice(0,100);
  return {ok:false,backgroundPush:false,reason:lastError};}
}
export const remotePushState=()=>({registered,lastError});
