import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {parseAgencyBrasilFeed,collectAgencyBrasilNews} from "../backend/news-public-rss.js";
import {pollWorldNewsMonitor} from "../backend/world-news-monitor.js";
const now=Date.parse("2026-11-25T12:05:00Z");
const xml=(date="Wed, 25 Nov 2026 11:58:00 GMT",link="https://agenciabrasil.ebc.com.br/politica/noticia/2026-11/congresso-aprova-texto")=>
 "<rss><channel><item><title><![CDATA[Congresso aprova novo texto sobre orçamento]]></title>"+
 "<link>"+link+"</link><pubDate>"+date+"</pubDate>"+
 "<description><![CDATA[<p>Notícia de fonte pública</p>]]></description></item></channel></rss>";
const parsed=parseAgencyBrasilFeed(xml(),{now});
assert.equal(parsed.articles.length,1);
assert.equal(parsed.articles[0].source,"Agência Brasil");
assert.equal(parsed.articles[0].url,"https://agenciabrasil.ebc.com.br/politica/noticia/2026-11/congresso-aprova-texto");
assert.equal(parsed.articles[0].publishedAt,"2026-11-25T11:58:00.000Z");
assert.equal(parseAgencyBrasilFeed(xml("Wed, 25 Nov 2026 11:58:00 GMT","https://attacker.example/noticia"),{now}).articles.length,0);
assert.equal(parseAgencyBrasilFeed(xml("Mon, 01 Jun 2026 11:58:00 GMT"),{now}).articles.length,0);
const collect=await collectAgencyBrasilNews({now,fetchImpl:async()=>({ok:true,async text(){return xml();}})});
assert.equal(collect.ok,true);
assert.equal(collect.articles.length,1);
const failure=await collectAgencyBrasilNews({now,fetchImpl:async()=>({ok:false,status:503})});
assert.equal(failure.ok,false);
assert.match(failure.diagnostics.error,/503/);
const queries=[];
const db={prepare(sql){
 const query={sql,values:[]};queries.push(query);
 const statement={
  bind(...values){query.values=values;return statement;},
  async run(){return {meta:{changes:1}};},
  async first(){return null;},
  async all(){return {results:[]};}
 };
 return statement;
}};
let fallbackCalls=0,advanced=0;
const result=await pollWorldNewsMonitor({ULTRON_DB:db},{
 now,trigger:"on-demand",
 loadNews:async()=>({active:true,articles:[],attempts:[
  {label:"google-news-rss",ok:false,count:0,error:"timeout"},
  {label:"gdelt",ok:true,count:0}
 ]}),
 collectFallback:async()=>{fallbackCalls++;return collect;},
 advance:async(_,correlation)=>{
  advanced++;
  assert.ok(correlation.events.length===1);
  assert.ok(correlation.events[0].sources[0].url.includes("agenciabrasil.ebc.com.br"));
  return {correlation,summary:{available:true,created:1,updated:0}};
 }
});
assert.equal(result.ok,true,"valid RSS fallback recovers empty GDELT/Google batch");
assert.equal(result.recovered,true);
assert.equal(result.articleCount,1);
assert.equal(result.alerts,0,"first observation does not generate an alert");
assert.equal(fallbackCalls,1);
assert.equal(advanced,1);
const update=queries.find(q=>q.sql.startsWith("UPDATE jarvis_world_news_monitor_runs SET status=?,article_count=?"));
assert.equal(update.values[0],"on-demand-completed-rss-recovery");
const diagnostic=queries.find(q=>q.sql.startsWith("INSERT OR REPLACE INTO jarvis_world_news_monitor_diagnostics"));
const recorded=JSON.parse(diagnostic.values[1]);
assert.equal(recorded.recovered,true);
assert.equal(recorded.providers.length,3);
assert.equal(recorded.providers[0].error,"timeout");
assert.equal(recorded.providers[2].provider,"agencia-brasil-rss");
assert.equal(recorded.providers[2].count,1);
const worker=readFileSync(new URL("../backend/worker.js",import.meta.url),"utf8");
assert.match(worker,/pollWorldNewsMonitor\(env\)/);
assert.match(worker,/readWorldNewsMonitorWithBootstrap\(env\)/);
console.log("WORLD NEWS COLLECTION RECOVERY PASS: official HTTPS RSS provenance, bounded freshness, failure diagnostics, D1 baseline and no fabricated alerts");
