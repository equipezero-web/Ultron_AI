import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {isNewsHistoryRefreshIntent} from "../backend/news-context.js";
import {buildWorldNewsRefreshReport} from "../backend/news-refresh-report.js";
const query="J.A.R.V.I.S., atualize as notícias anteriores, compare com os registros armazenados e mostre quais acontecimentos receberam novas fontes ou tiveram suas informações alteradas.";
assert.equal(isNewsHistoryRefreshIntent(query),true);
assert.equal(isNewsHistoryRefreshIntent("Quais são as notícias de hoje?"),false);
assert.equal(isNewsHistoryRefreshIntent("Como posso atualizar o navegador?"),false);
const unavailable=buildWorldNewsRefreshReport({news:true,attempts:[],
 worldEvolution:{available:false,reason:"d1-unavailable"},
 eventCorrelation:{events:[]}});
assert.equal(unavailable.verifiedComparison,false);
assert.match(unavailable.text,/Não é possível afirmar/);
assert.equal(unavailable.sources.length,0);
const noFresh=buildWorldNewsRefreshReport({news:true,
 attempts:[{label:"google-news-rss",ok:true,count:0}],
 worldEvolution:{available:true,created:0,updated:0,unchanged:3},
 eventCorrelation:{events:[]}});
assert.match(noFresh.text,/Isso não significa/);
assert.equal(noFresh.verifiedComparison,false);
const actual=buildWorldNewsRefreshReport({
 news:true,attempts:[{label:"google-news-rss",ok:true,count:1}],
 worldEvolution:{available:true,created:0,updated:1,unchanged:0},
 eventCorrelation:{events:[{
 event_id:"news-event-aabbccdd",title:"Temporal atinge Recife",
 sources:[{source:"Agência PE",url:"https://noticias.example.org/recife",title:"Temporal atinge Recife",publishedAt:"2026-11-25T10:00:00Z"}],
 evolution:{status:"updated",firstSeen:"2026-11-24T11:00:00Z",
 changes:{newSources:1,updatedSources:0},timeline:[]}
 }]}
});
assert.equal(actual.verifiedComparison,true);
assert.match(actual.text,/Novas fontes: 1/);
assert.match(actual.text,/noticias\.example\.org/);
assert.ok(!actual.text.includes("Nenhuma nova fonte foi encontrada"));
assert.deepEqual(actual.sources.map(s=>s.url),["https://noticias.example.org/recife"]);
const unrelated=buildWorldNewsRefreshReport({news:true,attempts:[],
 worldEvolution:{available:false,reason:"no-events"},eventCorrelation:{events:[]},
 webResearch:{sources:[{url:"https://apps.microsoft.com/detail/123",source:"Jarvis Assistant"}]}
});
assert.equal(unrelated.sources.length,0);
assert.doesNotMatch(unrelated.text,/Microsoft|Jarvis Assistant/);
const news=readFileSync(new URL("../backend/news-context.js",import.meta.url),"utf8");
const worker=readFileSync(new URL("../backend/worker.js",import.meta.url),"utf8");
assert.match(news,/isNewsHistoryRefreshIntent\(message\)\?"notícias Brasil hoje":message/);
assert.match(worker,/if\(isNewsHistoryRefreshIntent\(originalBody\?\.message\)\)/);
assert.match(worker,/data\.webResearch=\{/);
assert.match(worker,/data\.text=report\.text/);
console.log("WORLD HISTORICAL NEWS REFRESH PASS: intent routing, source provenance, unavailable D1 honesty, no results honesty, no Jarvis app links");
