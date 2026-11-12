// Native meteorological views — no iframe, no remote maps or pop-up.
// Extends the existing Meteorological Center and the SAME ULTRON_EARTH globe.
import {loadRadarManifest,SATELLITE_PRODUCT,RAINVIEWER_ATTRIBUTION} from "./jarvis-meteorological-live.js?v=5.00.0";
import {renderRadarMap,putRadarOnGlobe,clearRadarGlobe,renderSatelliteInsideRing} from "./jarvis-meteorological-ring-layer.js?v=5.00.0";
import {loadInmetStations} from "./jarvis-inmet-stations.js?v=5.00.0";
import {brazilXY,BRAZIL_OUTLINE_URL,geoJSONPaths} from "./jarvis-geospatial-model.js?v=4.96.0";

function install(){
 const base=window.ULTRON_METEO_CENTER;
 const panel=document.querySelector(".jarvis-meteo-center");
 if(!base?.open||!panel||base.__nativeRing) return false;
 const originalOpen=base.open.bind(base),originalClose=base.close.bind(base);
 const content=panel.querySelector(".jarvis-meteo-content");
 const reference=panel.querySelector(".jarvis-meteo-reference");
 const meta=panel.querySelector(".jarvis-meteo-meta");
 const tabButtons=panel.querySelectorAll("[data-meteo-tab]");
 let token=0,clock=null,manifest=null,manifestAt=0,index=0,region="brazil",mode="2d";
 let activeTab="apac",lastError="",nativeCount=0;
 const $=(tag,cls="",value="")=>{const node=document.createElement(tag);if(cls)node.className=cls;
   if(value)node.textContent=value;return node;};
 const note=(message)=>{const node=$("p","jarvis-meteo-native-status",message);content.append(node);return node;};
 const credit=(url,label)=>{
   const a=$("a","jarvis-meteo-credit",label);a.href=url;a.target="_blank";a.rel="noopener noreferrer";
   reference.append(a);return a;
 };
 const stop=()=>{if(clock!==null)clearInterval(clock);clock=null;
   clearRadarGlobe(window.ULTRON_EARTH);};
 function close(){++token;stop();if(mode==="3d")window.ULTRON_EARTH?.close?.();return originalClose();}
 function resetView(){
   content.replaceChildren();reference.replaceChildren();
   panel.dataset.meteoView=mode;panel.dataset.nativeMedia=activeTab;
 }
 const timestamp=t=>new Date(t*1000).toLocaleString("pt-BR",{
   timeZone:"America/Recife",day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"});
 async function radarView(runId,{refresh=false}={}){
   const toolbar=$("div","jarvis-meteo-native-tools");
   const status=note("Consultando mosaicos de radar observados…");
   const imageArea=$("div","jarvis-meteo-native-stage");content.append(imageArea);
   const button=(label,handler)=>{const b=$("button","",label);b.type="button";
      b.addEventListener("click",handler);toolbar.append(b);return b;};
   const scope=$("select");scope.setAttribute("aria-label","Região do radar");
   for(const [key,label] of [["brazil","Brasil"],["pernambuco","Pernambuco"]]){
      const option=$("option","",label);option.value=key;option.selected=region===key;scope.append(option);
   }
   scope.addEventListener("change",()=>{region=scope.value;void open({tab:"radar",view:mode});});
   toolbar.append(scope);
   button("Mapa 2D",()=>void open({tab:"radar",view:"2d"}));
   button("Globo 3D",()=>void open({tab:"radar",view:"3d"}));
   const previous=button("◀",()=>move(-1));
   const next=button("▶",()=>move(1));
   const play=button("Animar",()=>{
     if(clock!==null){clearInterval(clock);clock=null;play.textContent="Animar";return;}
     play.textContent="Pausar";
     clock=setInterval(()=>move(1),1900);
   });
   button("↻ Atualizar",()=>void open({tab:"radar",view:mode,refresh:true}));
   content.prepend(toolbar);
   credit(RAINVIEWER_ATTRIBUTION,"Fonte dos mosaicos: RainViewer");
   reference.append($("small","",
      "API de uso pessoal/educacional. Refletividade azul (dBZ), não mm de chuva acumulada; não é previsão."));
   if(refresh||!manifest||Date.now()-manifestAt>4*60000){
     const response=await loadRadarManifest();
     if(runId!==token||panel.hidden||activeTab!=="radar")return;
     if(!response.ok){lastError=response.error;status.textContent=response.error;return;}
     manifest=response;manifestAt=Date.now();index=response.frames.length-1;
   }
   const frames=manifest.frames;
   index=Math.max(0,Math.min(frames.length-1,index));
   let rendering=0;
   async function draw(){
     const request=++rendering,frame=frames[index];if(runId!==token||panel.hidden)return;
     status.textContent="RADAR · "+(index+1)+"/"+frames.length+
       " · "+timestamp(frame.time)+" (horário de Recife) · "+
       (manifest.stale?"ATENÇÃO: último mosaico está antigo. ":"Últimos mosaicos observados. ")+
       "Cobertura variável; áreas sem eco não confirmam ausência de chuva.";
     previous.disabled=index===0;next.disabled=index===frames.length-1;
     if(mode!=="3d"){
       renderRadarMap(imageArea,manifest,frame,{region});
       nativeCount=imageArea.querySelectorAll("[data-meteo-radar-tiles] image").length;
       return;
     }
     const earth=window.ULTRON_EARTH,opened=await earth?.open?.();
     if(runId!==token||request!==rendering||panel.hidden)return;
     const result=opened?.ok?putRadarOnGlobe(earth,manifest,frame):
       {ok:false,error:opened?.error||"Globo Mapbox indisponível"};
     if(result.ok){
       nativeCount=1;
       imageArea.replaceChildren($("p","",
         "Mosaico verdadeiro aplicado ao globo Mapbox existente. Zoom limitado pelo provedor do radar."));
       earth.focus?.(region==="pernambuco"?-8.3:-14.4,
         region==="pernambuco"?-37.1:-52.8,region==="pernambuco"?5.8:3.5,false,
         region==="pernambuco"?"Pernambuco":"Brasil");
     }else{
       // NEVER pretend the globe.gl alternative has a live radar texture.
       mode="2d";panel.dataset.meteoView="2d";lastError=result.error;
       earth?.close?.();
       status.textContent+=" Globo 3D sem Mapbox/raster: "+result.error+
         " Exibindo o radar REAL em 2D no mesmo Ring.";
       renderRadarMap(imageArea,manifest,frame,{region});
       nativeCount=imageArea.querySelectorAll("[data-meteo-radar-tiles] image").length;
     }
   }
   function move(delta){index=(index+delta+frames.length)%frames.length;void draw();}
   await draw();
 }
 async function satelliteView(runId){
   const tools=$("div","jarvis-meteo-native-tools");
   const button=$("button","","↻ Atualizar imagem");button.type="button";
   button.addEventListener("click",()=>void open({tab:"satellite"}));tools.append(button);content.append(tools);
   const status=note("Carregando o GOES-19 diretamente da NOAA…");
   const area=$("div","jarvis-meteo-native-stage");content.append(area);
   renderSatelliteInsideRing(area,{onStatus:r=>{
     if(runId!==token||panel.hidden||activeTab!=="satellite")return;
     nativeCount=r.ok?1:0;
     status.textContent=r.ok?
       "Imagem real GOES-19 / NOAA-CIRA dentro do Neural Ring. "+
       "Data e hora exatas da captura não foram verificadas; GeoColor (visível/IR) NÃO mede chuva em mm.":
       "A imagem NOAA não carregou. Não há substituição fictícia.";
   }});
   credit(SATELLITE_PRODUCT.source,"Crédito: NOAA/CIRA · GOES-19 GeoColor");
   reference.append($("small","",SATELLITE_PRODUCT.notice));
 }
 async function inmetView(runId){
   const status=note("Consultando posições das estações do INMET…");
   const report=await loadInmetStations();
   if(runId!==token||panel.hidden||activeTab!=="inmet")return;
   if(!report.ok){lastError=report.error;status.textContent=report.error;return;}
   status.textContent="INMET · "+report.count+" estações cadastradas, "+report.operational+
     " marcadas como operantes. São POSIÇÕES e situação operacional, não valores de chuva.";
   const area=$("div","jarvis-meteo-native-stage");content.append(area);
   const svg=document.createElementNS("http://www.w3.org/2000/svg","svg");
   svg.setAttribute("viewBox","0 0 900 550");svg.setAttribute("role","img");
   svg.classList.add("jarvis-meteo-inmet-map");
   const ns="http://www.w3.org/2000/svg";
   const make=(name,attrs)=>{const el=document.createElementNS(ns,name);
     for(const [key,val] of Object.entries(attrs))el.setAttribute(key,String(val));return el;};
   svg.append(make("rect",{width:900,height:550,fill:"#092238"}));
   // Same IBGE geographic outline used in the existing world map.
   const contour=make("g",{"data-inmet-outline":"pending"});
   svg.append(contour);
   void (async()=>{
     try{
       const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),6500);
       let response;try{response=await fetch(BRAZIL_OUTLINE_URL,{signal:ctl.signal});}
       finally{clearTimeout(timer);}
       if(!response.ok||runId!==token||!svg.isConnected)return;
       const paths=geoJSONPaths(await response.json(),{projection:"brazil"});
       for(const d of paths)contour.append(make("path",{d,fill:"#123950",
         stroke:"#76b0cb","stroke-width":1.6,"fill-opacity":.27}));
       contour.setAttribute("data-inmet-outline",paths.length?"ibge":"unavailable");
     }catch{contour.setAttribute("data-inmet-outline","unavailable");}
   })();
   const detail=$("p","jarvis-meteo-station-detail","Selecione um ponto: nome da estação, UF e situação.");
   const entries=report.stations.slice(0,600);
   for(const item of entries){
     const {x,y}=brazilXY(item.lng,item.lat);
     const dot=make("circle",{cx:x,cy:y,r:4.5,fill:item.operational?"#65e4b6":"#bd7f85",
       stroke:"#dbedfa","stroke-width":.7,tabindex:0});
     const tip=make("title");tip.textContent=item.name+" / "+item.state+" · "+
       (item.operational?"Operante":"Não operante");dot.append(tip);
     dot.addEventListener("click",()=>{
       detail.textContent=item.name+" · "+item.state+" · estação "+item.id+
         " · "+(item.operational?"Operante":"Não operante")+
         ". Não significa chuva observada.";
     });
     svg.append(dot);
   }
   area.append(svg,detail);
   nativeCount=entries.length;
   reference.append($("small","",report.disclaimer));
   credit(report.source,"Catálogo público de estações INMET");
 }
 async function open({tab="radar",view="2d",refresh=false}={}){
   ++token;stop();mode=view==="3d"?"3d":"2d";activeTab=tab;lastError="";nativeCount=0;
   const runId=token;
   // Base provides the same center, closes competing geographic visualizations
   // and maintains the original APAC / forecast controls.
   const result=await originalOpen({tab,view,refresh});
   if(runId!==token||!result?.ok)return result;
   if(["apac","forecast"].includes(tab)){
     panel.dataset.meteoView=mode;
     panel.dataset.nativeMedia=tab;
     return result;
   }
   resetView();
   meta.textContent=tab==="radar"?
     "RADAR REAL · mosaicos RainViewer em 2D / globo 3D Mapbox. Não é previsão nem o radar exclusivo do INPE.":
     tab==="satellite"?
     "SATÉLITE REAL · GOES-19 NOAA/CIRA, disco completo diretamente no Neural Ring.":
     "INMET · estações georreferenciadas; catálogo não inclui precipitação observada.";
   for(const node of tabButtons)node.setAttribute("aria-pressed",String(node.dataset.meteoTab===tab));
   if(tab==="radar")await radarView(runId,{refresh});
   else if(tab==="satellite")await satelliteView(runId);
   else if(tab==="inmet")await inmetView(runId);
   return {ok:true,visible:!panel.hidden,tab,view:mode,source:
      tab==="radar"?RAINVIEWER_ATTRIBUTION:tab==="satellite"?SATELLITE_PRODUCT.source:
       "https://apitempo.inmet.gov.br/estacoes/T"};
 }
 // Capture handlers installed by the original center so a click does not
 // reopen a remote-link card. No external map ever replaces the Ring.
 panel.addEventListener("click",event=>{
   const tab=event.target.closest?.("[data-meteo-tab]");
   if(tab){event.preventDefault();event.stopPropagation();
      void open({tab:tab.dataset.meteoTab,view:"2d"});return;}
   if(panel.querySelector(".jarvis-meteo-head button")===event.target||
      event.target.closest?.(".jarvis-meteo-head button")){
      event.preventDefault();event.stopPropagation();close();
   }
 },true);
 const quick=document.getElementById("btn-meteo-center");
 quick?.addEventListener("click",event=>{
   event.preventDefault();event.stopImmediatePropagation();void open({tab:"radar",view:"2d"});
 },true);
 window.addEventListener("ultron:new-conversation",()=>{stop();++token;});
 window.ULTRON_METEO_CENTER={
   ...base,open,close,__nativeRing:true,
   get state(){return {...base.state,tab:activeTab,view:mode,
     radarFrames:manifest?.frames.length||0,radarFrame:index,
     nativeCount,lastError,region};}
 };
 return true;
}
if(!install()){
 const timer=setInterval(()=>{if(install())clearInterval(timer);},100);
 setTimeout(()=>clearInterval(timer),12000);
}
