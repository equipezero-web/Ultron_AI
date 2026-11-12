import {METEO_VIEWERS,APAC_HOURS,loadApacObservations} from "./jarvis-meteorological-sources.js?v=4.98.0";

const stage=document.querySelector(".jarvis-cc-center");
if(stage){
 const panel=document.createElement("section");
 panel.className="jarvis-meteo-center";panel.hidden=true;
 panel.setAttribute("aria-label","Centro meteorológico JARVIS dentro do Neural Ring");
 const head=document.createElement("header");head.className="jarvis-meteo-head";
 const title=document.createElement("strong");title.textContent="J.A.R.V.I.S. // METEOROLOGIA";
 const closeButton=document.createElement("button");closeButton.textContent="×";closeButton.type="button";
 closeButton.setAttribute("aria-label","Fechar centro meteorológico");
 head.append(title,closeButton);
 const tabs=document.createElement("nav");tabs.className="jarvis-meteo-tabs";
 tabs.setAttribute("aria-label","Fontes meteorológicas independentes");
 const tabLabels={radar:"Radar INPE",satellite:"GOES-19",inmet:"INMET",apac:"APAC · PE",forecast:"Previsão"};
 const buttons={};
 for(const [key,label] of Object.entries(tabLabels)){
   const b=document.createElement("button");b.type="button";b.textContent=label;b.dataset.meteoTab=key;
   b.setAttribute("aria-pressed","false");tabs.append(b);buttons[key]=b;
   b.addEventListener("click",()=>void open({tab:key}));
 }
 const meta=document.createElement("p");meta.className="jarvis-meteo-meta";
 const content=document.createElement("div");content.className="jarvis-meteo-content";
 const reference=document.createElement("p");reference.className="jarvis-meteo-reference";
 panel.append(head,tabs,meta,content,reference);stage.append(panel);
 for(const name of ["pointerdown","pointerup","wheel","click","touchstart","touchend"]){
   panel.addEventListener(name,event=>event.stopPropagation(),{passive:true});
 }
 let current="radar",view="2d",hours=24,loadToken=0,lastReport=null;
 const resetContent=()=>{content.replaceChildren();reference.replaceChildren();};
 const note=(value)=>{const p=document.createElement("p");p.className="jarvis-meteo-note";p.textContent=value;content.append(p);return p;};
 const sourceLink=(source,label="Abrir visualizador oficial")=>{
   const a=document.createElement("a");a.href=source.url;a.target="_blank";a.rel="noopener noreferrer";
   a.textContent=label;return a;
 };
 function close(){
   loadToken++;panel.hidden=true;content.replaceChildren();reference.replaceChildren();
   window.ULTRON_EARTH?.clearThematicLayer?.();
   if(current==="apac"&&view==="3d")window.ULTRON_EARTH?.close?.();
   return {ok:true,visible:false};
 }
 function mapPoint(lat,lng){return{x:32+(lng+42)*90,y:30+(-3-lat)*72};}
 function showApac2D(report){
   const box=document.createElement("div");box.className="jarvis-meteo-apac-map";
   const svg=document.createElementNS("http://www.w3.org/2000/svg","svg");
   svg.setAttribute("viewBox","0 0 850 550");svg.setAttribute("role","img");
   svg.setAttribute("aria-label","Gráfico georreferenciado de pluviômetros APAC em Pernambuco, sem limites administrativos");
   const e=(tag,attrs={})=>{const n=document.createElementNS("http://www.w3.org/2000/svg",tag);
     for(const [key,value] of Object.entries(attrs))n.setAttribute(key,String(value));return n;};
   svg.append(e("rect",{x:0,y:0,width:850,height:550,fill:"#092539"}));
   for(let x=60;x<830;x+=135)svg.append(e("line",{x1:x,y1:25,x2:x,y2:535,stroke:"#31516b","stroke-dasharray":"4 7"}));
   for(let y=35;y<530;y+=110)svg.append(e("line",{x1:28,y1:y,x2:820,y2:y,stroke:"#31516b","stroke-dasharray":"4 7"}));
   for(const p of report.stations){
     const {x,y}=mapPoint(p.lat,p.lng);if(x<15||x>830||y<15||y>535)continue;
     const dot=e("circle",{cx:x,cy:y,r:Math.max(4,Math.min(12,5+Math.sqrt(p.value||0)*0.65)),
       fill:p.color,stroke:"#ebf7ff","stroke-width":1.2,tabindex:0});
     dot.classList.add("jarvis-meteo-gauge");
     dot.setAttribute("data-station",p.id);
     dot.setAttribute("aria-label",p.name+": "+p.value+" mm acumulados em "+report.hours+"h");
     const desc=e("title");desc.textContent=p.name+" / "+p.city+": "+p.value+" mm; leitura: "+p.lastReading;
     dot.append(desc);svg.append(dot);
     const onSelect=()=>{reference.textContent=p.name+" · "+p.city+" · "+p.value+
       " mm em "+report.hours+"h · Última leitura registrada: "+p.lastReading+
       " · Fonte APAC. Acumulado pluviométrico, não radar.";};
     dot.addEventListener("click",onSelect);
     dot.addEventListener("keydown",event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();onSelect();}});
   }
   const legend=e("text",{x:24,y:540,fill:"#a6c4da","font-size":16});
   legend.textContent="Posições geográficas esquemáticas · longitude / latitude · sem polígonos de municípios";
   svg.append(legend);box.append(svg);content.append(box);
 }
 async function showApac3D(report){
   const earth=window.ULTRON_EARTH;
   if(!earth?.open||!earth?.setThematicLayer){note("Globo 3D indisponível. As observações permanecem consultáveis em 2D.");view="2d";showApac2D(report);return;}
   const result=await earth.open();if(result?.ok===false){note("Não foi possível abrir o globo 3D; mostrando pluviômetros em 2D.");
     view="2d";showApac2D(report);return;}
   const points=report.stations.slice(0,120).map(p=>({
     id:"apac-"+p.id,name:p.name,lat:p.lat,lng:p.lng,color:p.color,kind:"weather",
     detail:p.value+" mm em "+report.hours+" horas; leitura: "+p.lastReading
   }));
   earth.setThematicLayer(points,{playing:false});
   if(points.length)earth.focus?.(-8.4,-36.9,4,false,"Pernambuco · APAC");
   note("Globo 3D exibindo "+points.length+" estações APAC georreferenciadas. Não são células de radar.");
 }
 async function apacView(token,{refresh=true}={}){
   const form=document.createElement("div");form.className="jarvis-meteo-filters";
   const windowChoice=document.createElement("select");windowChoice.setAttribute("aria-label","Acumulado APAC por horas");
   for(const n of Object.keys(APAC_HOURS)){const opt=document.createElement("option");opt.value=n;
     opt.textContent=n+"h";if(Number(n)===hours)opt.selected=true;windowChoice.append(opt);}
   const button=document.createElement("button");button.type="button";button.textContent="Atualizar leituras";
   const twoD=document.createElement("button");twoD.type="button";twoD.textContent="2D";
   const threeD=document.createElement("button");threeD.type="button";threeD.textContent="Globo 3D";
   const retry=()=>void open({tab:"apac",view});
   windowChoice.addEventListener("change",()=>{hours=Number(windowChoice.value);lastReport=null;retry();});
   button.addEventListener("click",()=>{lastReport=null;retry();});
   twoD.addEventListener("click",()=>void open({tab:"apac",view:"2d",refresh:false}));
   threeD.addEventListener("click",()=>void open({tab:"apac",view:"3d",refresh:false}));
   form.append(windowChoice,button,twoD,threeD);content.append(form);
   const status=note("Consultando estações reais da APAC. Não é radar meteorológico.");
   const report=!refresh&&lastReport?.hours===hours?lastReport:await loadApacObservations({hours});
   if(token!==loadToken||panel.hidden||current!=="apac")return;
   status.remove();
   if(!report.ok){note(report.error+" Nenhum valor fictício será exibido.");reference.append(sourceLink(METEO_VIEWERS.apac,"Consultar serviço oficial APAC"));return;}
   lastReport=report;
   const summary=note(report.count+" estações com leitura válida · acumulado de "+hours+
     " horas · consultado em "+new Date(report.checkedAt).toLocaleString("pt-BR")+
     ". Horário de cada estação no detalhe. "+report.warning);
   summary.setAttribute("data-meteo-provenance","observed");
   if(view==="3d")await showApac3D(report);
   else{window.ULTRON_EARTH?.clearThematicLayer?.();showApac2D(report);}
   reference.append(sourceLink(METEO_VIEWERS.apac,"Fonte: serviço geográfico APAC"));
 }
 function showRemoteViewer(tab){
   const src=METEO_VIEWERS[tab];
   meta.textContent=src.title+" · "+src.description;
   note("Visualizador oficial externo. O J.A.R.V.I.S. não valida automaticamente o horário da última imagem. "+
     "Se o site bloquear a incorporação, use o link oficial logo abaixo.");
   const frame=document.createElement("iframe");frame.className="jarvis-meteo-official-frame";
   frame.title=src.title;frame.loading="lazy";frame.referrerPolicy="no-referrer";
   frame.setAttribute("sandbox","allow-scripts allow-same-origin allow-forms");
   frame.src=src.url;content.append(frame);
   reference.append(sourceLink(src,"Abrir "+src.title+" no site oficial"));
   const second=document.createElement("small");second.textContent=
     "Radar, satélite e alertas são observações/produtos distintos. A fonte pode limitar cobertura ou atualização.";
   reference.append(second);
 }
 function showForecast(){
   meta.textContent=METEO_VIEWERS.forecast.description;
   note("Previsão numérica não é radar nem precipitação medida. A camada de modelo está separada do monitoramento oficial.");
   const button=document.createElement("button");button.type="button";button.className="jarvis-meteo-forecast-button";
   button.textContent="Mostrar previsão no mapa 2D (Recife)";
   button.addEventListener("click",async()=>{
     close();await window.ULTRON_ORCHESTRATOR?.execute?.("Mostre a previsão do tempo em Recife no mapa 2D","meteorological-center");
   });content.append(button);
   reference.append(sourceLink(METEO_VIEWERS.forecast,"Documentação do modelo Open-Meteo"));
 }
 async function open({tab="radar",view:desiredView="2d",refresh=true}={}){
   if(!Object.hasOwn(METEO_VIEWERS,tab))return {ok:false,error:"Fonte desconhecida."};
   const token=++loadToken;current=tab;view=desiredView==="3d"?"3d":"2d";
   if(!stage)return {ok:false,error:"Neural Ring indisponível."};
   window.ULTRON_GEO_VISUAL?.close?.();window.ULTRON_NEURAL_ANSWER?.clear?.();
   if(tab!=="apac"||view!=="3d")window.ULTRON_EARTH?.close?.();
   resetContent();panel.hidden=false;
   for(const [key,b] of Object.entries(buttons))b.setAttribute("aria-pressed",String(key===tab));
   const src=METEO_VIEWERS[tab];
   meta.textContent=src.title+" · "+src.description;
   if(tab==="apac")await apacView(token,{refresh});
   else if(tab==="forecast")showForecast();
   else showRemoteViewer(tab);
   return {ok:true,tab,view,visible:!panel.hidden,source:src.url,observed:tab==="apac"};
 }
 closeButton.addEventListener("click",close);
 window.addEventListener("ultron:new-conversation",close);
 const quickActions=document.querySelector(".quick-actions");
 if(quickActions&&!document.getElementById("btn-meteo-center")){
   const openButton=document.createElement("button");openButton.id="btn-meteo-center";
   openButton.type="button";openButton.textContent="RADAR / METEO";
   openButton.addEventListener("click",()=>void open({tab:"radar"}));
   quickActions.append(openButton);
 }
 window.ULTRON_METEO_CENTER={open,close,get state(){return {visible:!panel.hidden,tab:current,view,hours,
   stationCount:lastReport?.count||0,source:METEO_VIEWERS[current].url};}};
}
