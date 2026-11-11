// World weather intelligence, read-only. Source attribution and scope are mandatory.
// No user-controlled host or coordinates. Forecasts are NEVER emergency alerts.
import {normalizeGlobalLocation,safeLocationQuery} from "../modules/jarvis-global-weather.js";
import {searchGlobalLocations} from "./weather-global.js";

export const INSIGHT_TYPES=Object.freeze(["history","air","marine","flood","ensemble","alerts"]);
const MODELS={
 history:{url:"https://archive-api.open-meteo.com/v1/archive",name:"Open-Meteo / ERA5",page:"https://open-meteo.com/en/docs/historical-weather-api",class:"historical-reanalysis",warning:"Reanálise, não medição de uma estação; o recorte é um mês do ano selecionado."},
 air:{url:"https://air-quality-api.open-meteo.com/v1/air-quality",name:"Open-Meteo / Copernicus CAMS",page:"https://open-meteo.com/en/docs/air-quality-api",class:"air-quality-model",warning:"Estimativa de modelo atmosférico, não sensor individual de qualidade do ar."},
 marine:{url:"https://marine-api.open-meteo.com/v1/marine",name:"Open-Meteo / modelos oceânicos",page:"https://open-meteo.com/en/docs/marine-weather-api",class:"marine-model",warning:"Modelos de ondas/correntes; pode não haver cobertura útil para cidades interiores. Não usar para decisões de navegação."},
 flood:{url:"https://flood-api.open-meteo.com/v1/flood",name:"Open-Meteo / GloFAS",page:"https://open-meteo.com/en/docs/flood-api",class:"river-model",warning:"Vazão simulada de rios em grade de ~5 km, NÃO mapa de inundação, nível de água ou previsão de desastre local."},
 ensemble:{url:"https://ensemble-api.open-meteo.com/v1/ensemble",name:"Open-Meteo / GFS Ensemble",page:"https://open-meteo.com/en/docs/ensemble-api",class:"model-uncertainty",warning:"Faixa dos membros disponíveis do ensemble, não intervalo estatístico de confiança nem probabilidade de desastre."},
 alerts:{url:null,name:"Serviços meteorológicos oficiais",page:null,class:"official-bulletins",warning:"Disponível apenas para países e regiões com fonte oficial integrada; ausência de registros não garante segurança."}
};
const nonempty=(value,n=160)=>String(value??"").replace(/[\r\n<>]/g," ").replace(/\s+/g," ").trim().slice(0,n);
const numeric=(v,min,max)=>typeof v==="number"&&Number.isFinite(v)&&v>=min&&v<=max?v:null;
const isoDay=s=>typeof s==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(s);
const isoDate=s=>typeof s==="string"&&Number.isFinite(Date.parse(s))?new Date(s).toISOString():null;
const metric=(label,value,unit="",at=null)=>({label,value,unit,at});
function sourceFor(type){const c=MODELS[type];return {name:c.name,url:c.page,kind:c.class,disclaimer:c.warning,credit:"Open-Meteo.com / CC BY 4.0 (quando aplicável)"};}
async function fetchJson(url,fetchImpl=fetch,headers={}){
 const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),7500);
 try{
  const res=await fetchImpl(url,{method:"GET",signal:ctl.signal,headers:{Accept:"application/json",...headers}});
  if(!res?.ok)throw new Error("HTTP upstream "+res?.status);
  const obj=await res.json();
  if(!obj||typeof obj!=="object"||obj.error===true||Array.isArray(obj))throw Error("Resposta inválida");
  return obj;
 }finally{clearTimeout(timer);}
}
async function locate(params,fetchImpl){
 if(params.id!==null&&params.id!==undefined&&params.id!==""){
  const id=Number(params.id);
  if(!Number.isSafeInteger(id)||id<1)return null;
  const url=new URL("https://geocoding-api.open-meteo.com/v1/get");
  url.searchParams.set("id",String(id));
  return normalizeGlobalLocation(await fetchJson(url,fetchImpl));
 }
 if(!safeLocationQuery(params.city))return null;
 const r=await searchGlobalLocations(params.city,{fetchImpl});
 return r?.ok?r.locations?.[0]||null:null;
}
function deriveMetrics(type,raw,options){
 const result={metrics:[],series:[],bulletins:[]};
 const current=raw.current||{},daily=raw.daily||{},hourly=raw.hourly||{};
 if(type==="air"){
  for(const [field,label,unit,min,max] of [
    ["us_aqi","AQI americano","",0,500],["pm2_5","PM2.5","µg/m³",0,1500],
    ["pm10","PM10","µg/m³",0,2000],["ozone","Ozônio","µg/m³",0,1000]
  ]){const value=numeric(current[field],min,max);if(value!==null)result.metrics.push(metric(label,value,unit,current.time||null));}
 }else if(type==="marine"){
  for(const [field,label,unit,min,max] of [
    ["wave_height","Altura das ondas","m",0,60],
    ["sea_surface_temperature","Temperatura da superfície do mar","°C",-5,45],
    ["ocean_current_velocity","Velocidade da corrente","km/h",0,100]
  ]){const value=numeric(current[field],min,max);if(value!==null)result.metrics.push(metric(label,value,unit,current.time||null));}
 }else if(type==="history"){
  const n=Math.min(daily.time?.length||0,31),max=daily.temperature_2m_max||[],min=daily.temperature_2m_min||[],rain=daily.precipitation_sum||[];
  for(let i=0;i<n;i++){
    if(!isoDay(daily.time[i]))continue;
    const h=numeric(max[i],-100,65),l=numeric(min[i],-100,65),p=numeric(rain[i],0,2000);
    if(h!==null&&l!==null&&p!==null&&h>=l)result.series.push({date:daily.time[i],maxC:h,minC:l,rainMm:p});
  }
  if(result.series.length){
    result.metrics.push(metric("Dias disponíveis",result.series.length,"dias"));
    result.metrics.push(metric("Chuva acumulada no recorte",Math.round(result.series.reduce((a,x)=>a+x.rainMm,0)*10)/10,"mm"));
  }
 }else if(type==="flood"){
  const n=Math.min(daily.time?.length||0,7),values=daily.river_discharge||[],means=daily.river_discharge_mean||[];
  for(let i=0;i<n;i++){
    const date=daily.time[i],value=numeric(values[i],0,1e8);
    if(isoDay(date)&&value!==null)result.series.push({date,dischargeM3s:value,referenceMeanM3s:numeric(means[i],0,1e8)});
  }
  if(result.series.length)result.metrics.push(metric("Vazão fluvial simulada",result.series[0].dischargeM3s,"m³/s",result.series[0].date));
 }else if(type==="ensemble"){
  const keys=Object.keys(hourly).filter(k=>/^temperature_2m_member\d{1,3}$/.test(k)&&Array.isArray(hourly[k])).slice(0,100);
  for(let i=0;i<Math.min(5,hourly.time?.length||0);i++){
    const values=keys.map(k=>numeric(hourly[k][i],-100,65)).filter(v=>v!==null).sort((a,b)=>a-b);
    if(values.length<3)continue;
    result.series.push({at:nonempty(hourly.time[i],32),members:values.length,
      minC:values[0],maxC:values.at(-1),medianC:values[Math.floor(values.length/2)]});
  }
  if(result.series.length){const first=result.series[0];result.metrics.push(metric("Temperatura: menor membro",first.minC,"°C",first.at));
    result.metrics.push(metric("Temperatura: maior membro",first.maxC,"°C",first.at));
    result.metrics.push(metric("Membros no cálculo",first.members,"modelos",first.at));}
 }
 return result;
}
function inmetAlerts(raw,now){
 const items=[...(Array.isArray(raw?.hoje)?raw.hoje:[]),...(Array.isArray(raw?.futuro)?raw.futuro:[])];
 return items.slice(0,150).map(x=>{
  const title=nonempty(x.descricao||x.evento||x.tipo),severity=nonempty(x.severidade,50);
  const expiry=isoDate(x.data_fim||x.fim);
  const states=Array.isArray(x.estados)?x.estados:typeof x.estados==="string"?x.estados.split(/[;,|\s]+/):[];
  return {title,severity,issuedAt:isoDate(x.data_inicio||x.inicio),expiresAt:expiry,
    areas:states.filter(s=>/^[A-Z]{2}$/i.test(s)).slice(0,27).map(s=>s.toUpperCase()),
    url:"https://avisos.inmet.gov.br/",source:"INMET",official:true};
 }).filter(x=>x.title&&x.severity&&(!x.expiresAt||Date.parse(x.expiresAt)>=Date.parse(now))).slice(0,12);
}
function nwsAlerts(raw,now){
 return (Array.isArray(raw?.features)?raw.features:[]).slice(0,25).map(feature=>{
  const p=feature?.properties||{};
  return {title:nonempty(p.event||p.headline),severity:nonempty(p.severity,50),
    issuedAt:isoDate(p.sent||p.effective),expiresAt:isoDate(p.expires),
    areas:nonempty(p.areaDesc,150),url:typeof p["@id"]==="string"&&p["@id"].startsWith("https://api.weather.gov/")?p["@id"]:"https://www.weather.gov/alerts",
    source:"US National Weather Service",official:true};
 }).filter(x=>x.title&&(!x.expiresAt||Date.parse(x.expiresAt)>=Date.parse(now))).slice(0,12);
}
export async function loadWeatherInsight(input={}, {fetchImpl=fetch,now=()=>new Date().toISOString()}={}){
 const type=String(input.type||"").trim();
 if(!INSIGHT_TYPES.includes(type))return {ok:false,status:400,error:"Módulo não reconhecido."};
 const year=Number(input.year||new Date(now()).getUTCFullYear()-1),month=Number(input.month||1);
 if(type==="history"&&(!Number.isInteger(year)||year<1940||year>new Date(now()).getUTCFullYear()-1||
   !Number.isInteger(month)||month<1||month>12))return {ok:false,status:400,error:"Use um ano entre 1940 e o ano passado e mês de 1 a 12."};
 const locationInput={city:input.city,id:input.id};
 if(!input.id&&!safeLocationQuery(input.city))return {ok:false,status:400,error:"Informe uma localidade válida."};
 let location;
 try{location=await locate(locationInput,fetchImpl);}
 catch{return {ok:false,status:503,error:"Busca de localidade indisponível."};}
 if(!location)return {ok:false,status:404,error:"Localidade não encontrada; especifique cidade e país."};
 const result={ok:true,type,location,fetchedAt:now(),source:sourceFor(type),
  metrics:[],series:[],bulletins:[],scope:"weather-model"};
 try{
  if(type==="alerts"){
   if(location.countryCode!=="BR"&&location.countryCode!=="US")return {...result,coverage:"not-integrated",scope:"official-source-unavailable",
      source:{name:"Nenhuma fonte de alerta oficial conectada para o país",url:null,disclaimer:"Não foi possível consultar alertas oficiais neste país. Isso NÃO significa ausência de riscos."}};
   const url=location.countryCode==="BR"?"https://apiprevmet3.inmet.gov.br/avisos/ativos":
      "https://api.weather.gov/alerts/active?point="+location.lat+","+location.lng;
   const data=await fetchJson(url,fetchImpl,location.countryCode==="US"?{"User-Agent":"JARVIS-PersonalWeather/1.0 (public weather briefing)"}:{});
   result.source={name:location.countryCode==="BR"?"INMET":"US National Weather Service",
     url:location.countryCode==="BR"?"https://avisos.inmet.gov.br/":"https://www.weather.gov/alerts",
     disclaimer:location.countryCode==="BR"?"Avisos nacionais, NÃO filtrados automaticamente até o município. Consulte a abrangência por UF e o portal oficial.":"Avisos oficiais para o ponto geográfico consultado; confira o comunicado na fonte."};
   result.scope=location.countryCode==="BR"?"official-countrywide":"official-point";
   result.coverage="integrated";
   result.bulletins=location.countryCode==="BR"?inmetAlerts(data,now()):nwsAlerts(data,now());
   return result;
  }
  const spec=MODELS[type],url=new URL(spec.url);
  url.searchParams.set("latitude",String(location.lat));url.searchParams.set("longitude",String(location.lng));
  url.searchParams.set("timezone","auto");
  if(type==="air")url.searchParams.set("current","us_aqi,pm2_5,pm10,ozone");
  if(type==="marine")url.searchParams.set("current","wave_height,sea_surface_temperature,ocean_current_velocity");
  if(type==="flood"){url.searchParams.set("daily","river_discharge,river_discharge_mean");url.searchParams.set("forecast_days","7");}
  if(type==="ensemble"){url.searchParams.set("hourly","temperature_2m");url.searchParams.set("models","gfs_seamless");url.searchParams.set("forecast_days","3");}
  if(type==="history"){
   const mm=String(month).padStart(2,"0");
   url.searchParams.set("start_date",String(year)+"-"+mm+"-01");
   url.searchParams.set("end_date",new Date(Date.UTC(year,month,0)).toISOString().slice(0,10));
   url.searchParams.set("daily","temperature_2m_max,temperature_2m_min,precipitation_sum");
   url.searchParams.set("models","era5");
   result.period={year,month};
  }
  const data=await fetchJson(url.toString(),fetchImpl);
  const parsed=deriveMetrics(type,data,{year,month});
  result.metrics=parsed.metrics;result.series=parsed.series;
  if(!result.metrics.length)return {ok:false,status:404,error:"A fonte não forneceu medidas utilizáveis nessa localidade. Não há estimativa substituta.",source:result.source};
  return result;
 }catch{return {ok:false,status:503,error:"Fonte meteorológica indisponível. Nenhuma medição ou alerta foi inventado.",source:result.source};}
}
