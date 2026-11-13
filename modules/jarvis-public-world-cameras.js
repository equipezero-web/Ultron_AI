import {PUBLIC_WORLD_CAMERAS, CAMERA_CATEGORY_NAMES, WORLD_CAMERAS_HOME,
 WORLD_CAMERAS_INTERNATIONAL, findPublicCameras, parseWorldCameraCommand,
 publicCameraEmbed, cameraDirectorySummary} from "./jarvis-public-world-cameras-model.js";

// Public third-party webcams only. Nothing here activates user/device cameras.
// Playing a listed stream is NOT proof that its owner is currently broadcasting.
const output=document.getElementById("output-box");
const make=(tag,cls,txt)=>{
 const el=document.createElement(tag);if(cls)el.className=cls;
 if(txt!==undefined)el.textContent=String(txt);return el;
};
let panel=null,queryField=null,countryField=null,categoryField=null,regionField=null;
let results=null,player=null,screen=null,nowPlaying=null,notice=null,summary=null;
let requested=false,selection=null,playing=false;
function say(msg){
 if(!output)return;
 const line=make("p","","> [CÂMERAS MUNDIAIS] "+String(msg).slice(0,370));
 output.append(line);output.scrollTop=output.scrollHeight;
}
function safeLink(url,label){
 const a=make("a","jarvis-worldcam-source",label);
 a.href=url;a.target="_blank";a.rel="noopener noreferrer";
 return a;
}
function endPlayback(){
 playing=false;nowPlaying=null;
 if(player){player.removeAttribute("src");player.hidden=true;}
 if(screen)screen.hidden=false;
}
function hide(){
 requested=false;selection=null;endPlayback();
 if(panel)panel.hidden=true;
 return {handled:true,ok:true,closed:true};
}
function choose(camera,{autoPlay=false}={}){
 selection=camera;endPlayback();
 if(!camera){notice.textContent="Escolha uma câmera pública para consultar a fonte.";return;}
 notice.replaceChildren();
 const meta=make("span","",
  camera.name+" · "+camera.city+", "+camera.country+" · Transmissão: "+
  camera.publisher+". Status atual da transmissão: não verificado.");
 notice.append(meta,safeLink(camera.sourceUrl,"Abrir página da câmera"));
 if(camera.embedId){
  const action=make("button","jarvis-worldcam-play","REPRODUZIR (FONTE EXTERNA)");
  action.type="button";action.addEventListener("click",()=>startPlayback(camera));
  notice.append(action);
 }else{
  notice.append(make("span","jarvis-worldcam-hint",
   "O catálogo não forneceu um player incorporável confirmado. "+
   "Abra a fonte para conferir a transmissão; nenhum vídeo será inventado."));
 }
 if(autoPlay&&camera.embedId)startPlayback(camera);
}
function startPlayback(camera){
 if(!requested||!selection||camera.id!==selection.id)return {ok:false,reason:"NO_SELECTION"};
 const url=publicCameraEmbed(camera);
 if(!url)return {ok:false,reason:"EMBED_UNAVAILABLE"};
 player.src=url;player.title="Webcam de "+camera.name+" · provedor "+camera.publisher;
 player.hidden=false;screen.hidden=true;nowPlaying=camera;playing=true;
 const n=make("span","jarvis-worldcam-hint",
   " Reprodução solicitada ao provedor. Não é possível comprovar automaticamente "+
   "se o sinal está ao vivo ou se o provedor bloqueou a incorporação.");
 notice.append(n);
 return {ok:true,requested:true,liveVerified:false};
}
function optionList(select,entries){
 for(const [v,label] of entries){
  const o=document.createElement("option");o.value=v;o.textContent=label;select.append(o);
 }
}
function build(){
 if(panel?.isConnected)return true;
 // The command center is dynamically mounted after this module loads.
 const stage=document.querySelector(".jarvis-cc-center");
 if(!stage){say("Neural Ring ainda não montado. Tente novamente após a inicialização.");return false;}
 panel=null;
 panel=make("section","jarvis-worldcam-panel");
 panel.hidden=true;panel.setAttribute("role","region");
 panel.setAttribute("aria-label","Câmeras públicas pelo mundo");
 const head=make("header","jarvis-worldcam-head");
 const heading=make("strong","","◈ J.A.R.V.I.S. // VISÃO MUNDIAL");
 const close=make("button","","×");close.type="button";
 close.setAttribute("aria-label","Fechar câmeras mundiais");
 let closePressedAt=0;
 close.addEventListener("pointerdown",event=>{
  if(event.button!==0)return;
  closePressedAt=Date.now();event.stopPropagation();hide();
 });
 close.addEventListener("click",event=>{
  event.stopPropagation();
  if(Date.now()-closePressedAt<850)return;
  hide();
 });
 head.append(heading,close);
 summary=make("p","jarvis-worldcam-summary");
 const toolbar=make("div","jarvis-worldcam-filters");
 queryField=make("input");queryField.type="search";queryField.placeholder="Buscar cidade, país ou câmera";
 queryField.setAttribute("aria-label","Buscar câmera pública por cidade, país ou tema");
 queryField.autocomplete="off";
 countryField=make("select");countryField.setAttribute("aria-label","Filtrar país");
 regionField=make("select");regionField.setAttribute("aria-label","Filtrar continente");
 categoryField=make("select");categoryField.setAttribute("aria-label","Filtrar tipo de câmera");
 optionList(countryField,[["","Todos os países"],...[...new Set(PUBLIC_WORLD_CAMERAS.map(x=>x.country))]
  .sort((a,b)=>a.localeCompare(b,"pt-BR")).map(x=>[x,x])]);
 optionList(regionField,[["","Todas as regiões"],...[...new Set(PUBLIC_WORLD_CAMERAS.map(x=>x.region))].map(x=>[x,x])]);
 optionList(categoryField,[["","Todos os tipos"],...Object.entries(CAMERA_CATEGORY_NAMES)]);
 for(const el of [queryField,regionField,countryField,categoryField]){
  el.addEventListener("input",render);
  toolbar.append(el);
 }
 results=make("div","jarvis-worldcam-results");
 results.setAttribute("aria-label","Câmeras públicas catalogadas");
 const videoArea=make("div","jarvis-worldcam-view");
 screen=make("div","jarvis-worldcam-placeholder",
  "Selecione um local. A câmera será reproduzida somente após o seu clique.");
 player=make("iframe");player.hidden=true;
 player.setAttribute("allow","autoplay; encrypted-media; picture-in-picture");
 player.setAttribute("allowfullscreen","");
 player.referrerPolicy="strict-origin-when-cross-origin";
 player.loading="lazy";
 player.setAttribute("sandbox","allow-scripts allow-same-origin allow-presentation allow-popups");
 videoArea.append(screen,player);
 notice=make("div","jarvis-worldcam-info");
 notice.setAttribute("aria-live","polite");
 const footer=make("footer","jarvis-worldcam-footer");
 footer.append(make("span","",
  "Fonte: catálogo externo. Não é vigilância oficial nem câmera própria. "+
  "Não afirmamos sinal ao vivo sem confirmação."),
  safeLink(WORLD_CAMERAS_HOME,"Catálogo Brasil"),
  safeLink(WORLD_CAMERAS_INTERNATIONAL,"Catálogo internacional"));
 panel.append(head,summary,toolbar,results,videoArea,notice,footer);
 stage.append(panel);
 return true;
}
function render(){
 if(!panel)return;
 const matches=findPublicCameras({
  search:queryField.value,country:countryField.value,
  category:categoryField.value,region:regionField.value
 });
 const info=cameraDirectorySummary();
 summary.textContent=info.indexed+" pontos públicos catalogados ("+
  info.countries.length+" países) · "+info.embedded+
  " com player divulgado · 0 sinais confirmados ao vivo automaticamente";
 results.replaceChildren();
 for(const c of matches){
  const button=make("button","jarvis-worldcam-item");
  button.type="button";button.setAttribute("aria-pressed",String(c.id===selection?.id));
  button.append(make("strong","",c.name),
   make("small","",c.city+" · "+c.country+" · "+CAMERA_CATEGORY_NAMES[c.category]),
   make("small","",c.embedId?"Player publicado no catálogo":"Somente fonte catalogada"));
  button.addEventListener("click",()=>{choose(c);render();});
  results.append(button);
 }
 if(!matches.length)
  results.append(make("p","jarvis-worldcam-empty",
   "Nenhuma câmera deste local consta na seleção inicial. "+
   "Consulte o catálogo de origem; não vamos inventar um feed."));
}
function open({search="",cameraId=null}={}){
 if(!build())return {handled:true,ok:false,reason:"RING_UNAVAILABLE"};
 requested=true;panel.hidden=false;
 if(search){queryField.value=search;countryField.value="";
  regionField.value="";categoryField.value="";}
 let selected=cameraId?PUBLIC_WORLD_CAMERAS.find(x=>x.id===cameraId):null;
 if(!selected&&search){
  const matches=findPublicCameras({search});
  if(matches.length===1)selected=matches[0];
 }
 choose(selected);render();
 const count=findPublicCameras({search:queryField.value}).length;
 say("Central exibida dentro do Neural Ring. "+count+
  " resultado(s) no catálogo verificado. Reproduzir depende de seleção manual e do provedor.");
 return {handled:true,ok:true,count,selected:selected?.id||null,videoStarted:false};
}
function search(term){
 return open({search:term});
}
function status(){
 const summary=cameraDirectorySummary();
 say(summary.indexed+" câmeras catalogadas, "+
  summary.embedded+" links de players incorporáveis; "+
  "não há monitoramento contínuo nem confirmação de sinal ao vivo.");
 return {handled:true,ok:true,...summary,open:requested,
  playing:playing?nowPlaying?.id||null:null};
}
function parse(raw){return parseWorldCameraCommand(raw);}
async function execute(raw){
 const intent=parse(raw);if(!intent)return {handled:false};
 if(intent.type==="close")return hide();
 if(intent.type==="status")return status();
 if(intent.type==="search")return search(intent.term);
 return open();
}
function stop(){
 hide();say("STOP: reprodução de câmeras externas encerrada no Neural Ring.");
 return {ok:true,stopped:true};
}
window.ULTRON_WORLD_CAMERAS={parse,execute,open,search,hide,status,stop,
 get state(){return {open:requested,selected:selection?.id||null,
  playerRequested:playing,liveVerified:false,playing:nowPlaying?.id||null};}};
window.addEventListener("ultron:emergency-stop",stop);
const strip=document.querySelector(".quick-actions");
if(strip&&!document.getElementById("btn-world-public-cameras")){
 const button=make("button","","CÂMERAS MUNDIAIS");
 button.type="button";button.id="btn-world-public-cameras";
 let lastPointerAt=0;
 button.addEventListener("pointerdown",event=>{
  if(event.button!==0)return;
  lastPointerAt=Date.now();
  open();
 });
 button.addEventListener("click",()=>{
  if(Date.now()-lastPointerAt<850)return;
  open();
 });
 strip.append(button);
}
