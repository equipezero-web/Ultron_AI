import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {correlateNewsEvents} from "../backend/news-event-correlation.js";
const base="2026-11-24T14:00:00Z";
const items=[
 {title:"Temporal provoca alagamentos no centro de Recife nesta terça",description:"Ruas alagadas na região central",url:"https://example.com/recife-temporal?utm_source=x",source:"Agência A",publishedAt:base},
 {title:"Temporal provoca alagamentos no centro de Recife nesta terça",description:"Trânsito lento",url:"https://other.org/recife-alagamentos",source:"Agência B",publishedAt:"2026-11-24T14:20:00Z"},
 {title:"Temporal provoca alagamentos no centro de Recife nesta terça",description:"Ruas alagadas",url:"https://example.com/recife-temporal?utm_source=y",source:"Agência A",publishedAt:base},
 {title:"Congresso discute reforma da tributação no orçamento anual",description:"Sessão",url:"https://news.example.net/tributacao",source:"Agência C",publishedAt:base},
 {title:"Temporal provoca alagamentos no centro de Recife nesta terça",description:"Ocorrência antiga",url:"https://another.com/historico",source:"Agência D",publishedAt:"2026-11-19T14:20:00Z"},
 {title:"Clique aqui",url:"javascript:alert(1)",publishedAt:base}
];
const result=correlateNewsEvents(items);
assert.equal(result.metrics.duplicateUrls,1);
assert.equal(result.metrics.groupedEvents,3);
const grouped=result.events.find(e=>e.sourceCount===2);
assert.ok(grouped);
assert.equal(grouped.independentDomains,2);
assert.equal(grouped.sources.length,2);
assert.equal(grouped.verificationStatus,"not-independently-verified");
assert.equal(grouped.divergenceStatus,"review-needed");
assert.ok(grouped.sources.every(s=>s.url.startsWith("https://")));
assert.equal(correlateNewsEvents(items).events.find(e=>e.sourceCount===2).event_id,grouped.event_id);
assert.equal(correlateNewsEvents([]).events.length,0);
assert.equal(correlateNewsEvents([{title:"Sem data ainda",url:"https://site.com/article"}]).events.length,0);
const context=readFileSync(new URL("../backend/news-context.js",import.meta.url),"utf8");
const worker=readFileSync(new URL("../backend/worker.js",import.meta.url),"utf8");
assert.match(context,/correlateNewsEvents\(articles\)/);
assert.match(context,/eventCorrelation:correlation/);
assert.match(context,/CORRELAÇÃO CONSERVADORA DE NOTÍCIAS/);
assert.match(worker,/eventCorrelation: newsState\.eventCorrelation \|\| null/);
console.log("WORLD CORRELATION PASS: source grouping, distinct events, URL de-duplication, provenance, no false verification");
