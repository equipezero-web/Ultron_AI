import assert from "node:assert/strict";
import {PUBLIC_WORLD_CAMERAS,validatePublicCamera,publicCameraEmbed,
 findPublicCameras,parseWorldCameraCommand,cameraDirectorySummary,
 WORLD_CAMERAS_SKYLINE_URL,WORLD_CAMERAS_ALTERNATIVE_ID,getWorldCameraAlternative,
 getWesternWallPlayableAlternative,WESTERN_WALL_EARTHCAM_ID,WESTERN_WALL_EARTHCAM_YOUTUBE_URL,
 WESTERN_WALL_OFFICIAL_CAMERAS_URL,
 WORLD_CAMERAS_CATALOGS,CAMERA_PROVIDER_NAMES,cameraProvider}
 from "../modules/jarvis-public-world-cameras-model.js";
assert.ok(PUBLIC_WORLD_CAMERAS.length>=10);
assert.equal(PUBLIC_WORLD_CAMERAS.every(validatePublicCamera),true);
assert.equal(new Set(PUBLIC_WORLD_CAMERAS.map(c=>c.id)).size,PUBLIC_WORLD_CAMERAS.length);
const summary=cameraDirectorySummary();
assert.equal(summary.indexed,PUBLIC_WORLD_CAMERAS.length);
assert.equal(WORLD_CAMERAS_CATALOGS.length,2,"Both worldwide directories are available");
assert.equal(summary.providerCatalogs,2);
assert.ok(WORLD_CAMERAS_CATALOGS.some(p=>p.id==="skyline"&&
 p.all==="https://www.skylinewebcams.com/en/webcam.html"));
assert.ok(WORLD_CAMERAS_CATALOGS.some(p=>p.id==="webcamera24"&&
 p.all==="https://webcamera24.com/pt/all-webcams/"&&
 p.countries==="https://webcamera24.com/pt/countries/"&&
 p.categories==="https://webcamera24.com/pt/categories/"));
assert.equal(CAMERA_PROVIDER_NAMES.webcamera24,"Webcamera24");
const w24=PUBLIC_WORLD_CAMERAS.filter(c=>cameraProvider(c)==="webcamera24");
assert.ok(w24.length>=7);
assert.ok(w24.every(c=>c.publisher==="Webcamera24"));
assert.equal(findPublicCameras({provider:"webcamera24"}).length,w24.length);
assert.ok(findPublicCameras({provider:"skyline"}).length>=3);
assert.ok(findPublicCameras({search:"Osaka",provider:"webcamera24"}).length>=1);
assert.ok(findPublicCameras({search:"Quênia",provider:"webcamera24"}).length>=1);
assert.equal(findPublicCameras({search:"Quênia",provider:"skyline"}).length,0);
const playable=w24.filter(c=>c.embedId);
assert.ok(playable.length>=4);
for(const cam of playable){
 const url=publicCameraEmbed(cam);
 assert.match(url,/^https:\/\/www\.youtube-nocookie\.com\/embed\/[a-zA-Z0-9_-]{11}\?/);
 assert.ok(url.includes("mute=1"),"Every Webcamera24 player starts muted");
 assert.ok(url.includes("enablejsapi=1"),"Manual YouTube sound control is available");
 assert.ok(url.includes("playsinline=1"));
}
assert.equal(w24.filter(c=>!c.embedId).every(c=>publicCameraEmbed(c)===null),true);
assert.equal(PUBLIC_WORLD_CAMERAS.filter(c=>cameraProvider(c)==="skyline")
 .every(c=>publicCameraEmbed(c)===null),true);
assert.equal(validatePublicCamera({...w24[0],sourceUrl:
 "https://webcamera24.com/pt/camera/usa/invented-stream/"}),false,
 "Provider host itself is NOT enough to allow arbitrary streams");
assert.equal(validatePublicCamera({...w24[0],sourceUrl:
 "http://webcamera24.com/pt/camera/usa/elboroom-bar-band-cam/"}),false);

assert.equal(summary.liveVerified,0,"A published catalog is never evidence of a live signal");
assert.ok(summary.countries.length>=9);
const skyline=getWorldCameraAlternative();
assert.ok(skyline,"A câmera alternativa oficial precisa constar no catálogo");
assert.equal(skyline.id,WORLD_CAMERAS_ALTERNATIVE_ID);
assert.equal(skyline.sourceUrl,WORLD_CAMERAS_SKYLINE_URL);
assert.equal(skyline.name,"Jerusalém — Muro Ocidental");
assert.equal(skyline.country,"Israel");
assert.equal(skyline.publisher,"SkylineWebcams");
assert.equal(skyline.embedId,null,"Live video belongs to webcam host; do not embed");
const earthcam=getWesternWallPlayableAlternative(skyline);
assert.ok(earthcam,"The exact Western Wall location should have an alternative view");
assert.equal(earthcam.id,WESTERN_WALL_EARTHCAM_ID);
assert.equal(earthcam.country,skyline.country);
assert.equal(earthcam.city,skyline.city);
assert.equal(earthcam.publisher,"EarthCam");
assert.equal(earthcam.sourceUrl,WESTERN_WALL_EARTHCAM_YOUTUBE_URL);
assert.equal(earthcam.embedId,"77akujLn4k8");
assert.equal(validatePublicCamera(earthcam),true);
assert.equal(publicCameraEmbed(earthcam),
 "https://www.youtube-nocookie.com/embed/77akujLn4k8?autoplay=1&mute=1&playsinline=1&rel=0");
assert.match(WESTERN_WALL_OFFICIAL_CAMERAS_URL,/^https:\/\/thekotel\.org\//);
assert.equal(getWesternWallPlayableAlternative(earthcam),null,
 "Different providers must not be treated as identical feeds");
assert.equal(getWesternWallPlayableAlternative({id:"skyline-shanghai"}),null);
assert.equal(validatePublicCamera({...earthcam,sourceUrl:"https://www.youtube.com/watch?v=AAAAAAAAAAA"}),false);
assert.equal(validatePublicCamera({...earthcam,embedId:"AAAAAAAAAAA"}),false);
assert.equal(validatePublicCamera({...earthcam,publisher:"SkylineWebcams"}),false);
assert.equal(validatePublicCamera({...earthcam,id:"untrusted-youtube"}),false);

assert.equal(publicCameraEmbed(skyline),null,"Skyline live video must remain link-only");
assert.equal(validatePublicCamera(skyline),true);
assert.equal(findPublicCameras({search:"jerusalem"}).length,1);
assert.equal(findPublicCameras({search:"Muro Ocidental"}).length,1);
assert.equal(findPublicCameras({country:"Israel"}).length,1);
assert.deepEqual(parseWorldCameraCommand("Jarvis, mostre a câmera de Jerusalém"),
 {type:"search",term:"jerusalem"});
assert.equal(validatePublicCamera({...skyline,sourceUrl:
 "https://www.skylinewebcams.com/en/webcam/israel/jerusalem-district/jerusalem/unrelated.html"}),false,
 "Skyline must be exact page allowlisted, not a general external embed host");
assert.equal(validatePublicCamera({...skyline,sourceUrl:
 "https://www.skylinewebcams.com/en/webcam/israel/jerusalem-district/jerusalem/western-wall.html?redirect=http://127.0.0.1"}),false);
assert.equal(validatePublicCamera({...skyline,embedId:"ojTrjv9QxM8"}),false,
 "Never fabricate a YouTube embed for source-link-only page");
assert.equal(validatePublicCamera({...skyline,id:"arbitrary-other-city"}),false);
assert.equal(findPublicCameras({search:"Recife"}).length,1);
assert.equal(findPublicCameras({search:"tóquio"}).length,1);
assert.ok(findPublicCameras({country:"Japão"}).every(c=>c.country==="Japão"));
assert.ok(findPublicCameras({region:"Europa"}).every(c=>c.region==="Europa"));
assert.ok(findPublicCameras({category:"aeroportos"}).every(c=>c.category==="aeroportos"));
assert.equal(findPublicCameras({search:"câmera fictícia não existe"}).length,0);
assert.equal(publicCameraEmbed(PUBLIC_WORLD_CAMERAS[0]),
 "https://www.youtube-nocookie.com/embed/ojTrjv9QxM8?autoplay=1&mute=1&playsinline=1&rel=0");
assert.equal(publicCameraEmbed(PUBLIC_WORLD_CAMERAS.find(c=>!c.embedId)),null);
assert.equal(validatePublicCamera({...PUBLIC_WORLD_CAMERAS[0],sourceUrl:"http://192.168.0.1/live"}),false);
assert.equal(validatePublicCamera({...PUBLIC_WORLD_CAMERAS[0],embedId:"../../../private"}),false);
assert.deepEqual(parseWorldCameraCommand("Jarvis, câmeras do mundo"),{type:"open"});
assert.deepEqual(parseWorldCameraCommand("Jarvis, ativar câmeras do mundo"),{type:"open"});
assert.deepEqual(parseWorldCameraCommand("monitoramento visual mundial"),{type:"open"});
assert.deepEqual(parseWorldCameraCommand("Jarvis, mostre a câmera de Recife"),{type:"search",term:"recife"});
assert.deepEqual(parseWorldCameraCommand("buscar webcams em Tóquio"),{type:"search",term:"toquio"});
assert.deepEqual(parseWorldCameraCommand("fechar câmeras mundiais"),{type:"close"});
assert.deepEqual(parseWorldCameraCommand("status das câmeras mundiais"),{type:"status"});
for(const cmd of ["abrir câmera","abrir câmera do celular","mostre a câmera do computador","abra a câmera do meu quarto","ligar câmera do celular","acessar câmeras privadas",
 "localize câmera de apartamento","ativar câmera escondida",
 "acessar rtsp://127.0.0.1/live","espionar pessoas",
 "mostrar senha das câmeras","abrir o globo","cancelar plano"]){
 assert.equal(parseWorldCameraCommand(cmd),null,cmd);
}
console.log("JARVIS PUBLIC WORLD CAMERAS MODEL PASS: curated real links, strict whitelist, source guard, no fake live status.");
