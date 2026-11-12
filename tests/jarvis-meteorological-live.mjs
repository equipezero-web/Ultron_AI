import assert from "node:assert/strict";
import {radarTileGrid,radarTileBounds,radarTileUrl,radarMapboxTemplate,
 normalizeRadarManifest,loadRadarManifest,SATELLITE_PRODUCT} from "../modules/jarvis-meteorological-live.js";
const now=1794500500000;
const raw={version:"2.0",host:"https://tilecache.rainviewer.com",
 radar:{past:[
 {time:1794496800,path:"/v2/radar/abc01234"},
 {time:1794497400,path:"/v2/radar/abc12345"},
 {time:1794498000,path:"/v2/radar/abc23456"},
 {time:1794498600,path:"/v2/radar/abc34567"},
 {time:1794499200,path:"/v2/radar/abc45678"},
 {time:1794499800,path:"/v2/radar/abc56789"},
 {time:1794500400,path:"/v2/radar/abc67890"}
 ]}};
const manifest=normalizeRadarManifest(raw,{now});
assert.equal(manifest.ok,true);assert.equal(manifest.frames.length,6);
assert.equal(manifest.latestTime,1794500400);assert.equal(manifest.stale,false);
const brazil=radarTileGrid("brazil"),pe=radarTileGrid("pernambuco");
assert.ok(brazil.length>=8&&brazil.length<=18);
assert.ok(pe.length>=2&&pe.length<=8);
for(const tile of [...brazil,...pe]){
 assert.ok(tile.north>tile.south&&tile.east>tile.west);
 assert.deepEqual(radarTileBounds(tile.z,tile.x,tile.y),
 {west:tile.west,east:tile.east,north:tile.north,south:tile.south});
 assert.match(radarTileUrl(manifest,manifest.frames[0],tile),/\/256\/[46]\/\d+\/\d+\/2\/1_1\.png$/);
}
assert.match(radarMapboxTemplate(manifest,manifest.frames.at(-1)),/\/\{z\}\/\{x\}\/\{y\}\/2\/1_1\.png$/);
assert.equal(normalizeRadarManifest({...raw,host:"https://evil.example"}, {now}),null);
assert.equal(normalizeRadarManifest({...raw,radar:{past:[]}}, {now}),null);
assert.equal(radarTileUrl(manifest,manifest.frames[0],{z:9,x:0,y:0}),null);
assert.equal(radarTileUrl(manifest,{time:1,path:"/v2/radar/x"},brazil[0]),null);
assert.equal(normalizeRadarManifest(raw,{now:now+10*3600e3}).stale,true);
const live=await loadRadarManifest({fetchImpl:async()=>({ok:true,json:async()=>raw}),now:()=>now});
assert.equal(live.ok,true);
const offline=await loadRadarManifest({fetchImpl:async()=>{throw Error("offline")}});
assert.equal(offline.ok,false);
assert.match(SATELLITE_PRODUCT.image,/cdn\.star\.nesdis\.noaa\.gov\/GOES19/);
console.log("LIVE RADAR PASS: bounded historical frames, safe tile origin, both regions, clock freshness, NOAA source, offline honesty");
