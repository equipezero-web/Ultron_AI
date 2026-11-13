// Live-image sources used directly INSIDE the existing Neural Jarvis.
// Never confuse observed radar echoes, GOES imagery, APAC gauges and forecasts.
export const RAINVIEWER_META="https://api.rainviewer.com/public/weather-maps.json";
export const RAINVIEWER_ATTRIBUTION="https://www.rainviewer.com/";
export const NOAA_GEOCOLOR="https://cdn.star.nesdis.noaa.gov/GOES19/ABI/FD/GEOCOLOR/1808x1808.jpg";
export const NOAA_SOURCE="https://www.star.nesdis.noaa.gov/GOES/fulldisk_band.php?band=GEOCOLOR&sat=G19";
export const BRAZIL_RADAR_BOUNDS=Object.freeze({west:-74,east:-34,north:6,south:-34,zoom:4});
export const PE_RADAR_BOUNDS=Object.freeze({west:-41.7,east:-34.4,north:-6.4,south:-9.8,zoom:6});
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
const mercatorY=(lat,z)=>{
 const latRad=clamp(lat,-85.051128,85.051128)*Math.PI/180;
 return ((1-Math.log(Math.tan(latRad)+1/Math.cos(latRad))/Math.PI)/2)*2**z;
};
export function radarTileBounds(z,x,y){
 const n=2**z,lng=t=>360*t/n-180,lat=t=>180/Math.PI*Math.atan(Math.sinh(Math.PI*(1-2*t/n)));
 return {west:lng(x),east:lng(x+1),north:lat(y),south:lat(y+1)};
}
export function radarTileGrid(region="brazil"){
 const box=region==="pernambuco"?PE_RADAR_BOUNDS:BRAZIL_RADAR_BOUNDS;
 const z=box.zoom,n=2**z,tiles=[];
 const left=clamp(Math.floor((box.west+180)/360*n),0,n-1),
       right=clamp(Math.floor((box.east+180)/360*n),0,n-1);
 const top=clamp(Math.floor(mercatorY(box.north,z)),0,n-1),
       bottom=clamp(Math.floor(mercatorY(box.south,z)),0,n-1);
 for(let x=left;x<=right;x++)for(let y=top;y<=bottom;y++)
   tiles.push({z,x,y,...radarTileBounds(z,x,y)});
 return tiles;
}
export function normalizeRadarManifest(raw,{now=Date.now()}={}){
 if(raw?.version?.toString().split(".")[0]!=="2"||typeof raw.host!=="string"||
    !/^https:\/\/tilecache\.rainviewer\.com\/?$/.test(raw.host))return null;
 const timeline=raw?.radar?.past;
 if(!Array.isArray(timeline)||!timeline.length)return null;
 const frames=[];
 for(const f of timeline){
   if(!Number.isInteger(f?.time)||f.time<=0||
     typeof f.path!=="string"||!/^\/v2\/radar\/[A-Za-z0-9_-]{6,20}$/.test(f.path))continue;
   if(f.time*1000>now+15*60000)continue;
   frames.push({time:f.time,path:f.path});
 }
 frames.sort((a,b)=>a.time-b.time);
 const limited=frames.slice(-6);
 if(!limited.length)return null;
 const last=limited.at(-1);
 return {ok:true,provider:"RainViewer",host:raw.host.replace(/\/$/,""),frames:limited,
  latestTime:last.time,updatedAt:new Date(last.time*1000).toISOString(),
  stale:now-last.time*1000>3*3600000,ageMinutes:Math.max(0,Math.round((now-last.time*1000)/60000)),
  source:RAINVIEWER_ATTRIBUTION,
  disclaimer:"Mosaico de ecos observados por radares; cobertura variável. Não é previsão, chuva acumulada em pluviômetro nem alerta."};
}
export function radarTileUrl(manifest,frame,tile){
 if(!manifest?.ok||!manifest.frames.includes(frame)||!Number.isInteger(tile?.z)||
    tile.z<0||tile.z>7||!Number.isInteger(tile?.x)||!Number.isInteger(tile?.y)||
    tile.x<0||tile.y<0||tile.x>=2**tile.z||tile.y>=2**tile.z)return null;
 return manifest.host+frame.path+"/256/"+tile.z+"/"+tile.x+"/"+tile.y+"/2/1_1.png";
}
export function radarMapboxTemplate(manifest,frame){
 if(!manifest?.ok||!manifest.frames.includes(frame))return null;
 return manifest.host+frame.path+"/256/{z}/{x}/{y}/2/1_1.png";
}
export async function loadRadarManifest({fetchImpl=fetch,now=()=>Date.now()}={}){
 const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),8500);
 try{
   const res=await fetchImpl(RAINVIEWER_META,{signal:abort.signal,cache:"no-store",
     headers:{Accept:"application/json"}});
   if(!res.ok)throw Error("HTTP "+res.status);
   const model=normalizeRadarManifest(await res.json(),{now:now()});
   return model||{ok:false,error:"O provedor retornou dados de radar inválidos ou sem quadros válidos."};
 }catch(err){
   return {ok:false,error:"Radar indisponível agora: "+String(err?.message||err).slice(0,130)};
 }finally{clearTimeout(timer);}
}
export const SATELLITE_PRODUCT=Object.freeze({
 title:"GOES-19 / NOAA · GeoColor",
 image:NOAA_GEOCOLOR,source:NOAA_SOURCE,
 notice:"Imagem real do disco completo do GOES-19, com GeoColor (visual/IR). NÃO é radar, precipitação medida ou previsão. Horário da captura não é verificado por este painel; não presuma tempo real."
});
