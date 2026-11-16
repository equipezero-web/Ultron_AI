import assert from "node:assert/strict";
import {parseTrendIntent} from "../modules/jarvis-trend-intent.js";
import {parseLocalCommand} from "../modules/jarvis-local-commands.js";
import {
 TREND_DOMAINS,planTrendScan,makeTrendFeedUrl,
 parseSearchTrends,parseNewsTrends,collectTrendSample,
 pollTrendIntelligence,latestTrendIntelligence
} from "../backend/trend-intelligence.js";

const date=new Date("2026-11-16T16:12:00.000Z"),now=date.getTime();
const searchXml=`<?xml version="1.0"?><rss xmlns:ht="https://trends.google.com/trends/trendingsearches/daily"><channel>
<item><title><![CDATA[Busca fictícia para teste]]></title>
<link>https://trends.google.com/trending?geo=BR</link>
<pubDate>Mon, 16 Nov 2026 14:00:00 GMT</pubDate>
<ht:approx_traffic>10K+</ht:approx_traffic>
<ht:news_item><ht:news_item_title>Referência fictícia</ht:news_item_title><ht:news_item_url>https://example.org/referencia</ht:news_item_url><ht:news_item_source>Publisher Test</ht:news_item_source></ht:news_item>
</item>
<item><title>Busca futura</title><link>https://trends.google.com/trending?geo=BR</link><pubDate>Fri, 20 Nov 2026 14:00:00 GMT</pubDate></item>
<item><title>Busca antiga</title><link>https://trends.google.com/trending?geo=BR</link><pubDate>Mon, 9 Nov 2026 14:00:00 GMT</pubDate></item>
</channel></rss>`;
const newsXml=`<?xml version="1.0"?><rss><channel>
<item><title><![CDATA[Notícia de teste &amp; descoberta]]></title>
<link>https://news.google.com/rss/articles/example</link>
<pubDate>Mon, 16 Nov 2026 11:00:00 GMT</pubDate>
<source>Redação Teste</source></item>
<item><title>Duplicata</title><link>http://127.0.0.1/secret</link>
<pubDate>Mon, 16 Nov 2026 11:00:00 GMT</pubDate></item>
</channel></rss>`;

assert.equal(TREND_DOMAINS.length,20);
assert.equal(new Set(TREND_DOMAINS.map(x=>x.id)).size,20);
for(const hour of [0,1,2,3,4]){
 const groups=planTrendScan(new Date(Date.UTC(2026,10,16,hour,12)));
 assert.equal(groups.length,12);
 assert.equal(groups.filter(x=>x.geo==="BR").length,1);
 assert.equal(groups.filter(x=>x.region==="br"&&!x.geo).length,4);
 assert.equal(groups.filter(x=>x.region==="world"&&!x.geo).length,4);
}
const host=new URL(makeTrendFeedUrl("br",TREND_DOMAINS[0]));
assert.equal(host.hostname,"news.google.com");
assert.equal(host.searchParams.get("ceid"),"BR:pt-419");
assert.match(host.searchParams.get("q"),/when:2d/);
assert.throws(()=>makeTrendFeedUrl("private",{id:"politica"}));
assert.throws(()=>makeTrendFeedUrl("br",{id:"internal-files"}));
const search=parseSearchTrends(searchXml,{now,region:"BR"});
assert.equal(search.length,1);
assert.equal(search[0].approximateSearches,"10K+");
assert.equal(search[0].newsReferences.length,1);
assert.match(search[0].evidence,/não é contagem exata/);
assert.equal(search[0].source,"Google Trends");
const news=parseNewsTrends(newsXml,{now,region:"br",category:"tecnologia"});
assert.equal(news.length,1);
assert.equal(news[0].title,"Notícia de teste & descoberta");
assert.equal(news[0].confidence,"cobertura-a-verificar");
assert.match(news[0].evidence,/não comprova popularidade/);
assert.equal(parseNewsTrends(newsXml.replace("Mon, 16 Nov","Mon, 02 Nov"),{now}).length,0);
assert.equal(parseSearchTrends(searchXml.replace(/<rss /,"<rss "),{now:now+60*24*3600000}).length,0);

const phrases=[
 ["Jarvis, mostre tendências de hoje","all","all"],
 ["Jarvis, quais as tendências de moda no Brasil hoje?","br","moda"],
 ["Jarvis, mostre tendências mundiais de tecnologia","world","tecnologia"],
 ["Jarvis, mostre tendências de todos os setores","all","all"],
 ["Jarvis, o que está em alta no mundo?","world","all"],
 ["Jarvis, quais as tendências das redes sociais hoje?","all","redes-sociais"]
];
for(const [phrase,region,category] of phrases){
 const intent=parseTrendIntent(phrase);
 assert.equal(intent?.type,"trend-intelligence",phrase);
 assert.equal(intent.region,region,phrase);
 assert.equal(intent.category,category,phrase);
 assert.equal(parseLocalCommand(phrase)?.type,"trend-intelligence",phrase);
}
assert.equal(parseTrendIntent("Jarvis, feche tendências")?.type,"trend-intelligence-close");
for(const phrase of ["Como ver tendências?","Não mostre tendências","Se eu quisesse tendências?"]){
 assert.equal(parseTrendIntent(phrase),null,phrase);
}
let requests=0;
const mockFetch=async url=>{
 requests++;
 return {ok:true,headers:{get:()=>"application/xml"},
  text:async()=>url.includes("trends.google.com")?searchXml:newsXml};
};
const report=await collectTrendSample({now:()=>date,fetchImpl:mockFetch});
assert.equal(requests,12);
assert.equal(report.ok,true);
assert.equal(report.available,12);
assert.equal(report.feeds.filter(x=>x.provider==="Google Trends").length,4);
const memory=new Map();
const sqlCalls=[];
const env={ULTRON_DB:{prepare(sql){
 const entry={sql,args:[]};sqlCalls.push(entry);
 return {
  bind(...args){entry.args=args;return this;},
  async run(){
   if(sql.startsWith("INSERT OR IGNORE")){
    const [key,at,region,category,json]=entry.args;
    if(!memory.has(key))memory.set(key,{sample_key:key,observed_at:at,region,category,snapshot_json:json});
   }
   if(sql.startsWith("DELETE FROM")){
    for(const [key,row] of memory)if(row.observed_at<entry.args[0])memory.delete(key);
   }
   return {success:true};
  },
  async first(){const key=entry.args[0];return memory.get(key)||null;},
  async all(){
   return {results:[...memory.values()].filter(row=>row.observed_at>=entry.args[0])
    .sort((a,b)=>b.observed_at.localeCompare(a.observed_at)).slice(0,260)};
  }
 };
}}};
const skip=await pollTrendIntelligence(env,{now:()=>new Date("2026-11-16T16:03:00.000Z"),fetchImpl:mockFetch});
assert.equal(skip.skipped,true);
const stored=await pollTrendIntelligence(env,{now:()=>date,fetchImpl:mockFetch});
assert.equal(stored.ok,true);assert.equal(stored.saved,12);assert.equal(memory.size,12);
const repeat=await pollTrendIntelligence(env,{now:()=>date,fetchImpl:mockFetch});
assert.equal(repeat.skipped,true);
const latest=await latestTrendIntelligence(env,{now:()=>now,region:"all"});
assert.equal(latest.ok,true);
assert.equal(latest.sampleBased,true);
assert.equal(latest.exhaustive,false);
assert.deepEqual(latest.coverage,{observed:12,expected:44,complete:false});
assert.equal(latest.partial,true);
assert.equal(latest.items.find(x=>x.kind==="search-trend").observedCycles,1);
assert.equal(latest.stale,false);
assert.ok(latest.items.some(x=>x.kind==="search-trend"));
assert.ok(latest.items.some(x=>x.kind==="news-observation"));
assert.ok(latest.sourceStatus.length===12);
assert.match(latest.privacy,/Nenhum comando/);
const br=await latestTrendIntelligence(env,{now:()=>now,region:"br",category:"pesquisas"});
assert.equal(br.ok,true);
assert.equal(br.items.length,1);
assert.equal(br.items[0].region,"BR");
assert.deepEqual(br.coverage,{observed:1,expected:1,complete:true});
const invalid=await latestTrendIntelligence(env,{region:"secret"});
assert.equal(invalid.status,400);
assert.equal((await latestTrendIntelligence(env,{now:()=>now+40*3600000})).ok,false);
const outage=await collectTrendSample({now:()=>date,fetchImpl:async()=>{throw Error("offline")}});
assert.equal(outage.ok,false);
assert.equal(outage.feeds.length,12);
assert.ok(outage.feeds.every(f=>!f.ok&&!f.signals.length));
const collectorSrc=String(await (await import("node:fs/promises"))
 .readFile(new URL("../backend/trend-intelligence.js",import.meta.url),"utf8"));
for(const forbidden of ["memoryKey","deviceSecret","privateData","cameraFrames","fileContent"]){
 assert.equal(collectorSrc.includes(forbidden),false);
}
console.log("JARVIS TRENDS PASS: 20 domains, source-constrained RSS, real timestamps, D1 hourly window, Brazil-first, no fake popularity, privacy and voice intent.");

