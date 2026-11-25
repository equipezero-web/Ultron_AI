import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {parseCamaraRss,collectCamaraNews} from "../backend/news-camara-rss.js";
import {collectPublicNewsFallback} from "../backend/news-public-sources.js";
import {pollWorldNewsMonitor} from "../backend/world-news-monitor.js";
const now=Date.parse("2026-11-25T12:05:00Z");
const camaraUrl="https://www.camara.leg.br/noticias/123456-projeto-de-educacao-e-aprovado";
const abUrl="https://agenciabrasil.ebc.com.br/educacao/noticia/2026-11/projeto-e-aprovado";
const xml=(link=camaraUrl,date="Wed, 25 Nov 2026 11:55:00 GMT")=>"<rss><channel><item>"+
 "<title><![CDATA[Deputados debatem novas diretrizes para a educação pública]]></title>"+
 "<link>"+link+"</link><pubDate>"+date+"</pubDate>"+
 "<description><![CDATA[Debate na comissão]]></description></item></channel></rss>";
const parsed=parseCamaraRss(xml(),{now});
assert.equal(parsed.articles.length,1);
assert.equal(parsed.articles[0].domain,"www.camara.leg.br");
assert.equal(parsed.articles[0].source,"Agência Câmara");
assert.equal(parseCamaraRss(xml("https://www.camara.leg.br.evil.example/noticias/123"),{now}).articles.length,0);
assert.equal(parseCamaraRss(xml("https://www.camara.leg.br/admin"),{now}).articles.length,0);
assert.equal(parseCamaraRss(xml(camaraUrl,"Tue, 18 Nov 2026 11:55:00 GMT"),{now}).articles.length,0);
const camara=await collectCamaraNews({now,fetchImpl:async()=>({ok:true,text:async()=>xml()})});
assert.equal(camara.ok,true);
const fail=await collectCamaraNews({now,fetchImpl:async()=>({ok:false,status:503})});
assert.equal(fail.ok,false);
assert.match(fail.diagnostics.error,/503/);
const agency=async()=>({ok:true,articles:[{title:"Entidades anunciam medidas para combater evasão escolar",
 url:abUrl,description:"",source:"Agência Brasil",domain:"agenciabrasil.ebc.com.br",
 publishedAt:"2026-11-25T11:53:00.000Z"}],diagnostics:{provider:"agencia-brasil-rss"}});
const both=await collectPublicNewsFallback({now,agency,camara:async()=>camara});
assert.equal(both.ok,true);
assert.equal(both.articles.length,2);
assert.equal(both.diagnostics.distinctDomains,2);
assert.equal(both.diagnostics.providerCount,2);
const partial=await collectPublicNewsFallback({now,agency,camara:async()=>{throw Error("simulated timeout")}});
assert.equal(partial.ok,true,"one source failing does not erase the other");
assert.equal(partial.diagnostics.providers[1].ok,false);
assert.match(partial.diagnostics.providers[1].error,/timeout/);
const dbQueries=[];
const db={prepare(sql){
 const state={sql,args:[]};dbQueries.push(state);
 const statement={bind(...args){state.args=args;return statement;},
 async run(){return {meta:{changes:1}};},async first(){return null;},
 async all(){return {results:[]};}};
 return statement;
}};
const result=await pollWorldNewsMonitor({ULTRON_DB:db},{
 now,loadNews:async()=>({active:true,articles:[],attempts:[
 {label:"brasil-24h",ok:false,count:0,error:"timeout"},
 {label:"google-news-rss",ok:false,count:0,error:"timeout"}]}),
 collectFallback:async()=>both,
 advance:async(_,correlation)=>{
  assert.ok(correlation.events.length>=2);
  assert.equal(new Set(correlation.events.flatMap(event=>event.sources.map(s=>s.domain))).size,2);
  return {correlation,summary:{available:true,created:2,updated:0}};
 }});
assert.equal(result.ok,true);
assert.equal(result.articleCount,2);
assert.equal(result.recovered,true);
const diagnostics=dbQueries.find(item=>item.sql.startsWith("INSERT OR REPLACE INTO jarvis_world_news_monitor_diagnostics"));
const saved=JSON.parse(diagnostics.args[1]);
assert.equal(saved.providers.length,4);
assert.equal(saved.successfulProviders,2);
assert.deepEqual(saved.providers.slice(-2).map(p=>p.provider),["agencia-brasil-rss","agencia-camara-rss"]);
const runStatus=dbQueries.find(item=>item.sql.startsWith("UPDATE jarvis_world_news_monitor_runs SET status=?,article_count=?"));
assert.equal(runStatus.args[0],"completed-rss-recovery");
assert.equal(result.alerts,0,"initial multi-feed scan must never fabricate news alerts");
const src=readFileSync(new URL("../backend/world-news-monitor.js",import.meta.url),"utf8");
assert.match(src,/collectPublicNewsFallback/);
console.log("WORLD MULTI-RSS PASS: second verified source, URL/domain/date checks, partial failure recovery, distinct publishers and D1 diagnostics");
