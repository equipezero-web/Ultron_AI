import {parseMultimodalCommand,resolveMultimodalContext} from "./jarvis-multimodal-context-model.js";

// Phase XIII: one verified, observable result for each explicit voice/text
// instruction. This coordinator cannot execute device, financial or file actions.
const output=document.getElementById("output-box");
let serial=0,busy=false,last=null,lastVoice={text:"",at:0};
const brief=(s,max=190)=>String(s??"").replace(/[<>\r\n]/g," ").replace(/\s+/g," ").trim().slice(0,max);
function log(message){
 if(!output)return;
 const p=document.createElement("p");
 p.textContent="> [CONTEXTO MULTIMODAL] "+brief(message,340);
 output.append(p);
 output.scrollTop=output.scrollHeight;
}
function safeRead(){
 let digest=null,news=null,director=null,immersive=null;
 try{digest=window.ULTRON_CONTEXTUAL?.preview?.()||null;}catch{}
 try{
  const module=window.ULTRON_NEURAL_NEWS;
  news=module?{state:module.state,selectedArticle:module.selectedArticle,
    requested:module.state?.requested===true}:null;
 }catch{}
 try{director=window.ULTRON_VISUAL_ORCHESTRATOR?.context||null;}catch{}
 try{
  const module=window.ULTRON_IMMERSIVE;
  immersive=module?{...module.state,current:module.current}:null;
 }catch{}
 return {digest,news,director,immersive,now:Date.now()};
}
function finish(result,{ticket,type,source}={}){
 if(ticket!==serial)return {ok:false,cancelled:true,error:"Comando contextual cancelado"};
 const done={...result,type:type||"unknown",inputSource:source||"terminal",
  at:new Date().toISOString()};
 last={ok:done.ok===true,type:done.type,scene:done.scene||null,
  reason:done.reason||done.error||null,
  confirmedAt:done.ok===true?done.at:null};
 log((done.ok?"CONFIRMADO // ":"NÃO CONFIRMADO // ")+
  brief(done.message||done.error||done.reason||done.type,240));
 window.dispatchEvent(new CustomEvent("ultron:multimodal-confirmation",{
  detail:{...last,source:source||"terminal"}
 }));
 return done;
}
function present(message,url=null){
 const director=window.ULTRON_VISUAL_ORCHESTRATOR;
 if(director?.state?.active){
  director.presentContext?.({description:message,url});
 }else if(window.ULTRON_IMMERSIVE?.state?.active){
  window.ULTRON_IMMERSIVE?.presentContext?.(message);
 }
}
function fail(error,reason="NOT_VERIFIED"){
 return {ok:false,error,reason};
}
function current(){
 const data=safeRead();
 return {data,context:resolveMultimodalContext(data)};
}
async function perform(intent){
 const {data,context}=current();
 const director=window.ULTRON_VISUAL_ORCHESTRATOR;
 const immersive=window.ULTRON_IMMERSIVE;
 const news=window.ULTRON_NEURAL_NEWS;
 if(intent.type==="status"){
  const state=director?.state||null;
  return {ok:true,scene:state?.scene||null,
   message:"Diretor visual "+(state?.active?"ativo":"inativo")+
    "; contexto "+(context.ok?"com fonte verificada: "+context.title:"indisponível ou não selecionado")+
    "; último resultado: "+(last?.ok?"confirmado":last?.reason||"não verificado")};
 }
 if(!context.ok){
  return fail("Não há um registro atual selecionado e verificável ("+context.reason+"). "+
   "Selecione uma notícia ou destaque com fonte para usar 'isso' ou 'esta imagem'.",
   context.reason);
 }
 if(intent.type==="explain"){
  const message=context.title+" // "+context.description+" "+context.evidence+
   " Fonte: "+context.source+". Publicação: "+context.publishedAt+".";
  present(message,context.url);
  return {ok:true,scene:context.scene,message,sourceUrl:context.url};
 }
 if(intent.type==="source"){
  present("FONTE VERIFICADA // "+context.title+" // "+context.source+
   " // publicado: "+context.publishedAt,context.url);
  return {ok:true,scene:context.scene,
   message:"Fonte original disponível no painel: "+context.source+". "+context.url,
   sourceUrl:context.url};
 }
 if(intent.type==="image"){
  if(context.type!=="news"||!context.hasImage||!context.imageUrl)
   return fail("Não existe imagem verificável para o registro selecionado. Nenhuma imagem será criada.",
     "NO_SOURCE_IMAGE");
  // A priority headline does not guarantee the same article is selected in the
  // news rail. Requiring the exact article URL prevents wrong-image attribution.
  if(data.news?.selectedArticle?.url!==context.url)
   return fail("A imagem dessa manchete não foi confirmada na central de notícias.",
     "WRONG_NEWS_IMAGE");
  if(director?.state?.active){
   const opened=await director.show("news");
   if(!opened?.ok)return fail(opened?.error||"A central não confirmou a cena","NEWS_FAILED");
  }else{
   if(!news?.show)return fail("Central de imagens indisponível","NEWS_UNAVAILABLE");
   news.show();
   if(news.state?.requested!==true)
    return fail("Exibição de imagem não confirmada pela central","NEWS_NOT_VISIBLE");
  }
  return {ok:true,scene:"news",message:"Imagem atribuída à fonte exibida na central existente.",
   sourceUrl:context.url};
 }
 if(intent.type==="visualize"){
  if(!context.eventKey)return fail(
   "Este registro não contém coordenadas verificadas. Não vou inventar um ponto no mapa.",
   "NO_VERIFIED_COORDINATES");
  const scene=intent.view==="3d"?"tour":"map";
  let result=null;
  if(director?.state?.active){
   result=await director.show(scene,{focusKey:context.eventKey});
  }else if(immersive?.state?.active){
   result=await immersive.setMode(intent.view);
  }else{
   result=await window.ULTRON_CONTEXTUAL_MAP?.open?.({
    view:intent.view,focusKey:context.eventKey
   })||fail("Visualizador contextual indisponível","MAP_UNAVAILABLE");
  }
  if(result?.ok!==true)return fail(result?.error||"Visualização não confirmada",
    result?.reason||"VIEW_NOT_CONFIRMED");
  const actual=result.view||result.mode;
  if(actual!=="2d"&&actual!=="3d")
   return fail("O motor não informou qual visualização foi realmente aberta.",
     "MODE_NOT_CONFIRMED");
  return {ok:true,scene,
   message:context.title+" centralizado no modo "+actual.toUpperCase()+
    (intent.view!==actual?" (modo solicitado indisponível; fallback confirmado).":"")+
    " Isto não representa previsão ou intensidade de risco.",
   mode:actual,fallback3d:intent.view==="3d"&&actual==="2d"};
 }
 if(intent.type==="scene"){
  if(!director?.state?.active)return fail(
   "Abra o DIRETOR VISUAL antes de retornar à cena de notícias.","DIRECTOR_INACTIVE");
  const outcome=await director.show(intent.scene);
  return outcome?.ok===true?
   {ok:true,scene:outcome.scene,message:"Cena de notícias confirmada no Neural Ring."}:
   fail(outcome?.error||"Cena não confirmada","SCENE_NOT_CONFIRMED");
 }
 if(intent.type==="navigate"){
  const direction=intent.direction;
  if(data.director?.scene==="tour"&&data.immersive?.active){
   const r=await (direction===1?immersive?.next?.():immersive?.previous?.());
   return r?.ok?{ok:true,scene:"tour",message:"Evento seguinte/anterior confirmado na exploração visual."}:
    fail(r?.error||"Evento não confirmado","NAVIGATION_FAILED");
  }
  if(data.director?.scene==="priorities"){
   const entries=director?.plan?.().scenes.find(x=>x.id==="priorities")?.entries||[];
   const index=entries.findIndex(x=>x.id===data.director.selectedPriorityKey);
   const target=entries[index+direction];
   if(index<0||!target)return fail("Não há outro destaque verificado nessa direção.","END_OF_LIST");
   const r=director.selectPriority?.(target.id);
   return r?.ok?{ok:true,scene:"priorities",message:"Destaque selecionado: "+target.title}:
    fail("Seleção não confirmada","PRIORITY_FAILED");
  }
  if(data.director?.scene==="news"||(!data.director?.active&&data.news?.requested)){
   const position=news?.state?.index;
   const target=Number.isInteger(position)?position+direction:-1;
   if(target<0||target>=(news?.state?.count||0))
    return fail("Não há outra notícia nessa direção.","END_OF_LIST");
   news?.select?.(target);
   return news?.state?.index===target?
    {ok:true,scene:"news",message:"Notícia selecionada: "+brief(news.state.headline,130)}:
    fail("A central não confirmou a seleção da notícia","NEWS_SELECTION_FAILED");
  }
  if(data.director?.active){
   const r=await (direction===1?director.next?.():director.previous?.());
   return r?.ok?{ok:true,scene:r.scene,message:"Cena "+r.scene+" confirmada."}:
    fail(r?.error||"Cena não confirmada","SCENE_FAILED");
  }
  if(data.immersive?.active){
   const r=await (direction===1?immersive.next?.():immersive.previous?.());
   return r?.ok?{ok:true,scene:"tour",message:"Evento da exploração atualizado."}:
    fail(r?.error||"Navegação não confirmada","NAVIGATION_FAILED");
  }
 }
 return fail("Comando contextual não suportado.","UNSUPPORTED");
}
async function execute(raw,{source="terminal"}={}){
 const intent=parseMultimodalCommand(raw);
 if(!intent)return {handled:false};
 if(busy)return {handled:true,ok:false,reason:"CONTEXT_BUSY",
  error:"Há outra transição multimodal em andamento."};
 if(source.startsWith("voice")&&lastVoice.text===raw&&Date.now()-lastVoice.at<1200)
  return {handled:true,ok:false,duplicate:true,error:"Entrada de voz repetida."};
 if(source.startsWith("voice"))lastVoice={text:raw,at:Date.now()};
 const ticket=++serial;
 busy=true;
 try{
  const result=await perform(intent);
  return {handled:true,...finish(result,{ticket,type:intent.type,source})};
 }catch(error){
  return {handled:true,...finish(fail("Falha ao confirmar o contexto visual.",
   "CONTEXT_INTERNAL_ERROR"),{ticket,type:intent.type,source})};
 }finally{
  if(ticket===serial)busy=false;
 }
}
function stop(){
 serial++;busy=false;
 last={ok:false,type:"cancel",scene:null,reason:"CANCELLED",confirmedAt:null};
 window.dispatchEvent(new CustomEvent("ultron:multimodal-confirmation",{
  detail:{...last,source:"p0-stop"}
 }));
 return {ok:true,cancelled:true};
}
window.ULTRON_MULTIMODAL={
 parse:parseMultimodalCommand,execute,stop,
 get state(){return {busy,activeReference:resolveMultimodalContext(safeRead()).ok,
  last:last?{...last}:null};},
 get current(){return resolveMultimodalContext(safeRead());}
};
