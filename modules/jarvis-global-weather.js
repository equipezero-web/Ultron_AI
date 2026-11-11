// Globally geocoded, source-attributed short-term numerical meteorology.
// Forecasts are NOT real-time sensors, alerts or El Niño simulations.
import {WEATHER_SOURCE} from "./jarvis-weather-model.js";
const number=(v,min,max)=>typeof v==="number"&&Number.isFinite(v)&&v>=min&&v<=max?v:null;
const clean=(v,n=100)=>String(v??"").replace(/[\r\n<>]/g," ").replace(/\s+/g," ").trim().slice(0,n);
export function safeLocationQuery(value){
 if(typeof value!=="string")return null;
 const text=value.normalize("NFC").trim().replace(/\s+/g," ");
 return text.length>=2&&text.length<=96&&/^[\p{L}\p{M}\p{N} .,'’()-]+$/u.test(text)&&
   !/^(?:https?|ftp|javascript|data)\b/i.test(text)?text:null;
}
export function normalizeGlobalLocation(item){
 const id=Number(item?.id),lat=number(item?.latitude,-90,90),lng=number(item?.longitude,-180,180);
 const name=clean(item?.name,90),country=clean(item?.country,80),
  code=clean(item?.country_code,2).toUpperCase(),region=clean(item?.admin1,80);
 if(!Number.isSafeInteger(id)||id<1||lat===null||lng===null||!name||!country||!/^[A-Z]{2}$/.test(code))return null;
 return {id,key:"global-"+id,name,country,countryCode:code,region,lat,lng,
  timezone:clean(item?.timezone||"auto",70),label:[name,region,country].filter(Boolean).join(", ")};
}
export const GLOBAL_FORECAST_DAYS=[3,7,16];
export const globalDays=value=>[3,7,16].includes(Number(value))?Number(value):null;
const attributes=[
 ["temperature_2m_min","minC",-100,65],
 ["temperature_2m_max","maxC",-100,65],
 ["precipitation_sum","rainMm",0,2000],
 ["precipitation_probability_max","rainChancePercent",0,100]
];
export function normalizeGlobalForecast(payload,location,{days=7,now=()=>new Date().toISOString()}={}){
 if(!location||!location.key?.startsWith("global-")||!globalDays(days)||!payload||typeof payload!=="object")return null;
 const current=payload.current||{},daily=payload.daily||{},offset=number(payload.utc_offset_seconds,-50400,50400);
 if(offset===null||!Array.isArray(daily.time)||daily.time.length<days)return null;
 for(const [field] of attributes)if(!Array.isArray(daily[field])||daily[field].length<days)return null;
 if(typeof current.time!=="string"||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(current.time))return null;
 const stamp=Date.parse(current.time+"Z")-offset*1000,nowValue=Date.parse(now());
 if(!Number.isFinite(stamp)||!Number.isFinite(nowValue)||Math.abs(stamp-nowValue)>14*3600000)return null;
 const temp=number(current.temperature_2m,-100,65),hum=number(current.relative_humidity_2m,0,100),
  rain=number(current.precipitation,0,2000),wind=number(current.wind_speed_10m,0,500);
 if([temp,hum,rain,wind].some(n=>n===null))return null;
 const daysOut=[];
 for(let i=0;i<days;i++){
  const date=daily.time[i];
  if(typeof date!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(date)||(i&&date<=daysOut[i-1].date))return null;
  const day={date};
  let incomplete=false;
  for(const [field,key,min,max] of attributes){
   const n=number(daily[field][i],min,max);
   if(n===null){incomplete=true;break;}
   day[key]=n;
  }
  // A model update can return a partially populated FINAL forecast day.
  // Never create numbers from null; keep valid previous days and label the shortfall.
  if(incomplete){
   if(i===days-1&&daysOut.length>=2)break;
   return null;
  }
  if(day.minC>day.maxC)return null;
  daysOut.push(day);
 }
 if(daysOut[0].date!==current.time.slice(0,10))return null;
 return {ok:true,kind:"global-short-term-forecast",location:{...location},fetchedAt:now(),
  current:{time:current.time,temperatureC:temp,humidityPercent:hum,precipitationMm:rain,windKmh:wind},
  days:daysOut,requestedDays:days,partialForecast:daysOut.length<days,
  source:{...WEATHER_SOURCE,name:"Open-Meteo.com (CC BY 4.0); localidades GeoNames",
   disclaimer:"Estimativa numérica, não medição instantânea nem alerta oficial. Até 16 dias de previsão; a incerteza aumenta com o horizonte. Consulte o serviço oficial de alertas do país."},
  isOfficialAlert:false};
}
const fmt=n=>Number(n).toLocaleString("pt-BR",{maximumFractionDigits:1});
export function globalWeatherSummary(r){
 if(!r?.ok||r.kind!=="global-short-term-forecast"||!r.location?.label||!r.days?.length)return null;
 const d=r.days[0];
 return "Previsão para "+r.location.label+": temperatura modelada "+fmt(r.current.temperatureC)+
  " °C, umidade "+fmt(r.current.humidityPercent)+"%, vento "+fmt(r.current.windKmh)+
  " km/h. "+(r.partialForecast?r.days.length+" de "+r.requestedDays+" dias com dados completos disponíveis":r.days.length+" dias de previsão")+
  ". Hoje ("+d.date+"): "+fmt(d.minC)+" a "+
  fmt(d.maxC)+" °C; chuva "+fmt(d.rainMm)+" mm, chance máxima "+fmt(d.rainChancePercent)+
  "%. Fonte Open-Meteo/GeoNames; consulta "+r.fetchedAt+". Não é alerta oficial.";
}
export function globalWeatherScenario(r){
 if(!globalWeatherSummary(r)||!r.location.key.startsWith("global-"))return null;
 const loc=r.location,point=(id,detail)=>({id,name:loc.label,lat:loc.lat,lng:loc.lng,kind:"weather",detail,source:WEATHER_SOURCE.url});
 return {id:"weather-"+loc.key,title:"Meteorologia mundial — "+loc.name,projection:"world",
  source:{...r.source,basePeriod:"Consulta "+r.fetchedAt+"; "+r.days.length+" de "+(r.requestedDays||r.days.length)+" dias completos"},
  frames:[
   {id:"current",name:"Estimativa atual",type:"modelo meteorológico, não estação local",kind:"current-estimate",
    metrics:{temperatureC:r.current.temperatureC,humidityPercent:r.current.humidityPercent,
     precipitationMm:r.current.precipitationMm,windKmh:r.current.windKmh},
    description:"Estimativa do modelo para "+loc.label+" em "+r.current.time+": "+fmt(r.current.temperatureC)+" °C, umidade "+
     fmt(r.current.humidityPercent)+"%, vento "+fmt(r.current.windKmh)+" km/h. Não é medição instantânea.",
    points:[point("current","Temperatura "+fmt(r.current.temperatureC)+" °C; umidade "+fmt(r.current.humidityPercent)+
     "%; vento "+fmt(r.current.windKmh)+" km/h; precipitação "+fmt(r.current.precipitationMm)+" mm.")]},
   ...r.days.map((d,i)=>({id:"day-"+i,name:d.date,type:"previsão numérica diária",kind:"short-term-forecast",
    metrics:{minC:d.minC,maxC:d.maxC,rainMm:d.rainMm,rainChancePercent:d.rainChancePercent},
    description:loc.label+" — "+d.date+": "+fmt(d.minC)+" a "+fmt(d.maxC)+" °C; chuva "+fmt(d.rainMm)+
     " mm, chance máxima "+fmt(d.rainChancePercent)+"%. Incerteza crescente, não alerta oficial.",
    points:[point("day-"+i,"Mínima "+fmt(d.minC)+" °C, máxima "+fmt(d.maxC)+" °C; chuva "+
     fmt(d.rainMm)+" mm; chance máxima "+fmt(d.rainChancePercent)+"%.")]}))
  ]};
}
