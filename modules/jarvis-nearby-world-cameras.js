import {PUBLIC_WORLD_CAMERAS} from "./jarvis-public-world-cameras-model.js";

// Approximate public landmark/city reference points, NOT camera equipment GPS.
// An entry without verified approximate geography is never ranked as nearby.
// Distances are to these reference points, not to a camera lens or field of view.
const POSITIONS=Object.freeze({
 "recife-airport":[-8.126,-34.923],
 "copacabana":[-22.971,-43.183],
 "buenos-aires":[-34.603,-58.381],
 "times-square":[40.758,-73.986],
 "port-miami":[25.775,-80.172],
 "paris-panorama":[48.859,2.294],
 "lisboa-airport":[38.774,-9.135],
 "heathrow":[51.471,-0.454],
 "tokyo-rainbow":[35.636,139.762],
 "seoul-river":[37.528,126.934],
 "jerusalem-western-wall":[31.776,35.234],
 "jerusalem-western-wall-earthcam":[31.776,35.234],
 "cdm-cristo-redentor":[-22.951,-43.211],
 "cdm-congonhas":[-23.627,-46.656],
 "cdm-guarulhos":[-23.433,-46.474],
 "cdm-galeao":[-22.810,-43.251],
 "cdm-viracopos":[-23.008,-47.134],
 "cdm-afonso-pena":[-25.531,-49.175],
 "cdm-meia-praia":[-27.128,-48.602],
 "cdm-retiro-padres":[-27.154,-48.478],
 "cdm-sao-conrado":[-23.001,-43.259],
 "cdm-morro-pedras":[-27.711,-48.504],
 "cdm-praia-milionarios":[-23.970,-46.372],
 "cdm-goioere":[-24.184,-53.025],
 "cdm-sao-jose-campos":[-23.180,-45.884],
 "janelas-ponta-praia":[-23.986,-46.302],
 "janelas-canal-3":[-23.969,-46.326],
 "janelas-quebra-mar":[-23.971,-46.335],
 "janelas-monte-serrat":[-23.939,-46.330],
 "janelas-pitangueiras":[-23.995,-46.256],
 "janelas-ilha-porchat":[-23.979,-46.372],
 "janelas-canto-forte":[-24.016,-46.411]
});
const R=Math.PI/180;
function distanceKm(a,b,c,d){
 const x=(c-a)*R,y=(d-b)*R;
 const h=Math.sin(x/2)**2+Math.cos(a*R)*Math.cos(c*R)*Math.sin(y/2)**2;
 return Math.round(2*6371*Math.asin(Math.min(1,Math.sqrt(h))));
}
export function nearbyWorldCameras({lat,lng,maxKm=50,limit=4}={}){
 if(!Number.isFinite(lat)||!Number.isFinite(lng)||Math.abs(lat)>90||Math.abs(lng)>180)return [];
 const max=Math.max(0,Math.min(100,Number(maxKm)||0));
 return PUBLIC_WORLD_CAMERAS.flatMap(camera=>{
  const coord=POSITIONS[camera.id];
  if(!coord)return [];
  const km=distanceKm(lat,lng,...coord);
  if(km>max)return [];
  return [{id:camera.id,name:camera.name,city:camera.city,country:camera.country,
    publisher:camera.publisher,sourceUrl:camera.sourceUrl,
    hasPublishedPlayer:Boolean(camera.embedId),distanceKm:km,
    distanceType:"approximate-reference",liveVerified:false}];
 }).sort((a,b)=>a.distanceKm-b.distanceKm||a.name.localeCompare(b.name))
  .slice(0,Math.max(0,Math.min(8,Number(limit)||0)));
}
