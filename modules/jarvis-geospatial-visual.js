import API_CONFIG from "../config.js";
import {globalWeatherScenario} from "./jarvis-global-weather.js?v=4.77.0";
import {searchGlobalLocations,loadGlobalWeather} from "../backend/weather-global.js?v=4.74.0";
import {loadWeatherInsight} from "../backend/weather-intelligence.js?v=4.75.0";
import {insightScenario,insightSummary,monitorSummary,WEATHER_INSIGHT_LABELS} from "./jarvis-weather-insight-model.js?v=4.75.0";
import {GEO_SCENARIOS,GEO_PALETTE,geoFrame,validateGeoScenario,BRAZIL_OUTLINE_URL,WORLD_OUTLINE_URL,brazilXY,worldXY,geoJSONPaths} from "./jarvis-geospatial-model.js?v=4.75.0";

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
 placeBar.append(placeInput,daysChoice,placeSearch,placeRefresh);
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
 const canvas=document.createElement("div");canvas.className="jarvis-geo-2d";canvas.hidden=true;
 canvas.setAttribute("aria-label","Mapa 2D do Brasil e marcadores de tendências regionais");
 const svg=document.createElementNS("http://www.w3.org/2000/svg","svg");
 svg.setAttribute("viewBox","0 0 900 550");svg.setAttribute("role","img");
 svg.setAttribute("aria-label","Mapa interativo do Brasil");
 const svgLabels=document.createElement("div");svgLabels.className="jarvis-geo-map-note";
 canvas.append(svg,svgLabels);
 const list=document.createElement("div");list.className="jarvis-geo-region-list";list.setAttribute("aria-label","Regiões destacadas");
 const detail=document.createElement("p");detail.className="jarvis-geo-detail";detail.setAttribute("aria-live","polite");
 const footer=document.createElement("footer");footer.className="jarvis-geo-footer";
 const source=document.createElement("a");source.target="_blank";source.rel="noopener noreferrer";
 const caveat=document.createElement("small");
 const officialAlerts=document.createElement("a");officialAlerts.href="https://avisos.inmet.gov.br/";
 officialAlerts.target="_blank";officialAlerts.rel="noopener noreferrer";
 officialAlerts.textContent="Consultar alertas oficiais do INMET";officialAlerts.hidden=true;
 footer.append(source,officialAlerts,caveat);
 panel.append(head,controls,placeBar,insightBar,placeResults,timeline,evidence,canvas,list,detail,footer);stage.append(panel);
 for(const type of ["pointerdown","pointerup","wheel","click","touchstart","touchend"]){
   panel.addEventListener(type,event=>event.stopPropagation(),{passive:true});
 }
 let dataset=null,frameIndex=1,mode="3d",playing=false,clock=null,selected=null,outlines={brazil:null,world:null};
 let geoLoading={brazil:null,world:null},seq=0,filterKind="all",refreshClock=null;
 const ns="http://www.w3.org/2000/svg";
 const e=(tag,attr={})=>{const el=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attr))el.setAttribute(k,String(v));return el;};
 function resize(){panel.dataset.screen=document.body.classList.contains("ultron-tv-display")?"tv":
   stage.getBoundingClientRect().width<660||window.innerWidth<=820?"compact":"wide";}
 if(typeof ResizeObserver!=="undefined")new ResizeObserver(resize).observe(stage);
 window.addEventListener("resize",resize,{passive:true});
 resize();
 function renderMap(frame){
   svg.replaceChildren();
   const bg=e("rect",{width:900,height:550,fill:"#091a2c",rx:12});svg.append(bg);
   for(let x=55;x<880;x+=100)svg.append(e("line",{x1:x,x2:x,y1:40,y2:530,stroke:"#35516a","stroke-opacity":".38","stroke-width":1}));
   for(let y=50;y<535;y+=80)svg.append(e("line",{x1:50,x2:875,y1:y,y2:y,stroke:"#35516a","stroke-opacity":".38","stroke-width":1}));
   const projection=dataset?.projection==="world"?"world":"brazil",outline=outlines[projection];
   if(outline?.length)for(const d of outline)svg.append(e("path",{d,fill:"#18354b",stroke:"#6c9caa","stroke-width":1.4,"fill-opacity":".83"}));
   for(const p of frame.points){
     const {x,y}=(projection==="world"?worldXY(p.lng,p.lat):brazilXY(p.lng,p.lat)),color=GEO_PALETTE[p.kind]?.color||"#91d7f0";
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
   svgLabels.textContent=projection==="world"?
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
       return outlines[projection];
     }catch{return [];}finally{clearTimeout(timeout);}
   })().finally(()=>{geoLoading[projection]=null;});
   return geoLoading[projection];
 }
 function selectRegion(p){
   selected=p?.id||null;
   detail.replaceChildren();
   if(!p){detail.textContent="Selecione uma região para consultar o contexto.";return;}
   const b=document.createElement("strong");b.textContent=p.name+" — "+GEO_PALETTE[p.kind]?.short;
   const line=document.createElement("p");line.textContent=p.detail;
   const link=document.createElement("a");link.href=p.source;link.target="_blank";link.rel="noopener noreferrer";link.textContent="Ver fonte dos dados";
   detail.append(b,line,link);
   for(const node of list.querySelectorAll("button"))node.setAttribute("aria-pressed",String(node.dataset.id===selected));
   for(const node of svg.querySelectorAll(".jarvis-geo-marker"))node.setAttribute("aria-pressed",String(node.dataset.regionId===selected));
   if(mode==="3d"&&typeof window.ULTRON_EARTH?.focus==="function"){
     try{window.ULTRON_EARTH.focus(p.lat,p.lng,5,false,p.name);}catch{}
   }
 }
 function stop(){playing=false;play.textContent="▶";play.setAttribute("aria-label","Reproduzir quadros");if(clock!==null)clearInterval(clock);clock=null;}
 function draw(){
   if(!dataset)return;
   resize();
   range.max=String(dataset.frames.length-1);range.value=String(frameIndex);
   const frame=geoFrame(dataset,frameIndex,filterKind);
   if(!frame)return;
   frameName.textContent=frame.name;
   frameType.textContent=frame.type;
   evidence.textContent=frame.description;
   for(const [key,b] of Object.entries(modeButtons))b.setAttribute("aria-pressed",String(key===mode));
   panel.dataset.mode=mode;
   canvas.hidden=mode!=="2d";
   list.replaceChildren();
   for(const p of frame.points){
     const b=document.createElement("button");b.type="button";b.className="jarvis-geo-region";
     b.dataset.id=p.id;b.setAttribute("aria-pressed",String(p.id===selected));
     const dot=document.createElement("span");dot.style.background=GEO_PALETTE[p.kind]?.color||"#91d7f0";dot.className="jarvis-geo-dot";
     const name=document.createElement("span");name.textContent=p.name;b.append(dot,name);
     b.addEventListener("click",()=>selectRegion(p));list.append(b);
   }
   const selectedPoint=frame.points.find(p=>p.id===selected);
   if(selectedPoint){detail.textContent="";selectRegion(selectedPoint);}
   else{selected=null;detail.textContent=frame.points.length?"Selecione uma região para ver o que os dados indicam.":"Nenhuma região nessa categoria para o quadro selecionado.";}
   if(mode==="2d")renderMap(frame);
   const earth=window.ULTRON_EARTH;
   if(earth?.state?.visible&&typeof earth.setThematicLayer==="function"){
     const points=frame.points.map(p=>({...p,color:GEO_PALETTE[p.kind]?.color||"#91d7f0"}));
     earth.setThematicLayer(points,{playing:mode==="3d"&&playing});
   }
 }
 async function setMode(next){
   if(!dataset)return {ok:false,error:"Sem dados carregados"};
   if(next!=="2d"&&next!=="3d")return {ok:false,error:"Modo não disponível"};
   mode=next;
   if(next==="3d"){
     const globe=window.ULTRON_EARTH;
     if(!globe?.state?.visible){const r=await globe?.open?.();if(!r?.ok){mode="2d";draw();return {ok:false,error:r?.error||"Globo indisponível"};}}
   }else await loadOutline(dataset?.projection);
   draw();return {ok:true,mode:next,count:geoFrame(dataset,frameIndex,filterKind)?.points.length||0};
 }
 async function open({scenario="enso",view="3d",data=null}={}){
   if(!["2d","3d"].includes(view))return {ok:false,error:"Modo inválido"};
   const requested=data||GEO_SCENARIOS[scenario];
   const validated=validateGeoScenario(requested);
   if(!validated)return {ok:false,error:"Cenário sem dados geográficos e fonte verificável"};
   window.ULTRON_NEURAL_ANSWER?.clear?.(); // Geo visualization gets the ring's attention, no overlapping previous answer.
   stop();dataset=validated;filterKind="all";filter.value="all";selected=null;
   frameIndex=Math.min(1,dataset.frames.length-1);range.max=String(dataset.frames.length-1);
   heading.textContent=dataset.title.toUpperCase();
   source.href=dataset.source.url;source.textContent=dataset.source.name;
   caveat.textContent=dataset.source.disclaimer;
   officialAlerts.hidden=!dataset.id.startsWith("weather-")||dataset.projection==="world";
   placeBar.hidden=dataset.projection!=="world";
   insightBar.hidden=dataset.projection!=="world";
   placeRefresh.disabled=!/^weather-global-\d+$/.test(dataset.id);
   if(refreshClock!==null){clearInterval(refreshClock);refreshClock=null;}
   if(/^weather-global-\d+$/.test(dataset.id))refreshClock=setInterval(()=>{
     if(panel.hidden||document.hidden)return;
     const id=Number(dataset?.id?.match(/^weather-global-(\d+)$/)?.[1]);
     if(id>0)void showLocation(id,Math.min(16,Math.max(3,dataset.frames.length-1)));
   },15*60*1000);
   svg.setAttribute("aria-label",dataset.projection==="world"?"Mapa 2D mundial":"Mapa 2D do Brasil");
   panel.hidden=false;
   const result=await setMode(view);
   if(!result.ok){panel.hidden=true;return result;}
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

 function closePanel(){
   stop();panel.hidden=true;selected=null;seq++;
   if(refreshClock!==null){clearInterval(refreshClock);refreshClock=null;}
   placeResults.hidden=true;
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
   },6500);
   return {ok:true,playing:true};
 }
 close.addEventListener("click",closePanel);
 for(const [key,b] of Object.entries(modeButtons))b.addEventListener("click",()=>void setMode(key));
 filter.addEventListener("change",()=>applyFilter(filter.value));
 range.addEventListener("input",()=>setFrame(range.value));
 play.addEventListener("click",()=>togglePlayback());
 window.addEventListener("ultron:new-conversation",closePanel);
 window.ULTRON_GEO_VISUAL={
   open,close:closePanel,setMode,setFrame,applyFilter,play:()=>togglePlayback(true),pause:()=>togglePlayback(false),
   get state(){return {visible:!panel.hidden,mode,playing,frame:frameIndex,scenario:dataset?.id||null,
     count:dataset?geoFrame(dataset,frameIndex,filterKind)?.points.length||0:0,frameCount:dataset?.frames.length||0,source:dataset?.source.url||null,filter:filterKind};}
 };
}
