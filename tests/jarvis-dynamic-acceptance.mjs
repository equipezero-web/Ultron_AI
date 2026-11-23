import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {validateJarvisAcceptanceManifest,validateJarvisProof}
  from "../modules/jarvis-acceptance-validation.js";
import {summarizeJarvisEvidence}
  from "../modules/jarvis-evidence-progress.js";
const original=JSON.parse(readFileSync(new URL("../data/jarvis-100-acceptance-manifest.json",import.meta.url),"utf8"));
const checkedAt="2026-11-19T13:40:00Z";
const now=()=>Date.parse("2026-11-19T14:00:00Z");
const base={state:"verified",scope:"Operação observada integralmente com dados e resultados reais.",
  reviewer:"jarvis-reviewer",verifiedAt:checkedAt,url:"https://github.com/equipezero-web/Ultron_AI/actions/runs/12345678"};
const makeProof=()=>structuredClone(base);
const fake=structuredClone(original);
const item=fake.capabilities.find(c=>c.id==="CORE-01");
assert.ok(item);
item.acceptance="accepted";
for(const category of ["code","ci","production","physical"])item.checks[category]=makeProof();
item.checks.physical={...makeProof(),state:"not-applicable",
  rationale:"Esta capacidade é um serviço backend; seu teste físico não possui interface de hardware direta."};
const evaluation=validateJarvisAcceptanceManifest(fake,{now});
assert.equal(evaluation.ok,true,"an audited capability must be allowed to progress from zero");
assert.equal(evaluation.accepted,1);
const report=summarizeJarvisEvidence(fake,{now});
assert.ok(report);
assert.equal(report.accepted,1);
assert.match(report.text,/1\/60 capacidades aceitas integralmente/);
const expectedPartials=original.capabilities.filter(x=>x.id!=="CORE-01"&&
  x.acceptance==="pending"&&x.checks?.code?.state==="partial-scope-verified"&&
  x.checks?.ci?.state==="partial-scope-verified").length;
assert.equal(report.partial,expectedPartials,"accepting one capability cannot freeze or inflate partial proof counts");
const allAccepted=structuredClone(original);
for(const c of allAccepted.capabilities){
  c.acceptance="accepted";
  for(const dimension of ["code","ci","production","physical"]){
    c.checks[dimension]=dimension==="physical"?
      {...makeProof(),state:"not-applicable",rationale:"Aceite sintético para teste de contrato, nunca prova do mundo real."}:
      makeProof();
  }
}
const full=validateJarvisAcceptanceManifest(allAccepted,{now});
assert.equal(full.ok,true,"never hardcode zero certified or block 100% if all proof contracts pass");
assert.equal(full.accepted,60);
assert.equal(summarizeJarvisEvidence(allAccepted,{now}).accepted,60);
function reject(change){
  const sample=structuredClone(fake);
  change(sample.capabilities.find(c=>c.id==="CORE-01"));
  assert.equal(validateJarvisAcceptanceManifest(sample,{now}).ok,false);
  assert.equal(summarizeJarvisEvidence(sample,{now}),null);
}
reject(c=>{c.checks.production="not-certified";});
reject(c=>{c.checks.production.verifiedAt="2025-01-01T00:00:00Z";});
reject(c=>{c.checks.production.url="http://localhost/proof";});
reject(c=>{c.checks.production.url="https://user:pass@github.com/proof";});
reject(c=>{c.checks.ci.scope="ran";});
reject(c=>{c.checks.code.reviewer="";});
reject(c=>{c.checks.physical.rationale="n/a";});
reject(c=>{c.checks.physical.state="pending";});
reject(c=>{c.acceptance="UNKNOWN";});
assert.equal(validateJarvisProof({...makeProof(),verifiedAt:"2026-12-01T00:00:00Z"},"production",{now}),false);
assert.equal(validateJarvisProof({...makeProof(),url:"https://github.com/proof"},"code",{now}),true);
assert.equal(validateJarvisAcceptanceManifest(original,{now}).accepted,0,
  "current production stays unaccepted; dynamic acceptance only changes with proof");
console.log("JARVIS DYNAMIC ACCEPTANCE PASS: simulated 0→1→60, no proof bypass, no false production certification");
