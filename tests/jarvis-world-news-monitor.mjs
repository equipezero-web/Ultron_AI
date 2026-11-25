import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {pollWorldNewsMonitor,latestWorldNewsAlerts,selectWorldNewsAlerts} from "../backend/world-news-monitor.js";
const timestamp=Date.parse("2026-11-25T12:05:00Z");
const newsEvent={
 event_id:"news-event-1234abcd",title:"Temporal deixa moradores desabrigados em Recife",
 sources:[{source:"Agência pública",domain:"example.org",
  url:"https://example.org/noticia",publishedAt:"2026-11-25T12:00:00Z"}],
 evolution:{status:"updated",changes:{newSources:1,updatedSources:0,possibleDiscrepancyChanged:false}}
};
assert.equal(selectWorldNewsAlerts([{...newsEvent,evolution:{status:"first-observed",changes:{newSources:1}}}]).length,0);
assert.equal(selectWorldNewsAlerts([{...newsEvent,evolution:{status:"unchanged",changes:{newSources:0}}}]).length,0);
assert.equal(selectWorldNewsAlerts([newsEvent],{now:timestamp})[0].verificationStatus,"not-independently-verified");
assert.equal(selectWorldNewsAlerts([newsEvent],{now:timestamp})[0].sources[0].url,"https://example.org/noticia");
const table={runs:new Map(),alerts:new Map(),commands:[]};
const db={prepare(sql){
 const q={sql,args:[]};table.commands.push(q);
 const statement={
  bind(...args){q.args=args;return statement;},
  async run(){
   if(sql.startsWith("INSERT OR IGNORE INTO jarvis_world_news_monitor_runs")){
    if(table.runs.has(q.args[0]))return {meta:{changes:0}};
    table.runs.set(q.args[0],{bucket:q.args[0],checked_at:q.args[1],status:q.args[2],article_count:0});
    return {meta:{changes:1}};
   }
   if(sql.startsWith("UPDATE jarvis_world_news_monitor_runs")){
    const row=table.runs.get(q.args.at(-1));
    if(row){row.status=q.args[0];if(q.args.length===3)row.article_count=q.args[1];}
   }
   if(sql.startsWith("INSERT OR IGNORE INTO jarvis_world_news_alerts")){
    if(!table.alerts.has(q.args[0]))table.alerts.set(q.args[0],{id:q.args[0],
     event_id:q.args[1],created_at:q.args[2],alert_json:q.args[3]});
   }
   return {meta:{changes:1}};
  },
  async first(){
   return [...table.runs.values()].sort((a,b)=>b.checked_at.localeCompare(a.checked_at))[0]||null;
  },
  async all(){
   const take=q.args[0]||8;
   return {results:[...table.alerts.values()].sort((a,b)=>b.created_at.localeCompare(a.created_at)).slice(0,take)};
  }
 };
 return statement;
}};
const env={ULTRON_DB:db};
let fetchCalls=0,historyCalls=0;
const loadNews=async()=>{fetchCalls++;return {active:true,articles:[{title:"Publicação",url:"https://example.org/noticia"}],
 eventCorrelation:{events:[newsEvent]}}};
const advance=async(_,corr)=>{historyCalls++;return {correlation:corr,summary:{available:true,created:0,updated:1}}};
const first=await pollWorldNewsMonitor(env,{now:timestamp,loadNews,advance});
assert.equal(first.ok,true);
assert.equal(first.alerts,1);
assert.equal(fetchCalls,1);
assert.equal(historyCalls,1);
const second=await pollWorldNewsMonitor(env,{now:timestamp+10*60000,loadNews,advance});
assert.equal(second.skipped,"already-started");
assert.equal(fetchCalls,1,"minute cron must not repeat costly news polling");
const third=await pollWorldNewsMonitor(env,{now:timestamp+31*60000,loadNews,advance});
assert.equal(third.ok,true);
assert.equal(fetchCalls,2,"new 30-minute bucket polls once");
const feed=await latestWorldNewsAlerts(env);
assert.equal(feed.ok,true);
assert.equal(feed.alerts.length,2);
assert.equal(feed.monitoring,"public-news-30-minute-cron");
const noDB=await pollWorldNewsMonitor({});
assert.equal(noDB.reason,"d1-unavailable");
const noNews=await pollWorldNewsMonitor(env,{now:timestamp+65*60000,
 loadNews:async()=>({active:true,articles:[],eventCorrelation:{events:[]}}),
 collectFallback:async()=>({ok:false,articles:[],diagnostics:{error:"simulated"}}),advance});
assert.equal(noNews.reason,"no-reliable-news");
const firstObserved={...newsEvent,evolution:{...newsEvent.evolution,status:"first-observed"}};
assert.equal(selectWorldNewsAlerts([firstObserved]).length,0);
const worker=readFileSync(new URL("../backend/worker.js",import.meta.url),"utf8");
const neural=readFileSync(new URL("../modules/ultron-neural-answer.js",import.meta.url),"utf8");
assert.match(worker,/ctx\.waitUntil\(pollWorldNewsMonitor\(env\)/);
assert.match(worker,/\/api\/intelligence\/news-alerts/);
assert.match(worker,/latestWorldNewsAlerts\(env\)/);
assert.match(worker,/worldNewsAlerts: worldNewsAlerts\.ok/);
assert.match(neural,/renderWorldNewsAlerts\(liveData\)/);
assert.match(neural,/ultron-world-news-alert/);
console.log("WORLD AUTONOMOUS NEWS PASS: bounded half-hour cron, D1 dedup, monitoring alerts, safe feed, neural integration");
