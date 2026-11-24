import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {reviewEventEvidence,reviewCorrelatedEvents} from "../backend/news-evidence-review.js";
import {recordWorldEvidenceAudit} from "../backend/news-evidence-audit.js";
const base={event_id:"news-event-1a2b3c4d",title:"Temporal deixa 12 desabrigados em Recife",
 timestamp:"2026-11-24T14:00:00Z",verificationStatus:"not-independently-verified",
 divergenceStatus:"review-needed",sources:[
  {title:"Temporal deixa 12 desabrigados em Recife",domain:"agencia-a.br",url:"https://agencia-a.br/1",publishedAt:"2026-11-24T14:00:00Z"},
  {title:"Temporal deixa 20 desabrigados em Recife",domain:"agencia-b.br",url:"https://agencia-b.br/2",publishedAt:"2026-11-24T14:10:00Z"}
 ]};
const review=reviewEventEvidence(base);
assert.equal(review.factChecked,false);
assert.equal(review.evidenceStatus,"potential-discrepancy");
assert.equal(review.discrepancies.length,1);
assert.deepEqual(review.discrepancies[0].sources.map(s=>s.value),[12,20]);
// Different claim labels are not contradictions by themselves.
assert.equal(reviewEventEvidence({...base,sources:[
 {...base.sources[0],title:"Temporal deixa 12 feridos em Recife"},
 {...base.sources[1],title:"Temporal deixa 20 desabrigados em Recife"}
]}).discrepancies.length,0);
// Same number from two sites does not prove truth or independent reporting.
assert.equal(reviewEventEvidence({...base,sources:[
 base.sources[0],{...base.sources[1],title:base.sources[0].title}
]}).evidenceStatus,"multi-source-unverified");
const correlation=reviewCorrelatedEvents({events:[base]});
assert.equal(correlation.events[0].verificationStatus,"not-independently-verified");
assert.equal(correlation.evidenceSummary.factChecked,0);
assert.equal(correlation.events[0].divergenceStatus,"potential-numeric-discrepancy");
assert.equal((await recordWorldEvidenceAudit({},correlation)).reason,"d1-unavailable");
const queries=[];
const db={prepare(sql){const call={sql,values:[]};queries.push(call);return {
 bind(...values){call.values=values;return this;},
 async run(){return {meta:{changes:1}}}
};}};
const date=Date.parse("2026-11-24T15:50:00Z");
const recorded=await recordWorldEvidenceAudit({ULTRON_DB:db},correlation,{now:date});
assert.equal(recorded.saved,true);
assert.equal(recorded.inserted,1);
const insert=queries.find(q=>q.sql.startsWith("INSERT"));
assert.ok(insert);
const data=JSON.parse(insert.values[3]);
assert.equal(data.evidenceReview.factChecked,false);
assert.equal(data.verificationStatus,"not-independently-verified");
assert.equal(data.sources.length,2);
assert.equal(Object.hasOwn(data,"operatorId"),false);
assert.equal(queries.filter(q=>q.sql.startsWith("DELETE")).length,1);
const broken={prepare(){throw Error("D1 simulated failure")}};
assert.equal((await recordWorldEvidenceAudit({ULTRON_DB:broken},correlation)).reason,"d1-write-failed");
const ctx=readFileSync(new URL("../backend/news-context.js",import.meta.url),"utf8");
const worker=readFileSync(new URL("../backend/worker.js",import.meta.url),"utf8");
assert.match(ctx,/reviewCorrelatedEvents\(correlateNewsEvents\(articles\)\)/);
assert.match(ctx,/potentialNumericDiscrepancies/);
assert.match(worker,/recordWorldEvidenceAudit\(env,newsState.eventCorrelation\)/);
assert.match(worker,/evidenceAudit: newsAudit/);
console.log("WORLD EVIDENCE REVIEW PASS: numeric discrepancies not truth claims, provenance and fail-soft D1 audit");
