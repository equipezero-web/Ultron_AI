// JARVIS autonomous *sampling* of six named world regions, not global sensor surveillance.
// Runs from Cloudflare Cron while the browser is closed, with a strict free-tier request budget.
const REGIONS=Object.freeze([
 {key:"recife",name:"Recife",country:"BR",lat:-8.0476,lng:-34.8770},
 {key:"florianopolis",name:"Florianópolis",country:"BR",lat:-27.5949,lng:-48.5482},
 {key:"miami",name:"Miami",country:"US",lat:25.7617,lng:-80.1918},
 {key:"london",name:"Londres",country:"GB",lat:51.5074,lng:-0.1278},
 {key:"tokyo",name:"Tóquio",country:"JP",lat:35.6895,lng:139.6917},
 {key:"sydney",name:"Sydney",country:"AU",lat:-33.8688,lng:151.2093}
]);
const sql=[
 "CREATE TABLE IF NOT EXISTS jarvis_weather_monitor (region TEXT NOT NULL, bucket TEXT NOT NULL, data_json TEXT NOT NULL, checked_at TEXT NOT NULL, PRIMARY KEY(region,bucket))",
 "CREATE INDEX IF NOT EXISTS idx_jarvis_weather_monitor_newest ON jarvis_weather_monitor(checked_at DESC)"
];
export const MONITOR_REGIONS=REGIONS.map(x=>({...x}));
let schemaReady=false;
async function ensure(db){
 if(!db?.prepare)return false;
 if(!schemaReady){for(const q of sql)await db.prepare(q).run();schemaReady=true;}
 return true;
}
const num=(v,min,max)=>typeof v==="number"&&Number.isFinite(v)&&v>=min&&v<=max?v:null;
async function collect(region,fetchImpl){
 const url=new URL("https://api.open-meteo.com/v1/forecast");
 for(const [k,v] of Object.entries({latitude:region.lat,longitude:region.lng,timezone:"auto",
  forecast_days:1,current:"temperature_2m,relative_humidity_2m,wind_speed_10m",
  daily:"precipitation_sum,precipitation_probability_max"}))url.searchParams.set(k,String(v));
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),6500);
 try{
  const response=await fetchImpl(url.toString(),{method:"GET",headers:{"Accept":"application/json"},signal:controller.signal});
  if(!response?.ok)return null;
  const raw=await response.json();
  const temp=num(raw.current?.temperature_2m,-100,65),rain=num(raw.daily?.precipitation_sum?.[0],0,2000),
   chance=num(raw.daily?.precipitation_probability_max?.[0],0,100),
   wind=num(raw.current?.wind_speed_10m,0,500),humid=num(raw.current?.relative_humidity_2m,0,100);
  if([temp,rain,chance,wind,humid].some(x=>x===null))return null;
  return {region:region.key,name:region.name,country:region.country,
   coords:{lat:region.lat,lng:region.lng},
   temperatureC:temp,rainMm:rain,rainChancePercent:chance,windKmh:wind,humidityPercent:humid,
   modelTime:raw.current?.time||null,source:"Open-Meteo.com",sourceUrl:"https://open-meteo.com/en/docs",
   disclaimer:"Amostra de previsão numérica atualizada periodicamente, não alerta oficial nem observação contínua."};
 }catch{return null;}finally{clearTimeout(timeout);}
}
const bucketFor=date=>date.toISOString().slice(0,10)+"T"+String(Math.floor(date.getUTCHours()/3)*3).padStart(2,"0")+":00Z";
export async function pollWeatherMonitor(env,{now=()=>new Date(),fetchImpl=fetch,force=false}={}){
 const date=now(),hour=date.getUTCHours();
 if(!(date instanceof Date)||!Number.isFinite(date.getTime()))return {ok:false,error:"Relógio inválido"};
 // Scheduled cron fires every minute. Only sample once at each 3-hour boundary;
 // no hidden automatic action can access devices or send messages.
 if(!force&&(hour%3!==0||date.getUTCMinutes()>4))return {ok:true,skipped:true,reason:"outside-3h-window"};
 const db=env?.ULTRON_DB;
 try{if(!await ensure(db))return {ok:false,error:"Banco D1 indisponível"};}
 catch{return {ok:false,error:"Falha ao preparar armazenamento D1"};}
 const bucket=bucketFor(date);
 try{
  const exists=await db.prepare("SELECT region FROM jarvis_weather_monitor WHERE bucket = ? LIMIT 1").bind(bucket).first();
  if(exists)return {ok:true,skipped:true,reason:"bucket-already-collected",bucket};
 }catch{return {ok:false,error:"Não foi possível consultar deduplicação D1"};}
 // Two concurrent requests per wave; at most six calls per 3-hour bucket (<50/day).
 const stored=[];
 for(let offset=0;offset<REGIONS.length;offset+=2){
  const results=await Promise.all(REGIONS.slice(offset,offset+2).map(async region=>{
   const sample=await collect(region,fetchImpl);
   if(!sample)return null;
   try{
    await db.prepare("INSERT OR IGNORE INTO jarvis_weather_monitor (region,bucket,data_json,checked_at) VALUES (?,?,?,?)")
     .bind(region.key,bucket,JSON.stringify(sample),date.toISOString()).run();
    return region.key;
   }catch{return null;}
  }));
  stored.push(...results.filter(Boolean));
 }
 try{
  const minDate=new Date(date.getTime()-7*86400000).toISOString();
  await db.prepare("DELETE FROM jarvis_weather_monitor WHERE checked_at < ?").bind(minDate).run();
 }catch{}
 return {ok:stored.length>0,bucket,sampled:stored.length,regions:stored,source:"Open-Meteo",everyHours:3};
}
export async function latestWeatherMonitor(env){
 const db=env?.ULTRON_DB;
 try{
  if(!await ensure(db))return {ok:false,status:503,error:"Armazenamento não disponível"};
  const rows=await db.prepare("SELECT region,bucket,data_json,checked_at FROM jarvis_weather_monitor ORDER BY checked_at DESC LIMIT 48").all();
  const latest=new Map();
  for(const row of rows.results||[]){
   if(latest.has(row.region))continue;
   try{
    const data=JSON.parse(row.data_json);
    if(data.region===row.region&&typeof data.temperatureC==="number")latest.set(row.region,{...data,checkedAt:row.checked_at});
   }catch{}
  }
  return {ok:true,checkedAt:[...latest.values()].map(x=>x.checkedAt).sort().at(-1)||null,
    regions:[...latest.values()],tracked:REGIONS.map(x=>({key:x.key,name:x.name,country:x.country})),
    cadenceHours:3,source:"Open-Meteo",disclaimer:"Amostras de seis localidades em intervalos de três horas. Não representa monitoramento integral do planeta, nem alertas meteorológicos oficiais."};
 }catch{return {ok:false,status:503,error:"Monitoramento ainda não disponível no D1"};}
}
