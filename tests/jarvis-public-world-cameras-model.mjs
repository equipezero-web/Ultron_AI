import assert from "node:assert/strict";
import {PUBLIC_WORLD_CAMERAS,validatePublicCamera,publicCameraEmbed,
 findPublicCameras,parseWorldCameraCommand,cameraDirectorySummary} from "../modules/jarvis-public-world-cameras-model.js";
assert.ok(PUBLIC_WORLD_CAMERAS.length>=10);
assert.equal(PUBLIC_WORLD_CAMERAS.every(validatePublicCamera),true);
assert.equal(new Set(PUBLIC_WORLD_CAMERAS.map(c=>c.id)).size,PUBLIC_WORLD_CAMERAS.length);
const summary=cameraDirectorySummary();
assert.equal(summary.indexed,PUBLIC_WORLD_CAMERAS.length);
assert.equal(summary.liveVerified,0,"A published catalog is never evidence of a live signal");
assert.ok(summary.countries.length>=9);
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
assert.deepEqual(parseWorldCameraCommand("monitoramento visual mundial"),{type:"open"});
assert.deepEqual(parseWorldCameraCommand("Jarvis, mostre a câmera de Recife"),{type:"search",term:"recife"});
assert.deepEqual(parseWorldCameraCommand("buscar webcams em Tóquio"),{type:"search",term:"toquio"});
assert.deepEqual(parseWorldCameraCommand("fechar câmeras mundiais"),{type:"close"});
assert.deepEqual(parseWorldCameraCommand("status das câmeras mundiais"),{type:"status"});
for(const cmd of ["abrir câmera","ligar câmera do celular","acessar câmeras privadas",
 "localize câmera de apartamento","ativar câmera escondida",
 "acessar rtsp://127.0.0.1/live","espionar pessoas",
 "mostrar senha das câmeras","abrir o globo","cancelar plano"]){
 assert.equal(parseWorldCameraCommand(cmd),null,cmd);
}
console.log("JARVIS PUBLIC WORLD CAMERAS MODEL PASS: curated real links, strict whitelist, source guard, no fake live status.");
