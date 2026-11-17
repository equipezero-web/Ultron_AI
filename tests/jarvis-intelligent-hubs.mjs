import assert from "node:assert/strict";
import {validateSkill,selectSkill} from "../backend/skill-hub.js";
import {AGENTS,planAgents,executeAgents} from "../backend/intelligent-task-hub.js";
import {sanitizeTrajectory} from "../backend/trajectory-hub.js";

const skill={id:"weather_globe",version:1,description:"Read weather and render",steps:[
  {tool:"weather.read",label:"Read weather"},{tool:"visual.render",label:"Render globe"}
]};
assert.equal(validateSkill(skill).ok,true);
assert.equal(validateSkill({...skill,steps:[{tool:"shell.exec",label:"Unsafe"}]}).ok,false);
assert.equal(validateSkill({...skill,id:"../../secret"}).ok,false);
assert.equal(validateSkill({...skill,steps:[]}).ok,false);
assert.equal(selectSkill([{...skill,status:"draft"},{...skill,version:2,status:"active"}],"weather_globe").version,2);
assert.equal(selectSkill([{...skill,status:"draft"}],"weather_globe"),null);

const plan=planAgents("Jarvis, analise a previsão do tempo e mostre no globo");
assert.ok(plan.steps.some(s=>s.agent==="meteorology"));
assert.ok(plan.steps.some(s=>s.agent==="visual"));
assert.ok(plan.steps.length<=6);
assert.equal(planAgents("qual o resultado?").steps[0].agent,"research");
const execution=await executeAgents(plan,{agents:{
  meteorology:async({tool})=>({ok:tool==="weather.read",result:{verified:true}}),
  visual:async({tool})=>({ok:tool==="visual.render",result:{view:"globe"}})
}});
assert.equal(execution.ok,true);
assert.equal(execution.steps.length,2);
assert.equal((await executeAgents({...plan,steps:[{id:"unsafe",agent:"devices",tool:"shell.exec",level:1}]})).error,"PLAN_NOT_ALLOWED");
const aborted=new AbortController();aborted.abort();
assert.equal((await executeAgents(plan,{signal:aborted.signal})).cancelled,true);
assert.ok(AGENTS.research.tools.includes("research.search"));

assert.equal(sanitizeTrajectory({status:"invalid"}),null);
const audit=sanitizeTrajectory({runId:"a",stepId:"b",agent:"research",status:"completed",
 durationMs:20,secret:"SHOULD_NOT_LEAK",prompt:"PRIVATE"});
assert.equal(audit.secret,undefined);
assert.equal(audit.prompt,undefined);
assert.equal(audit.durationMs,20);
console.log("JARVIS HUBS PASS: declarative skills, allowlisted agents, cancellation, minimal trajectory");
