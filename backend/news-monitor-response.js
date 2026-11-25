// Deterministic, public-only replies to World News Monitor queries.
// No AI-generated observations, unverified comparisons or invented alerts.
const normalized=text=>String(text||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
const short=(value,max=200)=>String(value??"").replace(/\s+/g," ").trim().slice(0,max);
const httpUrl=value=>{try{const uri=new URL(String(value||""));return ["https:","http:"].includes(uri.protocol)&&!uri.username&&!uri.password?uri.href:null;}catch{return null;}};
export function newsMonitorQueryMode(message){
 const q=normalized(message);
 if(/\b(?:diagnostic\w*|provedor(?:es)?|fonte(?:s)? utilizada(?:s)?|fontes de coleta|falh(?:a|aram)|timeout)\b/.test(q))return "diagnostics";
 if(/\b(?:alertas?|receberam novas fontes|novas fontes|alterac\w*|fontes modificadas)\b/.test(q)&&
   !/\b(?:ultima coleta|ultimo monitoramento|horario da coleta|hora da coleta|status da coleta)\b/.test(q))return "alerts";
 return "overview";
}
const timing=run=>{
 if(!run)return "Nenhuma coleta registrada no D1.";
 return "Última coleta: "+short(run.checkedAt,60)+
  ". Situação: "+short(run.status,80)+
  ". Artigos: "+(Number(run.articleCount)||0)+".";
};
export function formatNewsMonitorReply(report,{mode="overview"}={}){
 if(!report?.ok)return "J.A.R.V.I.S. // MONITOR MUNDIAL DE NOTÍCIAS\n\n"+
  "Não foi possível consultar o histórico D1 do monitor. Nenhuma coleta ou alteração foi confirmada.";
 const run=report.latestRun,alerts=Array.isArray(report.alerts)?report.alerts.slice(0,6):[];
 const header="J.A.R.V.I.S. // MONITOR MUNDIAL DE NOTÍCIAS";
 if(mode==="diagnostics"){
  const lines=[header,"DIAGNÓSTICO DE COLETA",timing(run)];
  const providers=Array.isArray(run?.diagnostics?.providers)?run.diagnostics.providers:[];
  if(!providers.length)lines.push("Ainda não há diagnóstico de provedores registrado para essa coleta.");
  for(const provider of providers.slice(0,14)){
   lines.push(short(provider.provider,65)+": "+(provider.ok?"consulta concluída":"consulta com falha")+
    "; artigos: "+(Number(provider.count)||0)+
    (provider.error?"; erro: "+short(provider.error,130):"")+".");
  }
  if(run?.diagnostics)lines.push("Recuperação alternativa: "+(run.diagnostics.recovered?"utilizada":"não utilizada")+".");
  return lines.join("\n\n");
 }
 if(mode==="alerts"){
  const lines=[header,"ALERTAS E NOVAS FONTES",timing(run)];
  if(!alerts.length)lines.push("Nenhum alerta registrado no D1 até esta consulta. "+
   "O monitor pode ter coletado artigos sem detectar atualizações em acontecimentos anteriores.");
  for(const alert of alerts){
   const links=(Array.isArray(alert.sources)?alert.sources:[]).slice(0,4)
    .map(source=>httpUrl(source.url)).filter(Boolean);
   lines.push(short(alert.title,220)+": novas fontes "+(Number(alert.newSources)||0)+
    "; fontes modificadas "+(Number(alert.updatedSources)||0)+
    "; observado em "+short(alert.createdAt||"data indisponível",50)+
    ". Links: "+(links.join(" ; ")||"URLs indisponíveis")+".");
  }
  lines.push("Os alertas comparam publicações e fontes; não verificam fatos independentemente.");
  return lines.join("\n\n");
 }
 const lines=[header,timing(run)];
 if(!report.scheduledRunObserved)
  lines.push("Execução agendada ainda não confirmada; a última coleta pode ter ocorrido sob demanda.");
 if(report.bootstrap?.attempted)
  lines.push("Inicialização sob demanda: "+(report.bootstrap.ok?"registrada":"não concluída")+".");
 lines.push("Alertas registrados: "+alerts.length+
  ". Para detalhes, solicite 'consulte os alertas de notícias'; "+
  "para erros e provedores, solicite 'informe o diagnóstico das fontes da última coleta'.");
 lines.push("Mudanças em publicações não constituem comprovação independente dos fatos.");
 return lines.join("\n\n");
}
