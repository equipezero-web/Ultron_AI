import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createNewsEvidenceViewModel} from "../modules/jarvis-news-evidence-view-model.js";
const now="2026-11-24T15:00:00Z";
const payload={news:true,eventCorrelation:{events:[{
 event_id:"news-event-deadbeef",title:"Temporal deixa 12 desabrigados em Recife",
 summary:"Descrição publicada pela primeira fonte",timestamp:now,
 sources:[
  {title:"Temporal deixa 12 desabrigados em Recife",source:"Agência A",domain:"agencia-a.br",url:"https://agencia-a.br/a",publishedAt:now},
  {title:"Temporal deixa 20 desabrigados em Recife",source:"Agência B",domain:"agencia-b.br",url:"https://agencia-b.br/b",publishedAt:now},
  {title:"Link inválido",url:"javascript:alert(1)",domain:"invalid",publishedAt:now}
 ],evidenceReview:{discrepancies:[{label:"desabrigados",sources:[
  {domain:"agencia-a.br",url:"https://agencia-a.br/a",value:12},
  {domain:"agencia-b.br",url:"https://agencia-b.br/b",value:20}
 ]}]}
}]}};
const rows=createNewsEvidenceViewModel(payload);
assert.equal(rows.length,1);
assert.equal(rows[0].sources.length,2);
assert.equal(rows[0].discrepancies.length,1);
assert.equal(rows[0].verified,false);
assert.match(rows[0].status,/Possível divergência/);
assert.match(rows[0].caveat,/não passaram por verificação factual/);
assert.equal(createNewsEvidenceViewModel({news:true,eventCorrelation:{events:[]}}).length,0);
assert.equal(createNewsEvidenceViewModel({news:false,eventCorrelation:payload.eventCorrelation}).length,0);
const injected={...payload,eventCorrelation:{events:[{...payload.eventCorrelation.events[0],title:"<img src=x onerror=alert(1)>"}]}};
assert.equal(createNewsEvidenceViewModel(injected)[0].title,"<img src=x onerror=alert(1)>");
const answer=readFileSync(new URL("../modules/ultron-neural-answer.js",import.meta.url),"utf8");
const script=readFileSync(new URL("../script.js",import.meta.url),"utf8");
const css=readFileSync(new URL("../modules/ultron-neural-answer.css",import.meta.url),"utf8");
assert.match(answer,/createNewsEvidenceViewModel\(liveData\)/);
assert.match(answer,/document\.createElement\('details'\)/);
assert.match(answer,/summary\.textContent=item\.title/);
assert.match(answer,/link\.rel='noopener noreferrer'/);
assert.match(answer,/renderEvidencePanel\(liveData\)/);
assert.match(answer,/liveData:event\.detail\?\.liveData/);
assert.match(script,/liveData:data\.liveData\|\|null/);
assert.match(css,/ultron-evidence-event>summary:focus-visible/);
console.log("NEURAL NEWS EVIDENCE PASS: 1 ring, drill-down, safe links, verified labels, bounded sources");
