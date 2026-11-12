// Climatic tendencies are geography and evidence, never a deterministic forecast
// from a UI animation. Coordinates mark representative REGIONS, not impact limits.
export const GEO_SOURCE={
  name:"Cemaden/MCTI — Painel El Niño nº 05 (outubro de 2026)",
  url:"https://www.gov.br/cemaden/pt-br/assuntos/monitoramento/el-nino/boletim-do-painel-el-nino-ndeg-05-outubro-de-2026-potenciais-impactos-e-orientacoes",
  basePeriod:"Outubro de 2026; projeção sazonal novembro de 2026 a janeiro de 2027",
  disclaimer:"Pontos de referência regionais e categorias qualitativas. Não são limites de desastre, probabilidade por município, alerta em tempo real nem previsão mensal."
};
export const GEO_PALETTE={
  dry:{color:"#eda75d",title:"Tendência de chuva abaixo da média",short:"Seca / menos chuva"},
  wet:{color:"#67c5ef",title:"Tendência de chuva acima da média",short:"Mais chuva"},
  heat:{color:"#e76e75",title:"Temperatura acima da média",short:"Mais calor"},
  observed:{color:"#d89c78",title:"Seca observada",short:"Seca observada"},
  weather:{color:"#a6d0f2",title:"Previsão numérica de curto prazo",short:"Tempo previsto"},
  history:{color:"#c5c6f1",title:"Reanálise histórica",short:"Histórico modelado"},
  air:{color:"#d4e8a5",title:"Qualidade do ar modelada",short:"Qualidade do ar"},
  marine:{color:"#74c6d0",title:"Oceanografia modelada",short:"Mar e ondas"},
  river:{color:"#6cb6e2",title:"Vazão fluvial simulada",short:"Vazão em rios"},
  uncertainty:{color:"#e7c0ec",title:"Faixa dos membros de ensemble",short:"Incerteza"},
  earthquake:{color:"#ed965c",title:"Epicentro e magnitude",short:"Sismo"},
  wildfires:{color:"#ef7848",title:"Incêndio catalogado",short:"Queimada"},
  volcanoes:{color:"#b879df",title:"Atividade vulcânica reportada",short:"Vulcão"},
  severeStorms:{color:"#e4a64e",title:"Tempestade reportada",short:"Tempestade"},
  floods:{color:"#499ddf",title:"Inundação catalogada",short:"Inundação"},
  landslides:{color:"#bf8d6d",title:"Deslizamento catalogado",short:"Deslizamento"},
  indicator:{color:"#9bc8e1",title:"Indicador por país",short:"Indicador"}
};
const spot=(id,name,lat,lng,kind,detail,source=GEO_SOURCE.url)=>({id,name,lat,lng,kind,detail,source,region:true});
export const GEO_SCENARIOS={
  enso:{
    id:"enso",
    title:"El Niño — Brasil",
    source:GEO_SOURCE,
    frames:[
      {id:"observed",name:"Outubro de 2026",type:"observação publicada",kind:"observed",
       description:"Pontos resumidos de áreas com seca relatada pelo Cemaden. Não representam a extensão real dos municípios afetados.",
       points:[
         spot("drought-ne","Leste do Nordeste",-10.7,-38.8,"observed","O Cemaden relatou seca grave e extrema em municípios, especialmente no leste do Nordeste."),
         spot("drought-n","Norte do Brasil",0.2,-62.4,"observed","O boletim apontou agravamento regional em áreas de Roraima e Amazonas.")
       ]},
      {id:"outlook",name:"Nov/2026 a Jan/2027",type:"previsão sazonal qualitativa",kind:"forecast",
       description:"Tendências regionais do boletim de outubro/2026. Não são valores numéricos nem localização exata de impactos.",
       points:[
         spot("south-wet","Sul do Brasil",-28.1,-51.1,"wet","Maior probabilidade sazonal de chuva acima da média; impactos locais dependem de outros fatores."),
         spot("north-dry","Norte",-3.2,-62.1,"dry","Maior probabilidade de precipitação abaixo da média, associada a calor e potencial de propagação de fogo."),
         spot("ne-dry","Nordeste",-9.2,-41.1,"dry","Partes do Nordeste apresentam tendência de chuva abaixo da média, sem uniformidade regional."),
         spot("central-dry","Centro-Oeste",-15.8,-53.3,"dry","Há áreas com tendência de chuva abaixo da média, outras com sinal distinto."),
         spot("se-wet","Partes do Sudeste",-22.9,-45.3,"wet","Partes do Sudeste apresentam maior probabilidade de chuva acima da média."),
         spot("warm-brazil","Grande parte do Brasil",-13.7,-48.1,"heat","Projeção indica temperaturas acima da média em quase todo o país, com exceções regionais.")
       ]},
      {id:"demo",name:"Dinâmica didática",type:"animação ilustrativa — não é previsão",kind:"illustrative",
       description:"A animação visualiza as mesmas tendências sazonais do quadro anterior. Velocidade, pulsos e áreas destacadas não são dados meteorológicos.",
       points:[
         spot("demo-south","Sul do Brasil",-28.1,-51.1,"wet","Pulso didático sobre a área de tendência de chuva acima da média."),
         spot("demo-north","Norte",-3.2,-62.1,"dry","Pulso didático sobre a área de tendência de menos chuva."),
         spot("demo-ne","Nordeste",-9.2,-41.1,"dry","Pulso didático sobre áreas com tendência de menos chuva."),
         spot("demo-co","Centro-Oeste",-15.8,-53.3,"dry","Pulso didático sobre áreas com sinal sazonal misto."),
         spot("demo-se","Sudeste",-22.9,-45.3,"wet","Pulso didático sobre áreas com sinal de chuva acima da média.")
       ]}
    ]
  }
};
const validURL=value=>{
 try{const u=new URL(String(value||""));return u.protocol==="https:"&&!u.username&&!u.password?u.href:null;}catch{return null;}
};
const clean=(value,n)=>String(value||"").replace(/[\r\n<>]/g," ").replace(/\s+/g," ").trim().slice(0,n);

// Optional numeric metrics come only from an already validated, sourced model.
// Their ranges prevent a UI from silently turning text into invented weather.
const METRIC_BOUNDS=Object.freeze({
 temperatureC:[-100,65],humidityPercent:[0,100],precipitationMm:[0,2000],
 windKmh:[0,500],minC:[-100,65],maxC:[-100,65],
 rainMm:[0,2000],rainChancePercent:[0,100]
});
function validateMetrics(metrics){
 if(metrics==null)return null;
 if(typeof metrics!=="object"||Array.isArray(metrics))return false;
 const result={};
 for(const [key,value] of Object.entries(metrics)){
  const bounds=METRIC_BOUNDS[key];
  if(!bounds||typeof value!=="number"||!Number.isFinite(value)||
    value<bounds[0]||value>bounds[1])return false;
  result[key]=value;
 }
 return Object.keys(result).length?result:null;
}
export function validateGeoScenario(input){
 if(!input||typeof input!=="object"||!Array.isArray(input.frames)||!input.frames.length||input.frames.length>17)return null;
 if(!input.source||!validURL(input.source.url)||!clean(input.source.disclaimer,350))return null;
 const frames=[];
 for(const frame of input.frames){
  const themed=String(input.id||"").startsWith("world-")&&input.theme?.topic;
  if(!Array.isArray(frame.points)||!frame.points.length||frame.points.length>(themed?160:20))return null;
  const points=[];
  for(const item of frame.points){
   if(item?.lat===null||item?.lat===undefined||item?.lng===null||item?.lng===undefined||
      !['number','string'].includes(typeof item.lat)||!['number','string'].includes(typeof item.lng)||
      String(item.lat).trim()===''||String(item.lng).trim()==='')return null;
   const lat=Number(item.lat),lng=Number(item.lng);
   if(!Number.isFinite(lat)||!Number.isFinite(lng)||Math.abs(lat)>90||Math.abs(lng)>180||!Object.hasOwn(GEO_PALETTE,item?.kind))return null;
   const name=clean(item.name,100),detail=clean(item.detail,350);
   const source=validURL(item.source||input.source.url);
   if(!name||!detail||!source)return null;
   const id=clean(item.id||name,65);
   if(points.some(previous=>previous.id===id))return null;
   const color=item.color==null?null:(/^#[0-9a-f]{6}$/i.test(String(item.color))?String(item.color):false);
   if(color===false)return null;
   const metric=item.value===undefined?null:item.value;
   if(metric!==null&&(typeof metric!=="number"||!Number.isFinite(metric)||metric<0||metric>5e15))return null;
   points.push({id,name,lat,lng,kind:item.kind,detail,source,
     ...(color?{color}:{}),
     ...(metric!==null?{value:metric,unit:clean(item.unit,30)}:{}),
     ...(item.observedAt?{observedAt:clean(item.observedAt,36)}:{})});
  }
  const metrics=validateMetrics(frame.metrics);
  if(metrics===false)return null;
  frames.push({id:clean(frame.id,45),name:clean(frame.name,90),type:clean(frame.type,100),
    kind:["observed","forecast","illustrative","current-estimate","short-term-forecast"].includes(frame.kind)?frame.kind:"illustrative",
    description:clean(frame.description,350),metrics,points});
 }
 const theme=input.theme?.topic&&/^[a-zA-Z0-9_-]{2,40}$/.test(input.theme.topic)?{
   topic:input.theme.topic,
   unit:clean(input.theme.unit,45),
   kind:clean(input.theme.kind,55),
   coloredBy:clean(input.theme.coloredBy,70),
   legend:(Array.isArray(input.theme.legend)?input.theme.legend:[]).slice(0,10).map(l=>({
     color:String(l.color||""),label:clean(l.label,110)})).filter(l=>/^#[0-9a-f]{6}$/i.test(l.color)&&l.label),
   countryValues:null
 }:null;
 if(theme&&input.theme?.countryValues&&typeof input.theme.countryValues==="object"){
   const values={};
   for(const [code,item] of Object.entries(input.theme.countryValues).slice(0,230)){
     if(!/^[A-Z]{3}$/.test(code)||!item||typeof item!=="object")continue;
     if(typeof item.value!=="number"||!Number.isFinite(item.value)||item.value<0||item.value>5e15||
        !/^#[0-9a-f]{6}$/i.test(item.color)||!/^(19|20)\d{2}$/.test(String(item.year)))continue;
     values[code]={value:item.value,color:item.color,year:String(item.year)};
   }
   theme.countryValues=values;
 }
 return {id:clean(input.id,55),title:clean(input.title,110),projection:input.projection==="world"?"world":"brazil",
   source:{name:clean(input.source.name,150),url:validURL(input.source.url),
     basePeriod:clean(input.source.basePeriod,180),disclaimer:clean(input.source.disclaimer,350)},frames,
   ...(theme?{theme}:{})};
}
export function geoFrame(dataset,index=0,category="all"){
 const data=validateGeoScenario(dataset);
 if(!data)return null;
 const n=Math.max(0,Math.min(data.frames.length-1,Number.isFinite(Number(index))?Math.floor(Number(index)):0));
 const f=data.frames[n];
 return {...f,index:n,points:f.points.filter(p=>category==="all"||p.kind===category)};
}
export const BRAZIL_OUTLINE_URL="https://servicodados.ibge.gov.br/api/v3/malhas/paises/BR?formato=application/vnd.geo+json";
export function brazilXY(lng,lat){return {x:55+(Number(lng)+74)*16.6,y:50+(6-Number(lat))*10.3};}
export const WORLD_OUTLINE_URL="https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson";
export function worldXY(lng,lat){return {x:50+(Number(lng)+180)*(800/360),y:35+(90-Number(lat))*(480/180)};}
export function geoJSONPaths(geojson,{projection="brazil"}={}){
 if(!geojson||typeof geojson!=="object")return [];
 const features=geojson.type==="FeatureCollection"?geojson.features:[geojson];
 const paths=[];
 for(const item of (features||[]).slice(0,projection==="world"?250:10)){
  const g=item?.geometry||item;
  const polygons=g?.type==="Polygon"?[g.coordinates]:g?.type==="MultiPolygon"?g.coordinates:[];
  for(const poly of polygons.slice(0,20))for(const ring of (poly||[]).slice(0,1)){
   if(!Array.isArray(ring)||ring.length<3||ring.length>8000)continue;
   const pts=ring.filter(p=>Array.isArray(p)&&Number.isFinite(p[0])&&Number.isFinite(p[1])).map(p=>projection==="world"?worldXY(p[0],p[1]):brazilXY(p[0],p[1]));
   if(pts.length>2)paths.push("M"+pts.map(p=>p.x.toFixed(1)+","+p.y.toFixed(1)).join("L")+"Z");
  }
 }
 return paths.slice(0,projection==="world"?350:60);
}
