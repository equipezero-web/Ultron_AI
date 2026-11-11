import assert from 'node:assert/strict';
import {GEO_SCENARIOS,validateGeoScenario,geoFrame,brazilXY,geoJSONPaths} from '../modules/jarvis-geospatial-model.js';

const scenario=validateGeoScenario(GEO_SCENARIOS.enso);
assert.ok(scenario,'The published source-grounded ENSO example must remain valid');
assert.equal(scenario.frames.length,3);
assert.equal(scenario.frames[0].kind,'observed');
assert.equal(scenario.frames[1].kind,'forecast');
assert.equal(scenario.frames[2].kind,'illustrative');
assert.ok(scenario.source.url.startsWith('https://'));
assert.match(scenario.source.disclaimer,/não|nem/i);
const forecast=geoFrame(scenario,1);
assert.ok(forecast.points.some(point=>point.name.includes('Sul')));
assert.ok(geoFrame(scenario,1,'wet').points.every(point=>point.kind==='wet'));
assert.equal(geoFrame(scenario,0,'wet').points.length,0);
assert.equal(geoFrame(scenario,99).index,2);

const copy=()=>JSON.parse(JSON.stringify(GEO_SCENARIOS.enso));
for(const absent of [null,undefined,'',false]){
  const input=copy();
  if(absent===undefined)delete input.frames[0].points[0].lat;
  else input.frames[0].points[0].lat=absent;
  assert.equal(validateGeoScenario(input),null,'Missing latitude must never become 0');
}
for(const wrong of [null,undefined,'',true]){
  const input=copy();
  if(wrong===undefined)delete input.frames[0].points[0].lng;
  else input.frames[0].points[0].lng=wrong;
  assert.equal(validateGeoScenario(input),null,'Missing longitude must never become 0');
}
const dup=copy();dup.frames[1].points[1].id=dup.frames[1].points[0].id;
assert.equal(validateGeoScenario(dup),null,'Duplicate region identifiers are ambiguous');
const unsafe=copy();unsafe.source.url='javascript:alert(1)';
assert.equal(validateGeoScenario(unsafe),null,'Untrusted source URLs are rejected');

const point=brazilXY(-51.1,-28.1);
assert.ok(Number.isFinite(point.x)&&Number.isFinite(point.y));
assert.deepEqual(geoJSONPaths({type:'Feature',geometry:{type:'Polygon',coordinates:[[
 [-52,-29],[-51,-29],[-51,-28],[-52,-29]
]]}}).length,1);
assert.deepEqual(geoJSONPaths(null),[]);
console.log('JARVIS PHASE 3 GEO PASS: 2D/3D scenario data, filters, sourced qualitative framing, coordinate hygiene and map paths');
