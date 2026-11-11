// Source-specific worldwide environmental products for personal J.A.R.V.I.S. use.
// Provider endpoints are immutable and coordinates ALWAYS originate from geocoding.
import {searchGlobalLocations} from "./weather-global.js";

export const INTELLIGENCE_PRODUCTS=Object.freeze({
 history:{host:"archive-api.open-meteo.com",path:"/v1/archive",
   fields:"temperature_2m_max,temperature_2m_min,precipitation_sum",source:"ERA5 / Open-Meteo",period:"historical reanalysis"},
 air:{host:"air-quality-api.open-meteo.com",path:"/v1/air-quality",
   fields:"us_aqi,pm2_5,pm10,ozone",source:"CAMS / Open-Meteo",period:"modeled current air quality"},
 marine:{host:"marine-api.open-meteo.com",path:"/v1/marine",
   fields:"wave_height,sea_surface_temperature,ocean_current_velocity",source:"Marine models / Open-Meteo",period:"modeled ocean"},
 flood:{host:"flood-api.open-meteo.com",path:"/v1/flood",
   fields:"river_discharge,river_discharge_max",source:"GloFAS / Open-Meteo",period:"modeled river discharge"},
 ensemble:{host:"ensemble-api.open-meteo.com",path:"/v1/ensemble",
   fields:"temperature_2m",source:"GFS ensemble / Open-Meteo",period:"ensemble spread"}
});
const fail=(status,error)=>({ok:false,status,error});
const metric=(value,minimum=-150,maximum=100000)=>{
 if(typeof value!=="number"||!Number.isFinite(value)||value<minimum||value>maximum)return null;
 return Number(value.toFixed(2));
};
const validDate=value=>typeof value==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&
 Number.isFinite(Date.parse(value+"T00:00:00Z"));
const last7=now=>{
 const d=new Date(now);d.setUTCDate(d.getUTCDate()-8);return d.toISOString().slice(0,10);
};
const maybeMetric=(v,lo,hi)=>v==null?null:metric(v,lo,hi);
export function normalizeEnvironmentalProduct(product,source,location,{now=()=>new Date().toISOString()}={}){
 if(!Object.hasOwn(INTELLIGENCE_PRODUCTS,product)||!source||typeof source!=="object"||
   !location?.key?.startsWith("global-"))return null;
 const spec=INTELLIGENCE_PRODUCTS[product],fetchedAt=now();
 if(!Number.isFinite(Date.parse(fetchedAt)))return null;
 let points=[];
 const put=(time,fields)=>{
  if(typeof time!=="string"||!time||!fields||!Object.values(fields).some(v=>v!==null))return;
  points.push({time,metrics:fields});
 };
 const current=source.current||{},daily=source.daily||{},hourly=source.hourly||{};
 if(product==="air"){
  put(current.time,{usAqi:maybeMetric(current.us_aqi,0,600),pm25:maybeMetric(current.pm2_5,0,5000),
    pm10:maybeMetric(current.pm10,0,5000),ozone:maybeMetric(current.ozone,0,5000)});
 }else if(product==="marine"){
  put(current.time,{waveHeightM:maybeMetric(current.wave_height,0,40),
    seaTempC:maybeMetric(current.sea_surface_temperature,-5,50),
    currentKmh:maybeMetric(current.ocean_current_velocity,0,120)});
 }else if(product==="history"||product==="flood"){
  if(!Array.isArray(daily.time))return null;
  const fields=product==="history"?
   [["minC","temperature_2m_min",-100,65],["maxC","temperature_2m_max",-100,65],["rainMm","precipitation_sum",0,2000]]:
   [["dischargeM3s","river_discharge",0,2000000],["maxDischargeM3s","river_discharge_max",0,2000000]];
  for(let i=0;i<Math.min(daily.time.length,31);i++){
   if(!validDate(daily.time[i]))continue;
   const values={};for(const [key,sourceKey,min,max] of fields)
     values[key]=maybeMetric(daily[sourceKey]?.[i],min,max);
   put(daily.time[i],values);
  }
 }else if(product==="ensemble"){
  if(!Array.isArray(hourly.time))return null;
  const members=Object.entries(hourly).filter(([key,val])=>
    /^temperature_2m_member\d+$/.test(key)&&Array.isArray(val)).slice(0,60);
  if(members.length<3)return null;
  for(let i=0;i<Math.min(12,hourly.time.length);i++){
   const vals=members.map(([,arr])=>maybeMetric(arr[i],-100,65)).filter(v=>v!==null);
   if(vals.length<3)continue;
   put(hourly.time[i],{memberCount:vals.length,minC:Math.min(...vals),maxC:Math.max(...vals),
     meanC:Number((vals.reduce((a,b)=>a+b,0)/vals.length).toFixed(2))});
  }
 }
 if(!points.length)return null;
 return {ok:true,product,kind:"modeled-environmental-data",location,source:{
   name:spec.source,url:product==="history"?"https://open-meteo.com/en/docs/historical-weather-api":
   product==="air"?"https://open-meteo.com/en/docs/air-quality-api":
   product==="marine"?"https://open-meteo.com/en/docs/marine-weather-api":
   product==="flood"?"https://open-meteo.com/en/docs/flood-api":"https://open-meteo.com/en/docs/ensemble-api"},
  fetchedAt,points,period:spec.period,
  disclaimer:product==="flood"?"Vazão de modelo GloFAS; NÃO é alerta oficial de enchente, cota local ou diagnóstico de risco.":
   product==="marine"?"Modelo marinho NÃO recomendado para navegação, segurança de embarcação ou decisões costeiras.":
   product==="air"?"Estimativa de poluição do modelo CAMS, não medição por sensor local.":
   product==="ensemble"?"Faixa entre membros de modelo, não probabilidades de desastre ou certezas.":
   "Reanálise meteorológica, não leitura de termômetro local ou previsão atual."};
}
const shared={method:"GET",headers:{Accept:"application/json"}};
async function request(url,fetchImpl){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),7500);
 try{
  const r=await fetchImpl(url,{...shared,signal:controller.signal});
  if(!r?.ok)throw Error("upstream unavailable");
  const data=await r.json();
  if(!data||typeof data!=="object"||data.error===true)throw Error("invalid response");
  return data;
 }finally{clearTimeout(timer);}
}
export async function loadEnvironmentalProduct({city,product,now=()=>new Date().toISOString()}={}, {fetchImpl=fetch}={}){
 if(!Object.hasOwn(INTELLIGENCE_PRODUCTS,product))return fail(400,"Produto ambiental inválido.");
 const found=await searchGlobalLocations(city,{fetchImpl});
 if(!found.ok)return found;
 const location=found.locations[0];
 if(!location)return fail(404,"Cidade não encontrada.");
 const spec=INTELLIGENCE_PRODUCTS[product],u=new URL("https://"+spec.host+spec.path);
 u.searchParams.set("latitude",String(location.lat));u.searchParams.set("longitude",String(location.lng));
 if(product==="history"){
  u.searchParams.set("start_date",last7(now()));u.searchParams.set("end_date",last7(now()));
  u.searchParams.set("daily",spec.fields);u.searchParams.set("timezone","auto");
 }else if(product==="air"||product==="marine"){
  u.searchParams.set("current",spec.fields);u.searchParams.set("timezone","auto");
 }else if(product==="flood"){
  u.searchParams.set("daily",spec.fields);u.searchParams.set("forecast_days","7");u.searchParams.set("timezone","GMT");
 }else{
  u.searchParams.set("hourly",spec.fields);u.searchParams.set("models","gfs_seamless");
  u.searchParams.set("forecast_days","3");u.searchParams.set("timezone","auto");
 }
 try{
  const result=normalizeEnvironmentalProduct(product,await request(u.toString(),fetchImpl),location,{now});
  return result||fail(502,"Fonte não trouxe dados suficientes; nenhuma medição foi inventada.");
 }catch{return fail(503,"Não foi possível consultar esta fonte meteorológica.");}
}
export function environmentalScenario(data){
 if(!data?.ok||!data.location?.key?.startsWith("global-")||!Array.isArray(data.points)||!data.points.length)return null;
 const loc=data.location,clean=(v)=>String(v).replace(/[<>\r\n]/g," ").slice(0,290);
 const details=p=>Object.entries(p.metrics).filter(([,v])=>v!==null).map(([k,v])=>k+": "+v).join(" · ");
 const mapPoint=(i,p)=>({id:data.product+"-"+i,name:loc.label,lat:loc.lat,lng:loc.lng,kind:"weather",
  detail:clean(details(p)),source:data.source.url});
 return {id:"environment-"+data.product+"-"+loc.key,title:data.product.toUpperCase()+" — "+loc.name,projection:"world",
  source:{name:data.source.name,url:data.source.url,basePeriod:data.period,
   disclaimer:data.disclaimer},
  frames:data.points.slice(0,17).map((p,i)=>({id:"sample-"+i,name:p.time,type:data.period,
   kind:"short-term-forecast",description:clean(details(p))+" — "+data.disclaimer,
   points:[mapPoint(i,p)]}))};
}
