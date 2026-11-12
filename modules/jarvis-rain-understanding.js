/**
 * APAC rain-gauge interpretation, separate from radar reflectivity and forecast.
 * In rainfall accumulation, mm = litres of water per square metre (1 mm = 1 L/m²).
 * Never sum different gauges as if they measure one location.
 */
export const APAC_RAIN_BANDS=Object.freeze([
 {min:0,max:0,label:"Sem chuva registrada",short:"0 mm",color:"#73899a"},
 {min:0,max:2,label:"Muito pouca chuva",short:"0–2 mm",color:"#76b7dd"},
 {min:2,max:10,label:"2–10 mm",short:"2–10 mm",color:"#46bb8e"},
 {min:10,max:30,label:"10–30 mm",short:"10–30 mm",color:"#e3cd5e"},
 {min:30,max:50,label:"30–50 mm",short:"30–50 mm",color:"#eda053"},
 {min:50,max:100,label:"50–100 mm",short:"50–100 mm",color:"#e56b58"},
 {min:100,max:Infinity,label:"Acima de 100 mm",short:">100 mm",color:"#ba54a9"}
]);
export const mmLabel=(value)=>Number(value).toLocaleString("pt-BR",{maximumFractionDigits:1})+" mm";
export function apacBand(mm){
 const value=Number(mm);
 if(!Number.isFinite(value)||value<0)return null;
 return value===0?APAC_RAIN_BANDS[0]:
    APAC_RAIN_BANDS.slice(1).find(b=>value>b.min&&value<=b.max)||APAC_RAIN_BANDS.at(-1);
}
export function analyzeApacRain(report,{search="",rainOnly=false}={}){
 if(!report?.ok||!Array.isArray(report.stations))return null;
 const valid=report.stations.filter(s=>s&&Number.isFinite(s.value)&&s.value>=0);
 const raining=valid.filter(s=>s.value>0);
 const cities=new Set(valid.map(s=>String(s.city||"").trim().toLocaleLowerCase("pt-BR")).filter(Boolean));
 const term=String(search||"").trim().toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g,"");
 const norm=s=>String(s||"").toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g,"");
 const filtered=valid.filter(s=>(!rainOnly||s.value>0)&&(!term||norm(s.city+" "+s.name).includes(term)))
   .sort((a,b)=>b.value-a.value||String(a.city).localeCompare(String(b.city),"pt-BR"));
 const sorted=[...valid].sort((a,b)=>b.value-a.value);
 const bands=APAC_RAIN_BANDS.map(b=>({...b,count:valid.filter(s=>apacBand(s.value)===b).length}));
 return {all:valid,filtered,top:sorted.slice(0,8),count:valid.length,withRain:raining.length,
   withoutRain:valid.length-raining.length,municipalityCount:cities.size,maximum:sorted[0]||null,
   bands,hours:report.hours};
}
export const APAC_MAP_BOUNDS=Object.freeze({west:-41.65,east:-34.55,north:-6.65,south:-9.62});
export function apacProjection(lng,lat,{width=900,height=450}={}){
 const bounds=APAC_MAP_BOUNDS;
 return {x:35+(Number(lng)-bounds.west)/(bounds.east-bounds.west)*(width-70),
   y:35+(bounds.north-Number(lat))/(bounds.north-bounds.south)*(height-70)};
}
export function apacInsideMainland(station){
 return station.lng>=APAC_MAP_BOUNDS.west&&station.lng<=APAC_MAP_BOUNDS.east&&
 station.lat<=APAC_MAP_BOUNDS.north&&station.lat>=APAC_MAP_BOUNDS.south;
}
export const APAC_OUTLINE_URL=
 "https://geoportal.apac.pe.gov.br/server/rest/services/met_monitoramento_chuvas_pe/MapServer/8/query";
export function parseApacBoundary(payload){
 const features=Array.isArray(payload?.features)?payload.features:[];
 const rings=[];
 for(const feature of features.slice(0,20)){
  const geom=feature?.geometry;
  if(!geom||!["Polygon","MultiPolygon"].includes(geom.type))continue;
  const polys=geom.type==="Polygon"?[geom.coordinates]:geom.coordinates;
  for(const polygon of polys||[])for(const ring of polygon||[]){
   if(!Array.isArray(ring)||ring.length<3)continue;
   const coords=ring.filter(c=>Array.isArray(c)&&Number.isFinite(c[0])&&Number.isFinite(c[1])&&
      c[0]>=-42&&c[0]<=-32&&c[1]>=-10&&c[1]<=-3);
   if(coords.length>=3)rings.push(coords);
  }
 }
 return rings;
}
export async function loadApacBoundary({fetchImpl=fetch}={}){
 const u=new URL(APAC_OUTLINE_URL);
 for(const [k,v] of Object.entries({where:"1=1",outFields:"objectid",
    outSR:"4326",geometryPrecision:"3",maxAllowableOffset:"0.02",
    returnGeometry:"true",resultRecordCount:"20",f:"geojson"}))u.searchParams.set(k,v);
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),9500);
 try{
  const response=await fetchImpl(u.toString(),{signal:controller.signal,cache:"force-cache"});
  if(!response.ok)return [];
  return parseApacBoundary(await response.json());
 }catch{return [];}finally{clearTimeout(timer);}
}
