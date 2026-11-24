import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {advanceWorldEventTimeline,matchWorldEvent} from "../backend/news-world-evolution.js";
import {createNewsEvidenceViewModel} from "../modules/jarvis-news-evidence-view-model.js";
const t=Date.parse("2026-11-24T16:00:00Z");
const source=(domain,title,id)=>({title,domain,url:"https://"+domain+"/"+id,publishedAt:"2026-11-24T15:00:00Z"});
const event=(id,title,sources)=>({event_id:"news-event-"+id,title,timestamp:"2026-11-24T15:00:00Z",sources,verificationStatus:"not-independently-verified",evidenceReview:{discrepancies:[]}});
const a=source("a.example.org","Temporal deixa 12 desabrigados em Recife","a");
const b=source("b.example.org","Temporal deixa 20 desabrigados em Recife","b");
const records=new Map();
const executed=[];
const env={ULTRON_DB:{prepare(sql){
 const command={sql,values:[]};executed.push(command);
 return {bind(...values){command.values=values;return this;},
 async run(){
  if(sql.startsWith("INSERT INTO jarvis_world_event_state")){
   records.set(command.values[0],{event_id:command.values[0],first_seen:command.values[1],last_seen:command.values[2],event_json:command.values[3]});
  }
  if(sql.startsWith("DELETE FROM jarvis_world_event_state")){
   for(const [id,row] of records)if(row.last_seen<command.values[0])records.delete(id);
  }
  return {meta:{changes:1}};
 },
 async all(){return {results:[...records.values()].filter(row=>row.last_seen>=command.values[0]).slice(0,80)}}};
}}};
const first=await advanceWorldEventTimeline(env,{events:[event("aaaaaaaa",a.title,[a])]},{now:t});
assert.equal(first.summary.created,1);
assert.equal(first.correlation.events[0].evolution.status,"first-observed");
assert.equal(first.correlation.events[0].evolution.timeline.length,1);
const second=await advanceWorldEventTimeline(env,{events:[event("bbbbbbbb",b.title,[b])]},{now:t+3600000});
assert.equal(second.correlation.events[0].event_id,"news-event-aaaaaaaa","event identity remains stable after publisher URL changes");
assert.equal(second.correlation.events[0].evolution.status,"updated");
assert.equal(second.correlation.events[0].evolution.changes.newSources,1);
assert.equal(second.correlation.events[0].evolution.timeline.length,2);
const repeated=await advanceWorldEventTimeline(env,{events:[event("cccccccc",a.title,[a])]},{now:t+7200000});
assert.equal(repeated.correlation.events[0].event_id,"news-event-aaaaaaaa");
assert.equal(repeated.correlation.events[0].evolution.status,"unchanged","previous A link not rediscovered after seeing B");
assert.equal(repeated.correlation.events[0].evolution.timeline.length,2);
const changed={...a,title:"Temporal deixa 25 desabrigados em Recife",publishedAt:"2026-11-24T18:30:00Z"};
const revised=await advanceWorldEventTimeline(env,{events:[event("dddddddd",changed.title,[changed])]},{now:t+10800000});
assert.equal(revised.correlation.events[0].evolution.changes.updatedSources,1);
const other=await advanceWorldEventTimeline(env,{events:[event("eeeeeeee","Congresso discute reforma tributaria orcamento anual",[
 source("c.example.org","Congresso discute reforma tributaria orcamento anual","c")
])]},{now:t+12000000});
assert.equal(other.summary.created,1,"unrelated story stays distinct");
assert.notEqual(other.correlation.events[0].event_id,"news-event-aaaaaaaa");
assert.equal(matchWorldEvent(event("ffffffff",a.title,[a]),[{event_id:"news-event-aaaaaaaa",last_seen:"2026-11-01T00:00:00Z",sourceUrls:[a.url],titleWords:["temporal","deixa","desabrigados","recife"]}],{now:t}),null,"stale stories not matched");
const view=createNewsEvidenceViewModel({news:true,eventCorrelation:revised.correlation});
assert.equal(view[0].verified,false);
assert.equal(view[0].evolution.timeline.length,3);
assert.equal(view[0].evolution.status,"updated");
assert.equal((await advanceWorldEventTimeline({},revised.correlation)).summary.reason,"d1-unavailable");
const failure=await advanceWorldEventTimeline({ULTRON_DB:{prepare(){throw Error("Offline")}}},revised.correlation);
assert.equal(failure.summary.reason,"d1-failed");
assert.equal(failure.correlation,revised.correlation,"D1 failure keeps live news accessible");
const worker=readFileSync(new URL("../backend/worker.js",import.meta.url),"utf8");
const neural=readFileSync(new URL("../modules/ultron-neural-answer.js",import.meta.url),"utf8");
assert.match(worker,/advanceWorldEventTimeline\(env,newsState.eventCorrelation\)/);
assert.match(worker,/recordWorldEvidenceAudit\(env,newsState.eventCorrelation\)/);
assert.match(worker,/worldEvolution: worldEvolution.summary/);
assert.match(neural,/ultron-evidence-timeline-list/);
assert.match(neural,/textContent='EVOLUÇÃO DO ACONTECIMENTO'/);
assert.equal(records.get("news-event-aaaaaaaa")?.event_id,"news-event-aaaaaaaa");
assert.equal(executed.filter(q=>q.sql.startsWith("DELETE FROM jarvis_world_event_state")).length,5);
console.log("WORLD EVOLUTION PASS: stable IDs across URLs, changed sources and headlines, de-dup history, topic isolation, D1 fail-soft, neural timeline");
