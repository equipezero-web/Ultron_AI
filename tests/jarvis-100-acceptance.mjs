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
    // Never allow '100%' just because code compiled: every acceptance proof
    // must carry a verifiable URL and a timestamp from a reviewer.
    for(const [name,proof] of Object.entries(c.checks)){
      assert.equal(typeof proof,"object",c.id+": "+name+" proof required");
      assert.ok(/^https:\/\//.test(proof?.url||""),c.id+": "+name+" source URL missing");
      assert.ok(!Number.isNaN(Date.parse(proof?.verifiedAt)),c.id+": "+name+" review time missing");
    }
  }else{
    assert.equal(c.acceptance,"pending",c.id+": unexpected undocumented acceptance state");
  }
}
for(const [area,num] of Object.entries(counts))
  assert.equal(manifest.capabilities.filter(c=>c.area===area).length,num,area+" inventory regression");
assert.equal(manifest.capabilities.filter(c=>c.acceptance==="accepted").length,0,
  "no physical deployment or end-to-end 100% is asserted without evidence");
// Maintenance is explicit: audio must remain globally disabled.
const audio=readFileSync(new URL("../modules/jarvis-audio-maintenance.js",import.meta.url),"utf8");
assert.match(audio,/enabled:false,mode:"text-only"/);
assert.match(audio,/speechSynthesis\?\.cancel/);
const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
assert.match(html,/modules\/jarvis-audio-maintenance\.js\?v=/);
console.log("JARVIS 100 ACCEPTANCE PASS: all 60 capabilities, six ordered stages, evidence-gated 100%, voice remains OFF");
