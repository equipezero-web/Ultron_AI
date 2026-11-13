import {parseSupervisedCommand,buildSupervisedPlan,checkSupervisedPlan} from "./jarvis-supervised-autonomy-model.js";
// One short consented sequence, read-only visual actions only. Never dispatch generic commands.
const output=document.getElementById("output-box");
let pending=null,serial=0,running=false,report=null;
function notify(message){
 if(!output)return;
 const line=document.createElement("p");
 line.textContent="> [AUTONOMIA SUPERVISIONADA] "+message;
 output.append(line);output.scrollTop=output.scrollHeight;
}
const current=()=>window.ULTRON_MULTIMODAL?.current||null;
function cancel(reason="CANCELLED"){
 serial++;pending=null;running=false;report={ok:false,reason,at:new Date().toISOString()};
 return {handled:true,ok:true,cancelled:true,reason};
}
function status(){
 return {handled:true,ok:true,pending:!!pending,running,
  plan:pending?{label:pending.label,steps:pending.steps.map(s=>s.label),expiresAt:pending.expiresAt}:null,
  last:report?{...report}:null};
}
async function execute(raw,{source="terminal"}={}){
 const intent=parseSupervisedCommand(raw);
 if(!intent)return {handled:false};
 if(intent.type==="status"){const r=status();notify(r.running?"Sequência em execução.":r.pending?
  "Plano aguardando autorização: "+r.plan.label+".":"Nenhum plano aguardando autorização.");return r;}
 if(intent.type==="cancel"){const r=cancel();notify("Plano cancelado.");return r;}
 if(intent.type==="plan"){
  if(running)return {handled:true,ok:false,reason:"BUSY"};
  const plan=buildSupervisedPlan(intent.kind,{current:current()});
  if(!plan.ok){notify("Plano recusado: "+plan.reason);return {handled:true,...plan};}
  pending=plan;report=null;
  notify("PLANO PROPOSTO // "+plan.label+" // "+plan.steps.map(s=>s.label).join(" → ")+
   ". Nenhuma etapa foi executada. Diga 'autorizar plano' em até 2 minutos.");
  return {handled:true,ok:true,awaitingApproval:true,plan:{label:plan.label,steps:plan.steps,expiresAt:plan.expiresAt}};
 }
 if(running)return {handled:true,ok:false,reason:"BUSY"};
 if(!pending)return {handled:true,ok:false,reason:"NO_PENDING_PLAN",error:"Nenhum plano aguardando autorização."};
 const plan=pending;
 const validation=checkSupervisedPlan(plan,{current:current()});
 if(!validation.ok){cancel(validation.reason);notify("Autorização recusada: "+validation.reason);return {handled:true,...validation};}
 // Approval must come from this explicit operator command; never from a timer or wake.
 pending=null;running=true;const ticket=++serial,receipts=[];
 notify("AUTORIZADO // iniciando "+plan.steps.length+" etapas visuais.");
 try{
  for(const step of plan.steps){
   if(ticket!==serial)return {handled:true,ok:false,reason:"CANCELLED",receipts};
   if(plan.kind==="event"){
    const check=checkSupervisedPlan(plan,{current:current()});
    if(!check.ok){report={ok:false,reason:check.reason,receipts};notify("Interrompido: "+check.reason);return {handled:true,...report};}
   }
   const director=window.ULTRON_VISUAL_ORCHESTRATOR;
   if(!director?.show){report={ok:false,reason:"DIRECTOR_UNAVAILABLE",receipts};break;}
   if(!director.state?.active){
    const start=await director.start?.();
    if(ticket!==serial)return {handled:true,ok:false,reason:"CANCELLED",receipts};
    if(start?.ok!==true){report={ok:false,reason:"DIRECTOR_START_FAILED",receipts};break;}
   }
   const result=await director.show(step.scene,plan.eventKey?{focusKey:plan.eventKey}:{});
   if(ticket!==serial)return {handled:true,ok:false,reason:"CANCELLED",receipts};
   const ok=result?.ok===true&&result.scene===step.scene;
   receipts.push({step:step.id,ok,scene:result?.scene||null,mode:result?.view||result?.mode||null});
   notify((ok?"CONFIRMADO // ":"NÃO CONFIRMADO // ")+step.label);
   if(!ok){report={ok:false,reason:result?.reason||"SCENE_NOT_CONFIRMED",receipts};break;}
  }
  if(!report)report={ok:true,reason:"COMPLETED",receipts};
  return {handled:true,...report};
 }catch{
  report={ok:false,reason:"EXECUTION_ERROR",receipts};
  notify("Falha durante a execução. Sequência interrompida.");
  return {handled:true,...report};
 }finally{if(ticket===serial)running=false;}
}
window.ULTRON_SUPERVISED_AUTONOMY={parse:parseSupervisedCommand,execute,cancel,
 get state(){return status();}};
window.addEventListener("ultron:emergency-stop",()=>cancel("P0_STOP"));
