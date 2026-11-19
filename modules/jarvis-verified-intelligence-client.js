import API_CONFIG from "../config.js";
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
    const cityMatch=/\b(?:em|para)\s+([\p{L}\p{M}\p{N} ,.'’()-]{2,96})(?:\s+(?:no|na)\s+(?:globo|mapa))?$/iu.exec(withoutDays);
    city=cityMatch?.[1]?.trim()||null;
  }
  return {message:topic,city,days};
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
export async function runVerifiedIntelligenceCommand(intent,{fetchImpl,showAnswer,isCancelled}={}){
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
  if(!data||!Array.isArray(data.steps)){
    return {ok:false,route:"verified-intelligence",text:"INTELIGÊNCIA VERIFICADA // resposta inválida do backend, sem dados confirmados."};
  }
  if(!response.ok&&data.ok!==true&&data.partial!==true){
    return {ok:false,route:"verified-intelligence",text:"INTELIGÊNCIA VERIFICADA // "+
      clean(data.error||"consulta não autorizada ou indisponível",170)+
      ". O sistema não presumiu nenhuma execução."};
  }
  const steps=data.steps.filter(s=>["meteorology","news","visual"].includes(s?.agent));
  const text="INTELIGÊNCIA VERIFICADA // "+steps.map(summarizeStep).join("\n")+
    (data.rendered===false?"\nGlobo 3D: nenhuma renderização no mapa foi confirmada pelo backend.":"");
  const cards=steps.filter(s=>s.agent==="news"&&s.status==="completed")
    .flatMap(s=>Array.isArray(s?.result?.articles)?s.result.articles:[])
    .filter(a=>isHttps(a.url)&&a.title).slice(0,5)
    .map(a=>({title:clean(a.title,190),description:clean(a.description,260),
      source:clean(a.source,100),publishedAt:a.publishedAt,url:a.url,image:isHttps(a.image)?a.image:null}));
  if(cancelled())return {ok:false,status:"cancelled",route:"verified-intelligence",text:"Consulta interrompida.",displayed:false};
  const show=showAnswer||(()=>globalThis.window?.ULTRON_NEURAL_ANSWER?.show);
  let displayed=false;
  try{
    const fn=show();
    if(typeof fn==="function"){
      fn(text,cards.length?{visual:{mode:"news",cards}}:{});
      displayed=true;
    }
  }catch{}
  const verified=steps.some(s=>s.status==="completed");
  return {ok:verified,partial:data.partial===true,route:"verified-intelligence",
    text:text+(displayed?"":"\nPainel Neural Ring indisponível para exibir o resultado."),
    displayed,renderedInGlobe:false,voiceEnabled:false};
}
