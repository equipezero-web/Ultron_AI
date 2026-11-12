import {METEO_VIEWERS,APAC_HOURS,loadApacObservations} from "./jarvis-meteorological-sources.js?v=4.99.0";
import {analyzeApacRain,APAC_RAIN_BANDS,apacBand,mmLabel,apacProjection,apacInsideMainland,loadApacBoundary} from "./jarvis-rain-understanding.js?v=4.99.0";

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
 let current="radar",view="2d",hours=24,loadToken=0,lastReport=null,citySearch="",onlyWet=true,outlines=null;
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
 function drawApacOutline(svg,group,token){
   if(!outlines)outlines=loadApacBoundary();
   void outlines.then(rings=>{
     if(token!==loadToken||!svg.isConnected)return;
     group.replaceChildren();
     for(const ring of rings.slice(0,80)){
       const commands=[];
       for(const [lng,lat] of ring){
         if(lng< -41.7||lng> -34.4||lat< -9.7||lat> -6.5)continue;
         const p=apacProjection(lng,lat);
         commands.push((commands.length?"L":"M")+p.x.toFixed(1)+" "+p.y.toFixed(1));
       }
       if(commands.length>=3){
         const shape=document.createElementNS("http://www.w3.org/2000/svg","path");
         shape.setAttribute("d",commands.join(" ")+" Z");
         shape.setAttribute("fill","#1e5065");shape.setAttribute("fill-opacity",".40");
         shape.setAttribute("stroke","#80b2cc");shape.setAttribute("stroke-width","1.4");
         group.append(shape);
       }
     }
     group.dataset.outline=group.childNodes.length?"official":"unavailable";
   }).catch(()=>group.dataset.outline="unavailable");
 }
 function showApac2D(report){
   const analysis=analyzeApacRain(report,{search:citySearch,rainOnly:onlyWet});
   const box=document.createElement("div");box.className="jarvis-meteo-apac-map";
   const svg=document.createElementNS("http://www.w3.org/2000/svg","svg");
   svg.setAttribute("viewBox","0 0 900 450");svg.setAttribute("role","img");
   svg.setAttribute("aria-label","Mapa de estações APAC em Pernambuco com chuva acumulada e legenda");
   const e=(tag,attrs={})=>{const n=document.createElementNS("http://www.w3.org/2000/svg",tag);
     for(const [key,value] of Object.entries(attrs))n.setAttribute(key,String(value));return n;};
   svg.append(e("rect",{x:0,y:0,width:900,height:450,fill:"#0b2538"}));
   for(let x=40;x<880;x+=140)svg.append(e("line",{x1:x,x2:x,y1:25,y2:430,stroke:"#31516b","stroke-dasharray":"4 7"}));
   for(let y=35;y<450;y+=95)svg.append(e("line",{x1:35,x2:865,y1:y,y2:y,stroke:"#31516b","stroke-dasharray":"4 7"}));
   const outline=e("g",{"data-meteo-state-outline":"loading"});svg.append(outline);
   const points=e("g",{"data-meteo-points":"true"});svg.append(points);
   const info=document.createElement("p");info.className="jarvis-meteo-station-detail";
   info.textContent="Toque em uma estação no mapa ou na lista para consultar o valor, município e horário registrado.";
   const addDot=(p,x,y)=>{
     const dot=e("circle",{cx:x,cy:y,r:Math.max(5,Math.min(13,5+Math.sqrt(p.value)*.85)),
       fill:apacBand(p.value).color,stroke:"#ebf7ff","stroke-width":1.2,tabindex:0});
     dot.classList.add("jarvis-meteo-gauge");dot.dataset.station=p.id;
     dot.setAttribute("aria-label",p.name+": "+mmLabel(p.value)+" em "+report.hours+" h");
     const hint=e("title");hint.textContent=p.name+" / "+p.city+": "+mmLabel(p.value)+"; leitura: "+p.lastReading;
     dot.append(hint);points.append(dot);
     const select=()=>{
       info.textContent=p.name+" · "+(p.city||"Município não informado")+" · "+mmLabel(p.value)+
         " acumulados em "+report.hours+" h · última leitura informada pela APAC: "+p.lastReading+".";
       for(const node of points.querySelectorAll(".jarvis-meteo-gauge"))
         node.classList.toggle("selected",node===dot);
     };
     dot.addEventListener("click",select);
     dot.addEventListener("keydown",event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();select();}});
     return select;
   };
   const main=analysis.filtered.filter(apacInsideMainland);
   const islands=analysis.filtered.filter(p=>!apacInsideMainland(p));
   for(const p of main){
     const xy=apacProjection(p.lng,p.lat);
     if(xy.x>=15&&xy.x<=885&&xy.y>=15&&xy.y<=435)addDot(p,xy.x,xy.y);
   }
   if(islands.length){
     const bg=e("rect",{x:696,y:32,width:190,height:100,rx:6,fill:"#153649",stroke:"#7da5b9"});
     svg.append(bg);
     const lbl=e("text",{x:703,y:51,fill:"#e0f2fa","font-size":14});
     lbl.textContent="ILHAS / FORA DO MAPA";svg.append(lbl);
     islands.slice(0,16).forEach((p,i)=>addDot(p,710+(i%7)*23,75+Math.floor(i/7)*23));
   }
   const subtitle=e("text",{x:22,y:438,fill:"#aad0e1","font-size":15});
   subtitle.textContent="PERNAMBUCO · longitude e latitude · seleção por estação";svg.append(subtitle);
   box.append(svg);content.append(box,info);
   drawApacOutline(svg,outline,loadToken);
   return info;
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
 function renderApacUnderstanding(report){
   const analysis=analyzeApacRain(report,{search:citySearch,rainOnly:onlyWet});
   const panel=document.createElement("section");panel.className="jarvis-meteo-summary";
   const title=document.createElement("strong");title.textContent="O QUE ESSES DADOS SIGNIFICAM?";
   const counts=document.createElement("p");
   counts.textContent=analysis.count+" estações com dados · "+analysis.withRain+" registraram chuva (>0 mm) · "+
     analysis.withoutRain+" registraram 0 mm no período de "+report.hours+" horas.";
   const highest=document.createElement("p");
   highest.textContent=analysis.maximum?
      "Maior acumulado entre as estações: "+mmLabel(analysis.maximum.value)+" — "+
        (analysis.maximum.city||"Município não informado")+" / "+analysis.maximum.name+".":
      "Não há máximos de chuva disponíveis.";
   const info=document.createElement("p");info.textContent=
     "1 mm significa 1 litro de água por metro quadrado. Esses acumulados NÃO são radar, previsão nem alerta de inundação.";
   const captured=document.createElement("small");captured.textContent=
     "Consulta: "+new Date(report.checkedAt).toLocaleString("pt-BR")+
     ". Os pluviômetros têm horários próprios, que podem estar atrasados.";
   panel.append(title,counts,highest,info,captured);content.append(panel);
   const legend=document.createElement("div");legend.className="jarvis-meteo-rain-legend";
   const legendTitle=document.createElement("strong");legendTitle.textContent="LEGENDA · CHUVA ACUMULADA";
   legend.append(legendTitle);
   for(const band of APAC_RAIN_BANDS){
     const item=document.createElement("span");item.className="jarvis-meteo-rain-band";
     const patch=document.createElement("i");patch.style.background=band.color;
     const label=document.createElement("span");label.textContent=band.short;
     item.append(patch,label);legend.append(item);
   }
   content.append(legend);
   return analysis;
 }
 function renderApacRanking(report,analysis,detail){
   const section=document.createElement("div");section.className="jarvis-meteo-ranking";
   const title=document.createElement("strong");title.textContent="ONDE MAIS CHOVEU? · MAIORES ACUMULADOS";section.append(title);
   if(!analysis.filtered.length){
     const none=document.createElement("p");
     none.textContent="Nenhuma estação corresponde ao filtro. Desmarque 'Só onde choveu' ou ajuste o município.";
     section.append(none);
   }
   for(const p of analysis.filtered.slice(0,8)){
     const button=document.createElement("button");button.type="button";button.className="jarvis-meteo-ranked";
     const city=document.createElement("span");city.textContent=(p.city||"PE")+" · "+p.name;
     const total=document.createElement("b");total.textContent=mmLabel(p.value);
     button.append(city,total);
     button.addEventListener("click",()=>{detail.textContent=p.name+" · "+p.city+" · "+
        mmLabel(p.value)+" em "+report.hours+" h · leitura: "+p.lastReading+".";
       const svg=content.querySelector(".jarvis-meteo-apac-map svg");
       if(svg)for(const n of svg.querySelectorAll(".jarvis-meteo-gauge"))
         n.classList.toggle("selected",n.dataset.station===p.id);
     });
     section.append(button);
   }
   content.append(section);
 }
 async function apacView(token,{refresh=true}={}){
   const form=document.createElement("div");form.className="jarvis-meteo-filters";
   const windowChoice=document.createElement("select");windowChoice.setAttribute("aria-label","Acumulado APAC por horas");
   for(const n of Object.keys(APAC_HOURS)){const opt=document.createElement("option");opt.value=n;
     opt.textContent=n+"h";if(Number(n)===hours)opt.selected=true;windowChoice.append(opt);}
   const button=document.createElement("button");button.type="button";button.textContent="Atualizar leituras";
   const twoD=document.createElement("button");twoD.type="button";twoD.textContent="Mapa 2D";
   const threeD=document.createElement("button");threeD.type="button";threeD.textContent="Globo 3D";
   const search=document.createElement("input");search.type="search";search.className="jarvis-meteo-search";
   search.setAttribute("aria-label","Buscar município ou estação");search.placeholder="Buscar município";
   search.value=citySearch;
   const wetLabel=document.createElement("label");wetLabel.className="jarvis-meteo-only-wet";
   const wetCheckbox=document.createElement("input");wetCheckbox.type="checkbox";wetCheckbox.checked=onlyWet;
   wetLabel.append(wetCheckbox,document.createTextNode("Só onde choveu (> 0 mm)"));
   const retry=(refresh=false,desired=view)=>void open({tab:"apac",view:desired,refresh});
   windowChoice.addEventListener("change",()=>{hours=Number(windowChoice.value);lastReport=null;retry(true);});
   button.addEventListener("click",()=>{lastReport=null;retry(true);});
   twoD.addEventListener("click",()=>retry(false,"2d"));
   threeD.addEventListener("click",()=>retry(false,"3d"));
   search.addEventListener("change",()=>{citySearch=search.value;retry(false);});
   wetCheckbox.addEventListener("change",()=>{onlyWet=wetCheckbox.checked;retry(false);});
   form.append(windowChoice,button,twoD,threeD,search,wetLabel);content.append(form);
   const status=note("Consultando dados oficiais de pluviômetros; nenhuma imagem radar é simulada.");
   const report=!refresh&&lastReport?.hours===hours?lastReport:await loadApacObservations({hours});
   if(token!==loadToken||panel.hidden||current!=="apac")return;
   status.remove();
   if(!report.ok){note(report.error+" Nenhum valor fictício será exibido.");reference.append(sourceLink(METEO_VIEWERS.apac,"Consultar serviço oficial APAC"));return;}
   lastReport=report;const analysis=renderApacUnderstanding(report);
   const summary=note("Os pontos mostram medidores de chuva. Clique em um ponto ou nome de estação para ver o total em milímetros.");
   summary.setAttribute("data-meteo-provenance","observed");
   let detail=null;
   if(view==="3d"){
     const subset={...report,stations:analysis.filtered};
     await showApac3D(subset);
     detail=document.createElement("p");detail.className="jarvis-meteo-station-detail";
     detail.textContent="Selecione uma estação na lista abaixo ou um marcador do globo.";
     content.append(detail);
   }else{window.ULTRON_EARTH?.clearThematicLayer?.();detail=showApac2D(report);}
   renderApacRanking(report,analysis,detail);
   reference.append(sourceLink(METEO_VIEWERS.apac,"Fonte: serviço geográfico APAC"));
   const warning=document.createElement("small");
   warning.textContent="Leituras podem estar atrasadas. Chuva acumulada não determina alerta de enchente nem o efeito do El Niño.";
   reference.append(warning);
 }
 function showRemoteViewer(tab){
   const src=METEO_VIEWERS[tab];
   meta.textContent=src.title+" · "+src.description;
   const card=document.createElement("section");card.className="jarvis-meteo-external";
   const title=document.createElement("strong");title.textContent="VISUALIZADOR OFICIAL EXTERNO";
   const description=document.createElement("p");
   description.textContent=tab==="radar"?
      "O SIGMA/INPE pode apresentar 'radares indisponíveis'. Sem acesso a um serviço de imagens validado, o J.A.R.V.I.S. não pode exibir radar ao vivo neste painel.":
      tab==="satellite"?
      "O INPE recusou a incorporação do DSAT. Abra o painel oficial para ver nuvens e confira a data da imagem.":
      "O radar e demais produtos do INMET podem ser consultados no mapa oficial, sem incorporação quebrada.";
   const main=sourceLink(src,tab==="radar"?"ABRIR RADAR INPE":
      tab==="satellite"?"ABRIR SATÉLITE GOES-19":"ABRIR MAPAS DO INMET");
   main.className="jarvis-meteo-external-main";
   card.append(title,description,main);
   if(tab==="radar")card.append(sourceLink(METEO_VIEWERS.inmet,"Alternativa: Radar no INMET"));
   const secondary=document.createElement("p");secondary.textContent=
     "Para entender quanto choveu em Pernambuco dentro do J.A.R.V.I.S., selecione APAC · PE. Os pluviômetros não são radar.";
   card.append(secondary);
   content.append(card);
   const disclaimer=document.createElement("small");
   disclaimer.textContent="Sem iframe: evita erros 410 Gone e conexão recusada. Cobertura e atualização devem ser conferidas na fonte.";
   reference.append(disclaimer);
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
 async function open({tab="radar",view:desiredView="2d",refresh=false}={}){
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
