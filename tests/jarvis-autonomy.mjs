import assert from "node:assert/strict";
import {validatePlan,isActionRequest,parsePlanText} from "../backend/action-catalog.js";
import {directPlan,runActionPlan} from "../modules/jarvis-action-engine.js";
assert.equal(validatePlan({steps:[{action:"shell.exec",args:{command:"x"}}]}),null);
assert.equal(validatePlan({steps:[{action:"text.set",args:{enabled:"true"}}]}),null);
assert.equal(validatePlan({steps:Array(7).fill({action:"earth.open"})}),null);
assert.equal(isActionRequest("Como abrir o globo?"),false);
assert.equal(isActionRequest("Não desligue o computador"),false);
assert.equal(isActionRequest("JARVIS, quero que você abra o globo"),true);
assert.equal(directPlan("JARVIS, feche a resposta").steps[0].action,"answer.close");
assert.equal(directPlan("Qual a capital da França?"),null);
assert.equal(directPlan("Localize Recife no globo").steps[0].args.place,"recife");
assert.ok(parsePlanText('{"steps":[{"action":"earth.open","args":{}}]}'));
let calls=[];
globalThis.window={
 ULTRON_NEURAL_ANSWER:{textEnabled:true,visible:true,setTextEnabled(v){this.textEnabled=v;calls.push("text")},clear(){this.visible=false;calls.push("close")}},
 ULTRON_EARTH:{state:{visible:false},async open(){this.state.visible=true;calls.push("earth");return {ok:true}},close(){this.state.visible=false}},
 JARVIS_COMMAND_CENTER:{setVisualMode(v){calls.push(v)}},
 ULTRON_VOICE_OUTPUT:{speak(){}}
};
const run=await runActionPlan({steps:[{action:"text.set",args:{enabled:false}},{action:"earth.open"},{action:"earth.close"},{action:"answer.close"}]},"teste");
assert.equal(run.ok,true);
assert.deepEqual(calls,["text","earth","ring","close"]);
assert.equal(window.ULTRON_NEURAL_ANSWER.textEnabled,false);
assert.equal(window.ULTRON_EARTH.state.visible,false);
assert.equal(window.ULTRON_NEURAL_ANSWER.visible,false);
calls=[];
window.ULTRON_EARTH.open=async()=>({ok:false,error:"offline"});
const fail=await runActionPlan({steps:[{action:"earth.open"},{action:"text.set",args:{enabled:true}}]},"teste");
assert.equal(fail.ok,false);assert.equal(fail.steps.length,1);assert.deepEqual(calls,[]);
console.log("AUTONOMY PASS: validated allowlist, ordered actions, verification and stop-on-failure");
