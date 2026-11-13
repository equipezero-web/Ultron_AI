import {buildVisualStoryboard,createVisualSceneNavigator} from "./jarvis-visual-orchestration-model.js";

// Phase XII — presentation control only. It coordinates existing visual modules.
// No autonomous search, video fabrication, device action or automatic globe spin.
const stage=document.querySelector(".jarvis-cc-center");
const output=document.getElementById("output-box");
const el=(tag,cls,content)=>{
 const node=document.createElement(tag);
 if(cls)node.className=cls;
 if(content!==undefined)node.textContent=String(content);
 return node;
};
const text=(value,max=190)=>String(value??"").replace(/[<>\r\n]/g," ").trim().slice(0,max);
let seq=0,busy=false,active=false,nav=null,lastActual=null;
let selectedPriorityKey=null,lastFocusedKey=null;
let panel,title,description,meta,source,steps,entries,status,prev,next,closeButton,contextLine,contextLink;
function log(message){
 if(!output)return;
 const p=el("p","","[ORQUESTRAÇÃO VISUAL] "+text(message,290));
 output.appendChild(p);output.scrollTop=output.scrollHeight;
}
function data(){
 let digest=null,news=null;
 try{digest=window.ULTRON_CONTEXTUAL?.preview?.()||null;}catch{}
 try{news=window.ULTRON_NEURAL_NEWS?.state||null;}catch{}
 return {digest,news,now:Date.now()};
}
function plan(){return buildVisualStoryboard(data());}
function publish(detail){
 window.dispatchEvent(new CustomEvent("ultron:visual-orchestration",{
  detail:{...detail,at:new Date().toISOString()}
 }));
}
function render(message=""){
 if(!panel||!active||!nav)return;
 const state=nav.snapshot(),scene=state.current;
 title.textContent=scene.title;
 description.textContent=scene.description;
 meta.textContent="CENA "+(state.index+1)+"/"+state.count+
  " · "+scene.records+" registros · coleta: "+new Date(scene.checkedAt).toLocaleString("pt-BR");
 source.hidden=!scene.sourceUrl;
 if(scene.sourceUrl){source.href=scene.sourceUrl;source.textContent="Fonte original";}
 steps.replaceChildren();
 for(const item of plan().scenes){
  const button=el("button","jarvis-visual-stage-chip",item.label);
  button.type="button";button.disabled=busy;button.setAttribute("aria-pressed",String(scene.id===item.id));
  button.addEventListener("click",()=>void show(item.id));
  steps.append(button);
 }
 entries.replaceChildren();
 for(const item of (scene.entries||[]).slice(0,4)){
  const row=el("div","jarvis-visual-orch-entry");
  const label=el("small","",item.source+" · "+item.type+" · "+new Date(item.publishedAt).toLocaleString("pt-BR"));
  const link=el("a","",item.title);
  link.href=item.url;link.target="_blank";link.rel="noopener noreferrer";
  row.append(label,link);
  if(scene.id==="priorities"){
   const button=el("button","jarvis-visual-orch-select","SELECIONAR");
   button.type="button";
   button.setAttribute("aria-label","Selecionar registro contextual: "+item.title);
   button.setAttribute("aria-pressed",String(selectedPriorityKey===item.id));
   button.addEventListener("click",()=>{
     selectedPriorityKey=item.id;
     contextLine.hidden=true;contextLink.hidden=true;
     render("Registro selecionado: "+item.title+". Use EXPLIQUE ISSO ou QUAL A FONTE.");
     window.dispatchEvent(new CustomEvent("ultron:visual-context-selection",{
       detail:{scene:"priorities",key:item.id}
     }));
   });
   row.append(button);
  }
  entries.append(row);
 }
 if(scene.id==="news"){
  const state=window.ULTRON_NEURAL_NEWS?.state;
  entries.append(el("p","jarvis-visual-orch-caption",
   "As imagens são exibidas na central existente de notícias. "+
   (state?.hasImage?"A notícia selecionada tem uma imagem atribuída à fonte.":"Sem imagem confirmada na notícia selecionada.")));
 }else if(scene.id==="map"||scene.id==="tour"){
  entries.append(el("p","jarvis-visual-orch-caption",
   "Mapa e globo mostram apenas coordenadas publicadas. "+
   (lastActual?.fallback3d?"Globo não confirmou abertura; modo 2D utilizado.":"O movimento é navegação de câmera, não evolução física do evento.")));
 }
 prev.disabled=busy||!state.previous;
 next.disabled=busy||!state.next;
 panel.setAttribute("aria-busy",String(busy));
 panel.dataset.scene=scene.id;
 status.textContent=message||"Pronto. Mude de cena somente mediante comando.";
}
function createPanel(){
 if(!stage)return;
 panel=el("section","jarvis-visual-orchestration");
 panel.hidden=true;panel.setAttribute("role","region");panel.setAttribute("aria-label","Orquestração Visual J.A.R.V.I.S.");
 panel.setAttribute("tabindex","-1");
 const header=el("header","jarvis-visual-orch-head");
 header.append(el("strong","","J.A.R.V.I.S. // DIRETOR VISUAL"));
 closeButton=el("button","","×");closeButton.type="button";
 closeButton.setAttribute("aria-label","Fechar orquestração visual");
 header.append(closeButton);
 const body=el("div","jarvis-visual-orch-body");
 title=el("h3","","");
 description=el("p","jarvis-visual-orch-description","");
 meta=el("small","jarvis-visual-orch-meta","");
 source=el("a","jarvis-visual-orch-source","Fonte original");
 source.target="_blank";source.rel="noopener noreferrer";source.hidden=true;
 steps=el("nav","jarvis-visual-orch-scenes");
 steps.setAttribute("aria-label","Cenas com fontes verificadas");
 entries=el("div","jarvis-visual-orch-entries");
 contextLine=el("p","jarvis-visual-orch-context","");
 contextLine.hidden=true;
 contextLink=el("a","jarvis-visual-orch-context-source","Consultar fonte deste registro");
 contextLink.hidden=true;contextLink.target="_blank";contextLink.rel="noopener noreferrer";
 body.append(title,description,meta,source,steps,entries,contextLine,contextLink);
 const footer=el("footer","jarvis-visual-orch-controls");
 prev=el("button","","‹");prev.type="button";prev.setAttribute("aria-label","Cena anterior");
 next=el("button","","›");next.type="button";next.setAttribute("aria-label","Próxima cena");
 status=el("p","jarvis-visual-orch-status","");
 status.setAttribute("role","status");status.setAttribute("aria-live","polite");
 footer.append(prev,next);
 panel.append(header,body,footer,status);stage.append(panel);
 prev.addEventListener("click",()=>void step(-1));
 next.addEventListener("click",()=>void step(1));
 closeButton.addEventListener("click",stop);
 panel.addEventListener("keydown",event=>{
  if(event.key==="ArrowLeft"){event.preventDefault();void step(-1);}
  if(event.key==="ArrowRight"){event.preventDefault();void step(1);}
  if(event.key==="Escape"){event.preventDefault();stop();}
 });
 for(const type of ["pointerdown","pointermove","pointerup","wheel","click","touchstart","touchmove","touchend"]){
  panel.addEventListener(type,event=>event.stopPropagation(),{passive:true});
 }
}
function deactivateOther(sceneId){
 if(sceneId==="news"){
  window.ULTRON_IMMERSIVE?.close?.();
  window.ULTRON_GEO_VISUAL?.close?.();
  window.ULTRON_GLOBAL_INTELLIGENCE?.close?.();
  window.ULTRON_NEURAL_NEWS?.show?.();
 }else if(sceneId==="priorities"){
  window.ULTRON_NEURAL_NEWS?.hide?.();
  window.ULTRON_IMMERSIVE?.close?.();
  window.ULTRON_GEO_VISUAL?.close?.();
  window.ULTRON_GLOBAL_INTELLIGENCE?.close?.();
 }else {
  window.ULTRON_NEURAL_NEWS?.hide?.();
  window.ULTRON_GLOBAL_INTELLIGENCE?.close?.();
  if(sceneId==="map")window.ULTRON_IMMERSIVE?.close?.();
 }
}
async function show(sceneId,{focusKey=null}={}){
 if(!stage)return {ok:false,error:"Neural Jarvis não disponível"};
 if(busy)return {ok:false,error:"Transição já em andamento"};
 const current=plan(),scene=current.scenes.find(x=>x.id===sceneId);
 if(!scene){
  const error="A cena não possui dados atuais confirmados. Consulte as fontes antes de apresentar.";
  if(active&&status)status.textContent=error;
  log(error);
  return {ok:false,error,reason:"SCENE_UNAVAILABLE"};
 }
 const ticket=++seq;busy=true;
 if(active)render("Validando fontes e preparando a próxima visualização...");
 let outcome={ok:true,view:scene.id};
 try{
  if(scene.id==="news"){
   const news=window.ULTRON_NEURAL_NEWS;
   if(!news?.show||!news.state?.count)outcome={ok:false,error:"Notícias verificadas indisponíveis"};
  }else if(scene.id==="map"){
   outcome=await window.ULTRON_CONTEXTUAL_MAP?.open?.({view:"2d",focusKey:focusKey||scene.focusKey})
     ||{ok:false,error:"Mapa contextual indisponível"};
  }else if(scene.id==="tour"){
   outcome=await window.ULTRON_IMMERSIVE?.start?.({view:"3d",focusKey:focusKey||scene.focusKey})
     ||{ok:false,error:"Exploração 3D indisponível"};
  }
 }catch(error){outcome={ok:false,error:text(error?.message||"Módulo visual indisponível",150)};}
 if(ticket!==seq){
  busy=false;return {ok:false,error:"Transição cancelada",cancelled:true};
 }
 busy=false;
 if(outcome?.ok!==true){
  const error="CENA NÃO CONFIRMADA · "+text(outcome?.error||"Fontes ou visualizador indisponíveis");
  if(active)render(error);
  log(error);publish({ok:false,scene:sceneId,error});
  return {ok:false,scene:sceneId,error};
 }
 deactivateOther(scene.id);
 if(!nav||!active)nav=createVisualSceneNavigator(current);
 else{
  // Rebase on the latest validated scene list (a source may have expired).
  nav=createVisualSceneNavigator(current);
 }
 nav.choose(scene.id);
 if(scene.id==="priorities"){
  if(!scene.entries.some(e=>e.id===selectedPriorityKey))
    selectedPriorityKey=scene.entries[0]?.id||null;
 }
 if(scene.id==="map"||scene.id==="tour")
   lastFocusedKey=outcome.selectedPoint||
      (scene.id==="tour"?window.ULTRON_IMMERSIVE?.state?.eventKey:null)||
      focusKey||scene.focusKey||null;
 active=true;lastActual=outcome;panel.hidden=false;
 contextLine.hidden=true;contextLink.hidden=true;
 const actualMode=scene.id==="tour"?(outcome.view||"2d"):
  scene.id==="map"?(outcome.view||"2d"):null;
 const fallback=Boolean(outcome.fallback3d);
 const details=fallback?"Globo indisponível; mapa 2D confirmado.":
  "Cena confirmada pelo módulo visual.";
 render(details);
 const result={ok:true,scene:scene.id,index:nav.snapshot().index,
  count:nav.snapshot().count,mode:actualMode,fallback3d:fallback,
  sourceVerified:true};
 log("CENA // "+scene.label+" // "+details);
 publish(result);
 return result;
}
async function start({scene="auto"}={}){
 if(busy)return {ok:false,error:"Transição em andamento"};
 const current=plan();
 if(!current.ok){
  const error="Não há notícias, prioridades ou coordenadas com coleta atual verificada.";
  log(error);return {ok:false,error,reason:current.reason};
 }
 const target=scene==="auto"?current.scenes[0].id:scene;
 return show(target);
}
async function step(direction){
 if(!active||!nav)return {ok:false,error:"Inicie a apresentação visual"};
 if(direction!==1&&direction!==-1)return {ok:false,error:"Direção inválida"};
 const state=nav.snapshot(),current=plan();
 const currentIndex=current.scenes.findIndex(x=>x.id===state.current.id);
 if(currentIndex<0)return {ok:false,error:"A cena atual perdeu a confirmação das fontes"};
 const nextIndex=currentIndex+direction;
 if(nextIndex<0||nextIndex>=current.scenes.length)
  return {ok:false,error:"Fim das cenas disponíveis"};
 return show(current.scenes[nextIndex].id);
}
function stop(){
 if(!active&&!busy)return {ok:true,stopped:false};
 seq++;busy=false;active=false;nav=null;
 selectedPriorityKey=null;lastFocusedKey=null;
 if(contextLine)contextLine.hidden=true;
 if(contextLink)contextLink.hidden=true;
 if(panel)panel.hidden=true;
 window.ULTRON_IMMERSIVE?.close?.();
 // Only close context-owned geo display, never unrelated weather/camera.
 if(window.ULTRON_GEO_VISUAL?.state?.scenario==="contextual-priorities-world-v1")
  window.ULTRON_GEO_VISUAL?.close?.();
 window.ULTRON_NEURAL_NEWS?.hide?.();
 publish({ok:true,stopped:true});
 return {ok:true,stopped:true};
}
function injectButton(){
 const strip=document.querySelector(".quick-actions");
 if(!strip||document.getElementById("btn-jarvis-visual-orchestrator"))return;
 const button=el("button","","DIRETOR VISUAL");
 button.type="button";button.id="btn-jarvis-visual-orchestrator";
 let touchAt=0;
 button.addEventListener("pointerdown",event=>{
  if(event.pointerType==="mouse"||event.button!==0)return;
  touchAt=Date.now();void start();
 });
 button.addEventListener("click",()=>{
  if(Date.now()-touchAt<800)return;
  void start();
 });
 strip.append(button);
}
createPanel();injectButton();
window.addEventListener("ultron:new-conversation",stop);
document.addEventListener("visibilitychange",()=>{
 if(document.hidden&&active&&status)status.textContent="Aba em segundo plano. Navegação manual pausada.";
});
function selectPriority(key){
 if(busy||!active||nav?.snapshot().current.id!=="priorities")
  return {ok:false,reason:"NO_ACTIVE_PRIORITY_SCENE"};
 const current=plan().scenes.find(s=>s.id==="priorities");
 if(!current?.entries?.some(e=>e.id===key))
  return {ok:false,reason:"PRIORITY_NOT_CURRENT"};
 selectedPriorityKey=key;
 contextLine.hidden=true;contextLink.hidden=true;
 render("Destaque confirmado. A seleção não altera automaticamente o mapa.");
 return {ok:true,selectedPriorityKey:key};
}
function presentContext({description="",url=null}={}){
 if(!active||!panel||panel.hidden)return false;
 contextLine.textContent=text(description,390);
 contextLine.hidden=!contextLine.textContent;
 let verifiedLink=null;
 try{
  const target=new URL(url);
  if(target.protocol==="https:"&&!target.username&&!target.password)
   verifiedLink=target.href;
 }catch{}
 contextLink.hidden=!verifiedLink;
 if(verifiedLink)contextLink.href=verifiedLink;
 return true;
}
window.ULTRON_VISUAL_ORCHESTRATOR={
 start,show,stop,next:()=>step(1),previous:()=>step(-1),
 selectPriority,presentContext,plan,
 get context(){
  if(!active)return null;
  const scene=nav?.snapshot().current.id||null;
  return {active,scene,
    selectedPriorityKey:scene==="priorities"?selectedPriorityKey:null,
    focusKey:scene==="tour"||scene==="map"?lastFocusedKey:null};
 },
 get state(){return {active,busy,scene:nav?.snapshot().current.id||null,
  index:nav?.snapshot().index??null,count:nav?.snapshot().count||0,
  selectedPriorityKey,lastFocusedKey,
  mode:lastActual?.view||null};}
};
