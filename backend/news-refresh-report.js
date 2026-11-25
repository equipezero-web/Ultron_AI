// Deterministic evidence-only public news update report.
// Never claim unchanged historical events when retrieval or D1 access failed.
const trim=(value,n=240)=>String(value||"").replace(/\s+/g," ").trim().slice(0,n);
const validUrl=value=>{
 try{const url=new URL(String(value||""));return ["https:","http:"].includes(url.protocol)&&!url.username&&!url.password?url.href:null;}
 catch{return null;}
};
export function buildWorldNewsRefreshReport(liveData){
 const events=Array.isArray(liveData?.eventCorrelation?.events)?
  liveData.eventCorrelation.events.slice(0,6):[];
 const state=liveData?.worldEvolution||{};
 const attempts=Array.isArray(liveData?.attempts)?liveData.attempts:[];
 const successful=attempts.some(a=>a?.ok&&Number(a.count)>0);
 const cited=events.flatMap(event=>(Array.isArray(event?.sources)?event.sources:[])
  .map(source=>({url:validUrl(source.url),title:trim(source.title||event.title,180),
   source:trim(source.source||source.domain,80),date:source.publishedAt||null}))
  .filter(source=>source.url)).slice(0,12);
 if(!liveData?.news||!state.available){
  const why=state.reason==="d1-unavailable"||state.reason==="d1-failed"
   ?"O histórico D1 não pôde ser consultado ou atualizado."
   :"Não há dados suficientes de notícias e histórico para comparar.";
  return {text:"Não consegui comprovar a atualização das notícias anteriores. "+
   why+" Não é possível afirmar que os acontecimentos permaneceram inalterados. "+
   "Confira a disponibilidade do Monitor Mundial e do D1 antes de concluir a comparação.",
   sources:[],verifiedComparison:false};
 }
 if(!events.length||!successful){
  return {text:"A coleta atual não retornou notícias novas com fontes utilizáveis. "+
   "Isso não significa que os acontecimentos anteriores estejam inalterados; "+
   "não foi possível comparar novas publicações com o histórico armazenado. "+
   "Nenhuma confirmação factual foi realizada.",
   sources:[],verifiedComparison:false};
 }
 const lines=[
  "J.A.R.V.I.S. // COMPARAÇÃO DE PUBLICAÇÕES",
  "Comparação do lote atual de notícias com registros públicos disponíveis no D1. "+
   "As diferenças observadas são mudanças em fontes e manchetes, não confirmação dos fatos.",
  "Novos acontecimentos observados: "+Number(state.created||0)+
   ". Acontecimentos com alterações detectadas: "+Number(state.updated||0)+
   ". Acontecimentos sem alterações detectadas neste lote: "+Number(state.unchanged||0)+"."
 ];
 for(const event of events){
  const history=event.evolution;
  if(!history){continue;}
  const status=history.status==="first-observed"?"Primeira observação neste histórico":
   history.status==="updated"?"Novas publicações ou alterações detectadas":
   history.status==="unchanged"?"Nenhuma alteração detectada entre as fontes comparadas":
   "Estado indeterminado";
  const newSources=Math.max(0,Number(history?.changes?.newSources)||0);
  const changedSources=Math.max(0,Number(history?.changes?.updatedSources)||0);
  const eventSources=(Array.isArray(event.sources)?event.sources:[])
   .map(s=>validUrl(s.url)).filter(Boolean).slice(0,3);
  lines.push(trim(event.title,180)+": "+status+
    ". Novas fontes: "+newSources+"; fontes atualizadas: "+changedSources+
    ". Primeiro registro: "+trim(history.firstSeen,35)+
    ". Evidências: "+(eventSources.join(" ; ")||"URLs indisponíveis")+".");
 }
 lines.push("Limitação: a ausência de mudanças detectadas não comprova que não houve atualizações no mundo. "+
  "As fontes podem estar incompletas ou atrasadas; nenhuma alegação foi verificada independentemente.");
 return {text:lines.join("\n\n"),sources:cited,verifiedComparison:true};
}
