// Normalized, sourced world weather insight visualizations. No disaster predictions.
export const WEATHER_INSIGHT_LABELS=Object.freeze({
 history:"Histórico climático",air:"Qualidade do ar",marine:"Oceanos e ondas",
 flood:"Vazão fluvial",ensemble:"Incerteza dos modelos",alerts:"Avisos oficiais"
});
const fmt=n=>Number(n).toLocaleString("pt-BR",{maximumFractionDigits:1});
const safeText=(v,n=260)=>String(v??"").replace(/[\r\n<>]/g," ").replace(/\s+/g," ").trim().slice(0,n);
const fmtMetric=m=>safeText(m.label,65)+": "+fmt(m.value)+(m.unit?" "+safeText(m.unit,14):"");
const sourceOk=value=>{try{const u=new URL(String(value||""));return u.protocol==="https:"&&!!u.hostname;}catch{return false;}};
export function insightSummary(report){
 if(!report?.ok||!Object.hasOwn(WEATHER_INSIGHT_LABELS,report.type)||!report.location?.label)return null;
 const source=report.source||{};
 let text=WEATHER_INSIGHT_LABELS[report.type]+" para "+safeText(report.location.label,120)+
  ". Fonte: "+safeText(source.name,140)+". Consulta: "+safeText(report.fetchedAt,40)+". ";
 if(report.type==="alerts"){
  if(report.coverage==="not-integrated")
    text+="Sem fonte oficial integrada neste país. Não significa ausência de avisos.";
  else text+=report.bulletins?.length?
    report.bulletins.length+" aviso(s) reportado(s) pela fonte. Verifique local e período de validade.":
    "A fonte consultada não devolveu avisos nessa consulta; não garante ausência de risco.";
 }else text+=(report.metrics||[]).slice(0,5).map(fmtMetric).join("; ")+".";
 return text+" "+safeText(source.disclaimer,320);
}
const kindFor={history:"history",air:"air",marine:"marine",flood:"river",ensemble:"uncertainty"};
const dataLabel=(type,entry)=>{
 if(type==="history")return entry.date+": "+fmt(entry.minC)+" a "+fmt(entry.maxC)+" °C; chuva "+fmt(entry.rainMm)+" mm.";
 if(type==="flood")return entry.date+": vazão simulada "+fmt(entry.dischargeM3s)+" m³/s"+
  (typeof entry.referenceMeanM3s==="number"?" (média modelada "+fmt(entry.referenceMeanM3s)+" m³/s).":".");
 if(type==="ensemble")return safeText(entry.at,30)+": menor membro "+fmt(entry.minC)+" °C; maior membro "+
  fmt(entry.maxC)+" °C; mediana "+fmt(entry.medianC)+" °C; "+entry.members+" membros.";
 return "";
};
export function insightScenario(report){
 if(!insightSummary(report)||!Object.hasOwn(kindFor,report.type)||!sourceOk(report.source?.url))return null;
 if(!report.metrics?.length)return null;
 const loc=report.location,kind=kindFor[report.type],source=report.source;
 const points=(id,detail)=>[{id,name:safeText(loc.label,100),lat:loc.lat,lng:loc.lng,
  kind,detail:safeText(detail,340),source:source.url}];
 const first=(report.metrics||[]).slice(0,5).map(fmtMetric).join("; ");
 const entries=Array.isArray(report.series)?report.series:[];
 const maxFrames=16; // one current or summary frame + at most 16 dated frames
 const sampling=entries.length>maxFrames?Array.from({length:maxFrames},(_,i)=>entries[Math.floor(i*(entries.length-1)/(maxFrames-1))]):entries;
 return {id:"insight-"+report.type+"-"+loc.key,title:WEATHER_INSIGHT_LABELS[report.type]+" — "+loc.name,
  projection:"world",
  source:{name:safeText(source.name,130),url:source.url,
   basePeriod:safeText(report.fetchedAt,100),disclaimer:safeText(source.disclaimer,350)},
  frames:[
   {id:"summary",name:"Resumo da fonte",type:safeText(source.kind,90),kind:"current-estimate",
    description:safeText(first+". "+source.disclaimer,350),points:points("summary",first)},
   ...sampling.map((entry,i)=>{
    const detail=dataLabel(report.type,entry);
    return {id:"date-"+i,name:entry.date||safeText(entry.at,24),type:safeText(source.kind,90),
     kind:"current-estimate",description:safeText(detail+". "+source.disclaimer,350),
     points:points("data-"+i,detail)};
   })
  ]};
}
export function monitorSummary(report){
 if(!report?.ok||!Array.isArray(report.regions))return null;
 const at=report.checkedAt?"Última coleta: "+report.checkedAt+". ":"Sem coleta armazenada ainda. ";
 return "Monitoramento meteorológico amostral do JARVIS. "+at+
  report.regions.slice(0,6).map(x=>safeText(x.name,45)+": "+fmt(x.temperatureC)+" °C, chuva prevista "+
   fmt(x.rainMm)+" mm, chance máxima "+fmt(x.rainChancePercent)+"%").join("; ")+
  ". "+safeText(report.disclaimer,350);
}
