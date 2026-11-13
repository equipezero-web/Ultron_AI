import assert from "node:assert/strict";
import {classifyJarvisNetwork,classifyJarvisDevice,deriveJarvisProfile,
 jarvisRenderDimensions,jarvisNetworkMessage} from "../modules/jarvis-universal-adaptive-model.js";
const wifi=classifyJarvisNetwork({online:true});
assert.deepEqual([wifi.tier,wifi.effectiveType,wifi.status],
 ["standard","unknown","browser-online"]);
const fast=classifyJarvisNetwork({effectiveType:"4g",downlink:30,rtt:35});
assert.equal(fast.tier,"standard");
// 4g is the browser effectiveType hint, never identification of Wi-Fi or 5G.
assert.equal(fast.effectiveType,"4g");
for(const effectiveType of ["slow-2g","2g","3g"]){
 const slow=classifyJarvisNetwork({effectiveType});
 assert.equal(slow.tier,"limited");
 assert.equal(slow.slow,true);
}
assert.equal(classifyJarvisNetwork({effectiveType:"4g",downlink:.4}).tier,"limited");
assert.equal(classifyJarvisNetwork({effectiveType:"4g",rtt:800}).tier,"limited");
assert.equal(classifyJarvisNetwork({effectiveType:"5g",saveData:true}).tier,"limited");
assert.equal(classifyJarvisNetwork({online:false,effectiveType:"4g"}).tier,"offline");
assert.match(jarvisNetworkMessage(classifyJarvisNetwork({online:false})),/TERMINAL LOCAL/);
assert.match(jarvisNetworkMessage(wifi),/BACKEND NÃO VERIFICADO/);
const tiny=classifyJarvisDevice({width:280,height:620,coarsePointer:true,
 deviceMemory:1,hardwareConcurrency:2});
assert.equal(tiny.layout,"phone");
assert.equal(tiny.lowPower,true);
const foldable=classifyJarvisDevice({width:840,height:910,coarsePointer:true,
 deviceMemory:8,hardwareConcurrency:8});
assert.equal(foldable.layout,"tablet");
const landscape=classifyJarvisDevice({width:844,height:390,coarsePointer:true});
assert.equal(landscape.layout,"phone");
assert.equal(landscape.landscape,true);
const iphone=classifyJarvisDevice({width:390,height:844,coarsePointer:true,
 deviceMemory:null,hardwareConcurrency:null});
assert.equal(iphone.layout,"phone");
assert.equal(iphone.lowPower,false,"Unknown device memory must not be mislabelled low");
const notebook=classifyJarvisDevice({width:1366,height:768,coarsePointer:false});
assert.equal(notebook.layout,"desktop");
const tv=classifyJarvisDevice({width:3840,height:2160,coarsePointer:false});
assert.equal(tv.layout,"tv");
const economy=deriveJarvisProfile(tiny,fast);
assert.equal(economy.tier,"economy");
assert.equal(economy.fps,15);
assert.equal(economy.particleStride,4);
const medium=deriveJarvisProfile(iphone,wifi);
assert.equal(medium.tier,"balanced");
assert.equal(medium.fps,24);
const high=deriveJarvisProfile(tv,fast);
assert.equal(high.tier,"high");
assert.equal(high.fps,30);
assert.equal(deriveJarvisProfile(iphone,{tier:"limited",status:"browser-online"}).tier,"economy");
assert.equal(deriveJarvisProfile(tv,{tier:"offline",status:"offline"}).tier,"economy");
for(const profile of [economy,medium,high]){
 const d=jarvisRenderDimensions(1100,2200,4,profile);
 assert.ok(d.width>0&&d.height>0);
 assert.ok(d.width*d.height<=profile.maxCanvasPixels*1.001,
  "Render pixel limit exceeded for "+profile.tier+": "+JSON.stringify(d));
 assert.ok(d.pixelRatio<=profile.dprCap);
 assert.equal(profile.allowAutoplayMedia,false);
 assert.equal(profile.allowUnrequestedTransfers,false);
}
const small=jarvisRenderDimensions(0,0,0,medium);
assert.ok(small.width>=1&&small.height>=1);
const reduced=deriveJarvisProfile({...iphone,reducedMotion:true},wifi);
assert.equal(reduced.visualEffects,false);
assert.equal(reduced.reducedMotion,true);
console.log("UNIVERSAL DEVICE & NETWORK MODEL PASS: 2G/3G/4G hints, unknown 5G/Wi-Fi, offline, Save-Data, touch, foldables, GPU budgets.");
