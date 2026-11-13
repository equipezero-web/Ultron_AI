import {TASK_CONTEXT} from "./jarvis-task-context.js?v=4.69.0";
import {WEATHER_CITIES,weatherCity,weatherGeoScenario,weatherSummary} from "./jarvis-weather-model.js?v=4.82.0";
import {globalWeatherScenario,globalWeatherSummary} from "./jarvis-global-weather.js?v=4.82.0";
import {loadGlobalWeather} from "../backend/weather-global.js?v=4.74.0";
import {loadLiveWeather} from "../backend/weather-live.js?v=4.80.0";
import {worldGeoIntent} from "./jarvis-world-intent.js?v=4.95.0";
import {japanTsunamiIntent} from "./jarvis-tsunami-simulation.js?v=4.96.0";
import {loadWorldGeo} from "./jarvis-world-geodata.js?v=4.95.0";
import {loadSpatialIntensity,SPATIAL_LAYERS} from "./jarvis-spatial-intensity.js?v=4.90.0";
import {validateGeoScenario} from "./jarvis-geospatial-model.js?v=4.96.0";
import {loadWeatherInsight} from "../backend/weather-intelligence.js?v=4.75.0";
import {insightSummary,insightScenario,monitorSummary} from "./jarvis-weather-insight-model.js?v=4.75.0";
import {classifyOperatorTurn} from "./jarvis-intent-engine.js?v=4.69.0";
import API_CONFIG from "../config.js";
import {validatePlan,isActionRequest} from "../backend/action-catalog.js?v=4.75.0";
import {normalizeCommand} from "./jarvis-local-commands.js?v=5.10.0";
const W=()=>window;
const action=(action,args={})=>({action,args});
export function directPlan(message){
 const followup=TASK_CONTEXT?.resolve(message);
 if(followup?.kind==="contextual-action"&&followup.command){
   return {steps:[action("earth.locate",{place:followup.region})],contextual:true};
 }
 const q=normalizeCommand(message).replace(/[.!?]+$/,"").trim();
 // Scientific visualizations require a known, cited dataset. Bare model
 // guesses must never become mapped "risk scores".
 const currentGeo=typeof window!=="undefined"?window.ULTRON_GEO_VISUAL?.state:null;
 const tsunami=japanTsunamiIntent(q);
 if(tsunami)return {steps:[action(tsunami.action,tsunami.args),action("geo.play")]};
 const enso=/(?:el nino|elnino|enos|enso)/.test(q);
 const worldwide=!enso?worldGeoIntent(q):null;
 if(worldwide)return {steps:[action(worldwide.action,worldwide.args)]};
 const geoRequested=/\b(?:globo|mapa|visualizacao|visualize|visualizar|destaque|marque|pinte|mostre|mostra|simulacao|simule|simular|crie|gere)\b/.test(q);
 const actionPrefix=/^(?:por favor |pode |consegue |me |agora )*(?:mostre|mostra|mostrar|exiba|abra|abrir|crie|gere|gerar|simule|simular|visualize|visualizar|destaque|marque|analise|investigue|pesquise|apresente)\b/.test(q);
 if(enso&&geoRequested&&actionPrefix){
   const first=action("geo.show",{scenario:"enso",view:/\b(?:2d|mapa plano|mapa bidimensional)\b/.test(q)?"2d":"3d"});
   // Two explicitly requested operations remain ordered; no arbitrary model actions.
   const tail=q.match(/\b(?:e depois|em seguida)\s+(?:mostre|destaque|filtre)(?: apenas| so| somente)?\s+(?:as |os )?(?:regioes? )?(?:com |de )?(mais chuva|chuva acima|menos chuva|chuva abaixo|seca|calor)\b/);
   if(tail){
     const kind=/calor/.test(tail[1])?"heat":/mais chuva|chuva acima/.test(tail[1])?"wet":"dry";
     return {steps:[first,action("geo.filter",{kind})]};
   }
   return {steps:[first]};
 }
 // Each scientific layer is a distinct data source. Avoid defaulting all questions to the forecast.
 if(actionPrefix&&/\b(?:monitoramento meteorologico|monitoramento do clima|boletim de monitoramento|monitoramento mundial|monitoramento 24h)\b/.test(q)){
   return {steps:[action("weather.monitor")]};
 }
 if(actionPrefix){
   const type=/\b(?:qualidade do ar|poluicao|pm2[.,]?5|aqi)\b/.test(q)?"air":
     /\b(?:historico|historia climatica|dados historicos|reanalise)\b/.test(q)?"history":
     /\b(?:oceanos?|oceanografia|ondas do mar|correntes oceanicas|temperatura do mar|mare)\b/.test(q)?"marine":
     /\b(?:vazao|cheias|rios?|enchentes|inundacoes|inundacao)\b/.test(q)?"flood":
     /\b(?:ensemble|ensembles|incerteza|incertezas|comparacao de modelos|faixa dos modelos)\b/.test(q)?"ensemble":
     /\b(?:alertas? oficiais?|avisos? meteorologicos|avisos? de tempo|avisos? oficiais)\b/.test(q)?"alerts":null;
   if(type){
     const y=q.match(/\b(19[4-9]\d|20\d{2})\b/),m=q.match(/\bmes\s+(\d{1,2})\b/);
     const target=q.match(/\b(?:em|para|na cidade de|no municipio de)\s+([\p{L}\p{M}\p{N} .,'’()-]{2,96}?)(?=\s+(?:no|na|pelo)\s+(?:globo|mapa)|\s+\b(?:em\s+)?(?:2d|3d)\b|$)/u);
     const city=target?.[1]?.trim();
     if(city){
       const args={type,city,view:/\b(?:globo|3d)\b/.test(q)?"3d":"2d"};
       if(type==="history"&&y)args.year=Number(y[1]);
       if(type==="history"&&m)args.month=Number(m[1]);
       return {steps:[action("weather.insight",args)]};
     }
   }
 }
 const weatherTerms=/\b(?:previsao(?: do tempo)?|tempo|clima|chuva|meteorologia|meteorologica|temperatura|vento)\b/.test(q);
 if(!enso&&weatherTerms&&actionPrefix){
   const requestedDays=/\b(?:16|dezesseis)\s+dias\b|\bduas semanas\b/.test(q)?16:
     /\b(?:7|sete)\s+dias\b|\buma semana\b/.test(q)?7:3;
   const cityRequest=q.match(/\b(?:tempo|clima|chuva|temperatura|vento|meteorologia|meteorologica)\b(?:\s+(?:atual|prevista|de hoje))?\s+(?:em|de|para|no|na)\s+(.+?)(?=\s+(?:no|na|pelo)\s+(?:mapa|globo)|\s+(?:em\s+)?(?:2d|3d)\b|$)/);
   const rawCity=cityRequest?.[1]?.replace(/\s+(?:por|durante|para)\s+(?:3|7|16)\s+dias.*$/,"")
     .replace(/\s+(?:nos|pelos)\s+proximos\s+(?:3|7|16)\s+dias.*$/,"").trim();
   const city=rawCity?weatherCity(rawCity):null;
   const view=/\b(?:globo|3d)\b/.test(q)?"3d":"2d";
   if(city&&requestedDays===3)return {steps:[action("weather.show",{city:city.key,view})]};
   if(rawCity)return {steps:[action("weather.global",{city:rawCity,view,days:requestedDays===3?7:requestedDays})]};
   if(/\b(?:previsao do tempo|no globo|no mapa|mapa|globo)\b/.test(q)){
     return {steps:[action("weather.show",{city:WEATHER_CITIES.recife.key,view})]};
   }
 }
 if(currentGeo?.visible){
   if(/^(?:agora |entao |me |por favor )*(?:mostre|abra|mude|troque|altere|passe|volte|visualize|exiba|ir)\b.*\b(?:2d|mapa plano)\b/.test(q)){
     return {steps:[action("geo.view2d")]};
   }
   if(/^(?:agora |entao |me |por favor )*(?:mostre|abra|mude|troque|altere|passe|volte|visualize|exiba|ir)\b.*\b(?:3d|globo)\b/.test(q)){
     return {steps:[action("geo.view3d")]};
   }
   if(/^(?:pause|pausar|pare|parar|interrompa|congele)(?: a| o)?(?: simulacao| animacao| visualizacao)?$/.test(q))return {steps:[action("geo.pause")]};
   if(/^(?:reproduza|reproduzir|continue|retome|inicie|anime|animar)(?: a| o)?(?: simulacao| animacao| visualizacao)?$/.test(q))return {steps:[action("geo.play")]};
   if(/^(?:proximo quadro|avance o quadro|proximo periodo|avance a linha do tempo)$/.test(q))return {steps:[action("geo.next")]};
   if(/^(?:quadro anterior|periodo anterior|volte o quadro)$/.test(q))return {steps:[action("geo.previous")]};
   if(/^(?:feche|fechar|oculte|esconda|desative)(?: o| a)?(?: mapa de impactos| camada climatica| visualizacao geográfica| visualizacao geografica| simulacao| visualizacao 2d| mapa 2d)$/.test(q))return {steps:[action("geo.close")]};
   const kind=/^(?:mostre|destaque|filtre|mostra)(?: apenas| so| somente)? (?:as |os )?(?:regioes? (?:com|de) )?(?:seca|menos chuva|chuva abaixo|chuva acima|mais chuva|calor)(?: no mapa| no globo)?$/.exec(q);
   if(kind)return {steps:[action("geo.filter",{kind:/seca|menos chuva|chuva abaixo/.test(q)?"dry":/mais chuva|chuva acima/.test(q)?"wet":"heat"})]};
 }

 const s=q.replace(/^(?:pode |consegue |quero |me )+/,"");
 const rules=[
  [/^(?:feche|fechar|oculte|esconda) (?:a |o )?(?:resposta|painel de respostas)(?: do neural ring)?$/, "answer.close"],
  [/^(?:abra|abrir|ative|ativar|mostre|exiba) (?:o )?(?:globo|globo terrestre|mapa|google earth)$/, "earth.open"],
  [/^(?:feche|fechar|desative|desativar) (?:o )?(?:globo|mapa|globo terrestre)$/, "earth.close"],
  [/^(?:volte|retorne) (?:ao|para o) (?:neural ring|anel neural|anel)$/, "earth.close"],
  [/^(?:centralize|resete|reinicie|resetar) (?:o |a )?(?:anel|neural ring|anel neural|esfera)(?: 3d)?$/, "ring.reset"],
  [/^(?:atualize|atualizar|consulte|traga) (?:as |o )?(?:noticias|boletim|boletim de noticias)(?: de hoje)?$/, "news.refresh"],
  [/^(?:liste|mostre|consulte|verifique) (?:os |meus )?dispositivos(?: pareados| conectados)?$/, "devices.list"],
  [/^(?:liste|mostre|consulte) (?:os |meus )?arquivos(?: locais)?$/, "files.list"],
  [/^(?:verifique|consulte|mostre) (?:o )?(?:status|estado|diagnostico) do sistema$/, "system.status"],
  [/^(?:verifique|consulte|diagnostique) (?:a |o )?(?:memoria|estado da memoria|saude da memoria)$/, "memory.health"],
  [/^(?:verifique|execute|rode|atualize) (?:o )?(?:parity check|paritycheck|diagnostico neural)$/, "parity.check"]
 ];
 for(const [pattern,name] of rules)if(pattern.test(s))return {steps:[action(name)]};
 const place=s.match(/^(?:localize|encontre|ache|mostre) (.+?) (?:no|pelo) (?:globo|mapa)(?: terrestre)?$/);
 if(place)return {steps:[action("earth.locate",{place:place[1]})]};
 const zoom=s.match(/^(aproxime|afaste|aumente o zoom do|diminua o zoom do) (?:o )?(?:anel|neural ring|anel neural)$/);
 if(zoom)return {steps:[action("ring.zoom",{direction:/^(aproxime|aumente)/.test(zoom[1])?"in":"out"})]};
 return null;
}
function requireApi(api,method){if(typeof api?.[method]!=="function")throw Error("Módulo indisponível: "+method);return api;}
function publish(text,visual=null){
 const id=W().__ultronQuestionSequence=(Number(W().__ultronQuestionSequence)||0)+1;
 W().dispatchEvent(new CustomEvent("ultron:question-start",{detail:{id}}));
 W().dispatchEvent(new CustomEvent("ultron:answer",{detail:{id,text,visualContext:visual,webResearch:{requested:false,sources:[]}}}));
}
async function executeStep(step,original){
 const w=W(),a=step.args,answer=w.ULTRON_NEURAL_ANSWER;
 switch(step.action){
 case "geo.global":{
   const endpoint=String(API_CONFIG.backendUrl||"").replace(/\/$/,"")+
     "/api/geo/world?topic="+encodeURIComponent(a.topic)+"&region="+encodeURIComponent(a.region);
   let report=null;
   const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),11500);
   try{
     const res=await fetch(endpoint,{headers:{Accept:"application/json"},signal:controller.signal,cache:"no-store"});
     const body=await res.json();
     if(res.ok&&body?.ok)report=body;
   }catch{}finally{clearTimeout(timer);}
   if(!report)report=await loadWorldGeo({topic:a.topic,region:a.region});
   if(!report?.ok)throw Error(report?.error||"Não há dados geográficos confirmados para esse tema ou período.");
   const data=validateGeoScenario(report.dataset);
   if(!data?.theme||data.theme.topic!==a.topic||data.projection!==(a.region==="world"?"world":"brazil"))
     throw Error("Fonte mundial não forneceu uma visualização geográfica validada");
   if(!w.ULTRON_GEO_VISUAL)await import("./jarvis-geospatial-visual.js?v=4.96.0");
   const geo=requireApi(w.ULTRON_GEO_VISUAL,"open");
   const result=await geo.open({data,view:a.view});
   if(!result?.ok||!geo.state.visible||geo.state.scenario!==data.id||geo.state.mode!==a.view)
     throw Error(result?.error||"O mapa mundial não pôde ser confirmado");
   const meaning=a.topic==="earthquakes"?"Cor = magnitude do sismo, não intensidade sentida.":
     ["population","gdp","co2"].includes(a.topic)?"Cores = indicador anual por país, com ano e fonte.":"Cores = categoria de evento; a fonte não publicou intensidade comparável.";
   return {text:data.title+" exibido em "+a.view.toUpperCase()+" · "+
     report.recordCount+" localizações georreferenciadas · "+data.source.basePeriod+
     ". Fonte: "+data.source.name+". "+meaning,verified:true};
 }
 case "geo.spatial":{
   const endpoint=String(API_CONFIG.backendUrl||"").replace(/\/$/,"")+
     "/api/geo/intensity?layer="+encodeURIComponent(a.layer)+
     "&region="+encodeURIComponent(a.region)+"&day=0";
   const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),11500);
   let report=null;
   try{
     const res=await fetch(endpoint,{headers:{Accept:"application/json"},signal:controller.signal,cache:"no-store"});
     const body=await res.json();
     if(res.ok&&body?.ok)report=body;
   }catch{}finally{clearTimeout(timer);}
   if(!report)report=await loadSpatialIntensity({layer:a.layer,region:a.region,day:0});
   if(!report?.ok||report.layer!==a.layer||report.region!==a.region||
     !Array.isArray(report.cells)||!report.cells.length)throw Error(report?.error||"Camada numérica indisponível");
   const spec=SPATIAL_LAYERS[a.layer],first=report.cells[0];
   const source={name:spec.source,url:spec.sourceUrl,
     basePeriod:report.dataTime||"Período não informado",
     disclaimer:report.disclaimer||"Amostras de modelos meteorológicos, não medição por bairro."};
   // A single model cell is a grounded locator; the FULL colored grid comes
   // from the separately validated report, not from a synthetic heat map.
   const data={id:"spatial-"+a.layer+"-"+a.region,title:spec.label+" — "+(a.region==="world"?"Mundo":"Brasil"),
    projection:a.region,source,
    frames:[{id:"latest",name:report.dataTime||"Amostra",type:"grade numérica amostrada",
      kind:["rain","temp"].includes(a.layer)?"short-term-forecast":"current-estimate",description:source.disclaimer,
      points:[{id:first.id,name:"Amostra geográfica",lat:first.lat,lng:first.lng,
        kind:a.layer==="air"?"air":a.layer==="marine"?"marine":a.layer==="river"?"river":"weather",
        detail:"Valor no centro amostrado: "+first.value+" "+report.unit+" · "+first.time,
        source:spec.sourceUrl}]}]};
   const validated=validateGeoScenario(data);
   if(!validated)throw Error("Não foi possível validar as amostras geográficas.");
   if(!w.ULTRON_GEO_VISUAL)await import("./jarvis-geospatial-visual.js?v=4.96.0");
   const geo=requireApi(w.ULTRON_GEO_VISUAL,"open");
   const result=await geo.open({data:validated,view:a.view,initialLayer:a.layer,initialIntensity:report});
   if(!result?.ok||geo.state.gridCount<1||geo.state.mode!==a.view)
     throw Error(result?.error||"Mapa colorido não foi confirmado.");
   return {text:spec.label+" · "+(a.region==="world"?"Mundo":"Brasil")+
    " · "+report.sampledCount+" células coloridas por valores do modelo, "+
    report.dataTime+". "+report.disclaimer,verified:true};
 }
 case "weather.monitor":{
   const endpoint=String(API_CONFIG.backendUrl||"").replace(/\/$/,"")+"/api/geo/monitor";
   const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
   let report;
   try{
     const res=await fetch(endpoint,{headers:{Accept:"application/json"},signal:controller.signal,cache:"no-store"});
     report=await res.json();
     if(!res.ok||!report?.ok)throw Error(report?.error||"Monitoramento persistente indisponível");
   }finally{clearTimeout(timer);}
   const summary=monitorSummary(report);
   if(!summary)throw Error("Monitoramento ainda não possui resposta válida");
   publish(summary);
   return {text:summary,verified:true};
 }
 case "weather.insight":{
   const url=new URL(String(API_CONFIG.backendUrl||"").replace(/\/$/,"")+"/api/geo/insight");
   url.searchParams.set("type",a.type);url.searchParams.set("city",a.city);
   if(a.year)url.searchParams.set("year",String(a.year));
   if(a.month)url.searchParams.set("month",String(a.month));
   const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),11000);
   let report=null;
   try{
     const res=await fetch(url.toString(),{headers:{Accept:"application/json"},signal:controller.signal,cache:"no-store"});
     const body=await res.json();
     if(res.ok&&body?.ok)report=body;
   }catch{}
   finally{clearTimeout(timer);}
   // Sources are public and host-restricted. Browser-only access may be blocked by CORS,
   // in which case the action reports the error rather than inventing measurements.
   if(!report){
     report=await loadWeatherInsight({type:a.type,city:a.city,year:a.year,month:a.month});
   }
   if(!report?.ok||report.type!==a.type)throw Error(report?.error||"Não foi possível confirmar dados desta fonte");
   const summary=insightSummary(report);
   if(!summary)throw Error("Dados de inteligência meteorológica incompletos");
   if(a.type==="alerts"){
     const cards=(report.bulletins||[]).map(x=>({title:x.title,url:x.url,
       description:x.source+" — "+x.severity+" — "+(x.areas?.join?.(", ")||x.areas||"")+" — "+(x.expiresAt||"validade não informada")}));
     publish(summary,cards.length?{mode:"news",introduction:"Avisos publicados pela autoridade oficial; verifique a fonte, a área e a validade.",cards}:null);
     return {text:summary,verified:true};
   }
   const data=insightScenario(report);
   if(!data)throw Error("A fonte não forneceu séries geográficas utilizáveis");
   if(!w.ULTRON_GEO_VISUAL)await import("./jarvis-geospatial-visual.js?v=4.96.0");
   const geo=requireApi(w.ULTRON_GEO_VISUAL,"open");
   const result=await geo.open({data,view:a.view});
   if(!result?.ok||geo.state?.scenario!==data.id||geo.state?.mode!==a.view)
     throw Error(result?.error||"O painel de análise não pôde ser confirmado");
   return {text:summary,verified:true};
 }
 case "weather.global":{
   const endpoint=String(API_CONFIG.backendUrl||"").replace(/\/$/,"")+
     "/api/geo/global?city="+encodeURIComponent(a.city)+"&days="+encodeURIComponent(a.days);
   const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
   let report=null,proxyError=null;
   try{
     const response=await fetch(endpoint,{headers:{Accept:"application/json"},signal:controller.signal,cache:"no-store"});
     const body=await response.json();
     if(!response.ok||!body?.ok)throw Error(body?.error||"Backend meteorológico indisponível");
     report=body;
   }catch(error){proxyError=error;}
   finally{clearTimeout(timer);}
   // Safe no-key browser fallback: same fixed Open-Meteo hosts, never user-supplied coordinates.
   if(!report?.ok){
     report=await loadGlobalWeather({query:a.city,days:a.days});
     if(!report?.ok)throw Error(report?.error||proxyError?.message||"Previsão mundial indisponível");
   }
   if(report.kind!=="global-short-term-forecast"||!Array.isArray(report.days)||report.days.length<2||report.days.length>a.days||
      (report.requestedDays!==undefined&&report.requestedDays!==a.days)||
      !report.location?.key?.startsWith("global-")||!report.source?.url?.includes("open-meteo.com"))
      throw Error("A previsão mundial retornada não foi validada");
   const data=globalWeatherScenario(report),summary=globalWeatherSummary(report);
   if(!data||!summary)throw Error("Não foi possível construir a visualização mundial");
   if(!w.ULTRON_GEO_VISUAL)await import("./jarvis-geospatial-visual.js?v=4.96.0");
   const geo=requireApi(w.ULTRON_GEO_VISUAL,"open");
   const result=await geo.open({data,view:a.view});
   if(!result?.ok||!geo.state.visible||geo.state.scenario!==data.id||geo.state.mode!==a.view)
     throw Error(result?.error||"Não foi possível verificar o mapa mundial");
   return {text:summary,verified:true};
 }
 case "weather.show":{
   const endpoint=String(API_CONFIG.backendUrl||"").replace(/\/$/,"")+
     "/api/geo/weather?city="+encodeURIComponent(a.city);
   const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);
   let payload=null,serverError=null;
   try{
     const response=await fetch(endpoint,{headers:{Accept:"application/json"},signal:controller.signal,cache:"no-store"});
     const body=await response.json();
     if(!response.ok||!body?.ok)throw Error(body?.error||"Backend meteorológico não respondeu");
     payload=body;
   }catch(error){serverError=error;}
   finally{clearTimeout(timer);}
   // The worldwide module already has direct Open-Meteo recovery; give the
   // 11 Brazilian capitals the same safe no-key, fixed-coordinate fallback.
   if(!payload?.ok){
     let recovery;
     try{recovery=await loadLiveWeather(a.city);}
     catch(error){throw Error("Não foi possível obter previsão confirmada para esta cidade. Verifique a conexão e tente novamente.");}
     if(!recovery?.ok)throw Error(recovery?.error||
       serverError?.message||"As fontes de previsão estão temporariamente indisponíveis.");
     payload=recovery;
   }
   if(payload.city?.key!==a.city||!Array.isArray(payload.days)||payload.days.length<1)
     throw Error("Dados meteorológicos inconsistentes");
   const dataset=weatherGeoScenario(payload),summary=weatherSummary(payload);
   if(!dataset||!summary)throw Error("Previsão inválida; nenhuma simulação será apresentada");
   if(!w.ULTRON_GEO_VISUAL)await import("./jarvis-geospatial-visual.js?v=4.96.0");
   const geo=requireApi(w.ULTRON_GEO_VISUAL,"open");
   const result=await geo.open({data:dataset,view:a.view});
   if(!result?.ok||!geo.state.visible||geo.state.scenario!==dataset.id||geo.state.mode!==a.view)
     throw Error(result?.error||"Mapa não foi confirmado");
   return {text:summary,verified:true};
 }
 case "geo.show":case "geo.view2d":case "geo.view3d":case "geo.play":case "geo.pause":case "geo.next":case "geo.previous":case "geo.filter":case "geo.close":{
   if(!w.ULTRON_GEO_VISUAL)await import("./jarvis-geospatial-visual.js?v=4.96.0");
   const geo=w.ULTRON_GEO_VISUAL;
   if(!geo)throw Error("Motor de visualização geográfica indisponível");
   let result;
   switch(step.action){
    case "geo.show":result=await geo.open({scenario:a.scenario,view:a.view});break;
    case "geo.view2d":result=await geo.setMode("2d");break;
    case "geo.view3d":result=await geo.setMode("3d");break;
    case "geo.play":result=geo.play();break;
    case "geo.pause":result=geo.pause();break;
    case "geo.next":result=geo.setFrame((geo.state.frame+1)%Math.max(1,geo.state.frameCount||3));break;
    case "geo.previous":result=geo.setFrame((geo.state.frame+Math.max(1,geo.state.frameCount||3)-1)%Math.max(1,geo.state.frameCount||3));break;
    case "geo.filter":result=geo.applyFilter(a.kind);break;
    case "geo.close":result=geo.close();break;
   }
   if(!result?.ok)throw Error(result?.error||"Não foi possível atualizar visualização");
   const state=geo.state;
   const verified=step.action==="geo.close"?!state.visible:
     step.action==="geo.pause"?!state.playing:
     step.action==="geo.play"?state.playing:
     step.action==="geo.view2d"?state.mode==="2d":
     step.action==="geo.view3d"?state.mode==="3d":
     step.action==="geo.filter"?state.filter===a.kind:
     step.action==="geo.show"?state.visible&&state.scenario===a.scenario&&state.mode===a.view:
     Number.isInteger(state.frame);
   if(!verified)throw Error("Não foi possível verificar estado da visualização");
   return {text:step.action==="geo.show"?(a.scenario==="tsunami-japan"?
      "Simulação DIDÁTICA de tsunami no Japão aberta no Neural Ring em "+a.view.toUpperCase()+". Origem e propagação hipotéticas; não é previsão nem alerta.":
      "Exibindo El Niño em "+a.view.toUpperCase()+". Dados sazonais e simulação identificada como ilustrativa."):
    step.action==="geo.close"?"Visualização geográfica fechada.":
    step.action==="geo.play"?"Animação ilustrativa iniciada.":
    step.action==="geo.pause"?"Animação pausada.":
    "Visualização geográfica atualizada: "+state.mode+" / quadro "+state.frame+".",verified:true};
 }
 case "text.set":requireApi(answer,"setTextEnabled").setTextEnabled(a.enabled);if(answer.textEnabled!==a.enabled)throw Error("Estado não confirmado");return a.enabled?"Textos ativados.":"Textos desativados.";
 case "answer.close":requireApi(answer,"clear").clear();if(answer.visible)throw Error("Painel ainda aberto");return "Resposta fechada.";
 case "earth.open":case "earth.locate":{
  if(!w.ULTRON_EARTH?.open)await import("./jarvis-earth.js?v=4.92.0");
  const e=requireApi(w.ULTRON_EARTH,step.action==="earth.locate"?"locate":"open");
  const result=step.action==="earth.locate"?await e.locate(a.place):await e.open();
  if(!result?.ok||!e.state?.visible)throw Error(result?.error||"Globo não confirmado");
  return step.action==="earth.locate"?"Globo centralizado em "+a.place+".":"Globo aberto.";
 }
 case "earth.close":if(w.ULTRON_EARTH?.state?.visible)requireApi(w.ULTRON_EARTH,"close").close();requireApi(w.JARVIS_COMMAND_CENTER,"setVisualMode").setVisualMode("ring");if(w.ULTRON_EARTH?.state?.visible)throw Error("Globo ainda aberto");return "Neural Ring restaurado.";
 case "ring.reset":requireApi(w.ULTRON_NEURAL_RING_3D,"reset").reset();return "Comando de centralização aplicado ao anel.";
 case "ring.zoom":requireApi(w.ULTRON_NEURAL_RING_3D,"zoomBy").zoomBy(a.direction==="in"?-220:220);return "Comando de zoom aplicado ao anel.";
 case "news.refresh":{const data=await requireApi(w.ULTRON_INTELLIGENCE,"refresh").refresh({reason:"manual"});if(!data?.ok)throw Error("Não foi possível atualizar notícias");const cards=(data.topics||[]).flatMap(t=>t.articles||[]).slice(0,6).map(x=>({...x,image:x.imageUrl||x.image}));publish("Boletim atualizado.",{mode:"news",introduction:"Principais acontecimentos das fontes consultadas, Brasil primeiro.",cards});return "Boletim atualizado e exibido.";}
 case "devices.list":{const list=await requireApi(w.ULTRON_DEVICES,"listDevices").listDevices();if(!Array.isArray(list))throw Error("Lista não confirmada");const text=list.length?list.map(d=>(d.deviceName||d.name||"Dispositivo")+" — "+(d.status||"estado desconhecido")).join("\n"):"Nenhum dispositivo pareado encontrado.";publish(text);return text;}
 case "files.list":{const data=await requireApi(w.ULTRON_LOCAL_FILES,"files").files();const list=Array.isArray(data)?data:data?.files;if(!Array.isArray(list))throw Error("Arquivos indisponíveis");const text=list.length?list.slice(0,25).map(x=>typeof x==="string"?x:x.path||x.name||"Arquivo").join("\n"):"Nenhum arquivo autorizado encontrado.";publish(text);return text;}
 case "system.status":{const status=await requireApi(w.ULTRON_CORE,"status").status();const text="Estado do sistema: "+JSON.stringify(status||{}).slice(0,1800);publish(text);return text;}
 case "memory.health":{const result=await requireApi(w.ULTRON_MEMORY,"refreshMemoryHealth").refreshMemoryHealth();return "Consulta de saúde da memória concluída.";}
 case "parity.check":{const report=await requireApi(w.ULTRON_NEURAL_PARITY,"sync").sync("operator");const text="PARITY CHECK: "+Object.entries(report||{}).map(([k,v])=>k+": "+String(v)).join(" · ");publish(text);return text;}
 case "device.command":{if(!normalizeCommand(original).includes(normalizeCommand(a.command)))throw Error("Ordem de dispositivo não está no pedido original");const api=requireApi(w.ULTRON_DEVICES,"routeNaturalLanguage");const intent=api.parseDeviceIntent?.(a.command);if(!intent)throw Error("Comando de dispositivo não reconhecido");const r=await api.routeNaturalLanguage(a.command,intent);if(!r?.ok||r.needsConfirmation)throw Error(r?.error?.message||"Dispositivo não confirmou");return {text:r.schedule?"Automação registrada.":r.verified===true?"Comando verificado.":"Comando enviado ao dispositivo; conclusão ainda não confirmada.",verified:r.verified===true||Boolean(r.schedule&&r.ok)};}
 case "research":{const r=await requireApi(w.ULTRON_CORE,"ask").ask(a.question);if(!r?.ok)throw Error(r?.error||"Pesquisa falhou");return "Resposta apresentada.";}
 default:throw Error("Ação não permitida");
 }
}
export async function runActionPlan(plan,original,{signal}={}){
 const valid=validatePlan(plan);if(!valid)return null;
 const results=[];
 let cancelled=Boolean(signal?.aborted);
 for(const step of valid.steps){
  if(signal?.aborted){cancelled=true;break;}
  const startedAt=Date.now();
  try{
   const raw=await executeStep(step,original);
   const body=typeof raw==="string"?{text:raw}:raw;
   const verified=typeof body.verified==="boolean"?body.verified:!["ring.reset","ring.zoom"].includes(step.action);
   const result={action:step.action,ok:true,verified,status:verified?"verified":"submitted",text:String(body.text||"").slice(0,1800),elapsedMs:Date.now()-startedAt};
   results.push(result);
   if(verified)TASK_CONTEXT?.recordAction(step,result);
   W().dispatchEvent?.(new CustomEvent("ultron:task-step",{detail:{...result}}));
   if(signal?.aborted){cancelled=true;break;}
  }catch(e){
   const failed={action:step.action,ok:false,verified:false,status:"failed",text:String(e?.message||e).slice(0,350),elapsedMs:Date.now()-startedAt};
   results.push(failed);
   W().dispatchEvent?.(new CustomEvent("ultron:task-step",{detail:{...failed}}));
   if(signal?.aborted)cancelled=true;
   break;
  }
 }
 if(signal?.aborted)cancelled=true;
 const ok=!cancelled&&results.length===valid.steps.length&&results.every(x=>x.ok);
 const verified=ok&&results.every(x=>x.verified);
 const status=cancelled?"cancelled":!ok?"failed":verified?"completed":"submitted";
 const text=cancelled?"P0 STOP: missão interrompida. Etapas concluídas: "+results.length+"/"+valid.steps.length+".":
  results.map(x=>x.text).join(" ");
 if(!cancelled&&(!ok||!results.some(x=>["research","news.refresh","devices.list","files.list","system.status","parity.check"].includes(x.action))))W().ULTRON_VOICE_OUTPUT?.speak?.(text,{reason:"autonomy",announce:false});
 return {ok,verified,cancelled,status,handled:true,route:"autonomy",text,steps:results};
}
export async function resolveActionPlan(message){
 const direct=directPlan(message);if(direct)return direct;
 const intent=classifyOperatorTurn(message);
 if(intent.kind==="negated"||intent.kind==="question"||intent.private)return null;
 if(!intent.action&&!isActionRequest(message))return null;
 // Only ask the semantic planner for explicit operational requests. Public
 // questions remain on the research path; no untrusted search content is executed.
 const q=normalizeCommand(message);
 if(!/\b(?:painel|neural|globo|mapa|anel|textos?|resposta|dispositivos?|arquivos|memoria|parity|boletim|sistema|noticias)\b/.test(q))return null;
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),6000);
 try{
  const r=await fetch(String(API_CONFIG.backendUrl||"").replace(/\/$/,"")+"/api/action-plan",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({message,taskContext:TASK_CONTEXT?.publicContextFor(message)||null}),signal:controller.signal});
  if(!r.ok)return null;const data=await r.json();
  const plan=validatePlan(data);
  // Semantic plans never receive authority to issue a new device command.
  return plan&&plan.steps.every(s=>s.action!=="device.command")?plan:null;
 }catch{return null;}finally{clearTimeout(timer);}
}
