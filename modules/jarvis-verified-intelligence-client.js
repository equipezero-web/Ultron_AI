import API_CONFIG from "../config.js";
import {validateGeoScenario} from "./jarvis-geospatial-model.js?v=4.96.0";
const ENDPOINT="/api/account/intelligence/execute";
const base=String(API_CONFIG?.backendUrl||"").replace(/\/+$/,"");
const clean=(value,n=220)=>String(value??"").replace(/[\x00-\x1f<>]/g," ").trim().slice(0,n);
const normalize=value=>String(value??"").normalize("NFD")
  .replace(/[\u0300-\u036f]/g,"").toLowerCase();
const isHttps=value=>{try{return new URL(value).protocol==="https:";}catch{return false;}};

/** Explicit operator command; never replaces normal forecast/news routing. */
export function parseVerifiedIntelligenceCommand(value){
  if(typeof value!=="string"||value.length>650)return null;
  const text=value.trim();
  const found=/^(?:(?:jarvis|ultron)[, :]+)?(?:(?:consulte|consultar|execute|executar|mostre|mostrar)\s+)?(?:a\s+)?intelig[eê]ncia verificada\s*:\s*(.+)$/iu.exec(text);
  if(!found)return null;
  const topic=found[1].trim();
  if(topic.length<3||topic.length>480)return null;
  const lowered=normalize(topic);
  const weather=/\b(?:previsao|meteorolog\w*|chuva|tempo|clima)\b/.test(lowered);
  const daysMatch=/\b(?:por|durante)\s+(3|7|16)\s+dias\b/i.exec(topic);
  const days=daysMatch?Number(daysMatch[1]):7;
  let city=null;
  if(weather){
    const withoutDays=topic.replace(/\s+(?:por|durante)\s+(?:3|7|16)\s+dias\b/i,"").trim();
    const cityMatch=/\b(?:em|para)\s+([\p{L}\p{M}\p{N} ,.'’()-]{2,96}?)(?:\s+(?:no|na)\s+(?:globo|mapa))?$/iu.exec(withoutDays);
    city=cityMatch?.[1]?.trim()||null;
  }
  // Rendering is opt-in. A request without a map keyword remains a text/card answer.
  const wantsMap=/\b(?:globo|mapa|visualiz\w*|3d|2d)\b/.test(lowered)&&
    !/\b(?:nao|sem)\s+(?:(?:abra|mostre|exiba|visualize)\s+)?(?:o\s+)?(?:globo|mapa)\b/.test(lowered);
  const view=wantsMap?(/\b(?:globo|3d)\b/.test(lowered)?"3d":"2d"):null;
  return {message:topic,city,days,view};
}
function summarizeStep(step){
  const result=step?.result||{};
  if(step?.status!=="completed")
    return (step?.agent||"especialista")+": "+(step?.status==="unavailable"?"indisponível":step?.status==="blocked"?"bloqueado":"consulta não confirmada");
  if(step.agent==="meteorology"){
    const v=result.current||{},first=result.days?.[0]||{},source=result.source||{};
    const temperature=Number.isFinite(v.temperatureC)?" · "+v.temperatureC+" °C":"";
    const rain=Number.isFinite(first.rainMm)?" · chuva prevista "+first.rainMm+" mm":"";
    return "Meteorologia: "+clean(result.location,130)+temperature+rain+
      " · "+clean(result.days?.length||0,4)+" dias de modelo"+
      " · fonte "+clean(source.name,95)+
      " · consulta "+clean(result.fetchedAt,42)+
      ". É previsão numérica, não alerta oficial.";
  }
  if(step.agent==="news"){
    const items=(result.articles||[]).slice(0,4);
    return "Notícias brasileiras: "+items.map(a=>clean(a.title,130)+" ("+clean(a.source,70)+
      " · "+clean(a.publishedAt,35)+")").join("; ")+".";
  }
  return "Especialista "+clean(step.agent,40)+": resposta não visualizada.";
}
/**
 * Returns a verified visual outcome only after the actual Neural Ring scene
 * reports the expected scenario, mode and source. Never pretend the Worker
 * rendered a map. Cancellation closes only a scene opened by this command.
 */
export async function renderVerifiedWeatherScene(weather,view,{geoController,isCancelled}={}){
  const cancelled=()=>typeof isCancelled==="function"&&isCancelled()===true;
  if(!["2d","3d"].includes(view)||weather?.type!=="forecast-model")
    return {ok:false,reason:"INVALID_VISUAL_REQUEST"};
  if(cancelled())return {ok:false,status:"cancelled",reason:"P0_CANCELLED"};
  const scenario=validateGeoScenario(weather.geoScenario);
  let trusted=false;
  try{
    const source=new URL(weather.source?.url);
    trusted=source.protocol==="https:"&&(source.hostname==="open-meteo.com"||
      source.hostname.endsWith(".open-meteo.com"));
  }catch{}
  if(!scenario||!trusted||!scenario.id.startsWith("weather-global-")||
     scenario.projection!=="world"||scenario.source.url!==weather.source?.url||
     scenario.frames.length!==(weather.days?.length||0)+1||
     scenario.frames[0]?.points[0]?.name!==clean(weather.location,100))
    return {ok:false,reason:"FORECAST_SCENE_NOT_VERIFIED"};
  let geo=geoController||globalThis.window?.ULTRON_GEO_VISUAL;
  if(!geo){
    try{await import("./jarvis-geospatial-visual.js?v=4.96.2");}
    catch{return {ok:false,reason:"GEO_MODULE_NOT_LOADED"};}
    geo=globalThis.window?.ULTRON_GEO_VISUAL;
  }
  if(cancelled())return {ok:false,status:"cancelled",reason:"P0_CANCELLED"};
  if(typeof geo?.open!=="function")return {ok:false,reason:"GEO_MODULE_NOT_LOADED"};
  try{
    const opened=await geo.open({data:scenario,view});
    const state=geo.state;
    const verified=opened?.ok===true&&state?.visible===true&&state.mode===view&&
      state.scenario===scenario.id&&state.source===scenario.source.url&&
      state.frameCount===scenario.frames.length;
    if(cancelled()){
      if(state?.scenario===scenario.id&&state.visible)geo.close?.();
      return {ok:false,status:"cancelled",reason:"P0_CANCELLED"};
    }
    return verified?{ok:true,view,scenario:scenario.id,source:scenario.source.url,
      frameCount:scenario.frames.length}:{ok:false,reason:"NEURAL_SCENE_NOT_CONFIRMED"};
  }catch{return {ok:false,reason:"NEURAL_RENDER_FAILED"};}
}

export async function runVerifiedIntelligenceCommand(intent,{fetchImpl,showAnswer,isCancelled,geoController}={}){
  if(!intent||!base)return {ok:false,route:"verified-intelligence",text:"Backend de inteligência não configurado."};
  const fetcher=fetchImpl||globalThis.fetch;
  const cancelled=()=>typeof isCancelled==="function"&&isCancelled()===true;
  let response,data;
  try{
    response=await fetcher(base+ENDPOINT,{
      method:"POST",credentials:"include",mode:"cors",cache:"no-store",redirect:"error",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({message:intent.message,...(intent.city?{city:intent.city}:{}),days:intent.days})
    });
    data=await response.json();
  }catch{
    return {ok:false,route:"verified-intelligence",text:"INTELIGÊNCIA VERIFICADA // rede ou login Cloudflare Access indisponível. Não foi possível confirmar a consulta."};
  }
  if(cancelled())return {ok:false,status:"cancelled",route:"verified-intelligence",text:"Consulta interrompida.",displayed:false};
  if(!response.ok&&data?.ok!==true&&data?.partial!==true){
    return {ok:false,route:"verified-intelligence",text:"INTELIGÊNCIA VERIFICADA // "+
      clean(data?.error||"consulta não autorizada ou indisponível",170)+
      ". O sistema não presumiu nenhuma execução."};
  }
  if(!data||!Array.isArray(data.steps)){
    return {ok:false,route:"verified-intelligence",text:"INTELIGÊNCIA VERIFICADA // resposta inválida do backend, sem dados confirmados."};
  }
  const steps=data.steps.filter(s=>["meteorology","news","visual"].includes(s?.agent));
  const weather=steps.find(s=>s.agent==="meteorology"&&s.status==="completed");
  const wantsGeo=Boolean(intent.view&&steps.some(s=>s.agent==="visual"));
  let geoOutcome=null;
  if(wantsGeo&&weather){
    geoOutcome=await renderVerifiedWeatherScene(weather.result,intent.view,
      {geoController,isCancelled:cancelled});
  }
  if(cancelled()||geoOutcome?.status==="cancelled")
    return {ok:false,status:"cancelled",route:"verified-intelligence",text:"Consulta interrompida.",displayed:false};
  const geoVerified=geoOutcome?.ok===true;
  const summary="INTELIGÊNCIA VERIFICADA // "+steps.filter(s=>s.agent!=="visual")
    .map(summarizeStep).join("\n");
  const visualLine=wantsGeo?(geoVerified?
    "\nVisualização "+intent.view.toUpperCase()+" confirmada no Neural Ring · "+
      geoOutcome.frameCount+" quadros · fonte "+clean(geoOutcome.source,120)+". A previsão é modelada, não alerta oficial.":
    "\nMapa não confirmado: "+clean(geoOutcome?.reason||"dados meteorológicos sem cena validada",110)+
      ". Nenhuma renderização foi declarada concluída."):
    (data.rendered===false&&steps.some(s=>s.agent==="visual")?
      "\nGlobo 3D: nenhuma renderização foi solicitada neste comando.":"");
  const text=summary+visualLine;
  const cards=steps.filter(s=>s.agent==="news"&&s.status==="completed")
    .flatMap(s=>Array.isArray(s?.result?.articles)?s.result.articles:[])
    .filter(a=>isHttps(a.url)&&a.title).slice(0,5)
    .map(a=>({title:clean(a.title,190),description:clean(a.description,260),
      source:clean(a.source,100),publishedAt:a.publishedAt,url:a.url,image:isHttps(a.image)?a.image:null}));
  const show=showAnswer||(()=>globalThis.window?.ULTRON_NEURAL_ANSWER?.show);
  let displayed=geoVerified;
  // A geospatial scene owns the Neural Ring. Calling show() over it would
  // replace the map, so text/news also remains in the existing terminal log.
  if(!geoVerified){
    try{
      const fn=show();
      if(typeof fn==="function"){
        fn(text,cards.length?{visual:{mode:"news",cards}}:{});
        displayed=true;
      }
    }catch{}
  }
  const readOk=steps.some(s=>s.status==="completed");
  const incomplete=steps.some(s=>s.status!=="completed"&&!(s.agent==="visual"&&geoVerified));
  return {ok:readOk&&(!wantsGeo||geoVerified),partial:incomplete,
    route:"verified-intelligence",text:text+(displayed?"":"\nPainel Neural Ring indisponível para exibir o resultado."),
    displayed,renderedInMap:geoVerified,renderedInGlobe:geoVerified&&intent.view==="3d",
    voiceEnabled:false};
}
