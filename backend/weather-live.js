import {weatherCity,normalizeWeatherPayload} from "../modules/jarvis-weather-model.js";

// The hostname and coordinates are fixed server-side. Never fetch a user URL.
export async function loadLiveWeather(cityInput,{fetchImpl=fetch,now=()=>new Date().toISOString()}={}){
 const city=weatherCity(cityInput);
 if(!city)return {ok:false,status:400,error:"Cidade não disponível. Use uma das capitais brasileiras configuradas."};
 const url=new URL("https://api.open-meteo.com/v1/forecast");
 for(const [key,value] of Object.entries({
  latitude:String(city.lat),longitude:String(city.lng),timezone:"auto",
  forecast_days:"3",
  current:"temperature_2m,relative_humidity_2m,precipitation",
  daily:"temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max"
 }))url.searchParams.set(key,value);
 const controller=new AbortController();
 const timeout=setTimeout(()=>controller.abort(),6500);
 try{
  const response=await fetchImpl(url.toString(),{
   method:"GET",headers:{"Accept":"application/json"},signal:controller.signal
  });
  if(!response?.ok)return {ok:false,status:502,error:"Serviço meteorológico indisponível. Não foi gerada previsão."};
  const data=await response.json();
  const report=normalizeWeatherPayload(data,city.key,{now});
  return report||{ok:false,status:502,error:"Fonte não forneceu dados atuais completos. Nenhuma previsão foi inferida."};
 }catch{
  return {ok:false,status:503,error:"Não foi possível consultar o provedor meteorológico."};
 }finally{clearTimeout(timeout);}
}
