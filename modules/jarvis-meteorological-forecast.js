/**
 * Real Open-Meteo numerical forecast; no synthetic weather values, no account data.
 * Forecasts are predictions and must never be labelled observed rain/radar or alerts.
 */
export const FORECAST_CITIES=Object.freeze([
 {id:"recife",label:"Recife · PE",lat:-8.05,lon:-34.88},
 {id:"brasilia",label:"Brasília · DF",lat:-15.78,lon:-47.93},
 {id:"saopaulo",label:"São Paulo · SP",lat:-23.55,lon:-46.63},
 {id:"manaus",label:"Manaus · AM",lat:-3.12,lon:-60.02},
 {id:"portoalegre",label:"Porto Alegre · RS",lat:-30.03,lon:-51.23},
 {id:"tokyo",label:"Tóquio · Japão",lat:35.68,lon:139.69},
 {id:"london",label:"Londres · Reino Unido",lat:51.51,lon:-0.13},
 {id:"newyork",label:"Nova York · EUA",lat:40.71,lon:-74.01}
]);
const finite=n=>typeof n==="number"&&Number.isFinite(n);
export function normalizeForecast(raw,{city,checkedAt=new Date().toISOString()}={}){
 const d=raw?.daily;
 if(!city||!d||!Array.isArray(d.time)||d.time.length<1||d.time.length>7||
   typeof raw.timezone!=="string"||!/^[A-Za-z_]+\/[A-Za-z_\/+-]+$/.test(raw.timezone))return null;
 const cols=["temperature_2m_max","temperature_2m_min","precipitation_sum","precipitation_probability_max","wind_speed_10m_max"];
 if(!cols.every(k=>Array.isArray(d[k])&&d[k].length===d.time.length))return null;
 const days=d.time.map((date,i)=>({
   date,max:d.temperature_2m_max[i],min:d.temperature_2m_min[i],
   rain:d.precipitation_sum[i],chance:d.precipitation_probability_max[i],
   wind:d.wind_speed_10m_max[i]
 }));
 if(!days.every(x=>/^\d{4}-\d{2}-\d{2}$/.test(x.date)&&
   ["max","min","rain","chance","wind"].every(k=>finite(x[k]))&&
   x.chance>=0&&x.chance<=100&&x.rain>=0&&x.wind>=0))return null;
 return {ok:true,city:city.label,timezone:raw.timezone,checkedAt,days,
  source:"https://open-meteo.com/en/docs",
  note:"Previsão de modelo numérico. Probabilidade de precipitação não garante chuva; acumulado previsto não é chuva observada."};
}
export async function fetchForecast(cityId,{fetchImpl=fetch,signal}={}){
 const city=FORECAST_CITIES.find(x=>x.id===cityId);
 if(!city)return {ok:false,error:"Local não cadastrado na seleção de previsão."};
 const url=new URL("https://api.open-meteo.com/v1/forecast");
 const query={latitude:city.lat,longitude:city.lon,timezone:"auto",forecast_days:7,
  daily:"temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max"};
 for(const [k,v] of Object.entries(query))url.searchParams.set(k,String(v));
 try{
  const response=await fetchImpl(url.toString(),{signal,headers:{Accept:"application/json"},cache:"no-store"});
  if(!response.ok)throw Error("HTTP "+response.status);
  const payload=await response.json();
  return normalizeForecast(payload,{city})||{ok:false,error:"A fonte retornou previsão incompleta ou inválida."};
 }catch(error){return {ok:false,error:"Previsão indisponível: "+String(error?.message||error).slice(0,110)};}
}
