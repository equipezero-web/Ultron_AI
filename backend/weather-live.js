import {weatherCity,normalizeWeatherPayload} from "../modules/jarvis-weather-model.js";

// Fixed Open-Meteo hostname and audited coordinates; never fetch operator-supplied URLs.
// One bounded retry avoids treating a short network outage as a definitive forecast failure.
export async function loadLiveWeather(cityInput,{fetchImpl=fetch,now=()=>new Date().toISOString(),pause=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}){
 const city=weatherCity(cityInput);
 if(!city)return {ok:false,status:400,code:"INVALID_CITY",error:"Cidade não disponível. Use uma das capitais brasileiras configuradas."};
 const url=new URL("https://api.open-meteo.com/v1/forecast");
 for(const [key,value] of Object.entries({
  latitude:String(city.lat),longitude:String(city.lng),timezone:"auto",
  forecast_days:"3",
  current:"temperature_2m,relative_humidity_2m,precipitation",
  daily:"temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max"
 }))url.searchParams.set(key,value);

 for(let attempt=0;attempt<2;attempt++){
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),7500);
  let shouldRetry=false;
  try{
   const response=await fetchImpl(url.toString(),{
    method:"GET",headers:{"Accept":"application/json"},signal:controller.signal
   });
   if(!response?.ok){
    if(response?.status===429)return {ok:false,status:503,code:"WEATHER_PROVIDER_RATE_LIMIT",
     error:"A fonte meteorológica está limitando as consultas. Tente novamente em alguns minutos."};
    shouldRetry=attempt===0&&(!response||response.status>=500);
    if(!shouldRetry)return {ok:false,status:502,code:"WEATHER_PROVIDER_HTTP",
     error:"O provedor meteorológico não forneceu uma resposta utilizável."};
   }else{
    const data=await response.json();
    const report=normalizeWeatherPayload(data,city.key,{now});
    return report||{ok:false,status:502,code:"WEATHER_PROVIDER_INVALID_DATA",
     error:"A fonte meteorológica não forneceu dados válidos ou suficientemente recentes; nenhuma previsão foi inferida."};
   }
  }catch(error){
   shouldRetry=attempt===0;
   if(!shouldRetry)return {ok:false,status:503,
    code:error?.name==="AbortError"?"WEATHER_PROVIDER_TIMEOUT":"WEATHER_PROVIDER_NETWORK",
    error:error?.name==="AbortError"?"A consulta meteorológica ultrapassou o tempo limite.":"Não foi possível consultar o provedor meteorológico."};
  }finally{clearTimeout(timeout);}
  if(shouldRetry)await pause(300);
 }
 return {ok:false,status:503,code:"WEATHER_PROVIDER_UNAVAILABLE",error:"Serviço meteorológico temporariamente indisponível."};
}
