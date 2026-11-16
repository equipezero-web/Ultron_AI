import {createParallelTaskCenter,JARVIS_SAFE_TASK_TYPES} from "./jarvis-parallel-readonly-model.js?v=5.39.0";
import {cameraDirectorySummary} from "./jarvis-public-world-cameras-model.js?v=5.39.0";
// Safe parallel status checks, not arbitrary command execution.
const handlers={
 "world-cameras":async()=>{
  const s=cameraDirectorySummary();
  return {ok:true,summary:s.indexed+" câmeras selecionadas indexadas, "+
   s.providerCatalogs+" catálogos globais. Estado dos sinais não confirmado.",
   verified:false};
 },
 "device-status":async({signal})=>{
  if(signal.aborted)return {ok:false,error:"Cancelada"};
  const api=window.ULTRON_DEVICES;
  if(typeof api?.listDevices!=="function")return {ok:false,error:"Bridge ainda não inicializado."};
  if(!window.ULTRON_MEMORY?.getMemoryKey?.())
   return {ok:false,error:"Identidade do operador indisponível; não foi feito pareamento."};
  const devices=await api.listDevices();
  if(signal.aborted)return {ok:false,error:"Cancelada"};
  if(!Array.isArray(devices))return {ok:false,error:"Gateway não devolveu dispositivos válidos."};
  return {ok:true,summary:devices.length+" dispositivo(s) registrado(s). "+
   devices.filter(d=>d?.online===true&&d?.status==="active").length+
   " identificado(s) como online pelo gateway.",verified:false};
 },
 "meteorology-status":async()=>{
  const s=window.ULTRON_METEO_CENTER?.state;
  if(!s)return {ok:false,error:"Central meteorológica não carregada nesta página."};
  return {ok:true,summary:"Módulo carregado. Modo "+s.view+", "+
   (s.stationCount||0)+" estação(ões) no último relatório local. "+
   "Não equivale a consulta nova nem a alerta oficial.",verified:false};
 },
 "data-intelligence":async()=>{
  const s=window.ULTRON_DATA_INTELLIGENCE?.state;
  if(!s)return {ok:false,error:"Módulo de origem dos dados não carregado."};
  return {ok:true,summary:s.historyCount+" relatório(s) local(is) de origem. "+
   "Sem sensores próprios ou corroboração independente.",verified:false};
 }
};
const engine=createParallelTaskCenter({handlers,maxConcurrent:3});
let panel=null;
const labels={
 "world-cameras":"Catálogos mundiais",
 "device-status":"Dispositivos pareados",
 "meteorology-status":"Meteorologia",
 "data-intelligence":"Origem dos dados"
};
const el=(tag,className,text)=>{const n=document.createElement(tag);if(className)n.className=className;
 if(text!==undefined)n.textContent=text;return n;};
let resultList=null,statusText=null;
function render(state){
 if(!panel||!resultList)return;
 statusText.textContent=state.running+" tarefa(s) em execução (máximo "+state.maxConcurrent+
  " simultâneas). Sem acesso a arquivos ou ações destrutivas.";
 resultList.replaceChildren();
 for(const t of [...state.tasks,...state.recent].slice(0,12)){
  const item=el("li","",labels[t.name]+" · "+t.status+
   (t.message?" · "+t.message:""));
  item.dataset.taskStatus=t.status;
  resultList.append(item);
 }
}
engine.subscribe(render);
function close(){if(panel)panel.hidden=true;return {ok:true};}
function open(){
 if(!panel?.isConnected)build();
 if(!panel)return {ok:false,error:"Neural Jarvis indisponível"};
 panel.hidden=false;render(engine.snapshot());
 return {ok:true,count:JARVIS_SAFE_TASK_TYPES.length};
}
function build(){
 if(panel?.isConnected)return;
 const stage=document.querySelector(".jarvis-cc-center");
 if(!stage)return;
 panel=el("section","jarvis-parallel-panel");panel.hidden=true;
 panel.setAttribute("aria-label","Multitarefas seguras J.A.R.V.I.S.");
 const head=el("header","jarvis-parallel-head");
 const title=el("strong","","J.A.R.V.I.S. // MULTITAREFAS");
 const x=el("button","","×");x.type="button";x.setAttribute("aria-label","Fechar painel multitarefas");
 x.addEventListener("click",close);
 head.append(title,x);
 const description=el("p","",
  "Consultas independentes em paralelo dentro desta página. "+
  "Não executa ações de dispositivos, não lê arquivos sem permissão e para ao sair do navegador.");
 const form=el("div","jarvis-parallel-choices");
 for(const name of JARVIS_SAFE_TASK_TYPES){
  const label=el("label","");
  const check=el("input");check.type="checkbox";check.value=name;
  check.checked=true;
  label.append(check,document.createTextNode(" "+labels[name]));
  form.append(label);
 }
 const controls=el("div","jarvis-parallel-actions");
 const start=el("button","","INICIAR CONSULTAS");start.type="button";
 start.addEventListener("click",()=>{
  const selected=[...form.querySelectorAll("input:checked")].map(i=>i.value);
  if(!selected.length){statusText.textContent="Escolha pelo menos uma consulta.";return;}
  start.disabled=true;
  void engine.start(selected).then(r=>{
   if(!r.ok&&r.error)statusText.textContent=r.error;
  }).finally(()=>{start.disabled=false;});
 });
 const cancel=el("button","","PARAR MULTITAREFAS");cancel.type="button";
 cancel.addEventListener("click",()=>engine.stop());
 controls.append(start,cancel);
 statusText=el("p","jarvis-parallel-status");
 resultList=el("ol","jarvis-parallel-results");
 panel.append(head,description,form,controls,statusText,resultList);
 stage.append(panel);
 render(engine.snapshot());
}
const quick=document.querySelector(".quick-actions");
if(quick&&!document.getElementById("btn-jarvis-parallel")){
 const btn=el("button","","MULTITAREFAS");btn.id="btn-jarvis-parallel";btn.type="button";
 btn.addEventListener("click",open);
 quick.append(btn);
}
window.ULTRON_PARALLEL_TASKS={open,close,start:engine.start,stop:engine.stop,
 get state(){return {...engine.snapshot(),inPageOnly:true,
  automationNotPersistent:true,readOnly:true}}};
window.addEventListener("ultron:emergency-stop",()=>{engine.stop();close();});
window.addEventListener("ultron:new-conversation",close);
