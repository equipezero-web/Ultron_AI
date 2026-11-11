// JARVIS Phase 5: measured/modelled VALUES from a bounded geographic sample grid.
// Each colored cell is the value at its own fixed model sample point; not radar,
// not an interpolated continuous surface, not a legal/official hazard boundary.
const number=(v,min,max)=>typeof v==="number"&&Number.isFinite(v)&&v>=min&&v<=max?v:null;
const format=n=>Number(n).toLocaleString("pt-BR",{maximumFractionDigits:1});
const bands=(thresholds,colors,labels)=>({thresholds,colors,labels});
export const SPATIAL_LAYERS=Object.freeze({
 rain:{label:"Chuva prevista",unit:"mm/dia",kind:"forecast",api:"https://api.open-meteo.com/v1/forecast",
  field:"precipitation_sum",group:"daily",minimum:0,maximum:2000,days:true,
  ...bands([0.1,2.5,10,25,50],["#3c5571","#74b8e8","#3276f1","#1764b3","#734dc9","#e24b9b"],
    ["Sem chuva significativa","Até 2,5 mm","2,5–10 mm","10–25 mm","25–50 mm","> 50 mm"]),
  source:"Open-Meteo — previsão numérica",sourceUrl:"https://open-meteo.com/en/docs"},
 temp:{label:"Temperatura máxima",unit:"°C",kind:"forecast",api:"https://api.open-meteo.com/v1/forecast",
  field:"temperature_2m_max",group:"daily",minimum:-100,maximum:65,days:true,
  ...bands([0,15,25,32,40],["#4c80bd","#77c9ef","#66be96","#f2c46e","#ef8652","#d84a62"],
    ["Abaixo de 0 °C","0–15 °C","15–25 °C","25–32 °C","32–40 °C","> 40 °C"]),
  source:"Open-Meteo — temperatura modelada",sourceUrl:"https://open-meteo.com/en/docs"},
 soil:{label:"Umidade do solo (não é índice de seca)",unit:"m³/m³",kind:"model",api:"https://api.open-meteo.com/v1/forecast",
  field:"soil_moisture_0_to_7cm",group:"hourly",minimum:0,maximum:1,days:false,
  ...bands([0.1,0.2,0.3,0.4,0.5],["#9c4e37","#d3894c","#e3b86a","#b4cc77","#6daab6","#4480ba"],
    ["< 0,1 m³/m³","0,1–0,2","0,2–0,3","0,3–0,4","0,4–0,5","> 0,5"]),
  source:"Open-Meteo — água volumétrica no solo 0–7 cm",sourceUrl:"https://open-meteo.com/en/docs"},
 air:{label:"Qualidade do ar — US AQI",unit:"índice",kind:"model",api:"https://air-quality-api.open-meteo.com/v1/air-quality",
  field:"us_aqi",group:"current",minimum:0,maximum:600,days:false,
  ...bands([50,100,150,200,300],["#74bd7c","#e7c66c","#ed9a4e","#d86b7a","#9a63b1","#744049"],
    ["Boa (0–50)","Moderada (51–100)","Insalubre p/ sensíveis (101–150)",
      "Insalubre (151–200)","Muito insalubre (201–300)","Perigosa (>300)"]),
  source:"Open-Meteo / Copernicus CAMS — qualidade do ar modelada",
  sourceUrl:"https://open-meteo.com/en/docs/air-quality-api"},
 marine:{label:"Altura de ondas",unit:"m",kind:"model",api:"https://marine-api.open-meteo.com/v1/marine",
  field:"wave_height",group:"current",minimum:0,maximum:40,days:false,
  ...bands([0.5,1.5,2.5,4,6],["#355981","#4a94c9","#4cc2b5","#e6bd67","#e87e54","#ae507f"],
    ["< 0,5 m","0,5–1,5 m","1,5–2,5 m","2,5–4 m","4–6 m","> 6 m"]),
  source:"Open-Meteo Marine — modelos de ondas; não usar para navegação",
  sourceUrl:"https://open-meteo.com/en/docs/marine-weather-api"},
 river:{label:"Vazão de rios (não é nível de cheia)",unit:"m³/s",kind:"hydrological-model",
  api:"https://flood-api.open-meteo.com/v1/flood",field:"river_discharge",group:"daily",
  minimum:0,maximum:2e6,days:true,
  ...bands([50,200,1000,5000,20000],["#48779d","#559eb5","#6abeaf","#c4b973","#e09a63","#c86678"],
    ["< 50 m³/s","50–200 m³/s","200–1.000 m³/s","1.000–5.000 m³/s",
      "5.000–20.000 m³/s","> 20.000 m³/s"]),
  source:"Open-Meteo / GloFAS — vazão simulada; não mede risco de inundação",
  sourceUrl:"https://open-meteo.com/en/docs/flood-api"},
 drought:{label:"Seca oficial (ANA)",unit:"classe S0–S4",kind:"official-monthly",
  source:"ANA — Monitor de Secas (mensal)",sourceUrl:"https://monitordesecas.ana.gov.br/",
  colors:["#f0d68b","#e8b467","#e8874f","#d75450","#80364a"],
  labels:["S0 · fraca","S1 · moderada","S2 · grave","S3 · extrema","S4 · excepcional"],
  thresholds:[]},
 alerts:{label:"Alertas oficiais",unit:"avisos",kind:"official",
  source:"INMET / serviços oficiais locais",sourceUrl:"https://avisos.inmet.gov.br/",
  colors:[],labels:[],thresholds:[]}
});
const fixedGrid=(region)=>{
 const rows=region==="world"?5:5,cols=region==="world"?8:7;
 const bbox=region==="world"?{west:-180,east:180,north:60,south:-60}:
  {west:-74,east:-34,north:6,south:-34};
 const dx=(bbox.east-bbox.west)/cols,dy=(bbox.north-bbox.south)/rows,cells=[];
 for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){
  const west=bbox.west+dx*c,east=west+dx,north=bbox.north-dy*r,south=north-dy;
  const lat=Number(((north+south)/2).toFixed(5)),lng=Number(((west+east)/2).toFixed(5));
  cells.push({id:region+"-"+r+"-"+c,lat,lng,
   bounds:[Number(west.toFixed(4)),Number(south.toFixed(4)),Number(east.toFixed(4)),Number(north.toFixed(4))]});
 }
 return cells;
};
const BRAZIL_RIVERS=[
 [-3.1,-60.0],[-3.5,-55.0],[-2.5,-54.2],[-7.7,-63.5],[-8.0,-49.0],
 [-11.7,-43.1],[-9.5,-41.0],[-16.7,-49.2],[-18.8,-48.2],[-20.8,-51.3],
 [-23.0,-53.1],[-29.7,-51.3],[-27.5,-55.2],[-5.3,-42.8],[-15.4,-40.7]
];
const WORLD_RIVERS=[
 [30.5,31.1],[29.4,79.8],[25.1,83.0],[31.4,120.2],[38.0,-90.0],
 [-4.0,-61.0],[-3.3,-60.0],[12.5,14.2],[51.7,4.9],[45.4,29.2],
 [19.5,96.2],[10.2,105.7],[-7.5,110.2],[15.6,32.6],[24.6,88.7]
];
const BRAZIL_OCEAN=[[-4,-35],[-7,-34],[-10,-35],[-13,-36],[-16,-38],
 [-19,-39],[-21,-40],[-23,-42],[-25,-44],[-27,-46],[-29,-47],[-32,-49],
 [-1,-42],[-3,-39],[-13,-31],[-22,-35]];
const WORLD_OCEAN=[[10,-140],[-20,-130],[35,-160],[-35,-160],[20,-35],[-15,-25],
 [48,-30],[-45,-30],[10,75],[-20,75],[35,75],[-45,80],[10,150],[-20,155],[40,170],[-40,155]];
const discrete=(coords,region,marine)=>coords.map(([lat,lng],i)=>({
 id:region+"-"+(marine?"sea-":"river-")+i,lat,lng,
 bounds:marine?[lng-2,lat-2,lng+2,lat+2]:null
}));
export function spatialSampling(layer,region){
 if(!Object.hasOwn(SPATIAL_LAYERS,layer)||!["brazil","world"].includes(region))return null;
 if(["drought","alerts"].includes(layer))return [];
 if(layer==="river")return discrete(region==="world"?WORLD_RIVERS:BRAZIL_RIVERS,region,false);
 if(layer==="marine")return discrete(region==="world"?WORLD_OCEAN:BRAZIL_OCEAN,region,true);
 return fixedGrid(region);
}
export function spatialClass(layer,value){
 const config=SPATIAL_LAYERS[layer],n=Number(value);
 if(!config||!Number.isFinite(n)||!Array.isArray(config.thresholds))return null;
 for(let i=0;i<config.thresholds.length;i++)if(n<=config.thresholds[i])
   return {index:i,color:config.colors[i],label:config.labels[i]};
 const i=config.thresholds.length;return {index:i,color:config.colors[i],label:config.labels[i]};
}
const maxValue=(raw,i,field,group,day)=>{
 const data=group==="daily"?raw.daily:group==="hourly"?raw.hourly:raw.current;
 if(!data)return null;
 if(group==="current")return data[field]??null;
 if(!Array.isArray(data.time)||!Array.isArray(data[field]))return null;
 const offset=group==="daily"?day:0;
 return {value:data[field][offset]??null,time:data.time[offset]||null};
};
export function normalizeSpatialResponse(layer,region,day,raw,{now=()=>new Date().toISOString()}={}){
 const spec=SPATIAL_LAYERS[layer],cells=spatialSampling(layer,region);
 if(!spec||!cells||!cells.length||!Number.isInteger(day)||day<0||day>2)return null;
 const payload=Array.isArray(raw)?raw:[raw];
 if(payload.length!==cells.length)return null;
 let valid=[],dayString=null;
 for(let i=0;i<cells.length;i++){
  const record=payload[i];
  if(!record||typeof record!=="object"||record.error===true)continue;
  const metric=maxValue(record,i,spec.field,spec.group,day);
  const value=typeof metric==="object"&&metric!==null?metric.value:metric;
  const time=typeof metric==="object"&&metric!==null?metric.time:record.current?.time||null;
  const amount=number(value,spec.minimum,spec.maximum);
  if(amount===null||typeof time!=="string"||!time.length)continue;
  const classification=spatialClass(layer,amount);
  if(!classification)continue;
  if(!dayString)dayString=time;
  valid.push({...cells[i],value:amount,color:classification.color,
   label:classification.label,unit:spec.unit,time});
 }
 if(!valid.length)return null;
 return {ok:true,layer,region,day,kind:spec.kind,label:spec.label,unit:spec.unit,
  dataTime:dayString,observedAt:now(),source:{name:spec.source,url:spec.sourceUrl},
  sampledCount:valid.length,totalSamples:cells.length,
  cells:valid,legend:spec.colors.map((color,i)=>({color,label:spec.labels[i]})),
  disclaimer:layer==="soil"?
   "Umidade volumétrica superficial (0–7 cm); não é diagnóstico S0–S4 de seca. Consulte o Monitor de Secas da ANA.":
   layer==="river"?"Vazão simulada no rio mais próximo. Magnitude não equivale a risco ou aviso de enchente.":
   layer==="marine"?"Ondas em pontos oceânicos modelados; não usar para decisões de navegação.":
   layer==="air"?"Índice de qualidade do ar estimado por modelo; não sensores em cada célula.":
   "Valores de modelos meteorológicos amostrados por pontos fixos; manchas representam células de amostragem, não radar ou resolução local."};
}
export async function loadSpatialIntensity({layer="rain",region="brazil",day=0}={},
 {fetchImpl=fetch,now=()=>new Date().toISOString()}={}){
 const spec=SPATIAL_LAYERS[layer],grid=spatialSampling(layer,region);
 const n=Number(day);
 if(!spec||!grid||!Number.isInteger(n)||n<0||n>2)
   return {ok:false,status:400,error:"Camada, região ou dia inválidos."};
 if(layer==="drought")return {ok:false,status:409,official:true,source:spec.sourceUrl,
  error:"Seca S0–S4 exige polígonos mensais publicados pela ANA. Exiba o mapa oficial; não derive seca da chuva diária."};
 if(layer==="alerts")return {ok:false,status:409,official:true,source:spec.sourceUrl,
  error:"Alertas oficiais precisam de áreas de validade de cada serviço; consultar o INMET por fonte oficial."};
 const url=new URL(spec.api);
 url.searchParams.set("latitude",grid.map(p=>p.lat).join(","));
 url.searchParams.set("longitude",grid.map(p=>p.lng).join(","));
 url.searchParams.set(spec.group,spec.field);
 if(spec.group==="daily")url.searchParams.set("forecast_days","3");
 if(spec.group==="hourly")url.searchParams.set("forecast_hours","1");
 if(layer==="river")url.searchParams.set("forecast_days","3");
 url.searchParams.set("timezone","GMT");
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),10000);
 try{
  const response=await fetchImpl(url.toString(),{method:"GET",headers:{Accept:"application/json"},signal:controller.signal});
  if(!response?.ok)throw Error("HTTP "+String(response?.status||"offline"));
  const parsed=await response.json();
  const report=normalizeSpatialResponse(layer,region,n,parsed,{now});
  return report||{ok:false,status:502,error:"Modelo indisponível ou sem dados numéricos válidos para esta região."};
 }catch{
  return {ok:false,status:503,error:"Não foi possível obter a camada espacial do provedor meteorológico."};
 }finally{clearTimeout(timeout);}
}
export function spatialSummary(report){
 if(!report?.ok)return null;
 const values=report.cells.map(c=>c.value);
 return report.label+" · "+report.region+" · "+report.dataTime+" — "+
  report.sampledCount+"/"+report.totalSamples+" pontos. Intervalo amostrado "+
  format(Math.min(...values))+" a "+format(Math.max(...values))+" "+report.unit+
  ". Fonte "+report.source.name+". "+report.disclaimer;
}
