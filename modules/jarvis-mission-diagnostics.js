// Phase VI: read-only dependency checks and bounded, non-sensitive mission evidence.
// Readiness applies only to known prerequisites; it never proves a TV authorized
// its remote, a camera granted permission, or an external service will succeed.
const DONE = new Set(["completed","failed","submitted","cancelled","waiting-confirmation"]);
const validStatus = value => DONE.has(value) ? value : "failed";
const clean = (v,n=80) => String(v??"").replace(/[\r\n<>]/g," ").trim().slice(0,n);

export function missionRequirements(parts, parseDeviceIntent=()=>null, isCameraActivation=()=>false) {
  const requirements = new Map();
  for(const part of Array.isArray(parts)?parts:[]) {
    let intent = null;
    try { intent=parseDeviceIntent(part); } catch {}
    if (intent && ["desktop","mobile"].includes(intent.deviceType)) {
      const kind=intent.deviceType;
      requirements.set("bridge:"+kind,{key:"bridge:"+kind,kind:"bridge",deviceType:kind,
        label:kind==="desktop"?"Desktop Bridge":"Mobile Bridge"});
    }
    if (isCameraActivation(part)) requirements.set("camera:capability",
      {key:"camera:capability",kind:"camera",label:"Sensor óptico"});
  }
  return [...requirements.values()];
}

async function deadline(promise,ms){
  let timer;
  try {
    return await Promise.race([Promise.resolve(promise),
      new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error("Tempo limite da consulta de dependências.")),ms);})]);
  } finally {clearTimeout(timer);}
}

export async function inspectMissionDependencies(parts, {
  parseDeviceIntent=()=>null,
  isCameraActivation=()=>false,
  listDevices=null,
  cameraAvailable=()=>false
}={}, {timeoutMs=6500}={}) {
  const requirements=missionRequirements(parts,parseDeviceIntent,isCameraActivation);
  const checks=[];
  const bridgeTypes=[...new Set(requirements.filter(x=>x.kind==="bridge").map(x=>x.deviceType))];
  let devices=null, deviceError=null;
  if(bridgeTypes.length){
    try {
      if(typeof listDevices!=="function")throw new Error("Consulta de dispositivos não inicializada.");
      devices=await deadline(listDevices(),timeoutMs);
      if(!Array.isArray(devices))throw new Error("Gateway retornou inventário inválido.");
    }catch(error){deviceError=clean(error?.message||error,120);}
  }
  for(const requirement of requirements) {
    if(requirement.kind==="bridge"){
      const matches=Array.isArray(devices)?devices.filter(d=>
        d?.deviceType===requirement.deviceType && d?.status==="active"):[];
      const online=matches.some(d=>d.online===true);
      checks.push({
        key:requirement.key,label:requirement.label,ready:online,
        state:deviceError?"unavailable":online?"online":matches.length?"offline":"not-paired",
        code:deviceError?"GATEWAY_UNAVAILABLE":online?"BRIDGE_ONLINE":matches.length?"DEVICE_OFFLINE":"DEVICE_NOT_PAIRED",
        detail:deviceError|| (online?"Bridge autenticado e com heartbeat recente; ações físicas ainda precisam de ACK.":
          matches.length?"Dispositivo pareado, mas serviço remoto sem heartbeat recente.":
          "Nenhum Bridge ativo deste tipo foi encontrado.")
      });
    }else if(requirement.kind==="camera"){
      let available=false;
      try {available=cameraAvailable()===true;} catch {}
      checks.push({key:requirement.key,label:requirement.label,ready:available,
        state:available?"available":"missing",code:available?"CAMERA_API_PRESENT":"CAMERA_API_UNAVAILABLE",
        detail:available?"API disponível; permissão e transmissão ainda não verificadas.":
          "API de ativação da câmera não carregada."});
    }
  }
  return {ready:checks.every(c=>c.ready),checks,
    checked:checks.length,blocking:checks.filter(c=>!c.ready).map(c=>c.code),
    limitations:"Somente dependências identificadas foram verificadas. Dados remotos, permissões da TV e resultados físicos são confirmados depois."};
}

export function missionStepOutcome(routed, aborted=false){
  if(aborted || routed?.result?.cancelled===true || routed?.result?.status==="cancelled")return "cancelled";
  if(routed?.waitingConfirmation===true || routed?.result?.needsConfirmation===true)return "waiting-confirmation";
  if(routed?.submitted===true || routed?.result?.submitted===true || routed?.result?.status==="submitted")return "submitted";
  return routed?.ok===true?"completed":"failed";
}

export function createMissionJournal({now=()=>Date.now(),maxEntries=12}={}) {
  const runs=[];
  const find=id=>runs.find(x=>x.id===id);
  const clone=value=>value?JSON.parse(JSON.stringify(value)):null;
  const create=({id,total,source="terminal",localOnly=false}={})=>{
    const key=clean(id,100);
    if(!key||!Number.isInteger(total)||total<1||total>6)throw new Error("Missão inválida.");
    const entry={id:key,source:clean(source,40),localOnly:Boolean(localOnly),
      status:"running",startedAt:now(),finishedAt:null,preflight:null,
      steps:Array.from({length:total},(_,i)=>({number:i+1,dependsOn:i?i:null,
        status:"queued",route:null,startedAt:null,finishedAt:null}))};
    runs.unshift(entry);
    runs.splice(Math.max(1,maxEntries));
    return clone(entry);
  };
  const preflight=(id,result)=>{
    const r=find(id);if(!r||r.status!=="running")return false;
    r.preflight={ready:result?.ready===true,checks:Array.isArray(result?.checks)?
      result.checks.map(c=>({label:clean(c.label),code:clean(c.code),state:clean(c.state),ready:c.ready===true})):[]};
    return true;
  };
  const beginStep=(id,index)=>{
    const r=find(id),step=r?.steps[index];
    if(!r||r.status!=="running"||!step||step.status!=="queued")return false;
    if(index>0&&r.steps[index-1].status!=="completed")return false;
    step.status="running";step.startedAt=now();return true;
  };
  const finishStep=(id,index,status,route=null)=>{
    const r=find(id),step=r?.steps[index];
    if(!r||!step||step.status!=="running")return false;
    step.status=validStatus(status);step.route=clean(route,80);step.finishedAt=now();
    return true;
  };
  const finish=(id,status)=>{
    const r=find(id);if(!r||r.status!=="running")return false;
    const final=validStatus(status);
    r.status=final;r.finishedAt=now();
    if(final==="completed"&&!r.steps.every(s=>s.status==="completed"))r.status="failed";
    return true;
  };
  return {create,preflight,beginStep,finishStep,finish,
    latest:()=>clone(runs[0]),get:id=>clone(find(id)),list:()=>clone(runs)};
}
