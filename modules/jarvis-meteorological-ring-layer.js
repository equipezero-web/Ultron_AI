import {radarTileGrid,radarTileUrl,radarMapboxTemplate,SATELLITE_PRODUCT} from "./jarvis-meteorological-live.js?v=5.00.0";
import {BRAZIL_OUTLINE_URL,geoJSONPaths,brazilXY} from "./jarvis-geospatial-model.js?v=4.96.0";
import {apacProjection,loadApacBoundary} from "./jarvis-rain-understanding.js?v=4.99.0";

const ns="http://www.w3.org/2000/svg";
const rasterId="jarvis-live-weather-radar",layerId="jarvis-live-weather-radar-layer";
const svg=(tag,attrs={})=>{
 const e=document.createElementNS(ns,tag);
 for(const [name,value] of Object.entries(attrs))e.setAttribute(name,String(value));
 return e;
};
let outlineCache=null;
const project=(region,lng,lat)=>region==="pernambuco"?
 apacProjection(lng,lat,{width:900,height:550}):brazilXY(lng,lat);
export function renderRadarMap(container,manifest,frame,{region="brazil",opacity=.78}={}){
 const root=svg("svg",{viewBox:"0 0 900 550",role:"img",
    "aria-label":"Radar meteorológico de ecos observados em "+
      (region==="pernambuco"?"Pernambuco":"Brasil")+"; mapa dentro do Neural Ring"});
 root.classList.add("jarvis-meteo-radar-map");
 root.append(svg("rect",{x:0,y:0,width:900,height:550,fill:"#092238"}));
 const lines=svg("g",{stroke:"#2f526c","stroke-dasharray":"3 8","stroke-width":.7});
 for(let x=45;x<900;x+=110)lines.append(svg("line",{x1:x,x2:x,y1:30,y2:522}));
 for(let y=45;y<545;y+=90)lines.append(svg("line",{x1:35,x2:870,y1:y,y2:y}));
 root.append(lines);
 const radar=svg("g",{"data-meteo-radar-tiles":"true"});
 let tileCount=0,loaded=0,errors=0;
 const tiles=radarTileGrid(region);
 for(const tile of tiles){
   const url=radarTileUrl(manifest,frame,tile);
   if(!url)continue;
   const top=project(region,tile.west,tile.north),bottom=project(region,tile.east,tile.south);
   const x=Math.min(top.x,bottom.x),y=Math.min(top.y,bottom.y),
         width=Math.abs(bottom.x-top.x),height=Math.abs(bottom.y-top.y);
   if(width<.1||height<.1)continue;
   const img=svg("image",{x,y,width,height,opacity,
     preserveAspectRatio:"none",href:url});
   img.setAttribute("data-radar-z",String(tile.z));
   img.setAttribute("data-radar-x",String(tile.x));
   img.setAttribute("data-radar-y",String(tile.y));
   img.addEventListener("load",()=>{loaded++;root.dataset.tileStatus="loaded";});
   img.addEventListener("error",()=>{
     errors++;
     if(errors===tileCount&&loaded===0)root.dataset.tileStatus="unavailable";
   });
   radar.append(img);tileCount++;
 }
 root.append(radar);
 const outline=svg("g",{"data-meteo-radar-outline":"pending"});
 root.append(outline);
 if(region==="brazil"){
   if(!outlineCache)outlineCache=(async()=>{
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),6500);
      try{
        const response=await fetch(BRAZIL_OUTLINE_URL,{signal:controller.signal});
        if(!response.ok)throw Error("IBGE unavailable");
        const paths=geoJSONPaths(await response.json(),{projection:"brazil"});
        return paths;
      }catch{return [];}finally{clearTimeout(timer);}
   })();
   void outlineCache.then(paths=>{
     if(!root.isConnected)return;
     for(const d of paths)outline.append(svg("path",{d,fill:"none",
       stroke:"#aed7ef","stroke-width":2.2}));
     outline.dataset.meteoRadarOutline=paths.length?"ibge":"unavailable";
   });
 }else{
   void loadApacBoundary().then(rings=>{
     if(!root.isConnected)return;
     for(const ring of rings.slice(0,50)){
       const d=ring.map(([lng,lat],i)=>{
         const p=project(region,lng,lat);
         return (i?"L":"M")+p.x.toFixed(1)+","+p.y.toFixed(1);
       }).join("")+"Z";
       outline.append(svg("path",{d,fill:"none",stroke:"#aed7ef","stroke-width":2.5}));
     }
     outline.dataset.meteoRadarOutline=rings.length?"apac":"unavailable";
   });
 }
 container.replaceChildren(root);
 return {root,tileCount,frameTime:frame.time,region,
   get loaded(){return loaded;},get errors(){return errors;}};
}
export function putRadarOnGlobe(earth,manifest,frame){
 const map=earth?.referenceMap,template=radarMapboxTemplate(manifest,frame);
 if(!map||!map.isStyleLoaded?.()||!template)return {ok:false,error:"O globo Mapbox 3D não está disponível."};
 try{
   if(map.getLayer(layerId))map.removeLayer(layerId);
   if(map.getSource(rasterId))map.removeSource(rasterId);
   map.addSource(rasterId,{type:"raster",tiles:[template],tileSize:256,maxzoom:7});
   map.addLayer({id:layerId,type:"raster",source:rasterId,
      paint:{"raster-opacity":.76,"raster-fade-duration":0}});
   return {ok:true,type:"mapbox-raster-on-globe",source:template};
 }catch(error){return {ok:false,error:"Não foi possível aplicar os mosaicos ao globo: "+String(error?.message||error)};}
}
export function clearRadarGlobe(earth){
 const map=earth?.referenceMap;
 if(!map)return;
 try{
   if(map.getLayer?.(layerId))map.removeLayer(layerId);
   if(map.getSource?.(rasterId))map.removeSource(rasterId);
 }catch{}
}
export function renderSatelliteInsideRing(container,{onStatus=()=>{}}={}){
 const wrap=document.createElement("div");wrap.className="jarvis-meteo-satellite-view";
 const img=document.createElement("img");img.className="jarvis-meteo-satellite-image";
 img.alt="Imagem GeoColor do disco completo GOES-19, NOAA/CIRA; nuvens e oceanos vistos por satélite";
 img.loading="eager";img.decoding="async";
 const description=document.createElement("p");description.textContent=SATELLITE_PRODUCT.notice;
 wrap.append(img,description);container.replaceChildren(wrap);
 img.onload=()=>{wrap.dataset.imageStatus="loaded";onStatus({ok:true,source:SATELLITE_PRODUCT.source});};
 img.onerror=()=>{wrap.dataset.imageStatus="unavailable";
   description.textContent="Imagem GOES-19 não carregou. Fonte temporariamente indisponível; não existe imagem substituta fictícia.";
   onStatus({ok:false,error:"NOAA image unavailable"});
 };
 // Constant current-image asset maintained on NOAA servers. The opaque
 // cache buster is not a claim about the actual satellite acquisition time.
 img.src=SATELLITE_PRODUCT.image+"?update="+Math.floor(Date.now()/600000);
 return {wrap,img,source:SATELLITE_PRODUCT.source};
}
