import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {classifyJarvisTurn} from "../backend/jarvis-conversation-router.js";
import {parseMissionControl} from "../modules/jarvis-mission-safety.js";
const f=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
const priority=f("modules/neural-priority-core-v4300.js");
const orchestrator=f("modules/ultron-orchestrator-v4270.js");
const p0=priority.slice(priority.indexOf("const P0 ="),priority.indexOf("const P1 ="));
assert.match(p0,/\(\?:jarvis\|ultron\)/,"P0 must understand the current JARVIS name");
assert.match(p0,/const RESUME/);
assert.doesNotMatch(p0,/\|continuar\|continue\|/,"Generic continue must never silently unfreeze P0");
assert.match(p0,/retomar\|retome/,"Explicit P0 resume must remain available");
for(const phrase of ["Jarvis, pare!","Jarvis, parar","Ultron, stop","parar"]){
 assert.equal(parseMissionControl(phrase)?.type,"stop",phrase);
 assert.equal(classifyJarvisTurn(phrase).isSocial,false,phrase);
}
assert.equal(parseMissionControl("Jarvis, retomar"),null,"Mission control should not replace P0's supervised resume gate");
const greet=orchestrator.slice(orchestrator.indexOf("if(classifyJarvisTurn(message).isSocial)"),orchestrator.indexOf("// Critical local UI commands"));
assert.match(greet,/ULTRON_PRIORITY\?\.state\?\.frozen/);
assert.match(greet,/route:"p0-stop"/);
assert.match(greet,/webResearch:\{requested:false/);
assert.match(f("modules/jarvis-audio-maintenance.js"),/enabled:false,mode:"text-only"/);
console.log("P0 REGRESSION PASS: JARVIS stop, no greeting bypass when frozen, audio OFF");
