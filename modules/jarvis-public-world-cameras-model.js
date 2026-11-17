// Public-camera index: curated publisher pages and embeddable YouTube streams.
// SkylineWebcams permits shared links, but only camera hosts may embed live
// video. Its Jerusalem page must therefore remain source-link-only.
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
 entry("tembe-elephants","Tembe Elephant Park — fauna","Emangusi","África do Sul","África","natureza",
  "https://africam.com/lodge/tembe-elephant-park/","Africam"),
 entry("taronga-zoo","Elefantes — Zoológico Taronga","Sydney","Austrália","Oceania","natureza",
  "https://camerasdomundo.com/elefantes-zoologico-sydney-ao-vivo/","Taronga Zoo"),
 entry("jerusalem-western-wall","Jerusalém — Muro Ocidental","Jerusalém","Israel","Ásia","cidades",
  "https://www.skylinewebcams.com/en/webcam/israel/jerusalem-district/jerusalem/western-wall.html",
  "SkylineWebcams"),
 entry("jerusalem-western-wall-earthcam","Jerusalém — Muro Ocidental · EarthCam","Jerusalém","Israel","Ásia","cidades",
  "https://www.youtube.com/watch?v=77akujLn4k8","EarthCam","77akujLn4k8")  ,entry("webcamera24-elbo-room","Elbo Room Bar — Fort Lauderdale","Fort Lauderdale","Estados Unidos","América do Norte","cidades",
  "https://webcamera24.com/pt/camera/usa/elboroom-bar-band-cam/","Webcamera24","YWs0HMRVCBY")
  ,entry("webcamera24-osaka-ikuno","Ikuno Korea Town — Osaka","Osaka","Japão","Ásia","cidades",
  "https://webcamera24.com/pt/camera/japan/ikuno-korea-town/","Webcamera24","ztXjQgNxi4o")
  ,entry("webcamera24-patong-nanai","Nanai Road — Patong","Patong","Tailândia","Ásia","estradas",
  "https://webcamera24.com/pt/camera/thailand/nanai-road-cam/","Webcamera24","uEkJjuAjWa0")
  ,entry("webcamera24-kenya-rhino","Porini Rhino Camp — Bebedouro","Ol Pejeta","Quênia","África","natureza",
  "https://webcamera24.com/pt/camera/kenya/porini-rhino-camp-waterhole-ol-pejeta/","Webcamera24","5dhmXmUD1ZE")
  ,entry("webcamera24-florida-bar","Interior de bar — Fort Lauderdale","Fort Lauderdale","Estados Unidos","América do Norte","cidades",
  "https://webcamera24.com/pt/camera/usa/fort-lauderdale-beach-bar-interior/","Webcamera24","wVNt3l657X0")
  ,entry("webcamera24-kyiv-maidan","Maidan Nezalezhnosti — Kiev","Kiev","Ucrânia","Europa","cidades",
  "https://webcamera24.com/pt/camera/ukraine/maidan-nezalezhnosti/","Webcamera24")
  ,entry("webcamera24-oppdal-ski","Área de esqui Vangslia — Oppdal","Oppdal","Noruega","Europa","natureza",
  "https://webcamera24.com/pt/camera/norway/vangslia-oppdal/","Webcamera24")
  ,entry("skyline-shanghai","Skyline de Xangai","Xangai","China","Ásia","cidades",
  "https://www.skylinewebcams.com/en/webcam/china/shanghai/shanghai/skyline-of-shanghai.html","SkylineWebcams")
  ,entry("skyline-times-square","Times Square — SkylineWebcams","Nova York","Estados Unidos","América do Norte","cidades",
  "https://www.skylinewebcams.com/en/webcam/united-states/new-york/new-york/times-square.html","SkylineWebcams")

]);
export const CAMERA_CATEGORY_NAMES=Object.freeze({
 cidades:"Cidades",aeroportos:"Aeroportos",praias:"Praias",
 portos:"Portos",estradas:"Estradas",natureza:"Natureza"
});
// Explicit, geographically different alternative. Never auto-substitute
// Jerusalem for an unavailable camera in another city.
export const WORLD_CAMERAS_ALTERNATIVE_ID="jerusalem-western-wall";
export const WORLD_CAMERAS_SKYLINE_URL=
 "https://www.skylinewebcams.com/en/webcam/israel/jerusalem-district/jerusalem/western-wall.html";
export const WESTERN_WALL_EARTHCAM_ID="jerusalem-western-wall-earthcam";
export const WESTERN_WALL_EARTHCAM_YOUTUBE_URL=
 "https://www.youtube.com/watch?v=77akujLn4k8";
// A distinct camera of the SAME landmark. Never claim it is the Skyline stream.
export function getWesternWallPlayableAlternative(camera){
 if(camera?.id!==WORLD_CAMERAS_ALTERNATIVE_ID)return null;
 return PUBLIC_WORLD_CAMERAS.find(c=>c.id===WESTERN_WALL_EARTHCAM_ID)||null;
}
export const WESTERN_WALL_OFFICIAL_CAMERAS_URL=
 "https://thekotel.org/en/western-wall/israel-live-cam/";
export const getWorldCameraAlternative=()=>PUBLIC_WORLD_CAMERAS.find(
 c=>c.id===WORLD_CAMERAS_ALTERNATIVE_ID
)||null;
export const WORLD_CAMERAS_CATALOGS=Object.freeze([
 Object.freeze({id:"camerasdomundo",label:"Câmeras do Mundo",
  home:"https://camerasdomundo.com/",
  all:"https://camerasdomundo.com/live-cams/",
  countries:"https://camerasdomundo.com/en/",
  categories:"https://camerasdomundo.com/",
  note:"Diretório brasileiro e internacional; centenas de páginas públicas navegáveis no provedor."}),
 Object.freeze({id:"africam",label:"Africam",
  home:"https://africam.com/",
  all:"https://africam.com/our-locations/",
  countries:"https://africam.com/our-locations/",
  categories:"https://africam.com/our-locations/",
  note:"Câmeras de fauna em reservas africanas; alguns vídeos exigem conta/assinatura no site."}),
 Object.freeze({id:"skyline",label:"SkylineWebcams",home:"https://www.skylinewebcams.com/en/webcam.html",
  all:"https://www.skylinewebcams.com/en/webcam.html",
  countries:"https://www.skylinewebcams.com/en/webcam.html",
  categories:"https://www.skylinewebcams.com/en/categories.html",
  note:"Catálogo global por países/categorias; transmissões ao vivo apenas na página do provedor."}),
 Object.freeze({id:"webcamera24",label:"Webcamera24",home:"https://webcamera24.com/pt/",
  all:"https://webcamera24.com/pt/all-webcams/",
  countries:"https://webcamera24.com/pt/countries/",
  categories:"https://webcamera24.com/pt/categories/",
  note:"Diretório mundial; players YouTube selecionados iniciam sem áudio no J.A.R.V.I.S."})
]);
export const CAMERA_PROVIDER_NAMES=Object.freeze({
 all:"Todos os provedores",skyline:"SkylineWebcams",webcamera24:"Webcamera24",
 camerasdomundo:"Câmeras do Mundo",africam:"Africam"
});
export function cameraProvider(camera){
 const source=String(camera?.sourceUrl||"");
 if(source.startsWith("https://www.skylinewebcams.com/"))return "skyline";
 if(source.startsWith("https://webcamera24.com/"))return "webcamera24";
 if(source.startsWith("https://camerasdomundo.com/"))return "camerasdomundo";
 if(source.startsWith("https://africam.com/"))return "africam";
 return "independent";
}
const SKYLINE_APPROVED=new Map([
 [WORLD_CAMERAS_SKYLINE_URL,WORLD_CAMERAS_ALTERNATIVE_ID],
 ["https://www.skylinewebcams.com/en/webcam/china/shanghai/shanghai/skyline-of-shanghai.html","skyline-shanghai"],
 ["https://www.skylinewebcams.com/en/webcam/united-states/new-york/new-york/times-square.html","skyline-times-square"]
]);
const WEB_CAMERA24_APPROVED=new Set([
 "https://webcamera24.com/pt/camera/usa/elboroom-bar-band-cam/",
 "https://webcamera24.com/pt/camera/japan/ikuno-korea-town/",
 "https://webcamera24.com/pt/camera/thailand/nanai-road-cam/",
 "https://webcamera24.com/pt/camera/kenya/porini-rhino-camp-waterhole-ol-pejeta/",
 "https://webcamera24.com/pt/camera/usa/fort-lauderdale-beach-bar-interior/",
 "https://webcamera24.com/pt/camera/ukraine/maidan-nezalezhnosti/",
 "https://webcamera24.com/pt/camera/norway/vangslia-oppdal/"
]);
export const WORLD_CAMERAS_HOME="https://camerasdomundo.com/";
export const WORLD_CAMERAS_INTERNATIONAL="https://camerasdomundo.com/en/";
const plain=s=>String(s??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim();
export function normalizeCameraText(text){return plain(text).replace(/\s+/g," ").slice(0,120);}
export function validatePublicCamera(camera){
 if(!camera||!(/^[a-z0-9-]{2,60}$/.test(camera.id))||
  !["América do Sul","América do Norte","Europa","Ásia","África","Oceania"].includes(camera.region)||
  !CAMERA_CATEGORY_NAMES[camera.category]||
  typeof camera.name!=="string"||!camera.name.trim()||typeof camera.city!=="string"||
  typeof camera.country!=="string"||typeof camera.publisher!=="string")return false;
 try{
  const url=new URL(camera.sourceUrl);
  const recognized=["camerasdomundo.com","africam.com"].includes(url.hostname);
  // Strict curated page allowlists: no arbitrary user URL or IP camera scanning.
  // Skyline live videos are link-only, according to its embedding policy.
  const skyline=SKYLINE_APPROVED.get(url.href)===camera.id&&
   camera.embedId===null&&camera.publisher==="SkylineWebcams";
  const webcamera24=WEB_CAMERA24_APPROVED.has(url.href)&&
   camera.publisher==="Webcamera24";
  // First-party EarthCam video published on its official YouTube channel.
  // Exact source+ID pair is required; do not permit arbitrary YouTube videos.
  const earthcam=url.href===WESTERN_WALL_EARTHCAM_YOUTUBE_URL&&
   camera.id===WESTERN_WALL_EARTHCAM_ID&&camera.publisher==="EarthCam"&&
   camera.embedId==="77akujLn4k8";
  if(url.protocol!=="https:"||(!recognized&&!skyline&&!webcamera24&&!earthcam)||
   url.username||url.password||url.port)return false;
 }catch{return false;}
 return camera.embedId===null||/^[a-zA-Z0-9_-]{11}$/.test(camera.embedId);
}
export function publicCameraEmbed(camera){
 if(!validatePublicCamera(camera)||!camera.embedId)return null;
 return "https://www.youtube-nocookie.com/embed/"+camera.embedId+
  (cameraProvider(camera)==="webcamera24"?
   "?autoplay=1&mute=1&playsinline=1&rel=0&enablejsapi=1":
   "?autoplay=1&mute=1&playsinline=1&rel=0");
}
export function findPublicCameras({search="",country="",category="",region="",provider=""}={}){
 const term=normalizeCameraText(search),nation=plain(country);
 return PUBLIC_WORLD_CAMERAS.filter(c=>validatePublicCamera(c)&&
  (!term||normalizeCameraText([c.name,c.city,c.country,c.region,c.category,c.publisher].join(" ")).includes(term))&&
  (!nation||plain(c.country)===nation)&&(!category||c.category===category)&&
  (!region||c.region===region)&&(!provider||cameraProvider(c)===provider));
}
export function parseWorldCameraCommand(message){
 const s=normalizeCameraText(message).replace(/^(?:jarvis|ultron)[ ,:.-]+/,"").replace(/[.!?]+$/,"").trim();
 // Bare "abrir câmeras" opens only the public catalog, never a local camera.
 if(/^(?:abrir|abra|mostre|mostrar|exibir|exiba) (?:as |os )?(?:cameras|webcams)$/.test(s))
  return {type:"open"};
 if(/^(?:cameras? (?:do mundo|mundiais|publicas do mundo)|monitoramento visual mundial|ativar cameras do mundo|ative as cameras do mundo|ativar monitoramento visual mundial|abrir cameras do mundo|abra cameras do mundo|mostre cameras do mundo|mostrar cameras do mundo|exibir webcams mundiais)$/.test(s))
  return {type:"open"};
 if(/^(?:fechar|feche|ocultar|oculte|sair (?:das|de)|remover|remova|retirar|retire) (?:as |os )?(?:cameras|webcams|cameras do mundo|cameras mundiais|monitoramento visual mundial)$/.test(s))
  return {type:"close"};
 if(/^(?:status|estado) (?:das cameras mundiais|do monitoramento visual mundial)$/.test(s))
  return {type:"status"};
 const match=s.match(/^(?:mostrar|mostre|abrir|abra|buscar|busque|ver) (?:as |uma |a )?(?:cameras?|webcams?) (?:de|do|da|em|no|na) ([a-z0-9\s-]{2,64})$/);
 if(match){
  const term=match[1].trim();
  // Keep private, attached, household and local optical-camera requests
  // in their existing permission-aware camera controller.
  if(/\b(?:celular|telefone|smartphone|notebook|computador|laptop|dispositivo|webcam local|camera local|ip|rtsp|privad[ao]s?|particular|minha|meu|quarto|banheiro|apartamento|residencia)\b/.test(term))
   return null;
  return {type:"search",term};
 }
 return null;
}
export function cameraDirectorySummary(){
 const countries=[...new Set(PUBLIC_WORLD_CAMERAS.map(c=>c.country))].sort();
 const regions=[...new Set(PUBLIC_WORLD_CAMERAS.map(c=>c.region))];
 return {indexed:PUBLIC_WORLD_CAMERAS.length,countries,regions,embedded:PUBLIC_WORLD_CAMERAS.filter(c=>c.embedId).length,
  liveVerified:0,providerCatalogs:WORLD_CAMERAS_CATALOGS.length,
  source:"Câmeras do Mundo / Africam / SkylineWebcams / Webcamera24 — fontes públicas externas"};
}
