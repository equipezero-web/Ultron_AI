// Phase 4: a small, audited list of Brazilian cities keeps geo routing deterministic.
// Weather is a short-term numeric model; it MUST NOT be presented as an ENSO outlook.
export const WEATHER_CITIES = Object.freeze({
 recife:{key:"recife",name:"Recife",lat:-8.0476,lng:-34.8770},
 "sao-paulo":{key:"sao-paulo",name:"São Paulo",lat:-23.5505,lng:-46.6333},
 "rio-de-janeiro":{key:"rio-de-janeiro",name:"Rio de Janeiro",lat:-22.9068,lng:-43.1729},
 brasilia:{key:"brasilia",name:"Brasília",lat:-15.7939,lng:-47.8828},
 florianopolis:{key:"florianopolis",name:"Florianópolis",lat:-27.5949,lng:-48.5482},
 "porto-alegre":{key:"porto-alegre",name:"Porto Alegre",lat:-30.0346,lng:-51.2177},
 manaus:{key:"manaus",name:"Manaus",lat:-3.1190,lng:-60.0217},
 belem:{key:"belem",name:"Belém",lat:-1.4558,lng:-48.5039},
 salvador:{key:"salvador",name:"Salvador",lat:-12.9777,lng:-38.5016},
 fortaleza:{key:"fortaleza",name:"Fortaleza",lat:-3.7319,lng:-38.5267},
 curitiba:{key:"curitiba",name:"Curitiba",lat:-25.4284,lng:-49.2733}
});
const norm=value=>String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"")
 .toLowerCase().trim().replace(/[_-]+/g," ").replace(/\s+/g," ");
const byName=Object.values(WEATHER_CITIES);
export const weatherCity=value=>byName.find(city=>norm(city.key)===norm(value)||norm(city.name)===norm(value))||null;
export const WEATHER_SOURCE=Object.freeze({
 name:"Open-Meteo — modelos meteorológicos",
 url:"https://open-meteo.com/en/docs",
 disclaimer:"Estimativas numéricas atuais e previsão de até 3 dias, não observação de estação, alerta INMET, simulação física do El Niño ou previsão de impacto local. Verifique avisos oficiais em avisos.inmet.gov.br."
});
const finite=(v,min,max)=>typeof v==="number"&&Number.isFinite(v)&&v>=min&&v<=max?v:null;
const dayString=v=>typeof v==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(v)?v:null;
export function normalizeWeatherPayload(payload,cityInput,{now=()=>new Date().toISOString()}={}){
 const city=weatherCity(cityInput);
 if(!city||!payload||typeof payload!=="object")return null;
 const daily=payload.daily||{},current=payload.current||{};
 if(!Array.isArray(daily.time)||daily.time.length<1||daily.time.length>16)return null;
 const keys=["temperature_2m_min","temperature_2m_max","precipitation_sum","precipitation_probability_max"];
 if(keys.some(key=>!Array.isArray(daily[key])||daily[key].length<daily.time.length))return null;
 const days=[];
 for(let i=0;i<Math.min(daily.time.length,3);i++){
  const date=dayString(daily.time[i]),low=finite(daily.temperature_2m_min[i],-100,65),
   high=finite(daily.temperature_2m_max[i],-100,65),
   rain=finite(daily.precipitation_sum[i],0,2000),
   chance=finite(daily.precipitation_probability_max[i],0,100);
  if(!date||low===null||high===null||high<low||rain===null||chance===null)return null;
  if(i&&date<=days[i-1].date)return null;
  days.push({date,minC:low,maxC:high,rainMm:rain,rainChancePercent:chance});
 }
 const t=finite(current.temperature_2m,-100,65);
 const humidity=finite(current.relative_humidity_2m,0,100);
 const currentRain=finite(current.precipitation,0,2000);
 const time=typeof current.time==="string"&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(current.time)?current.time:null;
 if(t===null||humidity===null||currentRain===null||!time)return null;
 const fetchedAt=now();
 if(typeof fetchedAt!=="string"||!Number.isFinite(Date.parse(fetchedAt)))return null;
 // Provider timestamps are local to the returned city. Allow timezone offsets
 // but reject historical / badly cached "current" data rather than calling it live.
 if(days[0]?.date!==time.slice(0,10))return null;
 if(Math.abs(Date.parse(time.slice(0,16)+":00Z")-Date.parse(fetchedAt))>36*3600*1000)return null;
 return {
  ok:true,city:{...city},fetchedAt,current:{time,temperatureC:t,humidityPercent:humidity,precipitationMm:currentRain},
  days,source:{...WEATHER_SOURCE},kind:"short-term-numeric-forecast",isOfficialAlert:false
 };
}
const num=v=>Number(v).toLocaleString("pt-BR",{maximumFractionDigits:1});
export function weatherSummary(report){
 if(!report?.ok||!weatherCity(report.city?.key)||!report.days?.length)return null;
 const day=report.days[0],city=weatherCity(report.city.key);
 return `Tempo modelado para ${city.name}: ${num(report.current.temperatureC)} °C, umidade ${num(report.current.humidityPercent)}%. Previsão para ${day.date}: mínima ${num(day.minC)} °C, máxima ${num(day.maxC)} °C; chuva ${num(day.rainMm)} mm, probabilidade máxima ${num(day.rainChancePercent)}%. Fonte: Open-Meteo. Atualizado: ${report.fetchedAt}. Não é alerta oficial nem previsão do El Niño.`;
}
export function weatherGeoScenario(report){
 if(!report?.ok||!weatherCity(report.city?.key)||!Array.isArray(report.days)||!report.days.length||!weatherSummary(report))return null;
 const city=weatherCity(report.city.key);
 const point=(id,detail)=>({id,name:city.name,lat:city.lat,lng:city.lng,kind:"weather",detail,source:WEATHER_SOURCE.url});
 return {
  id:"weather-"+city.key,title:"Tempo previsto — "+city.name,
  source:{...WEATHER_SOURCE,basePeriod:"Consulta "+report.fetchedAt+" | previsão curta de 3 dias"},
  frames:[
   {id:"estimate",name:"Estimativa atual",type:"modelo meteorológico, não estação de medição",kind:"current-estimate",
    description:"Condições estimadas pelo modelo para "+city.name+" em "+report.current.time+". Não são medições locais confirmadas.",
    points:[point("weather-current",`Temperatura estimada: ${num(report.current.temperatureC)} °C; umidade: ${num(report.current.humidityPercent)}%; precipitação atual estimada: ${num(report.current.precipitationMm)} mm.`)]},
   ...report.days.map((d,i)=>({id:"day-"+i,name:d.date,type:"previsão numérica de curto prazo",kind:"short-term-forecast",
    description:"Previsão de curto prazo para "+city.name+" em "+d.date+": de "+num(d.minC)+" °C a "+num(d.maxC)+" °C; precipitação acumulada "+num(d.rainMm)+" mm e probabilidade máxima de precipitação "+num(d.rainChancePercent)+"%. Não é alerta oficial.",
    points:[point("weather-day-"+i,`Mínima ${num(d.minC)} °C; máxima ${num(d.maxC)} °C; chuva prevista ${num(d.rainMm)} mm; probabilidade máxima de precipitação ${num(d.rainChancePercent)}%.`)]}))
  ]
 };
}
