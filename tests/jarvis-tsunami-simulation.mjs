import assert from "node:assert/strict";
import {japanTsunamiIntent,JAPAN_TSUNAMI_DEMO,TSUNAMI_DEMO_ID} from "../modules/jarvis-tsunami-simulation.js";
import {validateGeoScenario,geoFrame} from "../modules/jarvis-geospatial-model.js";
import {directPlan} from "../modules/jarvis-action-engine.js";
import {validatePlan} from "../backend/action-catalog.js";

for(const command of [
  "Jarvis, simule um tsunami no Japão",
  "Simular tsunami no Japan",
  "Crie uma simulação de tsunami no Japão",
  "Mostre tsunami no Japão em 3D"
]){
  const plan=directPlan(command);
  assert.deepEqual(plan?.steps?.[0],{action:"geo.show",args:{scenario:TSUNAMI_DEMO_ID,view:"3d"}},command);
  assert.ok(validatePlan(plan),command);
}
assert.deepEqual(directPlan("Jarvis, simule um tsunami no Japão no mapa 2D").steps,
  [{action:"geo.show",args:{scenario:TSUNAMI_DEMO_ID,view:"2d"}},{action:"geo.play",args:{}}]);
assert.equal(japanTsunamiIntent("Como simular um tsunami no Japão?"),null);
assert.equal(japanTsunamiIntent("Não simule um tsunami no Japão"),null);
assert.equal(japanTsunamiIntent("Simule tsunami na Califórnia"),null,"Other locations are not hardcoded as Japan");
assert.equal(directPlan("O que é um tsunami no Japão?"),null);
assert.equal(validatePlan({steps:[{action:"geo.show",args:{scenario:"tsunami-unknown",view:"3d"}}]}),null);
const demo=validateGeoScenario(JAPAN_TSUNAMI_DEMO);
assert.ok(demo,"Demo should be valid with provenance and no fabricated observations");
assert.equal(demo.projection,"world");
assert.equal(demo.frames.length,12);
assert.ok(demo.frames.every(f=>f.kind==="illustrative"&&f.points.length===17));
assert.match(demo.source.disclaimer,/NÃO É PREVISÃO/);
assert.ok(demo.frames.every(f=>!f.metrics));
assert.equal(geoFrame(demo,0).points[0].kind,"tsunamiOrigin");
assert.notDeepEqual(geoFrame(demo,0).points[1],geoFrame(demo,6).points[1],"Wavefront moves across frames");
const meanDistance=(frame)=>frame.points.slice(1).reduce((sum,p)=>
  sum+Math.hypot(p.lat-38.1,p.lng-143.4),0)/16;
assert.ok(meanDistance(demo.frames[8])>meanDistance(demo.frames[0])*5);
assert.ok(demo.frames.every(f=>f.points.every(p=>p.lat>=-90&&p.lat<=90&&p.lng>=-180&&p.lng<=180)));
console.log("TSUNAMI JAPAN DEMO PASS: direct voice routing, safe didactic animation, 2D/3D command, valid frames, no fake risk");
