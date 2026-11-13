import {contextualGeoScene} from "./jarvis-contextual-geo.js";

// Phase X: visual actions run only after explicit operator click/command.
// Wake notifications remain read-only text; no automatic camera movement.
const output=document.getElementById("output-box");
let requestId=0,lastMap=null;
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
   await import("./jarvis-geospatial-visual.js?v=4.96.0");
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
   representative:chosen.representative===true
  };
  lastMap=result;
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
window.ULTRON_CONTEXTUAL_MAP={
 open,
 get state(){return lastMap?{...lastMap}:{ok:false,reason:"NOT_OPENED"};}
};
