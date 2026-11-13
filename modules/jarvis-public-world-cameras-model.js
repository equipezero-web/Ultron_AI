// Public-camera index: curated publisher pages and embeddable YouTube streams.
// A catalog listing is NOT proof the feed is currently on-air.
// Only official public listing URLs; never RTSP/IP-camera scanning or private feeds.
const entry=(id,name,city,country,region,category,sourceUrl,publisher,embedId=null)=>Object.freeze({
 id,name,city,country,region,category,sourceUrl,publisher,embedId,
 availability:"not-verified"
});
export const PUBLIC_WORLD_CAMERAS=Object.freeze([
 entry("recife-airport","Aeroporto do Recife","Recife","Brasil","América do Sul","aeroportos",
  "https://camerasdomundo.com/aeroporto-recife-ao-vivo/","Papa Charlie Golf TV","ojTrjv9QxM8"),
 entry("copacabana","Praia de Copacabana","Rio de Janeiro","Brasil","América do Sul","praias",
  "https://camerasdomundo.com/copacabana-ao-vivo/","Homes in Rio","WEl_I5vmuSs"),
 entry("serra-rastro","Serra do Rio do Rastro","Lauro Müller","Brasil","América do Sul","estradas",
  "https://camerasdomundo.com/serra-do-rio-do-rastro/","Turma do Papai Beto"),
 entry("buenos-aires","Buenos Aires — Obelisco","Buenos Aires","Argentina","América do Sul","cidades",
  "https://camerasdomundo.com/buenos-aires-ao-vivo/","UADE","NfsyRx50gAI"),
 entry("times-square","Times Square","Nova York","Estados Unidos","América do Norte","cidades",
  "https://camerasdomundo.com/en/times-square-new-york-city/","AE Signage","VXo0VqVcbK4"),
 entry("port-miami","PortMiami","Miami","Estados Unidos","América do Norte","portos",
  "https://camerasdomundo.com/en/port-miami-webcam/","Cruise Ships Live","m1R-LmvVt30"),
 entry("paris-panorama","Paris — Torre Eiffel","Paris","França","Europa","cidades",
  "https://camerasdomundo.com/en/paris-panoramic-live/","Webcam Paris75","QI-PPEW2Bgc"),
 entry("lisboa-airport","Aeroporto de Lisboa","Lisboa","Portugal","Europa","aeroportos",
  "https://camerasdomundo.com/aeroporto-de-lisboa/","AVIAÇÃO TV"),
 entry("heathrow","Aeroporto Heathrow","Londres","Reino Unido","Europa","aeroportos",
  "https://camerasdomundo.com/en/london-heathrow-airport-cam/","Flightradar24","SgvpyjQX_HM"),
 entry("geiranger","Fiorde de Geiranger","Geiranger","Noruega","Europa","portos",
  "https://camerasdomundo.com/en/geirangerfjord-cruise-port/","Geirangerfjord Cruise Port"),
 entry("tokyo-rainbow","Rainbow Bridge","Tóquio","Japão","Ásia","cidades",
  "https://camerasdomundo.com/rainbow-bridge-toquio/","ちんあなご","Sm3nG3DHgBI"),
 entry("seoul-river","Rio Han — Seul","Seul","Coreia do Sul","Ásia","cidades",
  "https://camerasdomundo.com/en/seoul-city-centre/","RIVERWORKER","vk5BHoDxXf0"),
 entry("taronga-zoo","Elefantes — Zoológico Taronga","Sydney","Austrália","Oceania","natureza",
  "https://camerasdomundo.com/elefantes-zoologico-sydney-ao-vivo/","Taronga Zoo")
]);
export const CAMERA_CATEGORY_NAMES=Object.freeze({
 cidades:"Cidades",aeroportos:"Aeroportos",praias:"Praias",
 portos:"Portos",estradas:"Estradas",natureza:"Natureza"
});
export const WORLD_CAMERAS_HOME="https://camerasdomundo.com/";
export const WORLD_CAMERAS_INTERNATIONAL="https://camerasdomundo.com/en/";
const plain=s=>String(s??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim();
export function normalizeCameraText(text){return plain(text).replace(/\s+/g," ").slice(0,120);}
export function validatePublicCamera(camera){
 if(!camera||!(/^[a-z0-9-]{2,60}$/.test(camera.id))||
  !["América do Sul","América do Norte","Europa","Ásia","Oceania"].includes(camera.region)||
  !CAMERA_CATEGORY_NAMES[camera.category]||
  typeof camera.name!=="string"||!camera.name.trim()||typeof camera.city!=="string"||
  typeof camera.country!=="string"||typeof camera.publisher!=="string")return false;
 try{
  const url=new URL(camera.sourceUrl);
  if(url.protocol!=="https:"||url.hostname!=="camerasdomundo.com"||
   url.username||url.password||url.port)return false;
 }catch{return false;}
 return camera.embedId===null||/^[a-zA-Z0-9_-]{11}$/.test(camera.embedId);
}
export function publicCameraEmbed(camera){
 if(!validatePublicCamera(camera)||!camera.embedId)return null;
 return "https://www.youtube-nocookie.com/embed/"+camera.embedId+
  "?autoplay=1&mute=1&playsinline=1&rel=0";
}
export function findPublicCameras({search="",country="",category="",region=""}={}){
 const term=normalizeCameraText(search),nation=plain(country);
 return PUBLIC_WORLD_CAMERAS.filter(c=>validatePublicCamera(c)&&
  (!term||normalizeCameraText([c.name,c.city,c.country,c.region,c.category,c.publisher].join(" ")).includes(term))&&
  (!nation||plain(c.country)===nation)&&(!category||c.category===category)&&
  (!region||c.region===region));
}
export function parseWorldCameraCommand(message){
 const s=normalizeCameraText(message).replace(/^(?:jarvis|ultron)[ ,:.-]+/,"").replace(/[.!?]+$/,"").trim();
 if(/^(?:cameras? (?:do mundo|mundiais|publicas do mundo)|monitoramento visual mundial|ativar cameras do mundo|ative as cameras do mundo|ativar monitoramento visual mundial|abrir cameras do mundo|abra cameras do mundo|mostre cameras do mundo|mostrar cameras do mundo|exibir webcams mundiais)$/.test(s))
  return {type:"open"};
 if(/^(?:fechar|feche|ocultar|oculte) (?:cameras do mundo|cameras mundiais|monitoramento visual mundial)$/.test(s))
  return {type:"close"};
 if(/^(?:status|estado) (?:das cameras mundiais|do monitoramento visual mundial)$/.test(s))
  return {type:"status"};
 const match=s.match(/^(?:mostrar|mostre|abrir|abra|buscar|busque|ver) (?:as |uma |a )?(?:cameras?|webcams?) (?:de|do|da|em|no|na) ([a-z0-9\s-]{2,64})$/);
 if(match)return {type:"search",term:match[1].trim()};
 return null;
}
export function cameraDirectorySummary(){
 const countries=[...new Set(PUBLIC_WORLD_CAMERAS.map(c=>c.country))].sort();
 const regions=[...new Set(PUBLIC_WORLD_CAMERAS.map(c=>c.region))];
 return {indexed:PUBLIC_WORLD_CAMERAS.length,countries,regions,embedded:PUBLIC_WORLD_CAMERAS.filter(c=>c.embedId).length,
  liveVerified:0,source:"Câmeras do Mundo — catálogo externo"};
}
