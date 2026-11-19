import {validateJarvisAcceptanceManifest,validateJarvisProof} from "../modules/jarvis-acceptance-validation.js";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const manifest=JSON.parse(readFileSync(new URL("../data/jarvis-100-acceptance-manifest.json",import.meta.url),"utf8"));
const counts={"Comunicação":7,"Dispositivos":8,"Inteligência":20,"Funcionalidades":17,"Integridade":8};
assert.equal(manifest.capabilities.length,60,"all 60 user-defined capabilities must be present");
assert.deepEqual(manifest.phases.map(p=>p.area),
  ["Inteligência","Funcionalidades","Comunicação","Integridade","Dispositivos","Inteligência"],
  "respect the operator's six-stage priority sequence");
const ids=new Set();
for(const c of manifest.capabilities){
  assert.match(c.id,/^[A-Z]+-\d{2}$/);
  assert.ok(!ids.has(c.id),"no duplicate capability IDs");
  ids.add(c.id);
  assert.ok(Object.hasOwn(counts,c.area),"unknown area");
  assert.ok(c.name.length>3&&c.acceptanceRequirement.length>15&&c.codeReference.length>5);
  assert.ok(Number.isInteger(c.baselinePercent)&&c.baselinePercent>=0&&c.baselinePercent<=100);
  assert.ok(Array.isArray(c.stages)&&c.stages.length>0);
  for(const key of ["code","ci","production","physical"])
    assert.ok(Object.hasOwn(c.checks,key),"missing proof dimension: "+c.id+"/"+key);
  if(c.acceptance==="accepted"){
    for(const key of ["code","ci","production","physical"])
      assert.equal(validateJarvisProof(c.checks[key],key),true,
        "accepted capability must have fresh attested proof: "+c.id+"/"+key);
  }else assert.equal(c.acceptance,"pending",c.id+": unknown acceptance state");
}
for(const [area,num] of Object.entries(counts))
  assert.equal(manifest.capabilities.filter(c=>c.area===area).length,num,area+" inventory regression");
const evaluation=validateJarvisAcceptanceManifest(manifest);
assert.equal(evaluation.ok,true,"inventory must support future accepted capabilities with proofs");
assert.equal(evaluation.accepted,manifest.capabilities.filter(c=>c.acceptance==="accepted").length);
// Maintenance is explicit: audio must remain globally disabled.
const audio=readFileSync(new URL("../modules/jarvis-audio-maintenance.js",import.meta.url),"utf8");
assert.match(audio,/enabled:false,mode:"text-only"/);
assert.match(audio,/speechSynthesis\?\.cancel/);
const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
assert.match(html,/modules\/jarvis-audio-maintenance\.js\?v=/);
console.log("JARVIS 100 ACCEPTANCE PASS: all 60 capabilities, dynamic proof-gated acceptance, six stages, voice remains OFF");
