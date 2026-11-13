import {validateGeoScenario} from "./jarvis-geospatial-model.js";

// Phase X: render ONLY source-geocoded cataloged records, not news headlines,
// statewide INMET notices, inferred impact polygons or AI-generated coordinates.
const KINDS=new Set(["earthquake","wildfires","volcanoes","severeStorms","floods","landslides"]);
const PROVIDERS=Object.freeze({
 USGS:["earthquake.usgs.gov"],
 NASA:["eonet.gsfc.nasa.gov"],
 GDACS:["www.gdacs.org","gdacs.org"]
});
const sanitize=(v,max=170)=>String(v??"").replace(/[<>\r\n]/g," ").replace(/\s+/g," ").trim().slice(0,max);
function urlFor(source,url){
 try{
  const u=new URL(String(url||""));
  return u.protocol==="https:"&&!u.username&&!u.password&&!u.port&&
    PROVIDERS[source]?.includes(u.hostname)?u.href:null;
 }catch{return null;}
}
export function contextualMapCandidates(digest,{now=Date.now()}={}){
 const checked=Date.parse(String(digest?.generatedAt||""));
 if(digest?.ok!==true||!Array.isArray(digest.items)||!Number.isFinite(now)||
   !Number.isFinite(checked)||now-checked>5*60_000||checked-now>5*60_000||
   !["healthy","partial"].includes(digest.worldState))return [];
 const seen=new Set(),points=[];
 for(const item of digest.items.slice(0,10)){
  if(item?.type!=="cataloged"||typeof item.key!=="string"||
    !/^g:[\w:./-]{1,150}$/.test(item.key)||seen.has(item.key)||
    !KINDS.has(item.category))continue;
  const source=urlFor(item.source,item.url);
  const published=Date.parse(String(item.publishedAt||""));
  if(!source||!Number.isFinite(published)||published-now>5*60_000||
    now-published>7*86400000||typeof item.lat!=="number"||
    !Number.isFinite(item.lat)||Math.abs(item.lat)>90||
    typeof item.lng!=="number"||!Number.isFinite(item.lng)||Math.abs(item.lng)>180||
    !sanitize(item.title,100))continue;
  seen.add(item.key);
  points.push({
   id:item.key,source,name:sanitize(item.title,100),
   lat:item.lat,lng:item.lng,kind:item.category,
   detail:sanitize(item.verifiedLabel,140)+
     " · Registro publicado: "+new Date(published).toISOString()+
     (item.representative?" · Coordenada representativa da área":" · Coordenada informada pela fonte")+
     " · Não é previsão nem delimitação de impacto.",
   observedAt:new Date(published).toISOString(),
   representative:item.representative===true
  });
 }
 return points;
}
export function contextualGeoScene(digest,{focusKey=null,now=Date.now()}={}){
 if(focusKey!==null&&(!/^g:[\w:./-]{1,150}$/.test(String(focusKey))))return {
  ok:false,reason:"INVALID_EVENT"
 };
 const points=contextualMapCandidates(digest,{now});
 if(!points.length)return {ok:false,reason:"NO_VERIFIED_COORDINATES"};
 if(focusKey!==null&&!points.some(p=>p.id===focusKey))return {ok:false,reason:"EVENT_NOT_IN_CURRENT_SNAPSHOT"};
 const chosen=focusKey?points.find(p=>p.id===focusKey):points[0];
 const sorted=[chosen,...points.filter(p=>p!==chosen)].slice(0,10);
 const source=sorted[0].source;
 const data={
  id:"contextual-priorities-world-v1",
  title:"PRIORIDADES CONTEXTUAIS · REGISTROS CATALOGADOS",
  projection:"world",
  source:{
   name:"USGS, NASA EONET e GDACS · registros georreferenciados",
   url:source,
   basePeriod:"Consulta de fontes: "+sanitize(digest.generatedAt,36),
   disclaimer:"Pinos mostram coordenadas publicadas ou representativas. Não são limites de desastre, previsão de impacto, intensidade calculada ou prova de risco local."
  },
  frames:[{
   id:"verified-context",
   name:"Eventos catalogados",
   kind:"observed",
   type:"registros públicos georreferenciados",
   description:"Somente eventos de fontes verificadas com latitude/longitude publicada; notícias e avisos estaduais sem coordenadas NÃO recebem pinos.",
   points:sorted.map(x=>({
    id:sanitize(x.id,65),name:x.name,lat:x.lat,lng:x.lng,
    kind:x.kind,detail:x.detail,source:x.source,observedAt:x.observedAt
   }))
  }]
 };
 const validated=validateGeoScenario(data);
 return validated?{ok:true,scenario:validated,focusPointId:sanitize(chosen.id,65),
   candidateCount:points.length,mode:"sourced-observations",selectedSource:source,
   representative:chosen.representative}:
   {ok:false,reason:"INVALID_GEOGRAPHIC_DATA"};
}
