import {validateJarvisAcceptanceManifest} from "./jarvis-acceptance-validation.js";
/**
 * Evidence-based evolution status, without another page or a synthetic score.
 * The public manifest contains capability requirements, not credentials.
 */
const normalize=text=>String(text||"").normalize("NFD")
  .replace(/[\u0300-\u036f]/g,"").toLowerCase().trim();
const areas=[["Inteligência",20],["Funcionalidades",17],["Comunicação",7],["Integridade",8],["Dispositivos",8]];
export function parseJarvisEvolutionCommand(value){
  if(typeof value!=="string"||value.length>260)return null;
  const n=normalize(value).replace(/^(?:jarvis|ultron)[, :]+/,"")
    .replace(/[.!?]+$/,"").trim();
  return /^(?:(?:mostre|mostrar|consulte|consultar|verifique|verificar)\s+)?(?:(?:o|meu)\s+)?(?:progresso\s+(?:das\s+60\s+capacidades|do\s+jarvis|do\s+sistema)|relatorio\s+de\s+evolucao(?:\s+100%)?|evolucao\s+das\s+60\s+capacidades)$/.test(n)?
    {kind:"verified-acceptance-progress"}:null;
}
export function summarizeJarvisEvidence(manifest){
  const evaluation=validateJarvisAcceptanceManifest(manifest);
  if(!evaluation.ok)return null;
  const items=manifest.capabilities;
  const complete=items.filter(x=>x.acceptance==="accepted");
  const partial=items.filter(x=>x.acceptance==="pending"&&
    x.checks?.code?.state==="partial-scope-verified"&&
    x.checks?.ci?.state==="partial-scope-verified");
  const rows=areas.map(([name,total])=>({
    name,total,accepted:items.filter(x=>x.area===name&&x.acceptance==="accepted").length,
    partial:partial.filter(x=>x.area===name).length
  }));
  return {
    total:items.length,accepted:complete.length,partial:partial.length,
    pending:items.length-complete.length,areas:rows,
    text:"EVOLUÇÃO J.A.R.V.I.S. // HOMOLOGAÇÃO REAL\n"+
      complete.length+"/"+items.length+" capacidades aceitas integralmente.\n"+
      partial.length+" capacidades têm evidência parcial de código e CI, mas não de produção/dispositivos.\n"+
      rows.map(x=>x.name+": "+x.accepted+"/"+x.total+" aceitas; "+
        x.partial+" com progresso técnico parcialmente comprovado.").join("\n")+
      "\nMeta: 100% apenas com testes operacionais e evidências reais. "+
      "A aprovação da CI não equivale à publicação nem ao teste físico. "+
      "Voz, escuta e Voice Match permanecem desligados durante a manutenção."
  };
}
export async function showJarvisEvolutionProgress({fetchImpl,showAnswer,isCancelled}={}){
  const url=new URL("../data/jarvis-100-acceptance-manifest.json",import.meta.url);
  const fetcher=fetchImpl||globalThis.fetch;
  let report;
  try{
    const result=await fetcher(url.href,{method:"GET",cache:"no-store",mode:"same-origin"});
    if(!result.ok)throw Error("unavailable");
    const data=await result.json();
    report=summarizeJarvisEvidence(data);
    if(!report)throw Error("invalid-evidence");
  }catch{
    return {ok:false,route:"acceptance-progress",text:"EVOLUÇÃO J.A.R.V.I.S. // inventário verificável indisponível. Nenhuma nota foi presumida."};
  }
  if(typeof isCancelled==="function"&&isCancelled())return {ok:false,status:"cancelled",route:"acceptance-progress",text:"Consulta interrompida."};
  let displayed=false;
  try{
    const fn=showAnswer||globalThis.window?.ULTRON_NEURAL_ANSWER?.show;
    if(typeof fn==="function"){fn(report.text);displayed=true;}
  }catch{}
  return {ok:true,route:"acceptance-progress",text:report.text,
    accepted:report.accepted,partial:report.partial,displayed,voiceEnabled:false};
}
