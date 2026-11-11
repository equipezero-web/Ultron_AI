// Opt-in private watchlist: Cloudflare Cron every three hours, D1 snapshots, fixed request budget.
// No notifications to devices, no fabricated "disaster" scores.
const statements=[
 "CREATE TABLE IF NOT EXISTS jarvis_weather_watches (operator_id TEXT NOT NULL,location_id INTEGER NOT NULL,name TEXT NOT NULL,country TEXT NOT NULL,latitude REAL NOT NULL,longitude REAL NOT NULL,last_checked_at TEXT,created_at TEXT NOT NULL,PRIMARY KEY(operator_id,location_id))",
 "CREATE INDEX IF NOT EXISTS idx_weather_watches_due ON jarvis_weather_watches(last_checked_at)",
 "CREATE TABLE IF NOT EXISTS jarvis_weather_watch_samples (operator_id TEXT NOT NULL,location_id INTEGER NOT NULL,bucket TEXT NOT NULL,fetched_at TEXT NOT NULL,summary_json TEXT NOT NULL,PRIMARY KEY(operator_id,location_id,bucket))",
 "CREATE INDEX IF NOT EXISTS idx_weather_samples_recent ON jarvis_weather_watch_samples(operator_id,fetched_at DESC)"
];
const LIMIT_PER_USER=6,LIMIT_PER_BUCKET=24;
let ready=false;
const error=(status,reason)=>({ok:false,status,error:reason});
const validUser=u=>typeof u==="string"&&/^[0-9a-f]{64}$/.test(u);
const validId=value=>(typeof value==="string"||typeof value==="number")&&String(value).trim()&&
 Number.isSafeInteger(Number(value))&&Number(value)>0?Number(value):null;
const numeric=(v,a,b)=>typeof v==="number"&&Number.isFinite(v)&&v>=a&&v<=b?v:null;
async function setup(db){
 if(!db?.prepare)return false;
 if(!ready){for(const q of statements)await db.prepare(q).run();ready=true;}
 return true;
}
async function readProvider(u,fetchImpl){
 const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),6800);
 try{
  const r=await fetchImpl(u,{method:"GET",headers:{"Accept":"application/json"},signal:ctl.signal});
  if(!r?.ok)throw Error("Upstream indisponível");
  const value=await r.json();
  if(!value||value.error===true)throw Error("JSON inválido");
  return value;
 }finally{clearTimeout(timer);}
}
export function validateWatchSample(raw){
 const c=raw?.current||{},d=raw?.daily||{};
 const values={
  temperatureC:numeric(c.temperature_2m,-100,65),
  humidityPercent:numeric(c.relative_humidity_2m,0,100),
  windKmh:numeric(c.wind_speed_10m,0,500),
  rainMm:numeric(d.precipitation_sum?.[0],0,2000),
  rainChancePercent:numeric(d.precipitation_probability_max?.[0],0,100)
 };
 if(Object.values(values).some(n=>n===null)||
  typeof c.time!=="string"||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(c.time))return null;
 return {...values,modelTime:c.time,source:"Open-Meteo.com",
  url:"https://open-meteo.com/en/docs",kind:"model-estimate",officialAlert:false};
}
export async function configureWeatherWatch(env,operatorId,{action,id}={}, {fetchImpl=fetch,now=()=>new Date().toISOString()}={}){
 if(!validUser(operatorId))return error(401,"Identidade inválida");
 if(!["add","remove"].includes(action))return error(400,"Ação inválida");
 const locationId=validId(id);
 if(!locationId)return error(400,"ID de cidade inválido");
 const db=env?.ULTRON_DB;
 try{if(!await setup(db))return error(503,"D1 indisponível");}
 catch{return error(503,"Falha ao preparar D1");}
 try{
  if(action==="remove"){
   await db.prepare("DELETE FROM jarvis_weather_watches WHERE operator_id=? AND location_id=?").bind(operatorId,locationId).run();
   await db.prepare("DELETE FROM jarvis_weather_watch_samples WHERE operator_id=? AND location_id=?").bind(operatorId,locationId).run();
   return {ok:true,action,id:locationId};
  }
  const existing=await db.prepare("SELECT location_id FROM jarvis_weather_watches WHERE operator_id=? AND location_id=?").bind(operatorId,locationId).first();
  if(existing)return {ok:true,action,id:locationId,alreadyTracked:true};
  const count=await db.prepare("SELECT COUNT(*) AS total FROM jarvis_weather_watches WHERE operator_id=?").bind(operatorId).first();
  if(Number(count?.total)>=LIMIT_PER_USER)return error(409,"Limite de seis localidades atingido");
  const url=new URL("https://geocoding-api.open-meteo.com/v1/get");
  url.searchParams.set("id",String(locationId));
  const location=await readProvider(url.toString(),fetchImpl);
  const lat=numeric(location.latitude,-90,90),lng=numeric(location.longitude,-180,180);
  if(Number(location.id)!==locationId||lat===null||lng===null||
    typeof location.name!=="string"||!location.name.trim()||
    typeof location.country!=="string"||!location.country.trim())return error(404,"Cidade não encontrada");
  const name=location.name.replace(/[<>\r\n]/g," ").slice(0,90),country=location.country.replace(/[<>\r\n]/g," ").slice(0,90);
  await db.prepare("INSERT OR IGNORE INTO jarvis_weather_watches (operator_id,location_id,name,country,latitude,longitude,created_at) VALUES (?,?,?,?,?,?,?)")
   .bind(operatorId,locationId,name,country,lat,lng,now()).run();
  return {ok:true,action,id:locationId,location:{name,country,lat,lng},
    cadenceHours:3,notifications:false};
 }catch{return error(503,"Não foi possível salvar a localidade");}
}
export async function listWeatherWatches(env,operatorId){
 if(!validUser(operatorId))return error(401,"Identidade inválida");
 const db=env?.ULTRON_DB;
 try{
  if(!await setup(db))return error(503,"D1 indisponível");
  const watches=await db.prepare("SELECT location_id,name,country,last_checked_at FROM jarvis_weather_watches WHERE operator_id=? ORDER BY created_at LIMIT 6").bind(operatorId).all();
  const samples=await db.prepare("SELECT location_id,bucket,fetched_at,summary_json FROM jarvis_weather_watch_samples WHERE operator_id=? ORDER BY fetched_at DESC LIMIT 130").bind(operatorId).all();
  const history=(samples.results||[]).flatMap(row=>{
   try{return [{locationId:row.location_id,bucket:row.bucket,fetchedAt:row.fetched_at,summary:JSON.parse(row.summary_json)}];}
   catch{return [];}
  });
  return {ok:true,watches:watches.results||[],history,cadenceHours:3,
   notifications:false,retentionDays:7,
   disclaimer:"Coleta de modelos a cada 3 horas, não sensor em tempo real ou alerta oficial."};
 }catch{return error(503,"Histórico indisponível");}
}
export async function pollPersonalWeatherWatches(env,{now=()=>new Date(),fetchImpl=fetch}={}){
 const date=now();
 if(!(date instanceof Date)||!Number.isFinite(date.getTime()))return error(400,"Horário inválido");
 if(date.getUTCHours()%3!==0||date.getUTCMinutes()>4)return {ok:true,skipped:true};
 const db=env?.ULTRON_DB;
 try{if(!await setup(db))return error(503,"D1 indisponível");}
 catch{return error(503,"D1 indisponível");}
 const cutoff=new Date(date.getTime()-150*60000).toISOString();
 const bucket=date.toISOString().slice(0,10)+"T"+String(Math.floor(date.getUTCHours()/3)*3).padStart(2,"0")+":00Z";
 try{
  const rows=await db.prepare("SELECT operator_id,location_id,latitude,longitude FROM jarvis_weather_watches WHERE last_checked_at IS NULL OR last_checked_at<? ORDER BY COALESCE(last_checked_at,'') LIMIT ?").bind(cutoff,LIMIT_PER_BUCKET).all();
  let saved=0,failed=0;
  for(const row of rows.results||[]){
   const claim=await db.prepare("UPDATE jarvis_weather_watches SET last_checked_at=? WHERE operator_id=? AND location_id=? AND (last_checked_at IS NULL OR last_checked_at<?)")
    .bind(date.toISOString(),row.operator_id,row.location_id,cutoff).run();
   if(claim?.meta?.changes===0)continue;
   const url=new URL("https://api.open-meteo.com/v1/forecast");
   for(const [k,v] of Object.entries({latitude:row.latitude,longitude:row.longitude,
    timezone:"auto",forecast_days:1,current:"temperature_2m,relative_humidity_2m,wind_speed_10m",
    daily:"precipitation_sum,precipitation_probability_max"}))url.searchParams.set(k,String(v));
   try{
    const sample=validateWatchSample(await readProvider(url.toString(),fetchImpl));
    if(!sample){failed++;continue;}
    await db.prepare("INSERT OR IGNORE INTO jarvis_weather_watch_samples (operator_id,location_id,bucket,fetched_at,summary_json) VALUES (?,?,?,?,?)")
     .bind(row.operator_id,row.location_id,bucket,date.toISOString(),JSON.stringify(sample)).run();
    saved++;
   }catch{failed++;}
  }
  await db.prepare("DELETE FROM jarvis_weather_watch_samples WHERE fetched_at<?")
   .bind(new Date(date.getTime()-7*86400000).toISOString()).run();
  return {ok:true,saved,failed,bucket,maxWeatherCallsPerDay:LIMIT_PER_BUCKET*8};
 }catch{return error(503,"Falha na coleta programada");}
}
