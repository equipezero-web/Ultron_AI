import {
 JARVIS_EVIDENCE_SCHEMA,forecastEvidence,apacEvidence,evidenceSummary,isJarvisEvidence
} from "./jarvis-data-intelligence-model.js";

const STORAGE_KEY="jarvis_public_evidence_history_v1";
const MAX_REPORTS=18;
const MAX_STORAGE_BYTES=180000;
const sourceAllowed=new Set([
 "https://open-meteo.com/en/docs",
 "https://geoportal.apac.pe.gov.br/server/rest/services/met_monitoramento_chuvas_pe/MapServer"
]);
const clone=data=>JSON.parse(JSON.stringify(data));
let reports=[];
try{
 const raw=localStorage.getItem(STORAGE_KEY);
 if(raw && raw.length<MAX_STORAGE_BYTES){
  const items=JSON.parse(raw);
  if(Array.isArray(items))reports=items.filter(isJarvisEvidence).slice(0,MAX_REPORTS);
 }
}catch{} // Never block the neural UI if browser storage is disabled.
const persist=()=>{
 try{
  const value=JSON.stringify(reports);
  if(value.length<=MAX_STORAGE_BYTES){localStorage.setItem(STORAGE_KEY,value);return true;}
 }catch{}
 return false;
};
function register(kind,report){
 const evidence=kind==="forecast"?forecastEvidence(report):apacEvidence(report);
 if(!evidence)return null;
 reports=[evidence,...reports.filter(x=>x.id!==evidence.id)].slice(0,MAX_REPORTS);
 const stored=persist();
 window.dispatchEvent(new CustomEvent("ultron:data-evidence",{
  detail:{id:evidence.id,kind:evidence.kind,storedLocally:stored,
   sourceCount:evidence.sources.length}
 }));
 return clone(evidence);
}
export const registerForecast=report=>register("forecast",report);
export const registerApac=report=>register("apac",report);
const textNode=(tag,content,cls="")=>{
 const e=document.createElement(tag);e.textContent=String(content??"");
 if(cls)e.className=cls;
 return e;
};
export function renderEvidenceDetails(record){
 if(!isJarvisEvidence(record))return null;
 const box=document.createElement("details");
 box.className="jarvis-data-evidence";
 box.dataset.evidenceKind=record.kind;
 box.setAttribute("aria-label","Origem e verificação dos dados meteorológicos");
 const heading=document.createElement("summary");
 heading.textContent="J.A.R.V.I.S. · ORIGEM E CÁLCULOS";
 box.append(heading);
 const body=document.createElement("div");body.className="jarvis-data-evidence-body";
 body.append(textNode("p",
  record.kind==="station-observation"?
  "ORIGEM EXTERNA: registros de estações APAC, não sensores do J.A.R.V.I.S.":
  "ORIGEM EXTERNA: previsão numérica Open-Meteo, não medição de estação.",
  "jarvis-data-evidence-origin"));
 body.append(textNode("p","Consultado em: "+record.retrievedAt+
  (record.verification.timeliness==="stale-retrieval"?
    " · ATENÇÃO: consulta antiga":" · data de consulta, não de medição")));
 body.append(textNode("p","VALIDAÇÃO: estrutura e faixas numéricas conferidas. "+
  "Não há confirmação independente, validação física ou alerta oficial."));
 const list=document.createElement("ul");list.className="jarvis-data-evidence-metrics";
 for(const metric of (record.derived||[]).slice(0,5)){
  const li=document.createElement("li");
  li.append(textNode("strong",metric.label+": "));
  li.append(document.createTextNode(Number(metric.value).toLocaleString("pt-BR",{
    maximumFractionDigits:1})+" "+metric.unit+
    (metric.date?" · "+metric.date:"")));
  list.append(li);
 }
 body.append(textNode("h4","ANÁLISES CALCULADAS PELO J.A.R.V.I.S."),list);
 const caveats=document.createElement("p");
 caveats.textContent=(record.limitations||[]).slice(0,4).join(" ");
 caveats.className="jarvis-data-evidence-limitations";body.append(caveats);
 const links=document.createElement("div");links.className="jarvis-data-evidence-links";
 for(const src of record.sources){
  if(!sourceAllowed.has(src.url))continue;
  const a=document.createElement("a");
  a.href=src.url;a.target="_blank";a.rel="noopener noreferrer";
  a.textContent="Fonte original: "+src.provider;
  links.append(a);
 }
 body.append(links);
 const save=document.createElement("button");save.type="button";
 save.className="jarvis-data-evidence-export";
 save.textContent="EXPORTAR RELATÓRIO JSON";
 save.addEventListener("click",()=>{
  // User gesture only. No report uploading, no external network or telemetry.
  const blob=new Blob([JSON.stringify(record,null,2)],{type:"application/json"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");
  a.href=url;a.download="jarvis-evidence-"+record.kind+"-"+record.createdAt.slice(0,10)+".json";
  document.body.append(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),3000);
 });
 body.append(save);
 box.append(body);
 return box;
}
export function getEvidenceHistory(){return clone(reports);}
export function getEvidenceReport(id){const x=reports.find(r=>r.id===id);return x?clone(x):null;}
export function getLatestEvidence(){return reports.length?clone(reports[0]):null;}
export function exportEvidenceJSON(){
 return JSON.stringify({schema:JARVIS_EVIDENCE_SCHEMA,scope:"public-browser-local",
  generatedAt:new Date().toISOString(),
  disclaimer:"Cálculos do J.A.R.V.I.S. derivados de dados de terceiros; sem confirmação independente.",
  reports:reports},null,2);
}
if(typeof window!=="undefined"){
 window.ULTRON_DATA_INTELLIGENCE={
  get schema(){return JARVIS_EVIDENCE_SCHEMA;},
  get latest(){return getLatestEvidence();},
  history:getEvidenceHistory,
  getReport:getEvidenceReport,
  exportJSON:exportEvidenceJSON,
  get state(){return {ready:true,historyCount:reports.length,
   persistence:"best-effort-local-browser-only",backendVerified:false,
   ownSensorsConnected:false,independentCorroboration:false};}
 };
}
