import assert from "node:assert/strict";
import {createParallelTaskCenter,normalizeTaskSelection,validateSafeTask}
 from "../modules/jarvis-parallel-readonly-model.js";
import {safeTextFileName,canEditSelectedFile,safeEditableText,
 changedFromOriginal,fileEditorSummary,JARVIS_MAX_TEXT_FILE_BYTES}
 from "../modules/jarvis-scoped-files-model.js";

assert.deepEqual(normalizeTaskSelection(["world-cameras","world-cameras","unknown","device-status"]),
 ["world-cameras","device-status"]);
assert.equal(validateSafeTask("delete-all-files"),false);
assert.equal(validateSafeTask("phone.read-all"),false);
assert.equal(validateSafeTask("device-status"),true);
assert.equal(safeTextFileName("relatorio.txt"),true);
assert.equal(safeTextFileName("config.json"),true);
assert.equal(safeTextFileName("foto.jpg"),false);
assert.equal(safeTextFileName("../../secrets.txt"),false);
assert.equal(safeTextFileName(".env"),false);
assert.equal(safeTextFileName("run.sh"),false);
assert.equal(safeTextFileName("malware.exe"),false);
assert.equal(safeTextFileName("root\\x.txt"),false);
assert.equal(canEditSelectedFile({name:"r.md",size:JARVIS_MAX_TEXT_FILE_BYTES}),true);
assert.equal(canEditSelectedFile({name:"r.md",size:JARVIS_MAX_TEXT_FILE_BYTES+1}),false);
const buffer=new TextEncoder().encode("Olá, JARVIS!").buffer;
assert.equal(safeEditableText(buffer),"Olá, JARVIS!");
assert.equal(safeEditableText(new Uint8Array([0,1,2]).buffer),null);
assert.equal(safeEditableText(new Uint8Array([0xc3,0x28]).buffer),null);
assert.equal(changedFromOriginal("a","a"),false);
assert.equal(changedFromOriginal("a","b"),true);
assert.match(fileEditorSummary({fileName:"safe.txt",changed:true,writable:false}),/exportação de cópia/);

let started=0,finished=0,concurrency=0,peak=0;
const handlers=Object.fromEntries(["world-cameras","device-status",
 "meteorology-status","data-intelligence"].map(name=>[name,async({signal})=>{
 started++;concurrency++;peak=Math.max(peak,concurrency);
 await new Promise(r=>setTimeout(r,20));
 assert.equal(signal.aborted,false);
 concurrency--;finished++;
 return {ok:true,summary:name+" verificado",verified:false};
}]));
const engine=createParallelTaskCenter({handlers,maxConcurrent:3,now:()=>"2026-11-16T10:00:00Z"});
const states=[];
engine.subscribe(s=>states.push(s.running));
const first=await engine.start(["world-cameras","device-status",
 "meteorology-status","data-intelligence"]);
assert.equal(first.ok,true);
assert.equal(first.results.length,4);
assert.equal(started,4);
assert.equal(finished,4);
assert.equal(peak,3,"Only three tasks can execute concurrently");
assert.equal(engine.state.running,0);
assert.equal(engine.state.recent.length,4);
assert.ok(states.includes(3));
const denied=await engine.start(["arbitrary.shell"]);
assert.equal(denied.ok,false);
assert.match(denied.error,/Selecione tarefas seguras/);
const failed=createParallelTaskCenter({handlers:{
 "world-cameras":async()=>({ok:false,error:"Catálogo indisponível"})
}});
const bad=await failed.start(["world-cameras"]);
assert.equal(bad.ok,false);
assert.equal(bad.results[0].status,"failed");
const untilDone={};
untilDone.started=new Promise(resolve=>untilDone.tellStarted=resolve);
untilDone.finish=new Promise(resolve=>untilDone.finishNow=resolve);
const stoppable=createParallelTaskCenter({handlers:{
 "device-status":async()=>{untilDone.tellStarted();await untilDone.finish;return {ok:true};}
}});
const running=stoppable.start(["device-status"]);
await untilDone.started;
const overlap=await stoppable.start(["world-cameras"]);
assert.equal(overlap.ok,false);
assert.match(overlap.error,/Já existe um lote/,"Overlapping calls must not bypass the concurrency limit");
stoppable.stop();
untilDone.finishNow();
const stopResult=await running;
assert.equal(stopResult.cancelled,true);
assert.equal(stopResult.results[0].status,"cancelled");
// Starting a second batch must never bypass the GLOBAL three-task cap.
let releaseHeld;
const holding=new Promise(resolve=>{releaseHeld=resolve;});
let runningHeld=0,peakHeld=0;
const guardHandlers=Object.fromEntries([
 "world-cameras","device-status","meteorology-status","data-intelligence"
].map(name=>[name,async()=>{
 runningHeld++;peakHeld=Math.max(peakHeld,runningHeld);
 await holding;runningHeld--;
 return {ok:true,summary:name};
}]));
const guarded=createParallelTaskCenter({handlers:guardHandlers,maxConcurrent:3});
const firstBatch=guarded.start([
 "world-cameras","device-status","meteorology-status","data-intelligence"
]);
assert.equal(guarded.state.busy,true);
assert.equal(guarded.state.running,3);
const overlapGuard=await guarded.start(["world-cameras","meteorology-status"]);
assert.equal(overlapGuard.ok,false,"Overlapping start must be rejected globally");
assert.match(overlapGuard.error,/lote|Outra rodada/);
assert.equal(peakHeld,3);
guarded.stop();
const whileStopping=await guarded.start(["world-cameras"]);
assert.equal(whileStopping.ok,false,"STOP must fence a new batch until old handlers settle");
releaseHeld();
const cancelledBatch=await firstBatch;
assert.equal(cancelledBatch.cancelled,true);
assert.equal(guarded.state.busy,false);
const afterStop=await guarded.start(["world-cameras"]);
assert.equal(afterStop.ok,true,"New start works once the aborted batch has settled");
assert.equal(peakHeld,3,"No overlapping task wave exceeded global limit");

console.log("JARVIS SAFE MULTITASK + SCOPED FILES MODEL PASS: bounded concurrency, safe tasks, P0 stop, no path/file rights escalation.");
