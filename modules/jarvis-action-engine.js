import {TASK_CONTEXT} from "./jarvis-task-context.js?v=4.69.0";
import {WEATHER_CITIES,weatherCity,weatherGeoScenario,weatherSummary} from "./jarvis-weather-model.js?v=4.72.0";
import {globalWeatherScenario,globalWeatherSummary} from "./jarvis-global-weather.js?v=4.73.0";
import {classifyOperatorTurn} from "./jarvis-intent-engine.js?v=4.69.0";
import API_CONFIG from "../config.js";
import {validatePlan,isActionRequest} from "../backend/action-catalog.js?v=4.73.0";
import {normalizeCommand} from "./jarvis-local-commands.js?v=4.67.0";
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
 const enso=/(?:el nino|elnino|enos|enso)/.test(q);
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
 case "weather.global":{
   const endpoint=String(API_CONFIG.backendUrl||"").replace(/\/$/,"")+
     "/api/geo/global?city="+encodeURIComponent(a.city)+"&days="+encodeURIComponent(a.days);
   const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
   let report;
   try{
     const response=await fetch(endpoint,{headers:{Accept:"application/json"},signal:controller.signal,cache:"no-store"});
     report=await response.json();
     if(!response.ok||!report?.ok)throw Error(report?.error||"Previsão mundial indisponível");
   }finally{clearTimeout(timer);}
   if(report.kind!=="global-short-term-forecast"||report.days?.length!==a.days||
      !report.location?.key?.startsWith("global-")||!report.source?.url?.includes("open-meteo.com"))
      throw Error("A previsão mundial retornada não foi validada");
   const data=globalWeatherScenario(report),summary=globalWeatherSummary(report);
   if(!data||!summary)throw Error("Não foi possível construir a visualização mundial");
   if(!w.ULTRON_GEO_VISUAL)await import("./jarvis-geospatial-visual.js?v=4.73.0");
   const geo=requireApi(w.ULTRON_GEO_VISUAL,"open");
   const result=await geo.open({data,view:a.view});
   if(!result?.ok||!geo.state.visible||geo.state.scenario!==data.id||geo.state.mode!==a.view)
     throw Error(result?.error||"Não foi possível verificar o mapa mundial");
   return {text:summary,verified:true};
 }
 case "weather.show":{
   const endpoint=String(API_CONFIG.backendUrl||"").replace(/\/$/,"")+
     "/api/geo/weather?city="+encodeURIComponent(a.city);
   const controller=new AbortController();
   const timer=setTimeout(()=>controller.abort(),8500);
   let payload;
   try{
     const response=await fetch(endpoint,{headers:{Accept:"application/json"},signal:controller.signal,cache:"no-store"});
     payload=await response.json();
     if(!response.ok||!payload?.ok)throw Error(payload?.error||"Não foi possível confirmar os dados meteorológicos");
   }finally{clearTimeout(timer);}
   if(payload.city?.key!==a.city||!Array.isArray(payload.days)||payload.days.length<1)throw Error("Dados meteorológicos inconsistentes");
   const dataset=weatherGeoScenario(payload),summary=weatherSummary(payload);
   if(!dataset||!summary)throw Error("Previsão inválida; nenhuma simulação será apresentada");
   if(!w.ULTRON_GEO_VISUAL)await import("./jarvis-geospatial-visual.js?v=4.73.0");
   const geo=requireApi(w.ULTRON_GEO_VISUAL,"open");
   const result=await geo.open({data:dataset,view:a.view});
   if(!result?.ok||!geo.state.visible||geo.state.scenario!==dataset.id||geo.state.mode!==a.view)
     throw Error(result?.error||"Mapa não foi confirmado");
   return {text:summary,verified:true};
 }
 case "geo.show":case "geo.view2d":case "geo.view3d":case "geo.play":case "geo.pause":case "geo.next":case "geo.previous":case "geo.filter":case "geo.close":{
   if(!w.ULTRON_GEO_VISUAL)await import("./jarvis-geospatial-visual.js?v=4.73.0");
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
   return {text:step.action==="geo.show"?"Exibindo El Niño em "+a.view.toUpperCase()+". Dados sazonais e simulação identificada como ilustrativa.":
    step.action==="geo.close"?"Visualização geográfica fechada.":
    step.action==="geo.play"?"Animação ilustrativa iniciada.":
    step.action==="geo.pause"?"Animação pausada.":
    "Visualização geográfica atualizada: "+state.mode+" / quadro "+state.frame+".",verified:true};
 }
 case "text.set":requireApi(answer,"setTextEnabled").setTextEnabled(a.enabled);if(answer.textEnabled!==a.enabled)throw Error("Estado não confirmado");return a.enabled?"Textos ativados.":"Textos desativados.";
 case "answer.close":requireApi(answer,"clear").clear();if(answer.visible)throw Error("Painel ainda aberto");return "Resposta fechada.";
 case "earth.open":case "earth.locate":{
  if(!w.ULTRON_EARTH?.open)await import("./jarvis-earth.js?v=4.49.0");
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
export async function runActionPlan(plan,original){
 const valid=validatePlan(plan);if(!valid)return null;
 const results=[];
 for(const step of valid.steps){
  const startedAt=Date.now();
  try{
   const raw=await executeStep(step,original);
   const body=typeof raw==="string"?{text:raw}:raw;
   const verified=typeof body.verified==="boolean"?body.verified:!["ring.reset","ring.zoom"].includes(step.action);
   const result={action:step.action,ok:true,verified,status:verified?"verified":"submitted",text:String(body.text||"").slice(0,1800),elapsedMs:Date.now()-startedAt};
   results.push(result);
   if(verified)TASK_CONTEXT?.recordAction(step,result);
   W().dispatchEvent?.(new CustomEvent("ultron:task-step",{detail:{...result}}));
  }catch(e){
   const failed={action:step.action,ok:false,verified:false,status:"failed",text:String(e?.message||e).slice(0,350),elapsedMs:Date.now()-startedAt};
   results.push(failed);
   W().dispatchEvent?.(new CustomEvent("ultron:task-step",{detail:{...failed}}));
   break;
  }
 }
 const ok=results.length===valid.steps.length&&results.every(x=>x.ok);
 const verified=ok&&results.every(x=>x.verified);
 const status=!ok?"failed":verified?"completed":"submitted";
 const text=results.map(x=>x.text).join(" ");
 if(!ok||!results.some(x=>["research","news.refresh","devices.list","files.list","system.status","parity.check"].includes(x.action)))W().ULTRON_VOICE_OUTPUT?.speak?.(text,{reason:"autonomy",announce:false});
 return {ok,verified,status,handled:true,route:"autonomy",text,steps:results};
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
