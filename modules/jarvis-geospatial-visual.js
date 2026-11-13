import API_CONFIG from "../config.js";
import {SPATIAL_LAYERS,loadSpatialIntensity,spatialSummary} from "./jarvis-spatial-intensity.js?v=4.90.0";
import {globalWeatherScenario} from "./jarvis-global-weather.js?v=4.82.0";
import {searchGlobalLocations,loadGlobalWeather} from "../backend/weather-global.js?v=4.74.0";
import {loadWeatherInsight} from "../backend/weather-intelligence.js?v=4.75.0";
import {insightScenario,insightSummary,monitorSummary,WEATHER_INSIGHT_LABELS} from "./jarvis-weather-insight-model.js?v=4.75.0";
import {GEO_SCENARIOS,GEO_PALETTE,geoFrame,validateGeoScenario,BRAZIL_OUTLINE_URL,WORLD_OUTLINE_URL,brazilXY,worldXY,geoJSONPaths} from "./jarvis-geospatial-model.js?v=4.96.0";

// The visualization remains INSIDE the Neural Ring stage, no new page or pop-up.
const stage=document.querySelector(".jarvis-cc-center");
if(stage){
 const panel=document.createElement("section");panel.className="jarvis-geo-visual";panel.id="jarvis-geo-visual";
 panel.setAttribute("aria-label","Visualização geográfica do JARVIS");
 panel.hidden=true;
 const head=document.createElement("header");head.className="jarvis-geo-head";
 const heading=document.createElement("strong");heading.textContent="ANÁLISE GEOGRÁFICA";
 const close=document.createElement("button");close.type="button";close.className="jarvis-geo-close";
 close.textContent="×";close.setAttribute("aria-label","Fechar visualização geográfica");head.append(heading,close);
 const modeGroup=document.createElement("div");modeGroup.className="jarvis-geo-modes";
 modeGroup.setAttribute("role","group");modeGroup.setAttribute("aria-label","Modo de visualização");
 const modeButtons={};
 for(const mode of ["3d","2d"]){const b=document.createElement("button");b.type="button";
   b.dataset.mode=mode;b.textContent=mode==="3d"?"Globo 3D":"Mapa 2D";
   b.setAttribute("aria-pressed","false");modeButtons[mode]=b;modeGroup.append(b);}
 const filter=document.createElement("select");filter.className="jarvis-geo-filter";
 filter.setAttribute("aria-label","Filtrar fenômenos");
 for(const [value,text] of [["all","Todos os sinais"],["observed","Seca observada"],["dry","Chuva abaixo"],["wet","Chuva acima"],["heat","Temperatura alta"],["weather","Tempo previsto"]]){
  const o=document.createElement("option");o.value=value;o.textContent=text;filter.append(o);}
 const controls=document.createElement("div");controls.className="jarvis-geo-controls";controls.append(modeGroup,filter);
 const placeBar=document.createElement("form");placeBar.className="jarvis-geo-place-bar";placeBar.hidden=true;
 const placeInput=document.createElement("input");placeInput.type="search";placeInput.maxLength=96;
 placeInput.placeholder="Cidade, país (ex.: Tokyo, Japan)";placeInput.setAttribute("aria-label","Buscar cidade mundial");
 const daysChoice=document.createElement("select");daysChoice.setAttribute("aria-label","Horizonte da previsão");
 for(const n of [3,7,16]){const o=document.createElement("option");o.value=String(n);o.textContent=n+" dias";if(n===7)o.selected=true;daysChoice.append(o);}
 const placeSearch=document.createElement("button");placeSearch.type="submit";placeSearch.textContent="Buscar";
 const placeRefresh=document.createElement("button");placeRefresh.type="button";placeRefresh.textContent="↻";
 placeRefresh.setAttribute("aria-label","Atualizar meteorologia da cidade selecionada");
 const watchAdd=document.createElement("button");watchAdd.type="button";watchAdd.textContent="+ Acompanhar";
 watchAdd.title="Acompanhar esta cidade com coletas de 3 em 3 horas no Cloudflare";
 const watchList=document.createElement("button");watchList.type="button";watchList.textContent="Acompanhamentos";
 placeBar.append(placeInput,daysChoice,placeSearch,placeRefresh,watchAdd,watchList);
 const watchPanel=document.createElement("div");watchPanel.className="jarvis-geo-watch-panel";watchPanel.hidden=true;
 watchPanel.setAttribute("aria-live","polite");
 const placeResults=document.createElement("div");placeResults.className="jarvis-geo-place-results";placeResults.hidden=true;
 placeResults.setAttribute("aria-live","polite");
 const insightBar=document.createElement("form");insightBar.className="jarvis-geo-insight-bar";insightBar.hidden=true;
 const insightType=document.createElement("select");insightType.setAttribute("aria-label","Análise meteorológica mundial");
 for(const [id,label] of Object.entries(WEATHER_INSIGHT_LABELS)){
   const opt=document.createElement("option");opt.value=id;opt.textContent=label;insightType.append(opt);
 }
 const insightYear=document.createElement("input");insightYear.type="number";insightYear.min="1940";
 insightYear.max=String(new Date().getUTCFullYear()-1);
 insightYear.value=String(new Date().getUTCFullYear()-1);insightYear.setAttribute("aria-label","Ano histórico");
 const insightMonth=document.createElement("select");insightMonth.setAttribute("aria-label","Mês histórico");
 for(let m=1;m<=12;m++){const o=document.createElement("option");o.value=String(m);o.textContent=String(m).padStart(2,"0");insightMonth.append(o);}
 const insightSubmit=document.createElement("button");insightSubmit.type="submit";insightSubmit.textContent="Analisar";
 const monitorButton=document.createElement("button");monitorButton.type="button";monitorButton.textContent="Situação 24h";
 insightBar.append(insightType,insightYear,insightMonth,insightSubmit,monitorButton);
 const toggleHistory=()=>{const show=insightType.value==="history";insightYear.hidden=!show;insightMonth.hidden=!show;};
 insightType.addEventListener("change",toggleHistory);toggleHistory();


 const timeline=document.createElement("div");timeline.className="jarvis-geo-timeline";
 const play=document.createElement("button");play.type="button";play.textContent="▶";
 play.setAttribute("aria-label","Percorrer quadros temporais; a animação não cria uma nova previsão");
 const range=document.createElement("input");range.type="range";range.min="0";range.max="2";range.step="1";range.value="1";range.setAttribute("aria-label","Quadro temporal da análise");
 const frameText=document.createElement("div");frameText.className="jarvis-geo-frame-text";
 const frameName=document.createElement("strong");const frameType=document.createElement("small");
 frameText.append(frameName,frameType);timeline.append(play,range,frameText);
 const evidence=document.createElement("p");evidence.className="jarvis-geo-evidence";
 const intensityBar=document.createElement("div");intensityBar.className="jarvis-geo-intensity-bar";
 const intensityLabel=document.createElement("label");intensityLabel.textContent="CAMADA DE INTENSIDADE";
 const layerChoice=document.createElement("select");layerChoice.className="jarvis-geo-intensity-choice";
 layerChoice.setAttribute("aria-label","Selecionar camada meteorológica colorida");
 for(const [key,spec] of Object.entries(SPATIAL_LAYERS)){
   const option=document.createElement("option");option.value=key;option.textContent=spec.label;
   layerChoice.append(option);
 }
 const scopeChoice=document.createElement("select");scopeChoice.setAttribute("aria-label","Abrangência do mapa");
 for(const [id,name] of [["brazil","Brasil"],["world","Mundo"]]){
   const option=document.createElement("option");option.value=id;option.textContent=name;
   scopeChoice.append(option);
 }
 const overlayOpacity=document.createElement("input");overlayOpacity.type="range";overlayOpacity.min="20";
 overlayOpacity.max="90";overlayOpacity.value="66";overlayOpacity.step="5";
 overlayOpacity.setAttribute("aria-label","Opacidade das células coloridas");
 const intensityRefresh=document.createElement("button");intensityRefresh.type="button";
 intensityRefresh.textContent="Atualizar";intensityRefresh.setAttribute("aria-label","Atualizar camada espacial");
 intensityBar.append(intensityLabel,layerChoice,scopeChoice,overlayOpacity,intensityRefresh);
 const intensityLegend=document.createElement("div");intensityLegend.className="jarvis-geo-intensity-legend";
 intensityLegend.setAttribute("aria-live","polite");
 const intensityMessage=document.createElement("div");intensityMessage.className="jarvis-geo-intensity-status";
 intensityMessage.setAttribute("aria-live","polite");

 const canvas=document.createElement("div");canvas.className="jarvis-geo-2d";canvas.hidden=true;
 canvas.setAttribute("aria-label","Mapa 2D do Brasil e marcadores de tendências regionais");
 const svg=document.createElementNS("http://www.w3.org/2000/svg","svg");
 svg.setAttribute("viewBox","0 0 900 550");svg.setAttribute("role","img");
 svg.setAttribute("aria-label","Mapa interativo do Brasil");
 const svgLabels=document.createElement("div");svgLabels.className="jarvis-geo-map-note";
 const mapTools=document.createElement("div");mapTools.className="jarvis-geo-map-tools";
 const mapControl=(text,description)=>{
   const button=document.createElement("button");button.type="button";button.textContent=text;
   button.setAttribute("aria-label",description);button.title=description;mapTools.append(button);return button;
 };
 const mapZoomIn=mapControl("+","Aproximar mapa 2D");
 const mapZoomOut=mapControl("−","Afastar mapa 2D");
 const mapFocus=mapControl("◎","Centralizar mapa no local indicado");
 const mapReset=mapControl("Brasil / Mundo","Restaurar extensão completa do mapa");
 const mapZoomLabel=document.createElement("span");mapZoomLabel.className="jarvis-geo-map-zoom";
 mapZoomLabel.textContent="100%";mapTools.append(mapZoomLabel);
 canvas.append(mapTools,svg,svgLabels);
 const workspace=document.createElement("div");workspace.className="jarvis-geo-workspace";workspace.hidden=true;
 const metricPanel=document.createElement("aside");metricPanel.className="jarvis-geo-metrics";
 metricPanel.setAttribute("aria-label","Dados meteorológicos do período selecionado");
 workspace.append(canvas,metricPanel);
 const list=document.createElement("div");list.className="jarvis-geo-region-list";list.setAttribute("aria-label","Regiões destacadas");
 const detail=document.createElement("p");detail.className="jarvis-geo-detail";detail.setAttribute("aria-live","polite");
 const footer=document.createElement("footer");footer.className="jarvis-geo-footer";
 const source=document.createElement("a");source.target="_blank";source.rel="noopener noreferrer";
 const caveat=document.createElement("small");
 const officialAlerts=document.createElement("a");officialAlerts.href="https://avisos.inmet.gov.br/";
 officialAlerts.target="_blank";officialAlerts.rel="noopener noreferrer";
 officialAlerts.textContent="Consultar alertas oficiais do INMET";officialAlerts.hidden=true;
 footer.append(source,officialAlerts,caveat);
 panel.append(head,controls,placeBar,watchPanel,insightBar,placeResults,timeline,evidence,intensityBar,intensityLegend,intensityMessage,workspace,list,detail,footer);stage.append(panel);
 for(const type of ["pointerdown","pointerup","wheel","click","touchstart","touchend"]){
   panel.addEventListener(type,event=>event.stopPropagation(),{passive:true});
 }
 let dataset=null,frameIndex=1,mode="3d",playing=false,clock=null,selected=null,outlines={brazil:null,world:null};
 let worldCountryShapes=[];
 let geoLoading={brazil:null,world:null},seq=0,filterKind="all",refreshClock=null;
 let intensityReport=null,intensityKey="",intensityToken=0;
 const intensityCache=new Map();
 const ns="http://www.w3.org/2000/svg";
 const e=(tag,attr={})=>{const el=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attr))el.setAttribute(k,String(v));return el;};
 function resize(){
   const compact=stage.getBoundingClientRect().width<660||window.innerWidth<=820;
   panel.dataset.screen=document.body.classList.contains("ultron-tv-display")?"tv":compact?"compact":"wide";
   // The host can use a desktop CSS viewport with a narrow embedded Neural Ring.
   // Compute columns from the actual stage, not media queries alone.
   workspace.style.setProperty("grid-template-columns",
     compact?"minmax(0,1fr)":"minmax(0,1.15fr) minmax(260px,.85fr)","important");
   workspace.style.setProperty("flex",compact?"0 0 auto":"1 1 340px","important");
   workspace.style.setProperty("overflow",compact?"visible":"hidden","important");
   canvas.style.setProperty("height",compact?"280px":"100%","important");
   canvas.style.setProperty("min-height",compact?"220px":"0","important");
 }
 if(typeof ResizeObserver!=="undefined")new ResizeObserver(resize).observe(stage);
 window.addEventListener("resize",resize,{passive:true});
 resize();

 // Map camera is independent of the 3D Earth camera. Only actual geocoded
 // points and IBGE/Natural Earth contours are shown; no synthetic rain raster.
 let mapZoom=1,mapCenter=null;
 const pointerPositions=new Map();
 let dragStart=null,pinchStart=null;
 const baseViewport=()=>scopeChoice.value==="world"?
   {x:0,y:0,w:900,h:550}:{x:35,y:27,w:745,h:465};
 const clamp=(n,low,high)=>Math.max(low,Math.min(high,n));
 function drawMapViewport(){
   const base=baseViewport(),w=base.w/mapZoom,h=base.h/mapZoom;
   if(!mapCenter)mapCenter={x:base.x+base.w/2,y:base.y+base.h/2};
   const x=clamp(mapCenter.x-w/2,0,900-w),y=clamp(mapCenter.y-h/2,0,550-h);
   mapCenter={x:x+w/2,y:y+h/2};
   svg.setAttribute("viewBox",[x,y,w,h].map(n=>n.toFixed(2)).join(" "));
   svg.setAttribute("preserveAspectRatio","xMidYMid meet");
   mapZoomLabel.textContent=Math.round(mapZoom*100)+"%";
   mapZoomIn.disabled=mapZoom>=5;
   mapZoomOut.disabled=mapZoom<=1;
 }
 function setMapZoom(value){
   if(!dataset)return;
   mapZoom=clamp(Number(value)||1,1,5);
   drawMapViewport();
 }
 function focusMap(){
   const p=geoFrame(dataset,frameIndex,"all")?.points?.find(p=>p.id===selected)||
     geoFrame(dataset,frameIndex,"all")?.points?.[0];
   if(!p)return;
   const {x,y}=scopeChoice.value==="world"?worldXY(p.lng,p.lat):brazilXY(p.lng,p.lat);
   if(Number.isFinite(x)&&Number.isFinite(y)){mapCenter={x,y};setMapZoom(2.7);}
 }
 function resetMap(){mapZoom=1;mapCenter=null;drawMapViewport();}
 mapZoomIn.addEventListener("click",()=>setMapZoom(mapZoom*1.55));
 mapZoomOut.addEventListener("click",()=>setMapZoom(mapZoom/1.55));
 mapFocus.addEventListener("click",focusMap);
 mapReset.addEventListener("click",resetMap);
 svg.style.touchAction="none";
 svg.addEventListener("wheel",event=>{
   if(mode!=="2d"||panel.hidden)return;
   event.preventDefault();event.stopPropagation();
   setMapZoom(mapZoom*(event.deltaY<0?1.25:1/1.25));
 },{passive:false});
 const pointerDistance=()=>{
   const values=[...pointerPositions.values()];
   return values.length<2?0:Math.hypot(values[0].x-values[1].x,values[0].y-values[1].y);
 };
 svg.addEventListener("pointerdown",event=>{
   if(mode!=="2d"||(event.pointerType!=="touch"&&event.button!==0))return;
   pointerPositions.set(event.pointerId,{x:event.clientX,y:event.clientY});
   try{svg.setPointerCapture(event.pointerId);}catch{}
   if(pointerPositions.size===1){
     dragStart={x:event.clientX,y:event.clientY,center:{...(mapCenter||{x:450,y:275})},
       touchLastY:event.clientY,scrollGesture:false};
     pinchStart=null;
   }else{
     pinchStart=pointerDistance();dragStart=null;
   }
 });
 svg.addEventListener("pointermove",event=>{
   if(mode!=="2d"||!pointerPositions.has(event.pointerId))return;
   pointerPositions.set(event.pointerId,{x:event.clientX,y:event.clientY});
   if(pointerPositions.size>=2){
     const next=pointerDistance();
     if(pinchStart&&next>0)setMapZoom(mapZoom*next/pinchStart);
     pinchStart=next;return;
   }
   if(!dragStart)return;
   if(event.pointerType==='touch'&&pointerPositions.size===1){
     const dx=event.clientX-dragStart.x,dy=event.clientY-dragStart.y;
     if(!dragStart.scrollGesture&&Math.abs(dy)>8&&Math.abs(dy)>Math.abs(dx)*1.2)
       dragStart.scrollGesture=true;
     if(dragStart.scrollGesture){
       window.scrollBy({top:dragStart.touchLastY-event.clientY,behavior:'instant'});
       dragStart.touchLastY=event.clientY;
       return;
     }
   }
   const rect=svg.getBoundingClientRect(),base=baseViewport();
   if(rect.width<1||rect.height<1)return;
   mapCenter={
     x:dragStart.center.x-(event.clientX-dragStart.x)*base.w/mapZoom/rect.width,
     y:dragStart.center.y-(event.clientY-dragStart.y)*base.h/mapZoom/rect.height
   };
   drawMapViewport();
 });
 const releasePointer=event=>{
   pointerPositions.delete(event.pointerId);
   if(pointerPositions.size===1){
     const remaining=[...pointerPositions.values()][0];
     dragStart={x:remaining.x,y:remaining.y,center:{...(mapCenter||{x:450,y:275})},
       touchLastY:remaining.y,scrollGesture:false};
   }else dragStart=null;
   pinchStart=null;
 };
 svg.addEventListener("pointerup",releasePointer);
 svg.addEventListener("pointercancel",releasePointer);
 svg.addEventListener("lostpointercapture",releasePointer);
 function renderMetrics(frame){
   if(dataset?.theme){renderGlobalMetrics(frame);return;}
   metricPanel.replaceChildren();
   const heading=document.createElement("div");heading.className="jarvis-geo-metric-heading";
   const place=document.createElement("strong");place.textContent=frame.points[0]?.name||dataset.title;
   const time=document.createElement("small");time.textContent=frame.name+" · "+frame.type;
   heading.append(place,time);metricPanel.append(heading);
   const definitions=[
     ["temperatureC","TEMPERATURA ESTIMADA","°C"],
     ["humidityPercent","UMIDADE","%"],
     ["precipitationMm","CHUVA ESTIMADA","mm"],
     ["windKmh","VENTO ESTIMADO","km/h"],
     ["minC","MÍNIMA PREVISTA","°C"],
     ["maxC","MÁXIMA PREVISTA","°C"],
     ["rainMm","CHUVA PREVISTA","mm"],
     ["rainChancePercent","CHANCE MÁXIMA DE CHUVA","%"]
   ];
   const available=definitions.filter(([key])=>Number.isFinite(frame.metrics?.[key]));
   if(available.length){
     const grid=document.createElement("div");grid.className="jarvis-geo-metric-grid";
     for(const [key,label,unit] of available){
       const card=document.createElement("div");card.className="jarvis-geo-metric-card";
       card.dataset.metric=key;
       const title=document.createElement("small");title.textContent=label;
       const value=document.createElement("strong");
       value.textContent=frame.metrics[key].toLocaleString("pt-BR",{maximumFractionDigits:1})+" "+unit;
       card.append(title,value);grid.append(card);
     }
     metricPanel.append(grid);
   }else{
     const note=document.createElement("p");note.className="jarvis-geo-metric-empty";
     note.textContent="Camada qualitativa: os dados publicados não contêm medidas numéricas para este ponto.";
     metricPanel.append(note);
   }
   const precipitation=dataset.frames.filter(f=>Number.isFinite(f.metrics?.rainMm));
   if(precipitation.length){
     const title=document.createElement("strong");title.className="jarvis-geo-chart-title";
     title.textContent="CHUVA PREVISTA · PRÓXIMOS DIAS";metricPanel.append(title);
     const chart=document.createElement("div");chart.className="jarvis-geo-rain-chart";
     const max=Math.max(1,...precipitation.map(f=>f.metrics.rainMm));
     for(const f of precipitation){
       const row=document.createElement("div");row.className="jarvis-geo-rain-row";
       if(f.id===frame.id)row.dataset.active="true";
       const date=document.createElement("small");date.textContent=f.name;
       const track=document.createElement("div");track.className="jarvis-geo-rain-track";
       const bar=document.createElement("span");bar.style.width=(f.metrics.rainMm/max*100).toFixed(2)+"%";
       track.append(bar);
       const value=document.createElement("strong");
       value.textContent=f.metrics.rainMm.toLocaleString("pt-BR",{maximumFractionDigits:1})+" mm";
       row.append(date,track,value);chart.append(row);
     }
     metricPanel.append(chart);
   }
   const disclaimer=document.createElement("p");disclaimer.className="jarvis-geo-metric-disclaimer";
   disclaimer.textContent=available.length?
    "Estimativa numérica por localidade, não radar ou mapa de chuva por bairro. Fonte e período informados abaixo.":
    "Pontos geográficos representativos, não extensão real de impactos ou medição por município.";
   metricPanel.append(disclaimer);
 }

 const intensityProjection=()=>scopeChoice.value==="world"?"world":"brazil";
 const currentIntensityDay=()=>Math.max(0,Math.min(2,frameIndex-1));

 function renderGlobalTheme(){
   if(!dataset?.theme)return;
   intensityLegend.replaceChildren();intensityMessage.replaceChildren();
   const caption=document.createElement("strong");
   caption.textContent=(dataset.theme.kind==="educational-wave"?"SIMULAÇÃO DIDÁTICA · ":"CAMADA MUNDIAL · ")+dataset.title;
   intensityLegend.append(caption);
   const scale=document.createElement("div");scale.className="jarvis-geo-intensity-scale";
   for(const b of dataset.theme.legend){
     const item=document.createElement("span");item.className="jarvis-geo-intensity-band";
     const swatch=document.createElement("i");swatch.style.background=b.color;
     const label=document.createElement("small");label.textContent=b.label;
     item.append(swatch,label);scale.append(item);
   }
   intensityLegend.append(scale);
   const note=document.createElement("small");note.className="jarvis-geo-intensity-caption";
   note.textContent=dataset.source.basePeriod+" · "+dataset.theme.coloredBy+
     " · "+dataset.frames[0].points.length+" localizações. "+dataset.source.disclaimer;
   intensityMessage.append(note);
   const link=document.createElement("a");link.target="_blank";link.rel="noopener noreferrer";
   link.href=dataset.source.url;link.textContent="Ver publicação/fonte oficial";
   intensityMessage.append(link);
 }
 function renderGlobalMetrics(frame){
   metricPanel.replaceChildren();
   const heading=document.createElement("div");heading.className="jarvis-geo-metric-heading";
   const title=document.createElement("strong");title.textContent=dataset.title;
   const period=document.createElement("small");period.textContent=dataset.source.basePeriod;
   heading.append(title,period);metricPanel.append(heading);
   const stat=document.createElement("div");stat.className="jarvis-geo-metric-grid";
   const count=document.createElement("div");count.className="jarvis-geo-metric-card";
   const caption=document.createElement("small");caption.textContent=dataset.theme.kind==="educational-wave"?"PONTOS ILUSTRATIVOS":"REGISTROS GEOLOCALIZADOS";
   const value=document.createElement("strong");value.textContent=frame.points.length.toLocaleString("pt-BR");
   count.append(caption,value);stat.append(count);
   const meaning=document.createElement("div");meaning.className="jarvis-geo-metric-card";
   const type=document.createElement("small");type.textContent="COLORAÇÃO";
   const detailText=document.createElement("strong");detailText.textContent=
     dataset.theme.coloredBy==="earthquake-magnitude"?"Magnitude USGS":
     dataset.theme.kind==="country-indicator"?"Indicador anual":
     dataset.theme.kind==="educational-wave"?"Trajetória hipotética":"Categoria de evento";
   meaning.append(type,detailText);stat.append(meaning);metricPanel.append(stat);
   if(dataset.theme.kind==="educational-wave"){
     const note=document.createElement("p");note.className="jarvis-geo-metric-disclaimer";
     note.textContent="Etapa "+(frame.index+1)+"/"+dataset.frames.length+
       ". Frente geométrica hipotética. Sem altura, velocidade, horário de chegada ou área de inundação calculados.";
     metricPanel.append(note);return;
   }
   const infos=document.createElement("div");infos.className="jarvis-geo-global-event-list";
   const isCountry=dataset.theme.kind==="country-indicator";
   const ranked=isCountry?[...frame.points].sort((a,b)=>b.value-a.value):frame.points;
   const peak=isCountry?Math.max(1,...ranked.map(p=>Number(p.value)||0)):1;
   for(const [index,p] of ranked.slice(0,25).entries()){
     const row=document.createElement("button");row.type="button";row.className="jarvis-geo-global-event";
     const mark=document.createElement("i");mark.style.background=p.color||GEO_PALETTE[p.kind]?.color||"#90d4f7";
     const text=document.createElement("span");text.textContent=(isCountry?(index+1)+". ":"")+p.name+
       (p.value!=null?" · "+p.value.toLocaleString("pt-BR",{maximumFractionDigits:2})+
        (p.unit?" "+p.unit:""):"")+(isCountry&&p.observedAt?" · "+p.observedAt:"");
     if(isCountry){
       const wrap=document.createElement("span");wrap.className="jarvis-geo-country-entry";
       const track=document.createElement("span");track.className="jarvis-geo-country-bar";
       const bar=document.createElement("b");bar.style.width=(Math.min(100,100*p.value/peak)).toFixed(1)+"%";
       bar.style.background=p.color||"#79b1d8";track.append(bar);wrap.append(text,track);
       row.append(mark,wrap);
     }else row.append(mark,text);
     row.addEventListener("click",()=>selectRegion(p));
     infos.append(row);
   }
   metricPanel.append(infos);
   const caveat=document.createElement("small");caveat.className="jarvis-geo-metric-disclaimer";
   caveat.textContent=dataset.source.disclaimer;metricPanel.append(caveat);
 }
 function intensityLegendRender(report,issue=""){
   intensityLegend.replaceChildren();intensityMessage.replaceChildren();
   const spec=SPATIAL_LAYERS[layerChoice.value];
   if(!spec)return;
   const name=document.createElement("strong");name.textContent=spec.label+" · "+spec.unit;
   intensityLegend.append(name);
   const scale=document.createElement("div");scale.className="jarvis-geo-intensity-scale";
   for(const entry of (report?.legend||spec.colors.map((color,i)=>({color,label:spec.labels[i]})))){
     const item=document.createElement("span");item.className="jarvis-geo-intensity-band";
     const swatch=document.createElement("i");swatch.style.background=entry.color;
     const label=document.createElement("small");label.textContent=entry.label;
     item.append(swatch,label);scale.append(item);
   }
   intensityLegend.append(scale);
   const note=document.createElement("small");note.className="jarvis-geo-intensity-caption";
   note.textContent=report?.ok?
     "MODELO AMOSTRADO · "+report.sampledCount+"/"+report.totalSamples+
     " células · "+report.dataTime+" · "+report.source.name+" · Sem interpolação local.":
     (issue||"Selecione uma camada para consultar o provedor.");
   intensityMessage.append(note);
   const link=document.createElement("a");link.target="_blank";link.rel="noopener noreferrer";
   link.href=report?.source?.url||spec.sourceUrl;
   link.textContent=layerChoice.value==="drought"?"Abrir mapa mensal oficial ANA":
     layerChoice.value==="alerts"?"Consultar avisos oficiais":"Ver documentação da fonte";
   intensityMessage.append(link);
   if(layerChoice.value==="drought"){
     const explanation=document.createElement("p");
     explanation.textContent="As classes S0–S4 são do Monitor de Secas da ANA, de periodicidade mensal. Sem polígonos oficiais validados, o JARVIS não pinta áreas como se fossem seca extrema. Selecione 'Umidade do solo' para visualizar valores coloridos de modelo (não classes de seca).";
     intensityMessage.append(explanation);
   }
 }
 function applyIntensityToEarth(){
   const globe=window.ULTRON_EARTH;
   if(!globe)return;
   const cells=intensityReport?.ok?intensityReport.cells:[];
   const geographic=cells.filter(c=>Array.isArray(c.bounds));
   globe.setThematicGrid?.(geographic);
   if(cells.length&&!geographic.length){
     globe.setThematicLayer?.(cells.slice(0,25).map(c=>({
       id:c.id,name:intensityReport.label,lat:c.lat,lng:c.lng,
       kind:"weather",detail:c.value+" "+intensityReport.unit,
       color:c.color
     })));
   }else if(dataset){
     const f=geoFrame(dataset,frameIndex,filterKind);
     if(f)globe.setThematicLayer?.(f.points.map(p=>({
       ...p,color:GEO_PALETTE[p.kind]?.color||"#91d7f0"
     })),{playing:mode==="3d"&&playing});
   }
 }
 const intensityUrl=(layer,region,day)=>String(API_CONFIG.backendUrl||"").replace(/\/$/,"")+
   "/api/geo/intensity?layer="+encodeURIComponent(layer)+
   "&region="+encodeURIComponent(region)+"&day="+day;
 async function fetchIntensity(layer,region,day){
   const key=layer+":"+region+":"+day,now=Date.now(),cached=intensityCache.get(key);
   if(cached&&now-cached.at<30*60*1000)return cached.data;
   const url=intensityUrl(layer,region,day);
   let data=null;
   const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),11500);
   try{
     const response=await fetch(url,{headers:{Accept:"application/json"},
       cache:"no-store",signal:abort.signal});
     const body=await response.json();
     if(response.ok&&body?.ok)data=body;
   }catch{}finally{clearTimeout(timer);}
   if(!data?.ok)data=await loadSpatialIntensity({layer,region,day});
   if(data?.ok)intensityCache.set(key,{at:now,data});
   return data;
 }
 async function chooseIntensity({refresh=false}={}){
   if(!dataset||panel.hidden)return {ok:false,error:"Mapa fechado"};
   const layer=layerChoice.value,region=scopeChoice.value,day=currentIntensityDay();
   intensityKey=layer+":"+region+":"+day;
   if(refresh)intensityCache.delete(layer+":"+region+":"+day);
   const requestId=++intensityToken;
   intensityReport=null;
   window.ULTRON_EARTH?.setThematicGrid?.([]);
   intensityLegendRender(null,"Carregando células de modelo...");
   if(mode==="2d")renderMap(geoFrame(dataset,frameIndex,filterKind));
   if(["drought","alerts"].includes(layer)){
     intensityLegendRender(null,layer==="drought"?
       "Seca observada oficialmente: consulte o mapa mensal da ANA, não a previsão de chuva.":
       "Avisos oficiais dependem de área, validade e emissor; consultar fonte oficial.");
     return {ok:false,official:true};
   }
   if(SPATIAL_LAYERS[layer]?.days&&frameIndex>3&&dataset.frames.length>4){
     intensityLegendRender(null,"A camada espacial cobre apenas os três primeiros dias. O restante da previsão permanece por localidade.");
     return {ok:false,partial:true};
   }
   try{
     const data=await fetchIntensity(layer,region,day);
     if(requestId!==intensityToken||panel.hidden)return {ok:false,stale:true};
     if(!data?.ok)throw Error(data?.error||"Camada espacial indisponível");
     if(data.layer!==layer||data.region!==region||data.day!==day||
       !Array.isArray(data.cells)||!Array.isArray(data.legend))throw Error("Fonte espacial inconsistente");
     intensityReport=data;intensityLegendRender(data);
     if(mode==="2d")renderMap(geoFrame(dataset,frameIndex,filterKind));
     applyIntensityToEarth();
     return {ok:true,count:data.sampledCount};
   }catch(error){
     if(requestId===intensityToken){
       intensityLegendRender(null,"Fonte indisponível: "+String(error?.message||error).slice(0,140));
     }
     return {ok:false,error:String(error?.message||error)};
   }
 }
 layerChoice.addEventListener("change",()=>void chooseIntensity());
 scopeChoice.addEventListener("change",async()=>{
   resetMap();await loadOutline(intensityProjection());draw();void chooseIntensity();
 });
 intensityRefresh.addEventListener("click",()=>void chooseIntensity({refresh:true}));
 overlayOpacity.addEventListener("input",()=>{
   if(mode==="2d"&&dataset)renderMap(geoFrame(dataset,frameIndex,filterKind));
 });
 function renderMap(frame){
   svg.replaceChildren();
   const bg=e("rect",{width:900,height:550,fill:"#091a2c",rx:12});svg.append(bg);
   for(let x=55;x<880;x+=100)svg.append(e("line",{x1:x,x2:x,y1:40,y2:530,stroke:"#35516a","stroke-opacity":".38","stroke-width":1}));
   for(let y=50;y<535;y+=80)svg.append(e("line",{x1:50,x2:875,y1:y,y2:y,stroke:"#35516a","stroke-opacity":".38","stroke-width":1}));
   const projection=intensityProjection(),outline=outlines[projection];

   if(projection==="world"&&dataset?.theme?.kind==="country-indicator"&&worldCountryShapes.length){
     const values=dataset.theme.countryValues||{};
     const group=e("g",{"data-global-country-layer":dataset.theme.topic});
     for(const item of worldCountryShapes){
       const metric=values[item.id];
       if(!metric)continue;
       for(const path of item.paths){
         const shape=e("path",{d:path,fill:metric.color,"fill-opacity":".83",
           stroke:"#0a2538","stroke-width":".7"});
         shape.classList.add("jarvis-geo-world-country");
         shape.setAttribute("data-iso3",item.id);
         const title=e("title");
         title.textContent=item.name+": "+metric.value+" "+dataset.theme.unit+" ("+metric.year+")";
         shape.append(title);group.append(shape);
       }
     }
     svg.append(group);
   }

   if(outline?.length)for(const d of outline)svg.append(e("path",{d,fill:"#18354b",stroke:"#6c9caa","stroke-width":1.4,"fill-opacity":".83"}));
   // A rectangle is the fixed model cell (not a rainfall interpolation).
   // The Brazil outline clips cells to the national boundary; if IBGE is
   // offline the country is NOT colored outside an authoritative outline.
   const samples=intensityReport?.ok&&intensityReport.region===projection?intensityReport.cells:[];
   const oceanOverlay=intensityReport?.layer==="marine";
   const hasBrazilClip=projection==="brazil"&&!oceanOverlay&&Array.isArray(outline)&&outline.length>0;
   if(hasBrazilClip){
     const defs=e("defs"),clip=e("clipPath",{id:"jarvis-geo-brazil-mask"});
     for(const d of outline)clip.append(e("path",{d}));
     defs.append(clip);svg.append(defs);
   }
   const patches=e("g",{"data-intensity-layer":intensityReport?.layer||"none"});
   const opacity=Math.max(.2,Math.min(.9,Number(overlayOpacity.value)/100||.66));
   for(const cell of samples){
     if(!Array.isArray(cell.bounds)&&!["river"].includes(intensityReport.layer))continue;
     let shape;
     if(cell.bounds){
       // Ocean wave samples are offshore. Land-only IBGE clip would hide them.
       if(projection==="brazil"&&!hasBrazilClip&&!oceanOverlay)continue;
       const [w,s,east,n]=cell.bounds,top=projection==="world"?worldXY(w,n):brazilXY(w,n),
        bottom=projection==="world"?worldXY(east,s):brazilXY(east,s);
       if(![top.x,top.y,bottom.x,bottom.y].every(Number.isFinite))continue;
       shape=e("rect",{x:top.x,y:top.y,width:Math.abs(bottom.x-top.x),
         height:Math.abs(bottom.y-top.y),fill:cell.color,"fill-opacity":opacity,
         stroke:"#0b2437","stroke-width":.45});
       if(hasBrazilClip)shape.setAttribute("clip-path","url(#jarvis-geo-brazil-mask)");
     }else{
       const point=projection==="world"?worldXY(cell.lng,cell.lat):brazilXY(cell.lng,cell.lat);
       shape=e("circle",{cx:point.x,cy:point.y,r:10,fill:cell.color,
        "fill-opacity":opacity,stroke:"#eaf7ff","stroke-width":1});
     }
     shape.classList.add("jarvis-geo-intensity-cell");
     shape.setAttribute("data-sample-id",cell.id);
     shape.setAttribute("aria-label",intensityReport.label+": "+cell.value+" "+intensityReport.unit);
     const title=e("title");title.textContent=intensityReport.label+" — "+cell.value+" "+
       intensityReport.unit+" em ("+cell.lat+", "+cell.lng+") · "+cell.time;
     shape.append(title);
     shape.addEventListener("click",()=>{
       detail.textContent=intensityReport.label+": "+cell.value+" "+intensityReport.unit+
         " · centro da célula ("+cell.lat+", "+cell.lng+"), "+
         cell.time+". "+intensityReport.disclaimer;
     });
     patches.append(shape);
   }
   svg.append(patches);
   if(dataset?.id==="tsunami-japan"){
     const front=frame.points.filter(p=>p.kind==="tsunamiWave").map(p=>worldXY(p.lng,p.lat));
     if(front.length>=8){
       const path="M"+front.map(p=>p.x.toFixed(2)+","+p.y.toFixed(2)).join("L")+"Z";
       svg.append(e("path",{d:path,fill:"none",stroke:"#53c7f2","stroke-width":11,
         "stroke-opacity":".15","stroke-linejoin":"round"}));
       const wave=e("path",{d:path,fill:"none",stroke:"#53c7f2","stroke-width":3,
         "stroke-opacity":".92","stroke-linejoin":"round","stroke-dasharray":"12 6"});
       wave.classList.add("jarvis-tsunami-wave-front");
       wave.setAttribute("data-tsunami-front",frame.id);svg.append(wave);
     }
     const label=e("text",{x:50,y:30,fill:"#f5d5a2","font-size":15,
       "font-weight":"700","data-tsunami-warning":"true"});
     label.textContent="DEMONSTRAÇÃO HIPOTÉTICA · NÃO É ALERTA";
     svg.append(label);
   }
   for(const p of frame.points){
     const {x,y}=(projection==="world"?worldXY(p.lng,p.lat):brazilXY(p.lng,p.lat)),color=p.color||GEO_PALETTE[p.kind]?.color||"#91d7f0";
     if(!Number.isFinite(x)||!Number.isFinite(y))continue;
     const g=e("g",{"data-region-id":p.id,role:"button",tabindex:"0","aria-label":p.name+" — "+GEO_PALETTE[p.kind]?.short});
     g.classList.add("jarvis-geo-marker");
     g.append(e("circle",{cx:x,cy:y,r:19,fill:color,"fill-opacity":".16",stroke:color,"stroke-opacity":".62","stroke-width":2}));
     g.append(e("circle",{cx:x,cy:y,r:7,fill:color,stroke:"#051624","stroke-width":2}));
     const title=e("title");title.textContent=p.name+" — "+p.detail;g.append(title);
     g.addEventListener("click",()=>selectRegion(p));
     g.addEventListener("keydown",event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();selectRegion(p);}});
     svg.append(g);
   }
   svgLabels.textContent=dataset?.theme?dataset.title+" · "+dataset.source.basePeriod+" · "+dataset.frames[0].points.length+" pontos. "+dataset.source.disclaimer:intensityReport?.ok?intensityReport.label+" · CÉLULAS DE MODELO (não radar) · "+intensityReport.dataTime+" · "+intensityReport.sampledCount+" amostras.":projection==="world"?
      (outline?.length?"Mapa mundial: Natural Earth. Coordenadas aproximadas do modelo; não são limites de perigo.":"Contorno mundial indisponível: marcador exibido na grade global."):
      (outline?.length?"Contorno do Brasil: IBGE. Pontos representativos, não limites exatos de impacto.":"Contorno do IBGE indisponível. Pontos georreferenciados exibidos sobre a grade.");
 }
 async function loadOutline(which="brazil"){
   const projection=which==="world"?"world":"brazil";
   if(outlines[projection])return outlines[projection];
   if(geoLoading[projection])return geoLoading[projection];
   geoLoading[projection]=(async()=>{
     const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),6500);
     try{
       const response=await fetch(projection==="world"?WORLD_OUTLINE_URL:BRAZIL_OUTLINE_URL,{signal:controller.signal,cache:"force-cache"});
       if(!response.ok)throw Error("Contorno indisponível");
       const json=await response.json();
       outlines[projection]=geoJSONPaths(json,{projection});
       if(projection==="world"&&Array.isArray(json.features)){
         worldCountryShapes=json.features.slice(0,250).flatMap(item=>{
           const properties=item?.properties||{};
           const iso=String(properties.ADM0_A3||properties.ISO_A3||properties.SOV_A3||"");
           if(!/^[A-Z]{3}$/.test(iso)||!["Polygon","MultiPolygon"].includes(item?.geometry?.type))return [];
           const paths=geoJSONPaths({type:"FeatureCollection",features:[item]},{projection:"world"});
           if(!paths.length)return [];
           return [{id:iso,name:String(properties.ADMIN||properties.NAME||iso).slice(0,90),
             paths,geometry:item.geometry}];
         });
       }
       return outlines[projection];
     }catch{return [];}finally{clearTimeout(timeout);}
   })().finally(()=>{geoLoading[projection]=null;});
   return geoLoading[projection];
 }
 function selectRegion(p,{skipGlobe=false}={}){
   selected=p?.id||null;
   detail.replaceChildren();
   if(!p){detail.textContent="Selecione uma região para consultar o contexto.";return;}
   const b=document.createElement("strong");b.textContent=p.name+" — "+GEO_PALETTE[p.kind]?.short;
   const line=document.createElement("p");line.textContent=p.detail;
   const link=document.createElement("a");link.href=p.source;link.target="_blank";link.rel="noopener noreferrer";link.textContent="Ver fonte dos dados";
   detail.append(b,line,link);
   for(const node of list.querySelectorAll("button"))node.setAttribute("aria-pressed",String(node.dataset.id===selected));
   for(const node of svg.querySelectorAll(".jarvis-geo-marker"))node.setAttribute("aria-pressed",String(node.dataset.regionId===selected));
   if(!skipGlobe&&mode==="3d"&&typeof window.ULTRON_EARTH?.focus==="function"){
     try{window.ULTRON_EARTH.focus(p.lat,p.lng,5,false,p.name);}catch{}
   }
 }
 // Select an exact point from the currently rendered, source-verified scenario.
 // A 2D focus changes only the SVG viewport; a 3D focus uses the existing
 // Earth control, and its actual response is checked before reporting success.
 function focusPoint(id,{zoom=3}={}){
   if(panel.hidden||!dataset)return {ok:false,error:"Mapa não está aberto"};
   const p=geoFrame(dataset,frameIndex,filterKind)?.points.find(x=>x.id===id);
   if(!p)return {ok:false,error:"Ponto não pertence ao cenário atual"};
   if(mode==="3d"){
     const earth=window.ULTRON_EARTH;
     if(!earth?.state?.visible||typeof earth.focus!=="function")
       return {ok:false,error:"Globo 3D indisponível"};
     let result;
     try{result=earth.focus(p.lat,p.lng,Math.max(2,Math.min(6,Number(zoom)||3)),false,p.name);}
     catch{return {ok:false,error:"Falha ao centralizar o globo"};}
     if(result?.ok!==true)return {ok:false,error:result?.error||"Globo não confirmou o foco"};
     selectRegion(p,{skipGlobe:true});
     return {ok:true,id:p.id,mode:"3d",lat:p.lat,lng:p.lng};
   }
   selectRegion(p);
   const {x,y}=dataset.projection==="world"?worldXY(p.lng,p.lat):brazilXY(p.lng,p.lat);
   if(!Number.isFinite(x)||!Number.isFinite(y))return {ok:false,error:"Coordenadas inválidas"};
   mapCenter={x,y};
   setMapZoom(Math.max(1,Math.min(5,Number(zoom)||3)));
   return {ok:true,id:p.id,mode:"2d",lat:p.lat,lng:p.lng};
 }
 function stop(){playing=false;play.textContent="▶";play.setAttribute("aria-label","Reproduzir quadros");if(clock!==null)clearInterval(clock);clock=null;}
 function draw(){
   if(!dataset)return;
   resize();
   if(dataset.theme)renderGlobalTheme();
   range.max=String(dataset.frames.length-1);range.value=String(frameIndex);
   const frame=geoFrame(dataset,frameIndex,filterKind);
   if(!frame)return;
   frameName.textContent=frame.name;
   frameType.textContent=frame.type;
   evidence.textContent=frame.description;
   for(const [key,b] of Object.entries(modeButtons))b.setAttribute("aria-pressed",String(key===mode));
   panel.dataset.mode=mode;
   workspace.hidden=mode!=="2d";
   canvas.hidden=mode!=="2d";
   list.replaceChildren();
   for(const p of (dataset.id==="tsunami-japan"?frame.points.slice(0,1):frame.points)){
     const b=document.createElement("button");b.type="button";b.className="jarvis-geo-region";
     b.dataset.id=p.id;b.setAttribute("aria-pressed",String(p.id===selected));
     const dot=document.createElement("span");dot.style.background=p.color||GEO_PALETTE[p.kind]?.color||"#91d7f0";dot.className="jarvis-geo-dot";
     const name=document.createElement("span");name.textContent=p.name;b.append(dot,name);
     b.addEventListener("click",()=>selectRegion(p));list.append(b);
   }
   const selectedPoint=frame.points.find(p=>p.id===selected);
   if(selectedPoint){detail.textContent="";selectRegion(selectedPoint);}
   else{selected=null;detail.textContent=frame.points.length?"Selecione uma região para ver o que os dados indicam.":"Nenhuma região nessa categoria para o quadro selecionado.";}
   if(mode==="2d"){renderMap(frame);drawMapViewport();renderMetrics(frame);}
   const earth=window.ULTRON_EARTH;
   if(earth?.state?.visible&&typeof earth.setThematicLayer==="function"){
     const points=frame.points.map(p=>({...p,color:p.color||GEO_PALETTE[p.kind]?.color||"#91d7f0"}));
     earth.setThematicLayer(points,{playing:mode==="3d"&&playing});
   }
   if(intensityReport?.ok)applyIntensityToEarth();
   if(dataset.theme?.kind==="country-indicator"&&worldCountryShapes.length){
     const values=dataset.theme.countryValues||{};
     const polygons=worldCountryShapes.filter(c=>values[c.id]).map(c=>({
       id:c.id,color:values[c.id].color,geometry:c.geometry
     }));
     window.ULTRON_EARTH?.setThematicCountries?.(polygons);
   }
   const required=layerChoice.value+":"+scopeChoice.value+":"+currentIntensityDay();
   if(!dataset.theme&&!panel.hidden&&required!==intensityKey)void chooseIntensity();
 }
 async function setMode(next){
   if(!dataset)return {ok:false,error:"Sem dados carregados"};
   if(next!=="2d"&&next!=="3d")return {ok:false,error:"Modo não disponível"};
   mode=next;
   if(next==="3d"){
     const globe=window.ULTRON_EARTH;
     if(!globe?.state?.visible){const r=await globe?.open?.();if(!r?.ok){mode="2d";draw();return {ok:false,error:r?.error||"Globo indisponível"};}}
   }else await loadOutline(intensityProjection());
   draw();return {ok:true,mode:next,count:geoFrame(dataset,frameIndex,filterKind)?.points.length||0};
 }
 async function open({scenario="enso",view="3d",data=null,initialLayer=null,initialIntensity=null}={}){
   if(!["2d","3d"].includes(view))return {ok:false,error:"Modo inválido"};
   const requested=data||GEO_SCENARIOS[scenario];
   const validated=validateGeoScenario(requested);
   if(!validated)return {ok:false,error:"Cenário sem dados geográficos e fonte verificável"};
   window.ULTRON_NEURAL_ANSWER?.clear?.(); // Geo visualization gets the ring's attention, no overlapping previous answer.
   stop();dataset=validated;filterKind="all";filter.value="all";selected=null;
   mapZoom=1;mapCenter=null;pointerPositions.clear();
   scopeChoice.value=dataset.projection==="world"?"world":"brazil";
   layerChoice.value=initialLayer&&Object.hasOwn(SPATIAL_LAYERS,initialLayer)?initialLayer:"rain";
   intensityReport=initialIntensity?.ok?initialIntensity:null;
   intensityKey=intensityReport?layerChoice.value+":"+dataset.projection+":0":"";
   intensityToken++;
   intensityBar.hidden=Boolean(dataset.theme);
   intensityLegend.hidden=false;intensityMessage.hidden=false;
   if(dataset.theme)renderGlobalTheme();
   else if(intensityReport)intensityLegendRender(intensityReport);
   else{intensityLegend.replaceChildren();intensityMessage.replaceChildren();}
   window.ULTRON_EARTH?.setThematicCountries?.([]);
   mapReset.textContent=dataset.projection==="world"?"Mundo":"Brasil";
   frameIndex=dataset.id==="tsunami-japan"?0:Math.min(1,dataset.frames.length-1);
   range.max=String(dataset.frames.length-1);
   heading.textContent=dataset.title.toUpperCase();
   source.href=dataset.source.url;source.textContent=dataset.source.name;
   caveat.textContent=dataset.source.disclaimer;
   officialAlerts.hidden=!dataset.id.startsWith("weather-")||dataset.projection==="world";
   filter.hidden=Boolean(dataset.theme)||dataset.id.startsWith("weather-")||dataset.id.startsWith("spatial-"); // A single local weather point has no competing ENSO categories.
   placeBar.hidden=dataset.projection!=="world"||Boolean(dataset.theme);
   insightBar.hidden=dataset.projection!=="world"||Boolean(dataset.theme);
   placeRefresh.disabled=!/^weather-global-\d+$/.test(dataset.id);
   watchAdd.disabled=!/^weather-global-\d+$/.test(dataset.id);
   watchPanel.hidden=dataset.projection!=="world"||Boolean(dataset.theme);
   if(refreshClock!==null){clearInterval(refreshClock);refreshClock=null;}
   if(/^weather-global-\d+$/.test(dataset.id))refreshClock=setInterval(()=>{
     if(panel.hidden||document.hidden)return;
     const id=Number(dataset?.id?.match(/^weather-global-(\d+)$/)?.[1]);
     if(id>0)void showLocation(id,Math.min(16,Math.max(3,dataset.frames.length-1)));
   },15*60*1000);
   svg.setAttribute("aria-label",dataset.projection==="world"?"Mapa 2D mundial":"Mapa 2D do Brasil");
   panel.hidden=false;
   if(dataset.theme?.kind==="country-indicator")await loadOutline("world");
   const result=await setMode(view);
   if(!result.ok){panel.hidden=true;return result;}
   if(dataset.id==="tsunami-japan"&&view==="2d"){
     mapCenter=worldXY(143.4,38.1);setMapZoom(4.6);
   }
   if(view==="3d"&&dataset.projection==="world"&&dataset.frames[frameIndex]?.points?.[0]){
     selectRegion(dataset.frames[frameIndex].points[0]);
   }
   window.dispatchEvent(new CustomEvent("ultron:geo-visualization",{detail:{scenario:dataset.id,mode:view,frame:frameIndex}}));
   return {ok:true,mode:view,scenario:dataset.id,source:dataset.source.url};
 }

 const backend=String(API_CONFIG.backendUrl||"").replace(/\/+$/,"");
 const getJson=async(url)=>{
   const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
   let proxyError=null;
   try{
     const response=await fetch(url,{headers:{Accept:"application/json"},signal:controller.signal,cache:"no-store"});
     const data=await response.json();
     if(!response.ok||!data?.ok)throw Error(data?.error||"Serviço meteorológico indisponível");
     return data;
   }catch(error){proxyError=error;}
   finally{clearTimeout(timer);}
   // Worldwide queries can use Open-Meteo directly if the D1-bound Worker is stale.
   const params=new URL(url);
   let data;
   if(params.pathname==="/api/geo/locations"){
     data=await searchGlobalLocations(params.searchParams.get("q"));
   }else if(params.pathname==="/api/geo/global"){
     data=await loadGlobalWeather({id:params.searchParams.get("id"),query:params.searchParams.get("city"),
       days:params.searchParams.get("days")||"7"});
   }else throw proxyError||Error("Serviço indisponível");
   if(!data?.ok)throw Error(data?.error||proxyError?.message||"Consulta meteorológica indisponível");
   return data;
 }
 async function showLocation(id,days=Number(daysChoice.value)){
   const queryId=Number(id);
   if(!Number.isSafeInteger(queryId)||queryId<1)return {ok:false,error:"Localidade inválida"};
   const key=++seq;
   placeResults.hidden=false;placeResults.textContent="Consultando dados meteorológicos...";
   try{
     const response=await getJson(backend+"/api/geo/global?id="+queryId+"&days="+days);
     const scene=globalWeatherScenario(response);
     if(key!==seq||panel.hidden)return {ok:false,error:"Consulta cancelada"};
     if(!scene)throw Error("Previsão sem dados válidos");
     const result=await open({data:scene,view:mode});
     if(!result.ok)throw Error(result.error||"Mapa indisponível");
     placeInput.value=response.location.label;
     daysChoice.value=String(days);
     placeResults.textContent="Previsão atualizada: "+response.fetchedAt;
     return result;
   }catch(error){
     if(key===seq)placeResults.textContent=error?.message||"Não foi possível consultar o clima";
     return {ok:false,error:String(error?.message||error)};
   }
 }
 placeBar.addEventListener("submit",async event=>{
   event.preventDefault();const query=placeInput.value.trim(),key=++seq;
   placeResults.hidden=false;placeResults.textContent="Procurando localidades...";
   try{
     const response=await getJson(backend+"/api/geo/locations?q="+encodeURIComponent(query));
     if(key!==seq||panel.hidden)return;
     placeResults.replaceChildren();
     if(!response.locations?.length){placeResults.textContent="Localidade não encontrada; inclua o país.";return;}
     for(const loc of response.locations){
       const button=document.createElement("button");button.type="button";
       button.textContent=loc.label;button.addEventListener("click",()=>void showLocation(loc.id));
       placeResults.append(button);
     }
   }catch(error){if(key===seq)placeResults.textContent=error?.message||"Erro na busca";}
 });
 placeRefresh.addEventListener("click",()=>{
   const id=Number(dataset?.id?.match(/^weather-global-(\d+)$/)?.[1]);
   if(id>0)void showLocation(id);
 });

 insightBar.addEventListener("submit",async event=>{
   event.preventDefault();
   const id=Number(dataset?.id?.match(/global-(\d+)/)?.[1]);
   if(!Number.isSafeInteger(id)||id<=0){placeResults.hidden=false;placeResults.textContent="Selecione uma localidade na pesquisa mundial.";return;}
   const type=insightType.value,key=++seq,query=new URL(backend+"/api/geo/insight");
   query.searchParams.set("type",type);query.searchParams.set("id",String(id));
   if(type==="history"){query.searchParams.set("year",insightYear.value);query.searchParams.set("month",insightMonth.value);}
   placeResults.hidden=false;placeResults.textContent="Consultando "+WEATHER_INSIGHT_LABELS[type]+"...";
   try{
     let data=null;
     try{data=await getJson(query.toString());}catch{}
     if(!data?.ok)data=await loadWeatherInsight({type,id,year:type==="history"?Number(insightYear.value):undefined,
       month:type==="history"?Number(insightMonth.value):undefined});
     if(!data?.ok)throw Error(data?.error||"Não há dados válidos");
     if(key!==seq||panel.hidden)return;
     if(type==="alerts"){
       placeResults.replaceChildren();
       const intro=document.createElement("p");intro.textContent=insightSummary(data);
       placeResults.append(intro);
       for(const bulletin of (data.bulletins||[]).slice(0,12)){
         const item=document.createElement("a");item.href=bulletin.url;item.target="_blank";
         item.rel="noopener noreferrer";
         item.textContent=(bulletin.title||"Aviso")+" — "+(bulletin.severity||"")+
           " — "+(bulletin.areas?.join?.(", ")||bulletin.areas||"")+
           " — validade "+(bulletin.expiresAt||"não informada");
         placeResults.append(item);
       }
       return;
     }
     const scene=insightScenario(data);
     if(!scene)throw Error("Não há dados geográficos válidos para exibição");
     const result=await open({data:scene,view:mode});
     if(!result?.ok)throw Error(result?.error||"Mapa indisponível");
     placeResults.textContent=insightSummary(data);
   }catch(error){if(key===seq)placeResults.textContent=error?.message||"Análise indisponível";}
 });
 monitorButton.addEventListener("click",async()=>{
   const key=++seq;placeResults.hidden=false;placeResults.textContent="Consultando amostras persistentes...";
   try{
     const data=await getJson(backend+"/api/geo/monitor");
     if(key===seq&&!panel.hidden)placeResults.textContent=monitorSummary(data)||"Sem amostras disponíveis";
   }catch(error){if(key===seq)placeResults.textContent=error?.message||"Monitoramento indisponível";}
 });


 const postWatch=async(path,body={})=>{
   const key=window.ULTRON_MEMORY?.getMemoryKey?.();
   if(typeof key!=="string"||key.length<32)throw Error("Entre em sua sessão de memória JARVIS para acompanhar cidades.");
   const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
   try{
     const response=await fetch(backend+path,{method:"POST",cache:"no-store",
       headers:{"Content-Type":"application/json"},signal:controller.signal,
       body:JSON.stringify({memoryKey:key,...body})});
     const data=await response.json();
     if(!response.ok||data?.ok===false)throw Error(data?.error||"Monitoramento D1 indisponível");
     return data;
   }finally{clearTimeout(timer);}
 };
 async function renderWatches(){
   watchPanel.hidden=false;watchPanel.textContent="Consultando acompanhamento privado...";
   try{
     const data=await postWatch("/api/geo/watchlist");
     watchPanel.replaceChildren();
     const heading=document.createElement("strong");heading.textContent="MONITORAMENTO PESSOAL · 3 EM 3 HORAS";
     watchPanel.append(heading);
     if(!data.watches?.length){const p=document.createElement("p");p.textContent="Nenhuma cidade acompanhada. Abra uma previsão mundial e use + Acompanhar.";watchPanel.append(p);}
     for(const city of data.watches||[]){
       const row=document.createElement("div");row.className="jarvis-geo-watch-row";
       const name=document.createElement("span");name.textContent=city.name+", "+city.country+" — "+
         (city.last_checked_at?"última coleta "+city.last_checked_at:"aguardando a primeira coleta");
       const remove=document.createElement("button");remove.type="button";remove.textContent="Parar";
       remove.setAttribute("aria-label","Parar acompanhamento de "+city.name);
       remove.addEventListener("click",async()=>{
         try{await postWatch("/api/geo/watchlist/configure",{action:"remove",id:city.location_id});await renderWatches();}
         catch(error){watchPanel.textContent=error.message||"Erro ao remover";}
       });
       row.append(name,remove);watchPanel.append(row);
       const latest=data.history?.find(s=>s.locationId===city.location_id);
       if(latest){
         const status=document.createElement("small");
         status.textContent="Amostra "+latest.fetchedAt+" · "+latest.summary.temperatureC+" °C · chuva "+
           latest.summary.rainMm+" mm (modelo Open-Meteo, não alerta oficial)";
         watchPanel.append(status);
       }
     }
     const note=document.createElement("small");note.textContent="Máximo de 6 cidades. Amostras D1 por 7 dias. Não envia notificações push nem substitui alertas oficiais.";
     watchPanel.append(note);
   }catch(error){watchPanel.textContent=error?.message||"Monitoramento pessoal indisponível";}
 }
 watchAdd.addEventListener("click",async()=>{
   const id=Number(dataset?.id?.match(/^weather-global-(\d+)$/)?.[1]);
   if(!id){watchPanel.hidden=false;watchPanel.textContent="Primeiro abra a previsão de uma cidade mundial.";return;}
   watchPanel.hidden=false;watchPanel.textContent="Salvando cidade...";
   try{await postWatch("/api/geo/watchlist/configure",{action:"add",id});await renderWatches();}
   catch(error){watchPanel.textContent=error?.message||"Não foi possível ativar o acompanhamento";}
 });
 watchList.addEventListener("click",()=>void renderWatches());
 window.ULTRON_WEATHER_WATCH={list:renderWatches};

 function closePanel(){
   stop();panel.hidden=true;selected=null;seq++;
   intensityToken++;intensityReport=null;intensityKey="";intensityLegend.replaceChildren();
   intensityMessage.replaceChildren();
   if(refreshClock!==null){clearInterval(refreshClock);refreshClock=null;}
   placeResults.hidden=true;watchPanel.hidden=true;
   window.ULTRON_EARTH?.setThematicCountries?.([]);
   window.ULTRON_EARTH?.clearThematicLayer?.();
   return {ok:true,closed:true};
 }
 const setFrame=index=>{
   if(!dataset)return {ok:false,error:"Sem cenário"};
   const n=Number(index);if(!Number.isFinite(n)||n<0||n>=dataset.frames.length)return {ok:false,error:"Quadro inválido"};
   frameIndex=Math.floor(n);selected=null;draw();return {ok:true,frame:frameIndex,kind:dataset.frames[frameIndex].kind};
 };
 const applyFilter=kind=>{
   if(kind!=="all"&&!Object.hasOwn(GEO_PALETTE,kind))return {ok:false,error:"Categoria inválida"};
   filterKind=kind;selected=null;filter.value=kind;draw();return {ok:true,filter:kind};
 };
 function togglePlayback(next=!playing){
   if(!dataset)return {ok:false,error:"Sem cenário"};
   if(!next){stop();draw();return {ok:true,playing:false};}
   stop();playing=true;play.textContent="Ⅱ";play.setAttribute("aria-label","Pausar quadros");
   draw();
   clock=setInterval(()=>{
     if(document.hidden||panel.hidden){stop();draw();return;}
     frameIndex=(frameIndex+1)%dataset.frames.length;selected=null;draw();
   },dataset.id==="tsunami-japan"?950:6500);
   return {ok:true,playing:true};
 }
 close.addEventListener("click",closePanel);
 for(const [key,b] of Object.entries(modeButtons))b.addEventListener("click",()=>void setMode(key));
 filter.addEventListener("change",()=>applyFilter(filter.value));
 range.addEventListener("input",()=>setFrame(range.value));
 play.addEventListener("click",()=>togglePlayback());
 window.addEventListener("ultron:new-conversation",closePanel);
 window.ULTRON_GEO_VISUAL={
   open,close:closePanel,setMode,setFrame,applyFilter,focusPoint,play:()=>togglePlayback(true),pause:()=>togglePlayback(false),
   get state(){return {visible:!panel.hidden,mode,playing,frame:frameIndex,scenario:dataset?.id||null,
     count:dataset?geoFrame(dataset,frameIndex,filterKind)?.points.length||0:0,frameCount:dataset?.frames.length||0,
     source:dataset?.source.url||null,filter:filterKind,layer:intensityReport?.layer||layerChoice.value,
     gridCount:intensityReport?.ok?intensityReport.sampledCount:0,
     topic:dataset?.theme?.topic||null,countryCount:dataset?.theme?.countryValues?Object.keys(dataset.theme.countryValues).length:0};}
 };
}
