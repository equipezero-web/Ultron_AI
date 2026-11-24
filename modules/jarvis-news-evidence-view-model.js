// Safe view model for the existing Neural Ring response surface.
// The backend does not certify facts: the UI must preserve that limitation.
const text=(value,max=240)=>String(value??"").replace(/\s+/g," ").trim().slice(0,max);
const safeLink=value=>{
 try{const u=new URL(String(value||""));return u.protocol==="https:"&&!u.username&&!u.password?u.href:null;}
 catch{return null;}
};
const dateLabel=value=>{
 const date=new Date(value);
 return Number.isFinite(date.getTime())?date.toLocaleString("pt-BR"):"Data não informada";
};
export function createNewsEvidenceViewModel(liveData,{maxEvents=6,maxSources=6}={}){
 const correlation=liveData?.eventCorrelation;
 if(!liveData?.news||!correlation||!Array.isArray(correlation.events))return [];
 return correlation.events.slice(0,Math.max(1,Math.min(8,maxEvents))).map(event=>{
  const sources=(Array.isArray(event?.sources)?event.sources:[])
   .slice(0,Math.max(1,Math.min(8,maxSources))).map(item=>({
    title:text(item.title,180),name:text(item.source||item.domain||"Fonte",80),
    url:safeLink(item.url),date:dateLabel(item.publishedAt)
   })).filter(item=>item.url);
  const discrepancies=(Array.isArray(event?.evidenceReview?.discrepancies)?
    event.evidenceReview.discrepancies:[]).slice(0,3).map(item=>({
     label:text(item.label,60),
     sources:(Array.isArray(item.sources)?item.sources:[]).slice(0,2).map(source=>({
      name:text(source.domain,80),url:safeLink(source.url),
      value:Number.isFinite(Number(source.value))?Number(source.value):null
     })).filter(source=>source.url&&source.value!==null)
    })).filter(item=>item.sources.length===2);
  const evolution=event?.evolution&&Array.isArray(event.evolution.timeline)
   ? {
     status:["first-observed","updated","unchanged"].includes(event.evolution.status)
       ? event.evolution.status:"unknown",
     firstSeen:dateLabel(event.evolution.firstSeen),
     lastSeen:dateLabel(event.evolution.lastSeen),
     newSources:Number(event.evolution.changes?.newSources)||0,
     updatedSources:Number(event.evolution.changes?.updatedSources)||0,
     timeline:event.evolution.timeline.slice(-6).map(entry=>({
       observedAt:dateLabel(entry.observedAt),
       kind:entry.kind==="first-observed"?"Primeira observação":"Atualização de fontes",
       title:text(entry.title,220),
       newSources:Number(entry.newSources)||0,
       updatedSources:Number(entry.updatedSources)||0,
       possibleDiscrepancyChanged:Boolean(entry.possibleDiscrepancyChanged)
     }))
   }:null;
  const caveat="Agrupamento automático de manchetes. As alegações não passaram por verificação factual independente.";
  return {
   id:text(event.event_id,80),title:text(event.title,220),
   summary:text(event.summary||"Não há descrição disponível na fonte.",520),
   timestamp:dateLabel(event.timestamp),
   sources,sourceCount:sources.length,
   status:discrepancies.length?"Possível divergência numérica — revisar fontes":
    sources.length>1?"Múltiplas fontes — não verificado":"Fonte única — não verificado",
   discrepancies,evolution,caveat,verified:false
  };
 }).filter(item=>item.id&&item.title&&item.sources.length);
}
