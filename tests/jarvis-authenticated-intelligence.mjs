import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runVerifiedReadOnlyIntelligence} from "../backend/jarvis-authenticated-intelligence.js";

const now=Date.parse("2026-11-19T12:00:00Z");
const forecast={ok:true,kind:"global-short-term-forecast",
  location:{label:"Recife, Pernambuco, Brazil"},
  fetchedAt:"2026-11-19T11:55:00Z",
  source:{url:"https://open-meteo.com/en/docs",name:"Open-Meteo",
    disclaimer:"Previsão numérica; não é alerta oficial."},
  current:{temperatureC:29,humidityPercent:65},
  days:[{date:"2026-11-19",maxC:30,minC:24,rainMm:4}]
};
let weatherCalls=0,newsCalls=0;
const weatherLoader=async ({query,days})=>{
  weatherCalls++;
  assert.equal(query,"Recife");
  assert.equal(days,7);
  return forecast;
};
const newsLoader=async (query,options)=>{
  newsCalls++;
  assert.equal(query,"notícias Brasil hoje");
  assert.equal(options.limit,6);
  return {articles:[
    {title:"Notícia verificada",url:"https://example.org/story",
     publishedAt:"2026-11-19T11:30:00Z",source:"Fonte pública",description:"Resumo",image:null},
    {title:"Artigo antigo",url:"https://example.org/old",
     publishedAt:"2025-11-19T11:30:00Z",source:"Fonte pública"},
    {title:"Link inseguro",url:"javascript:alert(1)",
     publishedAt:"2026-11-19T11:30:00Z",source:"Fonte falsa"}
  ]};
};
const adapters={weatherLoader,newsLoader,now:()=>now};
const weather=await runVerifiedReadOnlyIntelligence({message:"Mostre previsão meteorológica",city:"Recife"},adapters);
assert.equal(weather.ok,true);
assert.equal(weather.steps[0].agent,"meteorology");
assert.equal(weather.steps[0].result.location,"Recife, Pernambuco, Brazil");
assert.equal(weather.steps[0].result.isOfficialAlert,false);
assert.equal(weather.deviceActions,false);
assert.equal(weather.voiceEnabled,false);
assert.equal(weather.rendered,false);
assert.equal(weatherCalls,1);
assert.equal(newsCalls,0);
const news=await runVerifiedReadOnlyIntelligence({message:"Quais notícias estão acontecendo hoje?"},adapters);
assert.equal(news.ok,true);
assert.equal(news.steps[0].result.articles.length,1,"stale and unsafe links must not pass");
assert.equal(news.steps[0].result.sourceCount,1);
assert.equal(newsCalls,1);
const mixed=await runVerifiedReadOnlyIntelligence(
  {message:"Mostre previsão do tempo e notícias no globo",city:"Recife"},adapters);
assert.equal(mixed.ok,false,"server does not claim browser rendering");
assert.equal(mixed.partial,true);
assert.equal(mixed.status,207);
assert.deepEqual(mixed.steps.map(s=>s.status),["completed","completed","unavailable"]);
assert.equal(mixed.rendered,false);
assert.match(mixed.nextAction,/Neural Ring/);
const previousCalls=weatherCalls+newsCalls;
assert.equal((await runVerifiedReadOnlyIntelligence({message:"Mostre clima",city:"javascript:invalid"},adapters)).error,"CITY_REQUIRED");
assert.equal((await runVerifiedReadOnlyIntelligence({message:"Previsão do tempo",city:"Recife",days:300},adapters)).error,"DAYS_INVALID");
assert.equal((await runVerifiedReadOnlyIntelligence({message:"Apague arquivos do meu celular"},adapters)).error,"AGENT_NOT_AVAILABLE");
assert.equal((await runVerifiedReadOnlyIntelligence({message:"Não mostre notícias"},adapters)).error,"NO_AFFIRMATIVE_ACTION");
assert.equal((await runVerifiedReadOnlyIntelligence({message:"x".repeat(800)},adapters)).error,"INVALID_COMMAND");
assert.equal(weatherCalls+newsCalls,previousCalls,"invalid/unsafe inputs must make no upstream calls");
const offline=await runVerifiedReadOnlyIntelligence({message:"Mostre previsão",city:"Recife"},
  {...adapters,weatherLoader:async()=>({ok:false,status:503})});
assert.equal(offline.ok,false);
assert.equal(offline.partial,false);
assert.equal(offline.steps[0].status,"failed");
const stale=await runVerifiedReadOnlyIntelligence({message:"Mostre notícias"},
  {...adapters,newsLoader:async()=>({articles:[{title:"Velha",url:"https://example.org",publishedAt:"2024-01-01"}]})});
assert.equal(stale.ok,false);
const worker=readFileSync(new URL("../backend/worker.js",import.meta.url),"utf8");
const handler=worker.slice(worker.indexOf("async function handleAccountIntelligence("),
  worker.indexOf("async function handleAccountPlugins("));
assert.match(handler,/authorizeJarvisAccount\(request,env\)/);
assert.match(handler,/if\(!auth\.ok\)return accountPluginsJson/);
assert.match(handler,/request\.method!=="POST"/);
assert.match(handler,/request\.text\(\)/);
assert.doesNotMatch(handler,/operatorFrom|memoryKey|executeAccountPlugin|deviceBridge/);
assert.match(worker,/if\(path\.startsWith\("\/api\/account\/"\)\)/);
assert.match(worker,/if\(path==="\u002Fapi\u002Faccount\u002Fintelligence\u002Fexecute"\)return handleAccountIntelligence/);
console.log("JARVIS AUTHENTICATED INTELLIGENCE PASS: live read-only runners, provenance, unsafe denial, Access gate, no fake visual");
