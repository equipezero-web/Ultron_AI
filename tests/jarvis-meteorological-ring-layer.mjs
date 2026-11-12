import assert from "node:assert/strict";
import {putRadarOnGlobe,clearRadarGlobe} from "../modules/jarvis-meteorological-ring-layer.js";
const frame={time:1794500400,path:"/v2/radar/abc67890"};
const manifest={ok:true,host:"https://tilecache.rainviewer.com",frames:[frame]};
const calls=[],sources=new Map(),layers=new Map();
const map={isStyleLoaded:()=>true,
  getSource:k=>sources.get(k),getLayer:k=>layers.get(k),
  addSource(k,v){assert.equal(v.maxzoom,7);sources.set(k,v);calls.push("addSource")},
  addLayer(v){layers.set(v.id,v);calls.push("addLayer")},
  removeLayer(k){layers.delete(k);calls.push("removeLayer")},
  removeSource(k){sources.delete(k);calls.push("removeSource")}
};
const earth={referenceMap:map};
const r=putRadarOnGlobe(earth,manifest,frame);
assert.equal(r.ok,true);assert.match(r.source,/tilecache\.rainviewer\.com/);
assert.equal(sources.size,1);assert.equal(layers.size,1);
assert.equal(putRadarOnGlobe(earth,manifest,frame).ok,true);
assert.deepEqual(calls.slice(-4),["removeLayer","removeSource","addSource","addLayer"]);
clearRadarGlobe(earth);assert.equal(sources.size,0);assert.equal(layers.size,0);
assert.equal(putRadarOnGlobe({},manifest,frame).ok,false);
assert.equal(putRadarOnGlobe(earth,manifest,{path:"/forged",time:1}).ok,false);
console.log("RADAR GLOBE PASS: genuine raster tile on existing Mapbox globe, source cleanup, no fake map");
