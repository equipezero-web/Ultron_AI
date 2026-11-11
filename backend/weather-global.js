import {safeLocationQuery,normalizeGlobalLocation,globalDays,normalizeGlobalForecast} from "../modules/jarvis-global-weather.js";

// Fixed provider origins: user-supplied strings never become URLs, coordinates or hosts.
const SEARCH_URL="https://geocoding-api.open-meteo.com/v1/search";
const LOOKUP_URL="https://geocoding-api.open-meteo.com/v1/get";
const FORECAST_URL="https://api.open-meteo.com/v1/forecast";
const failed=(status,error)=>({ok:false,status,error});
const aliases={
 "toquio":"Tokyo","londres":"London","nova iorque":"New York",
 "pequim":"Beijing","moscou":"Moscow","roma":"Rome","munique":"Munich"
};
const canonical=query=>aliases[query.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase()]||query;
async function requestJSON(url,fetchImpl){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),7000);
 try{
  const response=await fetchImpl(url,{method:"GET",headers:{Accept:"application/json"},signal:controller.signal});
  if(!response?.ok)throw Error("upstream "+(response?.status||"offline"));
  const obj=await response.json();
  if(!obj||typeof obj!=="object"||obj.error===true)throw Error("upstream invalid");
  return obj;
 }finally{clearTimeout(timer);}
}
export async function searchGlobalLocations(value,{fetchImpl=fetch}={}){
 const query=safeLocationQuery(value);
 if(!query)return failed(400,"Informe cidade ou localidade (2 a 96 caracteres).");
 const u=new URL(SEARCH_URL);
 u.searchParams.set("name",canonical(query));u.searchParams.set("count","8");u.searchParams.set("language","pt");
 try{
  const body=await requestJSON(u.toString(),fetchImpl);
  const locations=Array.isArray(body.results)?body.results.map(normalizeGlobalLocation).filter(Boolean).slice(0,8):[];
  return {ok:true,query,locations,source:"GeoNames via Open-Meteo",sourceUrl:"https://open-meteo.com/en/docs/geocoding-api"};
 }catch{return failed(503,"Não foi possível consultar a busca mundial de cidades.");}
}
export async function loadGlobalWeather({query=null,id=null,days=7}={},{fetchImpl=fetch,now=()=>new Date().toISOString()}={}){
 const duration=globalDays(days);
 if(!duration)return failed(400,"Horizonte permitido: 3, 7 ou 16 dias.");
 let location=null;
 if(id!==null&&id!==undefined&&id!==""){
  const num=Number(id);
  if(!Number.isSafeInteger(num)||num<1)return failed(400,"Identificador de cidade inválido.");
  const url=new URL(LOOKUP_URL);url.searchParams.set("id",String(num));
  try{location=normalizeGlobalLocation(await requestJSON(url.toString(),fetchImpl));}
  catch{return failed(503,"Não foi possível confirmar a localidade selecionada.");}
 }else{
  const result=await searchGlobalLocations(query,{fetchImpl});
  if(!result.ok)return result;
  location=result.locations[0]||null;
 }
 if(!location)return failed(404,"Localidade não encontrada. Informe também o país para evitar nomes ambíguos.");
 const u=new URL(FORECAST_URL);
 for(const [key,value] of Object.entries({
   latitude:String(location.lat),longitude:String(location.lng),timezone:"auto",
   forecast_days:String(duration),
   current:"temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m",
   daily:"temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max"
 }))u.searchParams.set(key,value);
 try{
  const raw=await requestJSON(u.toString(),fetchImpl);
  const report=normalizeGlobalForecast(raw,location,{days:duration,now});
  return report||failed(502,"O modelo não devolveu previsão válida e atual para esta localidade.");
 }catch{return failed(503,"Serviço de previsão mundial indisponível.");}
}
