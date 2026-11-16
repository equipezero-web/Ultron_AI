import {PUBLIC_WORLD_CAMERAS, CAMERA_CATEGORY_NAMES, CAMERA_PROVIDER_NAMES,
 WORLD_CAMERAS_CATALOGS, cameraProvider, WORLD_CAMERAS_HOME,
 WORLD_CAMERAS_INTERNATIONAL, WORLD_CAMERAS_ALTERNATIVE_ID,
 getWorldCameraAlternative, getWesternWallPlayableAlternative,
 WESTERN_WALL_EARTHCAM_ID,WESTERN_WALL_OFFICIAL_CAMERAS_URL,
 findPublicCameras, parseWorldCameraCommand,
 publicCameraEmbed, cameraDirectorySummary} from "./jarvis-public-world-cameras-model.js?v=5.38.0";

// Public third-party webcams only. Nothing here activates user/device cameras.
// Playing a listed stream is NOT proof that its owner is currently broadcasting.
const output=document.getElementById("output-box");
const make=(tag,cls,txt)=>{
 const el=document.createElement(tag);if(cls)el.className=cls;
 if(txt!==undefined)el.textContent=String(txt);return el;
};
let panel=null,queryField=null,countryField=null,categoryField=null,regionField=null,providerField=null;
let results=null,player=null,screen=null,nowPlaying=null,notice=null,summary=null;
let audioBar=null,audioButton=null,audioLabel=null;
let requested=false,selection=null,playing=false,userReportedFailure=null;
let audioRequested=false;
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
function sendYouTubeSound(command){
 if(!playing||cameraProvider(nowPlaying)!=="webcamera24"||!player?.contentWindow)return false;
 try{
  player.contentWindow.postMessage(JSON.stringify({
   event:"command",func:command,args:[]
  }),"https://www.youtube-nocookie.com");
  return true;
 }catch{return false;}
}
function syncAudio(){
 if(!audioBar||!audioButton||!audioLabel)return;
 const supported=playing&&cameraProvider(nowPlaying)==="webcamera24";
 audioBar.hidden=!supported;
 audioButton.textContent=audioRequested?"DESATIVAR ÁUDIO":"ATIVAR ÁUDIO";
 audioButton.setAttribute("aria-pressed",String(audioRequested));
 audioButton.disabled=!supported;
 audioLabel.textContent=!supported?"":audioRequested?
  "Ativação solicitada ao YouTube; o som não pôde ser confirmado automaticamente.":
  "Áudio desativado por padrão. Seu clique é necessário para ativar.";
}
function toggleAudio(){
 if(!playing||cameraProvider(nowPlaying)!=="webcamera24")
  return {ok:false,reason:"NO_MANAGED_PLAYER",audioRequested:false};
 const next=!audioRequested;
 if(!sendYouTubeSound(next?"unMute":"mute"))
  return {ok:false,reason:"PLAYER_UNAVAILABLE",audioRequested:false};
 audioRequested=next;syncAudio();
 return {ok:true,audioRequested:next,audioVerified:false};
}
function endPlayback(){
 if(playing)sendYouTubeSound("mute");
 playing=false;nowPlaying=null;audioRequested=false;
 if(player){player.removeAttribute("src");player.hidden=true;}
 if(screen)screen.hidden=false;
 syncAudio();
}
function hide(){
 requested=false;selection=null;userReportedFailure=null;endPlayback();
 if(panel)panel.hidden=true;
 return {handled:true,ok:true,closed:true};
}
function choose(camera,{autoPlay=false}={}){
 selection=camera;userReportedFailure=null;endPlayback();
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
 }else if(camera.id===WORLD_CAMERAS_ALTERNATIVE_ID){
  notice.append(make("span","jarvis-worldcam-hint",
   "Esta câmera pertence à SkylineWebcams; seu vídeo ao vivo não pode ser "+
   "incorporado aqui. Há outra transmissão do MESMO LOCAL pela EarthCam no YouTube "+
   "(outra câmera e outro ângulo, não é o vídeo da SkylineWebcams)."));
  const samePlace=getWesternWallPlayableAlternative(camera);
  if(samePlace){
   const button=make("button","jarvis-worldcam-same-place",
    "ASSISTIR AO MURO OCIDENTAL NO NEURAL · EARTHCAM");
   button.type="button";
   button.title="Abrir o player YouTube oficial da EarthCam no Neural Jarvis, inicialmente sem áudio";
   button.addEventListener("click",()=>{
    if(!requested||selection?.id!==camera.id)return;
    choose(samePlace);
    render();
    startPlayback(samePlace);
   });
   notice.append(button);
  }
  notice.append(safeLink(WESTERN_WALL_OFFICIAL_CAMERAS_URL,
   "Outras câmeras oficiais · Fundação do Muro Ocidental"));
 }else{
  notice.append(make("span","jarvis-worldcam-hint",
   "O catálogo não forneceu um player incorporável confirmado. "+
   "Abra a fonte para conferir a transmissão; nenhum vídeo será inventado."));
 }
 // When one provider's player is blocked/unavailable, offer an actual
 // additional public source without silently changing the selected location.
 const alternative=getWorldCameraAlternative();
 if(alternative&&camera.id!==alternative.id){
  const hint=make("span","jarvis-worldcam-hint",
   "Se esta transmissão falhar, há outra câmera pública em JERUSALÉM "+
   "(local diferente), hospedada na SkylineWebcams:");
  const link=safeLink(alternative.sourceUrl,"ALTERNATIVA · JERUSALÉM / MURO OCIDENTAL");
  link.classList.add("jarvis-worldcam-fallback");
  notice.append(hint,link);
 }
 if(autoPlay&&camera.embedId)startPlayback(camera);
}
function startPlayback(camera){
 if(!requested||!selection||camera.id!==selection.id)return {ok:false,reason:"NO_SELECTION"};
 const url=publicCameraEmbed(camera);
 if(!url)return {ok:false,reason:"EMBED_UNAVAILABLE"};
 audioRequested=false;
 player.src=url;player.title="Webcam de "+camera.name+" · provedor "+camera.publisher;
 player.hidden=false;screen.hidden=true;nowPlaying=camera;playing=true;
 syncAudio();
 userReportedFailure=null;
 const n=make("span","jarvis-worldcam-hint",
   " Reprodução solicitada ao provedor"+
   (camera.id===WESTERN_WALL_EARTHCAM_ID?" EarthCam / YouTube, outro ângulo do Muro Ocidental. ":" . ")+
   "Não é possível comprovar automaticamente se o sinal está ao vivo "+
   "ou se o provedor bloqueou a incorporação.");
 const failure=make("button","jarvis-worldcam-playback-failed",
   "VÍDEO FALHOU / INDISPONÍVEL");
 failure.type="button";
 failure.addEventListener("click",()=>{
  if(!selection||camera.id!==selection.id)return;
  // User report, NOT an automatic determination that the source is offline.
  userReportedFailure=camera.id;
  endPlayback();
  notice.querySelectorAll(".jarvis-worldcam-playback-failed").forEach(node=>node.remove());
  notice.append(make("span","jarvis-worldcam-hint",
   "Reprodução encerrada após seu aviso. A disponibilidade do provedor não foi verificada. "+
   (camera.id===WESTERN_WALL_EARTHCAM_ID?
    "Experimente a fonte original no YouTube ou as câmeras da Fundação do Muro Ocidental.":
    "Você pode abrir a fonte original ou consultar uma câmera alternativa de Jerusalém.")));
  if(camera.id===WESTERN_WALL_EARTHCAM_ID)
   notice.append(safeLink(WESTERN_WALL_OFFICIAL_CAMERAS_URL,
    "Câmeras oficiais do Muro Ocidental"));
 });
 notice.append(n,failure);
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
 providerField=make("select");providerField.setAttribute("aria-label","Filtrar provedor de câmeras");
 optionList(countryField,[["","Todos os países"],...[...new Set(PUBLIC_WORLD_CAMERAS.map(x=>x.country))]
  .sort((a,b)=>a.localeCompare(b,"pt-BR")).map(x=>[x,x])]);
 optionList(regionField,[["","Todas as regiões"],...[...new Set(PUBLIC_WORLD_CAMERAS.map(x=>x.region))].map(x=>[x,x])]);
 optionList(categoryField,[["","Todos os tipos"],...Object.entries(CAMERA_CATEGORY_NAMES)]);
 optionList(providerField,[["","Todos os provedores"],...Object.entries(CAMERA_PROVIDER_NAMES).filter(([k])=>k!=="all")]);
 for(const el of [queryField,regionField,countryField,categoryField,providerField]){
  el.addEventListener("input",render);
  toolbar.append(el);
 }
 const catalogs=make("details","jarvis-worldcam-catalogs");
 catalogs.append(make("summary","","EXPLORAR TODOS OS CATÁLOGOS · SKYLINE / WEBCAMERA24"));
 const directory=make("div","jarvis-worldcam-catalog-grid");
 for(const provider of WORLD_CAMERAS_CATALOGS){
  const card=make("section","jarvis-worldcam-catalog-card");
  card.append(make("strong","",provider.label),make("small","",provider.note));
  const links=make("div","jarvis-worldcam-catalog-links");
  for(const [name,url] of [["TODAS AS CÂMERAS",provider.all],
   ["PAÍSES",provider.countries],["CATEGORIAS",provider.categories]]){
   const link=safeLink(url,name);
   link.dataset.catalogProvider=provider.id;
   link.dataset.catalogSection=name;
   links.append(link);
  }
  card.append(links);directory.append(card);
 }
 catalogs.append(directory);
 results=make("div","jarvis-worldcam-results");
 results.setAttribute("aria-label","Seleção local de câmeras públicas catalogadas");
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
 player.addEventListener("load",()=>{
  if(playing&&cameraProvider(nowPlaying)==="webcamera24"&&!audioRequested)
   sendYouTubeSound("mute");
 });
 audioBar=make("div","jarvis-worldcam-audio");audioBar.hidden=true;
 audioButton=make("button","jarvis-worldcam-audio-toggle","ATIVAR ÁUDIO");
 audioButton.type="button";audioButton.setAttribute("aria-label",
  "Ativar ou desativar manualmente o áudio de um player Webcamera24");
 audioButton.setAttribute("aria-pressed","false");
 audioButton.addEventListener("click",toggleAudio);
 audioLabel=make("span","jarvis-worldcam-audio-label","Áudio desativado por padrão.");
 audioBar.append(audioButton,audioLabel);
 notice=make("div","jarvis-worldcam-info");
 notice.setAttribute("aria-live","polite");
 const footer=make("footer","jarvis-worldcam-footer");
 footer.append(make("span","",
  "Fonte: catálogo externo. Não é vigilância oficial nem câmera própria. "+
  "Não afirmamos sinal ao vivo sem confirmação."),
  safeLink(WORLD_CAMERAS_HOME,"Catálogo Brasil"),
  safeLink(WORLD_CAMERAS_INTERNATIONAL,"Catálogo internacional"));
 panel.append(head,summary,toolbar,catalogs,results,videoArea,audioBar,notice,footer);
 stage.append(panel);
 return true;
}
function render(){
 if(!panel)return;
 const matches=findPublicCameras({
  search:queryField.value,country:countryField.value,
  category:categoryField.value,region:regionField.value,provider:providerField.value
 });
 const info=cameraDirectorySummary();
 summary.textContent=info.indexed+" câmeras selecionadas ("+
  info.countries.length+" países) · "+info.embedded+
  " com player divulgado · 2 catálogos mundiais completos via links · "+
  "0 sinais confirmados automaticamente";
 results.replaceChildren();
 for(const c of matches){
  const button=make("button","jarvis-worldcam-item");
  button.type="button";button.setAttribute("aria-pressed",String(c.id===selection?.id));
  button.append(make("strong","",c.name),
   make("small","",c.city+" · "+c.country+" · "+CAMERA_CATEGORY_NAMES[c.category]),
   make("small","",CAMERA_PROVIDER_NAMES[cameraProvider(c)]+" · "+
    (c.embedId?"Player divulgado (mudo ao iniciar)":"Vídeo na página do provedor")));
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
  regionField.value="";categoryField.value="";providerField.value="";}
 let selected=cameraId?PUBLIC_WORLD_CAMERAS.find(x=>x.id===cameraId):null;
 if(!selected&&search){
  const matches=findPublicCameras({search});
  if(matches.length===1)selected=matches[0];
 }
 choose(selected);render();
 const count=findPublicCameras({search:queryField.value}).length;
 say("Central exibida dentro do Neural Ring: "+count+
  " câmeras selecionadas indexadas e links para os catálogos mundiais completos "+
  "SkylineWebcams / Webcamera24. Áudio Webcamera24 mudo por padrão.");
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
window.ULTRON_WORLD_CAMERAS={parse,execute,open,search,hide,status,stop,toggleAudio,
 get state(){return {open:requested,selected:selection?.id||null,
  playerRequested:playing,liveVerified:false,playing:nowPlaying?.id||null,
  audioRequested:audioRequested,audioVerified:false,
  managedAudio:playing&&cameraProvider(nowPlaying)==="webcamera24",
  globalCatalogs:WORLD_CAMERAS_CATALOGS.length,
  userReportedFailure:userReportedFailure||null,
  alternativeSource:getWorldCameraAlternative()?.sourceUrl||null};}};
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
