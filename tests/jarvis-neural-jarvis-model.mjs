import assert from "node:assert/strict";
import {NEURAL_JARVIS_ARCHITECTURE,NEURAL_JARVIS_FILES,
 neuralJarvisGeometryCount,clampBands,computeNeuralJarvisVisual,
 validateNeuralJarvisArchive} from "../modules/jarvis-neural-jarvis-model.js";
assert.equal(NEURAL_JARVIS_ARCHITECTURE.name,"Neural Jarvis");
assert.deepEqual(NEURAL_JARVIS_ARCHITECTURE.plates,[18,22,24]);
assert.deepEqual(neuralJarvisGeometryCount(),{
 plates:64,layers:3,arcs:5,nodes:180,particles:1400});
assert.equal(NEURAL_JARVIS_FILES.length,4);
assert.equal(validateNeuralJarvisArchive(),true);
assert.equal(validateNeuralJarvisArchive([{code:"MALICIOUS",title:"x",detail:"x"}]),false);
assert.deepEqual(clampBands({bass:-.1,mid:.55,high:999}),{
 bass:0,mid:.55,high:1});
assert.deepEqual(clampBands({bass:NaN,mid:undefined,high:Infinity}),{
 bass:0,mid:0,high:0});
const idle=computeNeuralJarvisVisual({time:2,bands:{},overdrive:false});
assert.equal(idle.audioReactive,false);
assert.equal(idle.speed,1);
const moving=computeNeuralJarvisVisual({time:2,bands:{bass:.6,mid:.4,high:.5},
 overdrive:true,expanded:true});
assert.equal(moving.expansion,1);
assert.equal(moving.audioReactive,true);
assert.ok(moving.speed>idle.speed);
assert.equal(computeNeuralJarvisVisual({reducedMotion:true,overdrive:true}).speed,0);
assert.ok(NEURAL_JARVIS_FILES.every(x=>!/(84\.6|TFLOPS|100%|conexões: 100)/i.test(x.technical+" "+x.detail)));
console.log("NEURAL JARVIS MODEL PASS: faithful 64-plate/5-gyro/180-node/1400-particle source and honest audio/telemetry.");
