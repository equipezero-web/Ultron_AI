/**
 * J.A.R.V.I.S. evidence contract v1.
 * External measurements remain attributed to their original providers.
 * JARVIS-produced values are explicitly deterministic DERIVATIONS, never new
 * physical observations, independent confirmation, alarms or AI predictions.
 *
 * No fabricated confidence percentages or raw-data authenticity claims.
 * Usable in browser and Node, with no network access and no storage effects.
 */
export const JARVIS_EVIDENCE_SCHEMA="jarvis-evidence-v1";
const APAC_URL="https://geoportal.apac.pe.gov.br/server/rest/services/met_monitoramento_chuvas_pe/MapServer";
const OPEN_METEO_URL="https://open-meteo.com/en/docs";
const valid=(value,min,max)=>typeof value==="number"&&Number.isFinite(value)&&value>=min&&value<=max;
const clipped=(value,max=180)=>String(value??"").replace(/[\u0000-\u001f<>]/g," ").replace(/\s+/g," ").trim().slice(0,max);
const isTime=(v)=>typeof v==="string"&&Number.isFinite(Date.parse(v))&&
 /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v);
const iso=(v)=>isTime(v)?new Date(v).toISOString():null;
const round=(v,precision=1)=>Number(Number(v).toFixed(precision));
const nowStamp=(now)=>{
 const t=typeof now==="function"?now():now;
 return iso(t)||null;
};
const trustStatus=(checkedAt,at)=>{
 const gap=Date.parse(at)-Date.parse(checkedAt);
 if(gap < -300000)return "invalid-future";
 if(gap > 3*3600000)return "stale-retrieval";
 return "recent-retrieval";
};
const base=(kind,checkedAt,source,at)=>{
 const status=trustStatus(checkedAt,at);
 if(status==="invalid-future")return null;
 return {
  schema:JARVIS_EVIDENCE_SCHEMA,
  domain:"meteorology",kind,
  createdAt:at,retrievedAt:checkedAt,
  verification:{
   sourceIdentity:"declared-provider-not-cryptographically-authenticated",
   structure:"validated-normalized-input",
   timeliness:status,
   independentCorroboration:"not-performed",
   authoritativeWarning:"not-checked",
   sensorCalibration:"not-checked"
  },
  sources:[{provider:source.provider,url:source.url,
   origin:kind==="station-observation"?"external-station-observations":"external-numerical-model"}],
  observations:[],derived:[],
  limitations:[]
 };
};
export function forecastEvidence(report,{now=()=>new Date().toISOString()}={}){
 if(report?.ok!==true||report.kind!=="global-short-term-forecast"||
    !report?.location?.key?.startsWith("global-")||
    !valid(report.location.lat,-90,90)||!valid(report.location.lng,-180,180)||
    !isTime(report.fetchedAt)||!Array.isArray(report.days)||report.days.length<1||
    report.days.length>16||!report?.current||!Array.isArray(report.days))return null;
 const at=nowStamp(now),checkedAt=iso(report.fetchedAt);
 if(!at||!checkedAt)return null;
 const entry=base("numerical-forecast",checkedAt,
  {provider:"Open-Meteo (dados numéricos) / GeoNames (localização)",url:OPEN_METEO_URL},at);
 if(!entry)return null;
 const city=clipped(report.location.label,130);
 if(!city)return null;
 const modelTime=clipped(report.current.time,40);
 if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(modelTime))return null;
 const data=[];
 for(const day of report.days){
  if(typeof day?.date!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(day.date)||
    (data.length&&day.date<=data.at(-1).date)||
    !valid(day.minC,-100,65)||!valid(day.maxC,-100,65)||day.minC>day.maxC||
    !valid(day.rainMm,0,2000)||!valid(day.rainChancePercent,0,100))return null;
  data.push({date:day.date,minC:day.minC,maxC:day.maxC,rainMm:day.rainMm,
   chance:day.rainChancePercent});
 }
 if(!valid(report.current.temperatureC,-100,65))return null;
 entry.id="forecast:"+report.location.key+":"+checkedAt;
 entry.subject={label:city,latitude:report.location.lat,longitude:report.location.lng};
 entry.observations=[{
  category:"model-estimate",value:report.current.temperatureC,unit:"°C",
  metric:"temperature_2m",provider:"Open-Meteo",
  dataTime:modelTime,dataTimeBasis:"local-model-time; timezone offset not present in normalized report",
  retrievedAt:checkedAt,
  description:"Estimativa numérica modelada; NÃO é uma medição de estação"
 }];
 const rainSum=round(data.reduce((s,d)=>s+d.rainMm,0));
 const wettest=data.reduce((a,b)=>b.rainMm>a.rainMm?b:a);
 const hottest=data.reduce((a,b)=>b.maxC>a.maxC?b:a);
 const coldest=data.reduce((a,b)=>b.minC<a.minC?b:a);
 entry.derived=[
  {metric:"total-forecast-precipitation",label:"Soma de precipitação prevista",
   kind:"jarvis-derived-calculation",value:rainSum,unit:"mm",
   period:{from:data[0].date,to:data.at(-1).date,days:data.length},
   formula:"soma de daily.precipitation_sum para os dias fornecidos",
   from:[OPEN_METEO_URL],not:"Chuva observada nem alerta de inundação"},
  {metric:"highest-forecast-daily-rain",label:"Maior acumulado diário previsto",
   kind:"jarvis-derived-calculation",value:wettest.rainMm,unit:"mm",
   date:wettest.date,formula:"máximo de daily.precipitation_sum",
   from:[OPEN_METEO_URL],not:"Confirmação de evento extremo"},
  {metric:"maximum-forecast-temperature",label:"Maior máxima prevista",
   kind:"jarvis-derived-calculation",value:hottest.maxC,unit:"°C",
   date:hottest.date,formula:"máximo de daily.temperature_2m_max",
   from:[OPEN_METEO_URL],not:"Temperatura observada"},
  {metric:"minimum-forecast-temperature",label:"Menor mínima prevista",
   kind:"jarvis-derived-calculation",value:coldest.minC,unit:"°C",
   date:coldest.date,formula:"mínimo de daily.temperature_2m_min",
   from:[OPEN_METEO_URL],not:"Temperatura observada"}
 ];
 entry.limitations=[
  "A fonte oferece estimativas e previsões numéricas, não pluviômetros locais.",
  "Apenas um provedor de dados meteorológicos foi consultado; não há confirmação independente.",
  "A soma de chuva prevista não equivale a medição nem a avaliação de risco.",
  "Não foram consultados alertas oficiais nem houve validação por sensores próprios."
 ];
 entry.completeness={daysProvided:data.length,daysRequested:valid(report.requestedDays,1,16)?
   report.requestedDays:data.length,partial:!!report.partialForecast};
 return entry;
}
export function apacEvidence(report,{now=()=>new Date().toISOString()}={}){
 if(report?.ok!==true||report.type!=="observed-rain-gauges"||
    ![1,3,6,12,24,48,72].includes(report.hours)||
    !Array.isArray(report.stations)||!report.stations.length||
    report.stations.length>500||!isTime(report.checkedAt))return null;
 const checkedAt=iso(report.checkedAt),at=nowStamp(now);
 if(!checkedAt||!at)return null;
 const entry=base("station-observation",checkedAt,
  {provider:"APAC · Pernambuco",url:APAC_URL},at);
 if(!entry)return null;
 const stations=[];
 for(const station of report.stations){
  if(!station||!valid(station.lat,-13,-2)||!valid(station.lng,-47,-30)||
    !valid(station.value,0,2000))continue;
  stations.push({id:clipped(station.id,45),name:clipped(station.name,90),
   city:clipped(station.city,90),value:station.value,
   lastReading:clipped(station.lastReading,75)});
 }
 if(!stations.length)return null;
 entry.id="apac:"+report.hours+":"+checkedAt;
 entry.subject={label:"Estações APAC · Pernambuco"};
 const max=stations.reduce((a,b)=>b.value>a.value?b:a);
 entry.observations=stations.slice(0,30).map(s=>({
  category:"external-station-observation",metric:"rain-accumulation",
  value:s.value,unit:"mm",stationId:s.id,station:s.name,city:s.city,
  provider:"APAC · Pernambuco",windowHours:report.hours,
  dataTime:s.lastReading||"não informado",
  dataTimeBasis:"texto fornecido pela APAC; idade não confirmada",
  retrievedAt:checkedAt
 }));
 entry.derived=[
  {metric:"stations-with-valid-rain-values",label:"Estações com valores válidos",
   kind:"jarvis-derived-calculation",value:stations.length,unit:"estações",
   formula:"contagem dos registros válidos obtidos na consulta APAC",
   from:[APAC_URL],not:"Cobertura total de Pernambuco"},
  {metric:"stations-recorded-rain",label:"Estações com chuva registrada",
   kind:"jarvis-derived-calculation",
   value:stations.filter(s=>s.value>0).length,unit:"estações",
   formula:"contagem de estações com acumulado > 0 mm no período selecionado",
   from:[APAC_URL],not:"Total de municípios atingidos"},
  {metric:"maximum-observed-station-accumulation",
   label:"Maior acumulado entre as estações retornadas",
   kind:"jarvis-derived-calculation",value:max.value,unit:"mm",
   station:max.name,city:max.city,windowHours:report.hours,
   formula:"máximo de chuva acumulada entre as estações retornadas",
   from:[APAC_URL],not:"Maior chuva de todo o estado ou alerta de enchente"}
 ];
 entry.completeness={stationsReturned:stations.length,
  stationsShownInDetail:entry.observations.length,partial:stations.length>30};
 entry.limitations=[
  "Leituras da APAC são atribuídas às estações, não medidas por sensores próprios do J.A.R.V.I.S.",
  "A data individual pode estar ausente ou atrasada; a hora da consulta não comprova a hora da medição.",
  "O sistema não verificou calibração, integridade física nem cobertura de todas as estações.",
  "Não há confirmação independente, diagnóstico de enchente ou aviso oficial."
 ];
 return entry;
}
export function evidenceSummary(entry){
 if(entry?.schema!==JARVIS_EVIDENCE_SCHEMA||!entry?.sources?.length)return null;
 const {verification,derived,subject}=entry;
 const provenance=entry.kind==="station-observation"?
  "Medições externas atribuídas às estações APAC":"Estimativas e previsões de modelo externo";
 const strongest=derived?.[0];
 const result=strongest?
   "Cálculo próprio: "+strongest.label.toLowerCase()+" = "+
   Number(strongest.value).toLocaleString("pt-BR",{maximumFractionDigits:1})+
   " "+strongest.unit+". ":"";
 return "J.A.R.V.I.S. // RELATÓRIO DE ORIGEM · "+subject.label+". "+provenance+". "+
  result+"Origem: "+entry.sources.map(s=>s.provider).join("; ")+
  ". Consulta: "+entry.retrievedAt+". "+
  (verification.timeliness==="stale-retrieval"?"Consulta antiga. ":"")+
  "Estrutura conferida; fonte NÃO corroborada independentemente. "+
  "Não é observação própria, garantia de precisão nem alerta oficial.";
}
export function isJarvisEvidence(data){
 return !!data&&data.schema===JARVIS_EVIDENCE_SCHEMA&&
   ["numerical-forecast","station-observation"].includes(data.kind)&&
   !!evidenceSummary(data);
}
