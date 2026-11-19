/**
 * One acceptance contract shared by the browser and CI. No static 0/60 lock.
 * Evidence must be attested; a green unit test alone never certifies production.
 */
export const JARVIS_CAPABILITY_COUNTS=Object.freeze({
  "Comunicação":7,"Dispositivos":8,"Inteligência":20,"Funcionalidades":17,"Integridade":8
});
export const JARVIS_PHASE_ORDER=Object.freeze([
  "Inteligência","Funcionalidades","Comunicação","Integridade","Dispositivos","Inteligência"
]);
const PROOF_DIMENSIONS=["code","ci","production","physical"];
const ISO_DATE=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
function legitimateUrl(value){
  try{
    const u=new URL(value);
    return u.protocol==="https:"&&!u.username&&!u.password&&
      u.hostname.includes(".")&&!/^(localhost|127\.|0\.0\.0\.0|10\.|192\.168\.)/.test(u.hostname);
  }catch{return false;}
}
export function validateJarvisProof(proof,dimension,{now=Date.now}={}){
  if(!proof||typeof proof!=="object"||Array.isArray(proof))return false;
  const allowed=proof.state==="verified"||
    dimension==="physical"&&proof.state==="not-applicable";
  if(!allowed||!legitimateUrl(proof.url))return false;
  if(typeof proof.verifiedAt!=="string"||!ISO_DATE.test(proof.verifiedAt))return false;
  const at=Date.parse(proof.verifiedAt);
  const time=Number(now());
  if(!Number.isFinite(at)||!Number.isFinite(time)||at>time+5*60000||at<time-90*86400000)return false;
  if(typeof proof.scope!=="string"||proof.scope.trim().length<20||proof.scope.length>500)return false;
  if(typeof proof.reviewer!=="string"||!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{1,79}$/.test(proof.reviewer))return false;
  if(proof.state==="not-applicable"){
    if(typeof proof.rationale!=="string"||proof.rationale.trim().length<30||proof.rationale.length>500)
      return false;
  }
  return true;
}
export function validateJarvisAcceptanceManifest(manifest,{now=Date.now}={}){
  const items=manifest?.capabilities;
  if(manifest?.schemaVersion!==1||!Array.isArray(items)||items.length!==60)
    return {ok:false,error:"INVENTORY_INVALID"};
  if(!Array.isArray(manifest.phases)||manifest.phases.length!==6||
     manifest.phases.some((stage,index)=>stage.stage!==index+1||
       stage.area!==JARVIS_PHASE_ORDER[index]))
    return {ok:false,error:"PHASE_ORDER_INVALID"};
  const seen=new Set(),counts=Object.fromEntries(Object.keys(JARVIS_CAPABILITY_COUNTS).map(a=>[a,0]));
  let accepted=0,partial=0;
  for(const item of items){
    if(!item||!Object.hasOwn(counts,item.area)||!/^[A-Z]+-\d{2}$/.test(item.id||"")||
       seen.has(item.id)||!Number.isInteger(item.baselinePercent)||
       item.baselinePercent<0||item.baselinePercent>100||
       typeof item.name!=="string"||item.name.length<4||
       typeof item.acceptanceRequirement!=="string"||item.acceptanceRequirement.length<16||
       !item.checks||typeof item.checks!=="object")
      return {ok:false,error:"CAPABILITY_INVALID"};
    seen.add(item.id);counts[item.area]++;
    if(item.acceptance==="accepted"){
      if(!PROOF_DIMENSIONS.every(d=>validateJarvisProof(item.checks[d],d,{now})))
        return {ok:false,error:"ACCEPTANCE_PROOF_MISSING",id:item.id};
      accepted++;
    }else if(item.acceptance==="pending"){
      if(item.checks.code?.state==="partial-scope-verified"&&
         item.checks.ci?.state==="partial-scope-verified")partial++;
    }else return {ok:false,error:"ACCEPTANCE_STATE_INVALID",id:item.id};
  }
  if(Object.entries(JARVIS_CAPABILITY_COUNTS).some(([area,count])=>counts[area]!==count))
    return {ok:false,error:"AREA_COUNT_INVALID"};
  return {ok:true,total:60,accepted,partial,pending:60-accepted,counts};
}
