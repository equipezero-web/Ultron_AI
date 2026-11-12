// J.A.R.V.I.S. global geospatial intelligence. Sources are fixed, read-only,
 // independently validated and never inferred from generated prose.
const clean=(s,n=120)=>String(s??"").replace(/[\r\n<>]/g," ").replace(/\s+/g," ").trim().slice(0,n);
const https=(url,fallback)=>{
 try{const u=new URL(String(url));return u.protocol==="https:"&&!u.username&&!u.password?u.href:fallback;}
 catch{return fallback;}
};
const validNumber=(v,a,b)=>typeof v==="number"&&Number.isFinite(v)&&v>=a&&v<=b;
const hex=x=>/^#[0-9a-f]{6}$/i.test(String(x));
const EVENT_COLOR={
 earthquakes:["#78b6dc","#a4d899","#eed273","#ed8f54","#d94f63","#ab3a61"],
 wildfires:"#ef7848",volcanoes:"#b879df",severeStorms:"#e4a64e",
 floods:"#499ddf",landslides:"#bf8d6d"
};
const wbBands={
 population:{codes:"SP.POP.TOTL",label:"População por país",unit:"habitantes",
  limits:[1e6,1e7,5e7,1e8,5e8],
  labels:["até 1 milhão","1–10 milhões","10–50 milhões","50–100 milhões","100–500 milhões","mais de 500 milhões"],
  colors:["#40789f","#63a5bf","#6dd0b8","#e1cb70","#ec9859","#d05a67"]},
 gdp:{codes:"NY.GDP.MKTP.CD",label:"PIB nominal por país",unit:"US$ correntes",
  limits:[1e9,1e10,1e11,1e12,1e13],
  labels:["até US$ 1 bi","US$ 1–10 bi","US$ 10–100 bi","US$ 100 bi–1 tri","US$ 1–10 tri","mais de US$ 10 tri"],
  colors:["#497e9f","#70b4c5","#83d8b1","#d9cb7e","#e7a765","#cb5978"]},
 co2:{codes:"EN.GHG.CO2.PC.CE.AR5",label:"Emissões de CO₂ equivalente por habitante",unit:"t CO₂e/pessoa",
  limits:[1,3,6,10,20],labels:["até 1 t","1–3 t","3–6 t","6–10 t","10–20 t","mais de 20 t"],
  colors:["#79b1d8","#92ccaf","#e3ce82","#ed9c62","#df7257","#b34562"]}
};
// CO2 legacy reliable World Bank indicator (metric tons CO2 per capita).
wbBands.co2.codes="EN.ATM.CO2E.PC";
wbBands.co2.label="Emissões de CO₂ por habitante";
wbBands.co2.unit="t CO₂/pessoa";
export const WORLD_GEO_TOPICS=Object.freeze({
 earthquakes:{label:"Terremotos mundiais",kind:"events",source:"USGS",url:"https://earthquake.usgs.gov/earthquakes/feed/v1.0/geojson.php",
   disclaimer:"Magnitude sísmica no epicentro, não intensidade sentida, danos ou perigo por município. Feed de eventos M4,5+ dos últimos sete dias."},
 wildfires:{label:"Queimadas e incêndios observados",kind:"events",category:"wildfires",source:"NASA EONET",
   url:"https://eonet.gsfc.nasa.gov/",disclaimer:"Eventos catalogados, não superfície total queimada nem classificação de gravidade. Cores indicam categoria, não intensidade."},
 volcanoes:{label:"Atividade vulcânica reportada",kind:"events",category:"volcanoes",source:"NASA EONET",
   url:"https://eonet.gsfc.nasa.gov/",disclaimer:"Eventos catalogados pela NASA EONET, não mapa de perigo de erupção ou áreas de exclusão."},
 severeStorms:{label:"Tempestades catalogadas",kind:"events",category:"severeStorms",source:"NASA EONET",
   url:"https://eonet.gsfc.nasa.gov/",disclaimer:"Eventos meteorológicos reportados pela NASA, não intensidade de vento/chuva nem alertas oficiais."},
 floods:{label:"Inundações catalogadas",kind:"events",category:"floods",source:"NASA EONET",
   url:"https://eonet.gsfc.nasa.gov/",disclaimer:"Posições de eventos catalogados; não polígonos de inundação nem probabilidade de risco."},
 landslides:{label:"Deslizamentos catalogados",kind:"events",category:"landslides",source:"NASA EONET",
   url:"https://eonet.gsfc.nasa.gov/",disclaimer:"Pontos de ocorrências reportadas; não mapa de risco geológico regional."},
 ...Object.fromEntries(Object.entries(wbBands).map(([key,v])=>[key,{
  label:v.label,kind:"indicator",source:"Banco Mundial — World Development Indicators",
  url:"https://data.worldbank.org/",disclaimer:"Dados anuais por país; ano de referência varia entre países. Pontos marcam capitais/centros publicados; não bairros ou medições em tempo real."
 }]))
});
const EARTHQUAKE_FEED="https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_week.geojson";
const EONET_BASE="https://eonet.gsfc.nasa.gov/api/v3/events/geojson";
const WB_BASE="https://api.worldbank.org/v2/";
const rangeBrazil=([lng,lat])=>lng>=-74.5&&lng<=-33.5&&lat>=-34.5&&lat<=5.6;
const within=(lng,lat,region)=>validNumber(lng,-180,180)&&validNumber(lat,-90,90)&&
 (region==="world"||rangeBrazil([lng,lat]));
const dateText=x=>{
 if(typeof x==="number"&&Number.isFinite(x))return new Date(x).toISOString();
 if(typeof x==="string"&&/^\d{4}-\d{2}-\d{2}/.test(x))return clean(x,28);
 return null;
};
const cls=(value,limits,colors,labels)=>{
 const index=limits.findIndex(bound=>value<=bound),i=index<0?colors.length-1:index;
 return {color:colors[i],label:labels[i],index:i};
};
const eqClass=magnitude=>cls(magnitude,[4.9,5.4,5.9,6.4,6.9],EVENT_COLOR.earthquakes,
 ["M4,5–4,9","M5,0–5,4","M5,5–5,9","M6,0–6,4","M6,5–6,9","M7,0+"]);
const pts=(items,region)=>items.filter(p=>within(p.lng,p.lat,region)).slice(0,140);
const shortPoints=(data,topic,region,title,description,source,period,legend,points,extra={})=>{
 const selected=pts(points,region);
 if(!selected.length)return {ok:false,status:404,code:"NO_GEOCODED_EVENTS",
  error:"A fonte não retornou registros georreferenciados para esta região/período. Nenhuma intensidade foi inventada.",
  source:source.url,topic};
 const scenario={
  id:"world-"+topic+"-"+region,
  title,projection:region==="world"?"world":"brazil",
  source:{name:source.name,url:source.url,basePeriod:period,disclaimer:description},
  theme:{topic,legend,unit:extra.unit||"",kind:extra.kind||"events",
   coloredBy:extra.coloredBy||"category",countryValues:extra.countryValues||null},
  frames:[{id:"observed",name:period,type:extra.type||"registros geográficos publicados",
   kind:"observed",description,points:selected}]
 };
 return {ok:true,topic,region,recordCount:selected.length,source:source,period,
  disclaimer:description,dataset:scenario};
};
export function normalizeWorldGeo(topic,region,payload,{now=()=>new Date().toISOString()}={}){
 const spec=WORLD_GEO_TOPICS[topic];
 if(!spec||!["world","brazil"].includes(region))return null;
 const source={name:spec.source,url:spec.url};
 if(topic==="earthquakes"){
  const rows=Array.isArray(payload?.features)?payload.features:[];
  const out=[];
  for(const row of rows.slice(0,180)){
   const coord=row?.geometry?.coordinates,m=row?.properties?.mag;
   if(!Array.isArray(coord)||coord.length<2||!validNumber(m,4.5,10))continue;
   const [lng,lat]=coord;if(!within(lng,lat,region))continue;
   const date=dateText(row?.properties?.time),url=https(row?.properties?.url,source.url);
   if(!date)continue;
   const color=eqClass(m).color,place=clean(row.properties.place||"Epicentro sem local identificado",90);
   const title=clean("M"+m.toFixed(1)+" · "+place,100);
   out.push({id:clean(row.id||"eq-"+out.length,65),name:title,lat,lng,kind:"earthquake",
    color,detail:"Magnitude "+m.toFixed(1)+" · "+date+" · "+place+". Epicentro, não área de danos.",
    source:url,value:m,unit:"magnitude",observedAt:date});
  }
  return shortPoints(payload,topic,region,spec.label,spec.disclaimer,source,
   "Últimos 7 dias · "+now().slice(0,10),
   EVENT_COLOR.earthquakes.map((color,i)=>({color,label:["M4,5–4,9","M5,0–5,4","M5,5–5,9","M6,0–6,4","M6,5–6,9","M7,0+"][i]})),
   out,{unit:"M",coloredBy:"earthquake-magnitude",type:"sismos registrados pelo USGS"});
 }
 if(spec.kind==="events"){
  const rows=Array.isArray(payload?.features)?payload.features:[];
  const out=[];
  for(const row of rows.slice(0,160)){
   let coords=row?.geometry?.coordinates;
   const geometry=row?.geometry?.type;
   if(geometry==="Polygon")coords=coords?.[0]?.[0];
   else if(geometry==="MultiPolygon")coords=coords?.[0]?.[0]?.[0];
   if(!Array.isArray(coords)||coords.length<2)continue;
   const [lng,lat]=coords;if(!within(lng,lat,region))continue;
   const name=clean(row?.properties?.title||"Evento natural reportado",100);
   const time=dateText(row?.properties?.date||row?.properties?.geometryDates?.[0]);
   if(!time||!name)continue;
   const link=https(row.properties.link,source.url);
   const magnitude=row.properties.magnitudeValue,unit=clean(row.properties.magnitudeUnit,18);
   const magnitudeText=validNumber(magnitude,0,1e7)?
    " · Magnitude informada: "+magnitude+(unit?" "+unit:" (unidade não informada)"):"";
   out.push({id:clean(row.properties.id||row.id||"eonet-"+out.length,65),
    name,lat,lng,kind:topic,color:EVENT_COLOR[topic],
    detail:"Evento EONET · "+time+magnitudeText+" · "+name+
      ". Intensidade não classificada quando a fonte não fornece escala comparável.",
    source:link,observedAt:time,
    ...(validNumber(magnitude,0,1e7)?{value:magnitude,unit}:{} )});
  }
  return shortPoints(payload,topic,region,spec.label,spec.disclaimer,source,
   "NASA EONET · eventos reportados nos últimos 30 dias",
   [{color:EVENT_COLOR[topic],label:"Ocorrências catalogadas; intensidade não classificada"}],
   out,{coloredBy:"event-category"});
 }
 if(spec.kind==="indicator"){
  const {observations,locations}=payload||{};
  if(!Array.isArray(observations?.[1])||!Array.isArray(locations?.[1]))return null;
  const def=wbBands[topic],countries=new Map();
  for(const c of locations[1]){
   if(!c||c.region?.value==="Aggregates")continue;
   const alpha2=clean(c.iso2Code,3),lat=Number(c.latitude),lng=Number(c.longitude);
   if(!/^[A-Z]{2}$/.test(alpha2)||!within(lng,lat,region))continue;
   const code=clean(c.id,3);
   if(!/^[A-Z]{3}$/.test(code))continue;
   countries.set(alpha2,{id:code,lat,lng,name:clean(c.name,80)});
  }
  const indicators=new Map(),yearByCountry=new Map();
  for(const row of observations[1]){
   const iso2=clean(row.country?.id,3),country=countries.get(iso2);
   if(!country||indicators.has(country.id))continue;
   const value=row.value;
   if(!validNumber(value,0,5e15))continue;
   const year=String(row.date||"");
   if(!/^20\d{2}$/.test(year)&&!/^19\d{2}$/.test(year))continue;
   const c=cls(value,def.limits,def.colors,def.labels);
   indicators.set(country.id,{value,color:c.color,label:c.label,year});
   yearByCountry.set(country.id,year);
  }
  const points=[];
  for(const country of countries.values()){
   const ind=indicators.get(country.id);if(!ind)continue;
   points.push({id:"country-"+country.id,name:country.name,
    lat:country.lat,lng:country.lng,kind:"indicator",color:ind.color,
    value:ind.value,unit:def.unit,observedAt:ind.year,
    source:"https://data.worldbank.org/indicator/"+def.codes+"?locations="+country.id,
    detail:def.label+": "+ind.value.toLocaleString("pt-BR",{maximumFractionDigits:2})+
      " "+def.unit+" (ano "+ind.year+"). Valor nacional; ponto é geolocalização de referência."});
  }
  const sortedYears=[...yearByCountry.values()].sort();
  const period=sortedYears.length?"Dados anuais disponíveis · "+sortedYears[0]+" a "+sortedYears.at(-1):"Dados anuais";
  return shortPoints(payload,topic,region,spec.label,spec.disclaimer,source,period,
   def.colors.map((color,i)=>({color,label:def.labels[i]})),points,
   {unit:def.unit,kind:"country-indicator",coloredBy:"national-annual-indicator",
    countryValues:Object.fromEntries(indicators)});
 }
 return null;
}
const fixedUrl=topic=>{
 if(topic==="earthquakes")return EARTHQUAKE_FEED;
 if(WORLD_GEO_TOPICS[topic]?.category){
  const u=new URL(EONET_BASE);
  u.searchParams.set("category",WORLD_GEO_TOPICS[topic].category);
  u.searchParams.set("status","all");u.searchParams.set("days","30");u.searchParams.set("limit","160");
  return u.href;
 }
 return null;
};
async function fetchJSON(url,fetchImpl,timeoutMs=8500){
 const ctl=new AbortController(),t=setTimeout(()=>ctl.abort(),timeoutMs);
 try{
  const res=await fetchImpl(url,{headers:{Accept:"application/json"},method:"GET",signal:ctl.signal});
  if(!res.ok)throw Error("Fonte "+new URL(url).hostname+" HTTP "+res.status);
  return await res.json();
 }finally{clearTimeout(t);}
}
export async function loadWorldGeo({topic,region="world"}={},{fetchImpl=fetch,now=()=>new Date().toISOString()}={}){
 if(!Object.hasOwn(WORLD_GEO_TOPICS,topic)||!["world","brazil"].includes(region))
  return {ok:false,status:400,code:"INVALID_TOPIC",error:"Tema ou região mundial não suportada por fonte geográfica validada."};
 try{
  let payload;
  if(WORLD_GEO_TOPICS[topic].kind==="indicator"){
   const def=wbBands[topic];
   const indicator=new URL("country/all/indicator/"+def.codes,WB_BASE);
   // mrv=1 returns the latest available observation for each country (fast WDI path).
   // In live GitHub checks, mrv=3 on all countries timed out, whereas mrv=1
   // with 400 rows returned 266 country/aggregate rows successfully.
   for(const [k,v] of Object.entries({format:"json",per_page:"400",mrv:"1"}))indicator.searchParams.set(k,v);
   const country=new URL("country",WB_BASE);
   country.searchParams.set("format","json");country.searchParams.set("per_page","400");
   const [observations,locations]=await Promise.all([
     fetchJSON(indicator.href,fetchImpl,12000),fetchJSON(country.href,fetchImpl,12000)
   ]);
   payload={observations,locations};
  }else payload=await fetchJSON(fixedUrl(topic),fetchImpl,10500);
  const report=normalizeWorldGeo(topic,region,payload,{now});
  return report||{ok:false,status:502,code:"INVALID_SOURCE_DATA",
   error:"A fonte não entregou dados geográficos válidos; o mapa não será preenchido com informações inventadas."};
 }catch(error){
  return {ok:false,status:503,code:"GEO_PROVIDER_UNAVAILABLE",
   error:"Não foi possível confirmar dados geográficos da fonte mundial. Tente novamente."};
 }
}
