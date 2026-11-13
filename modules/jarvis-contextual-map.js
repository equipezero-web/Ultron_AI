import {contextualGeoScene} from "./jarvis-contextual-geo.js";

// Phase X: visual actions run only after explicit operator click/command.
// Wake notifications remain read-only text; no automatic camera movement.
const output=document.getElementById("output-box");
let requestId=0,lastMap=null,lastFingerprint=null;
// The digest's generatedAt changes on each harmless preview. Compare the
// validated source points instead, so moving within the SAME observation set
// focuses the existing map without rebuilding Globe.gl or SVG.
function fingerprint(scenario){
 const points=scenario?.frames?.[0]?.points;
 if(!Array.isArray(points))return null;
 return JSON.stringify(points.map(p=>({
   id:p.id,name:p.name,lat:p.lat,lng:p.lng,kind:p.kind,
   source:p.source,observedAt:p.observedAt
 })).sort((a,b)=>a.id.localeCompare(b.id)));
}
function log(msg){
 if(!output)return;
 const p=document.createElement("p");
 p.textContent="> [MAPA CONTEXTUAL] "+String(msg).slice(0,300);
 output.appendChild(p);
 output.scrollTop=output.scrollHeight;
}
function publish(detail){
 window.dispatchEvent(new CustomEvent("ultron:contextual-map-status",{detail}));
}
async function open({view="2d",focusKey=null}={}){
 const serial=++requestId;
 const mode=view==="3d"?"3d":"2d";
 if(view!==mode){
  const res={ok:false,error:"Modo de visualização inválido"};log(res.error);return res;
 }
 const digest=window.ULTRON_CONTEXTUAL?.preview?.();
 const chosen=contextualGeoScene(digest,{focusKey,now:Date.now()});
 if(!chosen.ok){
  const error=chosen.reason==="EVENT_NOT_IN_CURRENT_SNAPSHOT"?
    "Este registro não está na coleta atual validada. Atualize as prioridades.":
    chosen.reason==="NO_VERIFIED_COORDINATES"?
    "Não há eventos catalogados com coordenadas verificadas. Notícias e avisos por estado não serão colocados em locais inventados.":
    "Registro geográfico inválido ou indisponível.";
  log(error);
  publish({ok:false,error,reason:chosen.reason});
  return {ok:false,error,reason:chosen.reason};
 }
 try{
  if(!window.ULTRON_GEO_VISUAL){
   await import("./jarvis-geospatial-visual.js?v=5.24.0");
  }
  if(serial!==requestId)return {ok:false,error:"Visualização substituída"};
  const map=window.ULTRON_GEO_VISUAL;
  if(!map?.open||!map?.focusPoint)throw Error("Motor de mapas sem função de centralização");
  const opened=await map.open({data:chosen.scenario,view:mode});
  if(serial!==requestId)return {ok:false,error:"Visualização substituída"};
  let selectedMode=mode,fallback3d=false;
  if((!opened?.ok||map.state?.scenario!==chosen.scenario.id)&&mode==="3d"){
   // Real 3D failure is reported. An existing 2D SVG may remain available.
   const fallback=await map.open({data:chosen.scenario,view:"2d"});
   if(serial!==requestId)return {ok:false,error:"Visualização substituída"};
   if(!fallback?.ok||map.state?.scenario!==chosen.scenario.id)
    throw Error("Globo 3D indisponível; o mapa 2D também não confirmou abertura");
   selectedMode="2d";fallback3d=true;
  }else if(!opened?.ok||map.state?.scenario!==chosen.scenario.id){
   throw Error(opened?.error||"Mapa 2D não confirmou abertura");
  }
  const focused=map.focusPoint(chosen.focusPointId,{zoom:selectedMode==="2d"?3.2:4});
  if(!focused?.ok)throw Error(focused?.error||"Não foi possível localizar o evento");
  const point=chosen.scenario.frames[0].points.find(p=>p.id===chosen.focusPointId);
  const result={
   ok:true,view:selectedMode,fallback3d,scenario:chosen.scenario.id,
   eventName:point?.name||"Registro catalogado",source:chosen.selectedSource,
   selectedPoint:chosen.focusPointId,pointCount:chosen.candidateCount,
   representative:chosen.representative===true,checkedAt:digest.generatedAt
  };
  lastMap=result;lastFingerprint=fingerprint(chosen.scenario);
  log("MAPA "+(selectedMode==="3d"?"3D":"2D")+" // "+result.eventName+
    " // "+result.pointCount+" registro(s) de fontes verificadas. "+
    (fallback3d?"Globo indisponível; mapa 2D ativado. ":"")+
    (result.representative?"Coordenada representativa. ":"")+
    "Pinos não indicam extensão ou probabilidade de impacto.");
  publish({...result,checkedAt:digest.generatedAt});
  return result;
 }catch(error){
  const message=String(error?.message||"Visualização indisponível").slice(0,160);
  log("VISUALIZAÇÃO INDISPONÍVEL // "+message);
  publish({ok:false,error:message});
  return {ok:false,error:message};
 }
}
// Move across the currently verified scenario without tearing down and
// reconstructing Mapbox/WebGL on every step. Revalidate source and freshness.
async function focus({focusKey,view=null}={}){
 if(typeof focusKey!=="string"||!/^g:[\w:./-]{1,150}$/.test(focusKey))
   return {ok:false,error:"Evento contextual inválido"};
 const mode=view===null?(lastMap?.view||"2d"):view;
 if(!["2d","3d"].includes(mode))return {ok:false,error:"Modo inválido"};
 const digest=window.ULTRON_CONTEXTUAL?.preview?.();
 const selected=contextualGeoScene(digest,{focusKey,now:Date.now()});
 if(!selected.ok)return {ok:false,error:"Evento não está na coleta atual com coordenadas verificadas.",reason:selected.reason};
 const map=window.ULTRON_GEO_VISUAL;
 // When a snapshot changed, reinitialize with its actual points. Otherwise
 // a repeated ID could point at an outdated or unrelated observation.
 if(!map?.state?.visible||map.state.scenario!==selected.scenario.id||
    lastFingerprint!==fingerprint(selected.scenario)){
   return open({view:mode,focusKey});
 }
 const serial=++requestId;
 let actual=mode,fallback3d=false;
 if(map.state.mode!==mode){
   let switched=await map.setMode(mode);
   if(serial!==requestId)return {ok:false,error:"Navegação substituída"};
   if(!switched?.ok&&mode==="3d"){
     switched=await map.setMode("2d");
     if(!switched?.ok)return {ok:false,error:"Globo indisponível e mapa 2D não respondeu"};
     actual="2d";fallback3d=true;
   }else if(!switched?.ok)return {ok:false,error:switched?.error||"Falha ao trocar o modo"};
 }
 const moved=map.focusPoint(selected.focusPointId,{zoom:actual==="2d"?3.2:4});
 if(!moved?.ok)return {ok:false,error:moved?.error||"Mapa não confirmou o foco"};
 const point=selected.scenario.frames[0].points.find(p=>p.id===selected.focusPointId);
 const result={ok:true,view:actual,fallback3d,scenario:selected.scenario.id,
   eventName:point?.name||"Registro catalogado",source:selected.selectedSource,
   selectedPoint:selected.focusPointId,pointCount:selected.candidateCount,
   representative:selected.representative===true,checkedAt:digest.generatedAt};
 lastMap=result;
 publish(result);
 return result;
}
function injectMapButton(){
 const strip=document.querySelector(".quick-actions");
 if(!strip||document.getElementById("btn-contextual-map"))return;
 const button=document.createElement("button");
 button.type="button";button.id="btn-contextual-map";button.textContent="MAPA CONTEXTUAL";
 let touchAt=0;
 button.addEventListener("pointerdown",event=>{
  if(event.pointerType==="mouse"||event.button!==0)return;
  touchAt=Date.now();void open({view:"2d"});
 });
 button.addEventListener("click",()=>{
  if(Date.now()-touchAt<800)return;
  void open({view:"2d"});
 });
 strip.appendChild(button);
}
window.ULTRON_CONTEXTUAL_MAP={
 open,focus,
 get state(){return lastMap?{...lastMap}:{ok:false,reason:"NOT_OPENED"};}
};
injectMapButton();
