import assert from "node:assert/strict";
import {createProviderDiagnostics,isProviderDiagnosticsIntent,providerDiagnosticsAnswer} from "../backend/provider-diagnostics.js";
import {createProviderCircuitBreaker} from "../backend/provider-circuit-breaker.js";

let time=Date.parse("2026-11-24T16:30:00Z");
const now=()=>time;
const diagnostics=createProviderDiagnostics({now});
const breaker=createProviderCircuitBreaker({now,threshold:2,cooldownMs:30000});
for(const command of [
  "Jarvis, status dos provedores de IA",
  "Diagnóstico dos modelos de IA",
  "Como está a saúde do gateway de IA?"
])assert.equal(isProviderDiagnosticsIntent(command),true,command);
for(const command of ["Qual seu provedor de IA favorito?","Me diga que horas são","Jarvis, pare","Status dos dispositivos"])
 assert.equal(isProviderDiagnosticsIntent(command),false,command);
let answer=providerDiagnosticsAnswer(breaker,diagnostics);
assert.match(answer.text,/sem observações/);
assert.doesNotMatch(answer.text,/todos online/i);
assert.equal(answer.providerDiagnostics.scope,"worker-isolate");
assert.equal(answer.providerDiagnostics.providers.length,5);
assert.equal(diagnostics.record({provider:"unknown",status:"success"}),false);
assert.equal(diagnostics.record({provider:"groq",status:"skipped"}),false);
diagnostics.record({provider:"gemini",status:"failed",durationMs:125});
diagnostics.record({provider:"gemini",status:"failed",durationMs:225});
breaker.onFailure("gemini",{status:503});
breaker.onFailure("gemini",{status:503});
assert.equal(breaker.isCooling("gemini"),true);
answer=providerDiagnosticsAnswer(breaker,diagnostics);
const gemini=answer.providerDiagnostics.providers.find(p=>p.provider==="gemini");
assert.equal(gemini.state,"resfriamento");
assert.equal(gemini.failures,2);
diagnostics.record({provider:"groq",status:"success",durationMs:45});
diagnostics.record({provider:"groq",status:"success",durationMs:55});
const groq=diagnostics.report(breaker).find(p=>p.provider==="groq");
assert.equal(groq.averageSuccessMs,50);
assert.equal(groq.successes,2);
assert.equal(groq.failures,0);
assert.equal(Object.hasOwn(groq,"error"),false);
assert.equal(Object.hasOwn(groq,"prompt"),false);
time+=30001;
breaker.onSuccess("gemini");
diagnostics.record({provider:"gemini",status:"success",durationMs:50});
assert.equal(diagnostics.report(breaker).find(p=>p.provider==="gemini").state,"sucesso observado");
time+=15*60*1000+1;
assert.equal(diagnostics.report(breaker).find(p=>p.provider==="gemini").state,"sem observações");
console.log("STAGE B DIAGNOSTICS PASS: explicit intent, scoped counts, cooldown, recovery, expiry, privacy");
