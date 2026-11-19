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

const mixed=planAgents("Jarvis, não mostre notícias; mostre a previsão meteorológica no mapa");
assert.ok(mixed.steps.some(s=>s.agent==="meteorology"));
assert.ok(mixed.steps.some(s=>s.agent==="visual"));
assert.ok(!mixed.steps.some(s=>s.agent==="news"),"negative news request must not become an agent step");
const contrary=planAgents("Quero notícias, mas não quero o mapa");
assert.deepEqual(contrary.steps.map(s=>s.agent),["news"],"negative map clause must not render");
const fullyNegative=planAgents("Não mostre notícias e nem o mapa");
assert.equal(fullyNegative.steps.length,0,"fully negative request must not trigger web-search fallback");
assert.equal(fullyNegative.reason,"NO_AFFIRMATIVE_ACTION");
assert.ok(planAgents("Mostre meteorologia e visualize no mapa").steps.some(s=>s.agent==="meteorology"));
assert.ok(planAgents("Mostre meteorologia e visualize no mapa").steps.some(s=>s.agent==="visual"));

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

// An explanatory plan with a visual step MUST finish its verified data read
// before invoking the render agent, even if concurrency is enabled.
const order=[];
let finishWeather;
const delayed=executeAgents(plan,{agents:{
  meteorology:async()=>{order.push("weather:start");return new Promise(resolve=>{finishWeather=resolve;});},
  visual:async()=>{order.push("visual:start");return {ok:true,result:{view:"globe"}};}
},concurrency:3});
assert.deepEqual(order,["weather:start"],"render must not race the source query");
finishWeather({ok:true,result:{verified:true}});
const ordered=await delayed;
assert.deepEqual(order,["weather:start","visual:start"]);
assert.equal(ordered.ok,true);

let renderAttempted=false;
const sourceFailed=await executeAgents(plan,{agents:{
  meteorology:async()=>({ok:false}),
  visual:async()=>{renderAttempted=true;return {ok:true};}
}});
assert.equal(sourceFailed.ok,false);
assert.equal(sourceFailed.steps[1].status,"blocked","failed source must not produce a visual");
assert.equal(sourceFailed.steps[1].reason,"PREREQUISITE_NOT_COMPLETED");
assert.equal(renderAttempted,false);

let unregisteredRender=false;
const sourceMissing=await executeAgents(plan,{agents:{
  visual:async()=>{unregisteredRender=true;return {ok:true};}
}});
assert.equal(sourceMissing.steps[0].status,"unavailable");
assert.equal(sourceMissing.steps[1].status,"blocked");
assert.equal(unregisteredRender,false);

const badOrder=await executeAgents({...plan,steps:[plan.steps[1],plan.steps[0]]},{
  agents:{meteorology:async()=>({ok:true}),visual:async()=>({ok:true})}
});
assert.equal(badOrder.error,"PLAN_INVALID_ORDER");

const concurrent=planAgents("Analise a previsão do tempo e as notícias recentes");
let started=0;
let releaseReads;
const readGate=new Promise(resolve=>{releaseReads=resolve;});
const readExecution=executeAgents(concurrent,{concurrency:3,agents:{
  meteorology:async()=>{started++;await readGate;return {ok:true};},
  news:async()=>{started++;await readGate;return {ok:true};}
}});
assert.equal(started,2,"independent read-only agents can run concurrently");
releaseReads();
assert.equal((await readExecution).ok,true);

const cancelledBeforeRender=new AbortController();
let releaseCancelled;
const blocker=new Promise(resolve=>{releaseCancelled=resolve;});
let renderAfterCancel=false;
const interrupted=executeAgents(plan,{signal:cancelledBeforeRender.signal,agents:{
  meteorology:async()=>{await blocker;return {ok:true};},
  visual:async()=>{renderAfterCancel=true;return {ok:true};}
}});
cancelledBeforeRender.abort();
releaseCancelled();
const abortedResult=await interrupted;
assert.equal(abortedResult.cancelled,true);
assert.equal(abortedResult.ok,false);
assert.equal(abortedResult.steps[1].status,"cancelled");
assert.equal(renderAfterCancel,false);


assert.equal(sanitizeTrajectory({status:"invalid"}),null);
const audit=sanitizeTrajectory({runId:"a",stepId:"b",agent:"research",status:"completed",
 durationMs:20,secret:"SHOULD_NOT_LEAK",prompt:"PRIVATE"});
assert.equal(audit.secret,undefined);
assert.equal(audit.prompt,undefined);
assert.equal(audit.durationMs,20);

// HTTP endpoints must remain read-only and operator-scoped.
const {readFileSync}=await import("node:fs");
const worker=readFileSync(new URL("../backend/worker.js",import.meta.url),"utf8");
for (const route of ["/api/hubs/plan","/api/hubs/skills","/api/hubs/trajectories"]) {
  const offset=worker.indexOf('if (path === "'+route+'" && request.method === "POST")');
  assert.ok(offset>0,route+" should be a POST endpoint");
  const scope=worker.slice(offset,offset+330);
  assert.match(scope,/const operatorId = await operatorFrom\(body\)/);
  assert.match(scope,/if \(!operatorId\) return missingOperator\(\)/);
}
assert.doesNotMatch(worker,/\/api\/hubs\/activate|\/api\/hubs\/execute/);
const orchestration=readFileSync(new URL("../backend/orchestration-engine.js",import.meta.url),"utf8");
assert.match(orchestration,/INSERT INTO orchestration_steps[\s\S]*?FROM orchestration_runs AS r/);
assert.match(orchestration,/r\.id = \? AND r\.operator_id = \? AND r\.status = 'running'/);
assert.match(orchestration,/if \(!Number\(writes\?\.\[0\]\?\.meta\?\.changes\)\)/);


console.log("JARVIS HUBS PASS: declarative skills, allowlisted agents, cancellation, minimal trajectory");
