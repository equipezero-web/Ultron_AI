// Official sources are kept distinct: radar/satellite (remote viewers),
// observed rain gauges (APAC), and numerical predictions (Open-Meteo).
export const METEO_VIEWERS=Object.freeze({
 radar:{title:"Radar INPE · SIGMA",url:"https://sigma.cptec.inpe.br/radar/",
   type:"radar",description:"Refletividade observada (dBZ) onde houver cobertura; o horário é controlado pelo INPE."},
 satellite:{title:"Satélite GOES-19 · INPE",url:"https://www.cptec.inpe.br/dsat/",
   type:"satellite",description:"Imagens de satélite; nuvens não equivalem a precipitação medida."},
 inmet:{title:"INMET · mapas oficiais",url:"https://mapas.inmet.gov.br/",
   type:"radar-and-weather",description:"Selecione Radar, Satélite ou Avisos no visualizador do INMET."},
 apac:{title:"APAC · estações em Pernambuco",
   url:"https://geoportal.apac.pe.gov.br/server/rest/services/met_monitoramento_chuvas_pe/MapServer",
   type:"gauge-observations",description:"Acumulado pluviométrico observado por estação; NÃO é radar nem El Niño."},
 forecast:{title:"Open-Meteo · previsão numérica",url:"https://open-meteo.com/en/docs",
   type:"forecast",description:"Previsão de modelo, independente das leituras de radar e pluviômetros."}
});
export const APAC_HOURS=Object.freeze({1:0,3:1,6:2,12:3,24:4,48:5,72:6});
const valueField=Object.freeze({1:"hora_1",3:"horas_3",6:"horas_6",12:"horas_12",24:"horas_24",48:"horas_48",72:"horas_72"});
const clean=(v,n=90)=>String(v??"").replace(/[<>\r\n]/g," ").trim().slice(0,n);
export function parseMeteoIntent(command){
  const q=String(command||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase()
    .replace(/^(?:jarvis|ultron)[, :!?]+/,"").replace(/[.!?]+$/,"").trim();
  if(/^(?:nao|nunca|como |se |e se |por que|porque|o que|qual |quais )/.test(q))return null;
  const trigger=/^(?:por favor )?(?:me )?(?:mostre|mostra|mostrar|abra|abrir|ative|ativar|acesse|acessar|exiba|exibir|visualize|visualizar|acompanhe|acompanhar|compare|comparar|quero ver|quero acompanhar)\b/;
  if(!trigger.test(q))return null;
  if(/\b(?:central meteorologica|centro meteorologico|painel meteorologico)\b/.test(q))return {tab:"radar",view:"2d"};
  if(/\b(?:apac|pernambuco)\b/.test(q)&&/\b(?:chuva|precipitacao|monitoramento|estacoes|acumulado|radar)\b/.test(q))return {tab:"apac",view:/\b3d\b/.test(q)?"3d":"2d"};
  if(/\binmet\b/.test(q))return {tab:"inmet",view:"2d"};
  if(/\b(?:satelite|goes|nuvens)\b/.test(q))return {tab:"satellite",view:"2d"};
  if(/\b(?:radar|chuvas? em tempo real|chuva observada)\b/.test(q))return {tab:"radar",view:"2d"};
  return null;
}
export function apacColor(mm){
  if(mm<2)return "#76b7dd";
  if(mm<10)return "#46bb8e";
  if(mm<30)return "#e3cd5e";
  if(mm<50)return "#eda053";
  if(mm<100)return "#e56b58";
  return "#ba54a9";
}
export function normalizeApacResponse(raw,{hours=24,checkedAt=new Date().toISOString()}={}){
  const field=valueField[hours];
  if(!field||!Array.isArray(raw?.features))return null;
  const stations=[];
  for(const row of raw.features.slice(0,500)){
    const a=row?.attributes||{},g=row?.geometry||{};
    const lat=Number(a.latitude??g.y),lng=Number(a.longitude??g.x),mm=a[field];
    if(typeof mm!=="number"||!Number.isFinite(mm)||mm<0||mm>2000||
       !Number.isFinite(lat)||!Number.isFinite(lng)||lat< -13||lat> -2||lng< -47||lng> -30)continue;
    stations.push({id:String(a.objectid??stations.length),name:clean(a.nome||a.municipio||"Estação"),
      city:clean(a.municipio||""),lat,lng,value:mm,color:apacColor(mm),
      lastReading:clean(a.ultima_leitura_data_hora||a.ultima_leitura||"Horário não informado",60)});
  }
  if(!stations.length)return null;
  return {ok:true,type:"observed-rain-gauges",hours,count:stations.length,checkedAt,
    source:METEO_VIEWERS.apac.url,stations,
    warning:"Acumulado observado por pluviômetros. Cobertura e horários variam por estação. Não é radar, previsão nem medida direta do El Niño."};
}
export async function loadApacObservations({hours=24,fetchImpl=fetch}={}){
  const layer=APAC_HOURS[hours],field=valueField[hours];
  if(layer===undefined)return {ok:false,error:"Janela de horas inválida."};
  const url=new URL(METEO_VIEWERS.apac.url+"/"+layer+"/query");
  for(const [key,val] of Object.entries({
    where:"1=1",outFields:["objectid","nome","municipio","latitude","longitude","ultima_leitura_data_hora",field].join(","),
    returnGeometry:"true",outSR:"4326",resultRecordCount:"500",f:"json"
  }))url.searchParams.set(key,val);
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),11000);
  try{
    const response=await fetchImpl(url.toString(),{headers:{Accept:"application/json"},signal:controller.signal,cache:"no-store"});
    if(!response.ok)throw Error("HTTP "+response.status);
    const payload=await response.json();
    if(payload?.error)throw Error("APAC: serviço de dados indisponível.");
    const report=normalizeApacResponse(payload,{hours});
    return report||{ok:false,error:"APAC sem leituras numéricas válidas para este período.",source:METEO_VIEWERS.apac.url};
  }catch(error){return {ok:false,error:"Não foi possível consultar diretamente a APAC: "+String(error?.message||error).slice(0,90),
    source:METEO_VIEWERS.apac.url};}
  finally{clearTimeout(timer);}
}
