import {buildImmersiveSequence,createImmersiveNavigator} from "./jarvis-immersive-sequence.js";

// All camera movement is explicit: button, keyboard, touch swipe or user command.
// The story is read from previously verified geo events; there is no AI geocoding.
const stage=document.querySelector(".jarvis-cc-center");
const output=document.getElementById("output-box");
const make=(tag,cls,text)=>{
 const node=document.createElement(tag);
 if(cls)node.className=cls;
 if(text!==undefined)node.textContent=text;
 return node;
};
let navigatorState=null,sequence=null,active=false,busy=false,request=0;
let panel,heading,title,category,info,counter,previous,next,button2d,button3d,source,closeButton,status,note,explanation;
function log(text){
 if(!output)return;
 const line=document.createElement("p");
 line.textContent="> [IMERSÃO] "+String(text).slice(0,270);
 output.appendChild(line);output.scrollTop=output.scrollHeight;
}
function createPanel(){
 if(!stage)return;
 panel=make("section","jarvis-immersive-context");
 panel.hidden=true;panel.setAttribute("role","region");
 panel.setAttribute("aria-label","Exploração visual de eventos publicados");
 panel.setAttribute("tabindex","-1");
 const top=make("header","jarvis-immersive-head");
 heading=make("strong","","J.A.R.V.I.S. · VISÃO CONTEXTUAL");
 closeButton=make("button","","×");closeButton.type="button";
 closeButton.setAttribute("aria-label","Fechar exploração contextual");
 top.append(heading,closeButton);
 const body=make("div","jarvis-immersive-body");
 category=make("span","jarvis-immersive-category","");
 title=make("h3","jarvis-immersive-title","Selecione um evento verificado");
 info=make("p","jarvis-immersive-info","");
 explanation=make("p","jarvis-immersive-explanation","");
 note=make("p","jarvis-immersive-note","");
 source=make("a","jarvis-immersive-source","Consultar fonte original");
 source.target="_blank";source.rel="noopener noreferrer";
 body.append(category,title,info,explanation,note,source);
 const controls=make("footer","jarvis-immersive-controls");
 previous=make("button","","‹");previous.type="button";
 previous.setAttribute("aria-label","Evento anterior");
 counter=make("span","jarvis-immersive-counter","0 / 0");
 next=make("button","","›");next.type="button";
 next.setAttribute("aria-label","Próximo evento");
 button2d=make("button","","2D");button2d.type="button";
 button2d.setAttribute("aria-label","Exibir registro no mapa 2D");
 button3d=make("button","","3D");button3d.type="button";
 button3d.setAttribute("aria-label","Exibir registro no globo 3D");
 controls.append(previous,counter,next,button2d,button3d);
 status=make("p","jarvis-immersive-status","");
 status.setAttribute("role","status");status.setAttribute("aria-live","polite");
 panel.append(top,body,controls,status);
 stage.append(panel);
 for(const eventName of ["pointerdown","pointermove","pointerup","wheel","click","touchstart","touchmove","touchend"]){
  panel.addEventListener(eventName,event=>event.stopPropagation(),{passive:true});
 }
 previous.addEventListener("click",()=>{void step(-1);});
 next.addEventListener("click",()=>{void step(1);});
 button2d.addEventListener("click",()=>{void setMode("2d");});
 button3d.addEventListener("click",()=>{void setMode("3d");});
 closeButton.addEventListener("click",close);
 panel.addEventListener("keydown",event=>{
  if(event.key==="ArrowLeft"){event.preventDefault();void step(-1);}
  if(event.key==="ArrowRight"){event.preventDefault();void step(1);}
  if(event.key==="Escape"){event.preventDefault();close();}
 });
 // Only a horizontal intentional swipe switches events; vertical touch remains
 // available to scroll the panel. No global document swipe listeners.
 let pointerStart=null;
 panel.addEventListener("touchstart",event=>{
  const t=event.changedTouches?.[0];
  pointerStart=t?{x:t.clientX,y:t.clientY}:null;
 },{passive:true});
 panel.addEventListener("touchend",event=>{
  const t=event.changedTouches?.[0],start=pointerStart;
  pointerStart=null;
  if(!start||!t||busy||event.target?.closest?.("button,a"))return;
  const dx=t.clientX-start.x,dy=t.clientY-start.y;
  if(Math.abs(dx)>65&&Math.abs(dx)>Math.abs(dy)*1.7)
   void step(dx<0?1:-1);
 },{passive:true});
}
function date(value){
 const n=Date.parse(value);
 return Number.isFinite(n)?new Date(n).toLocaleString("pt-BR",{
  day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"
 }):"horário não verificado";
}
function update({message=""}={}){
 if(!panel||!active||!navigatorState)return;
 const snap=navigatorState.snapshot(),item=snap.current;
 category.textContent=item.category.toUpperCase()+" · "+item.sourceName;
 title.textContent=item.title;
 info.textContent="Registro publicado: "+date(item.publishedAt)+
  " · "+item.lat.toFixed(3)+"°, "+item.lng.toFixed(3)+"°";
 explanation.textContent=item.explanation;
 note.textContent=item.locationNote+" "+item.disclaimer;
 source.href=item.sourceUrl;
 counter.textContent=String(snap.index+1)+" / "+String(snap.count);
 previous.disabled=busy||!snap.hasPrevious;
 next.disabled=busy||!snap.hasNext;
 button2d.disabled=busy;button3d.disabled=busy;
 button2d.setAttribute("aria-pressed",String(snap.view==="2d"));
 button3d.setAttribute("aria-pressed",String(snap.view==="3d"));
 panel.dataset.mode=snap.view;
 panel.dataset.category=item.type;
 panel.setAttribute("aria-busy",String(busy));
 status.textContent=message||"Exibição de registro georreferenciado; não é simulação de risco.";
}
function close(){
 ++request;active=false;busy=false;
 navigatorState=null;sequence=null;
 if(panel)panel.hidden=true;
 return {ok:true,closed:true};
}
async function start({view="2d",focusKey=null}={}){
 if(!panel)return {ok:false,error:"Neural Ring não está disponível"};
 if(!["2d","3d"].includes(view))return {ok:false,error:"Modo inválido"};
 if(busy)return {ok:false,error:"Navegação em andamento"};
 const ticket=++request;
 const digest=window.ULTRON_CONTEXTUAL?.preview?.();
 const built=buildImmersiveSequence(digest,{now:Date.now()});
 if(!built.ok){
  const error="Sem eventos georreferenciados atuais com fonte confirmada. Manchetes e avisos sem coordenadas não foram mapeados.";
  log(error);return {ok:false,error,reason:built.reason};
 }
 let selection;
 try{selection=createImmersiveNavigator(built,{mode:view});}
 catch{return {ok:false,error:"Sequência geográfica inválida"};}
 if(focusKey!==null){
  const chosen=selection.choose(focusKey);
  if(!chosen.ok)return {ok:false,error:"Evento não consta no resumo verificado"};
 }
 const target=selection.snapshot().current;
 busy=true;
 let result;
 try{
  result=await window.ULTRON_CONTEXTUAL_MAP?.open?.({view,focusKey:target.key});
 }catch{result={ok:false,error:"Falha ao abrir mapa"};}
 if(ticket!==request)return {ok:false,error:"Solicitação substituída"};
 busy=false;
 if(result?.ok!==true){log("Visualização indisponível: "+(result?.error||"motor de mapa não respondeu"));return result||{ok:false,error:"Motor indisponível"};}
 selection.setMode(result.view);
 navigatorState=selection;sequence=built;active=true;panel.hidden=false;
 update({message:result.fallback3d?"Globo indisponível; mapa 2D confirmado.":"Evento centralizado no "+result.view.toUpperCase()+"."});
 log("EXPLORAÇÃO // "+built.count+" evento(s) com coordenadas e fontes. Navegação manual 2D/3D.");
 return {ok:true,count:built.count,index:selection.snapshot().index,view:result.view,fallback3d:result.fallback3d};
}
async function move({key,view}={}){
 if(!active||!navigatorState)return {ok:false,error:"Inicie a exploração contextual"};
 if(busy)return {ok:false,error:"Navegação em andamento"};
 if(document.hidden)return {ok:false,error:"Exploração pausada: aba não visível"};
 const item=sequence?.items.find(item=>item.key===key);
 if(!item)return {ok:false,error:"Evento fora da sequência verificada"};
 const targetView=view||navigatorState.snapshot().view;
 if(!["2d","3d"].includes(targetView))return {ok:false,error:"Modo inválido"};
 busy=true;update({message:"Localizando registro na fonte geográfica..."});
 const ticket=++request;
 let result;
 try{result=await window.ULTRON_CONTEXTUAL_MAP?.focus?.({focusKey:key,view:targetView});}
 catch{result={ok:false,error:"Motor de mapa não respondeu"};}
 if(ticket!==request)return {ok:false,error:"Solicitação substituída"};
 busy=false;
 if(result?.ok!==true){
  update({message:"Não confirmado: "+String(result?.error||"localização indisponível").slice(0,135)});
  return result||{ok:false,error:"Localização não confirmada"};
 }
 navigatorState.choose(key);
 navigatorState.setMode(result.view);
 update({message:result.fallback3d
  ?"Globo indisponível; foco confirmado no mapa 2D."
  :"Coordenada verificada centralizada no mapa "+result.view.toUpperCase()+"."});
 return {ok:true,index:navigatorState.snapshot().index,view:result.view,
  eventName:item.title,fallback3d:Boolean(result.fallback3d)};
}
function step(direction){
 if(!navigatorState||!active)return Promise.resolve({ok:false,error:"Exploração não iniciada"});
 const state=navigatorState.snapshot(),target=sequence.items[state.index+direction];
 return target?move({key:target.key}):
  Promise.resolve({ok:false,error:"Fim dos registros disponíveis"});
}
function setMode(view){
 if(!navigatorState||!active)return Promise.resolve({ok:false,error:"Exploração não iniciada"});
 return move({key:navigatorState.snapshot().current.key,view});
}
function injectImmersiveButton(){
 const strip=document.querySelector(".quick-actions");
 if(!strip||document.getElementById("btn-jarvis-immersive"))return;
 const button=make("button","","EXPLORAR VISUAL");
 button.type="button";button.id="btn-jarvis-immersive";
 let touchAt=0;
 button.addEventListener("pointerdown",event=>{
  if(event.pointerType==="mouse"||event.button!==0)return;
  touchAt=Date.now();void start({view:"2d"});
 });
 button.addEventListener("click",()=>{
  if(Date.now()-touchAt<800)return;
  void start({view:"2d"});
 });
 strip.appendChild(button);
}
window.addEventListener("ultron:new-conversation",close);
document.addEventListener("visibilitychange",()=>{
 if(document.hidden&&active)status.textContent="Aba oculta. A navegação contextual está pausada.";
});
createPanel();
injectImmersiveButton();
window.ULTRON_IMMERSIVE={
 start,close,stop:close,next:()=>step(1),previous:()=>step(-1),
 setMode,select:key=>move({key}),
 get state(){const snap=navigatorState?.snapshot();
  return {active,busy,mode:snap?.view||null,index:snap?.index??null,
   count:snap?.count||0,eventKey:snap?.current?.key||null};}
};
