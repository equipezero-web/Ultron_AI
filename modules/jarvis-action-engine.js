import API_CONFIG from "../config.js";
import {validatePlan,isActionRequest} from "../backend/action-catalog.js?v=4.68.0";
import {normalizeCommand} from "./jarvis-local-commands.js?v=4.67.0";
const W=()=>window;
const action=(action,args={})=>({action,args});
export function directPlan(message){
 const q=normalizeCommand(message).replace(/[.!?]+$/,"").trim();
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
 case "device.command":{if(!normalizeCommand(original).includes(normalizeCommand(a.command)))throw Error("Ordem de dispositivo não está no pedido original");const api=requireApi(w.ULTRON_DEVICES,"routeNaturalLanguage");const intent=api.parseDeviceIntent?.(a.command);if(!intent)throw Error("Comando de dispositivo não reconhecido");const r=await api.routeNaturalLanguage(a.command,intent);if(!r?.ok||r.needsConfirmation)throw Error(r?.error?.message||"Dispositivo não confirmou");return r.schedule?"Automação registrada.":r.verified===true?"Comando verificado.":"Comando enviado ao dispositivo; conclusão ainda não confirmada.";}
 case "research":{const r=await requireApi(w.ULTRON_CORE,"ask").ask(a.question);if(!r?.ok)throw Error(r?.error||"Pesquisa falhou");return "Resposta apresentada.";}
 default:throw Error("Ação não permitida");
 }
}
export async function runActionPlan(plan,original){
 const valid=validatePlan(plan);if(!valid)return null;
 const results=[];
 for(const step of valid.steps){
  try{const text=await executeStep(step,original);results.push({action:step.action,ok:true,text});}
  catch(e){results.push({action:step.action,ok:false,text:String(e.message||e)});break;}
 }
 const ok=results.every(x=>x.ok);
 const text=results.map(x=>x.text).join(" ");
 if(!ok||!results.some(x=>["research","news.refresh","devices.list","files.list","system.status","parity.check"].includes(x.action)))W().ULTRON_VOICE_OUTPUT?.speak?.(text,{reason:"autonomy",announce:false});
 return {ok,handled:true,route:"autonomy",text,steps:results};
}
export async function resolveActionPlan(message){
 const direct=directPlan(message);if(direct)return direct;
 if(!isActionRequest(message))return null;
 // Only ask the semantic planner for explicit operational requests. Public
 // questions remain on the research path; no untrusted search content is executed.
 const q=normalizeCommand(message);
 if(!/\b(?:painel|neural|globo|mapa|anel|textos?|resposta|dispositivos?|arquivos|memoria|parity|boletim|sistema|noticias)\b/.test(q))return null;
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),6000);
 try{
  const r=await fetch(String(API_CONFIG.backendUrl||"").replace(/\/$/,"")+"/api/action-plan",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({message}),signal:controller.signal});
  if(!r.ok)return null;const data=await r.json();
  const plan=validatePlan(data);
  // Semantic plans never receive authority to issue a new device command.
  return plan&&plan.steps.every(s=>s.action!=="device.command")?plan:null;
 }catch{return null;}finally{clearTimeout(timer);}
}
