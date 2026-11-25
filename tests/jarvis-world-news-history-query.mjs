import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {newsMonitorQueryMode,formatNewsMonitorReply} from "../backend/news-monitor-response.js";
import {directPlan} from "../modules/jarvis-action-engine.js";
import {readWorldNewsHistory} from "../backend/world-news-monitor.js";
const query="J.A.R.V.I.S., compare os acontecimentos da última coleta com os registros anteriores e informe quais receberam novas fontes, quais foram atualizados e quais permaneceram sem alterações.";
assert.equal(newsMonitorQueryMode(query),"history");
assert.deepEqual(directPlan(query)?.steps,[{action:"news.monitor.status",args:{mode:"history"}}]);
assert.equal(newsMonitorQueryMode("JARVIS, consulte os alertas de notícias"),"alerts");
const record={title:"Comissão debate política nacional de proteção às mães atípicas e cuidadores familiares",
 event_id:"news-event-b8209428",
 data:{sources:[{url:"https://www.camara.leg.br/noticias/1322723-comissao-debate-politica-nacional-de-protecao-as-maes-atipicas-e-cuidadores-familiares-participe",
  publishedAt:"2026-11-25T14:53:00.000Z"}]},
 timeline:[{kind:"first-observed",observedAt:"2026-11-25T15:30:00Z",addedSources:["https://www.camara.leg.br/noticias/1322723"]},
 {kind:"source-update",observedAt:"2026-11-25T16:00:29.683Z",addedSources:["https://www.camara.leg.br/noticias/1322723-comissao-debate-politica-nacional-de-protecao-as-maes-atipicas-e-cuidadores-familiares-participe"],updatedSources:[]}]
};
const env={ULTRON_DB:{prepare(sql){
 assert.match(sql,/SELECT event_id,first_seen,last_seen,event_json/);
 return {bind(limit){assert.equal(limit,6);return this;},
 async all(){return {results:[{event_id:"news-event-b8209428",
 first_seen:"2026-11-25T15:30:00Z",last_seen:"2026-11-25T16:00:29.683Z",event_json:JSON.stringify(record)}]}}};
}}};
const history=await readWorldNewsHistory(env);
assert.equal(history.ok,true);assert.equal(history.events.length,1);
assert.equal(history.events[0].timeline[1].newSources,1);
const report={ok:true,alerts:[],latestRun:{checkedAt:"2026-11-25T16:00:29.683Z",status:"completed-rss-recovery",articleCount:8},history};
const reply=formatNewsMonitorReply(report,{mode:"history"});
assert.match(reply,/HISTÓRICO DOS ACONTECIMENTOS/);
assert.match(reply,/Atualização registrada em 2026-11-25T16:00:29.683Z/);
assert.match(reply,/novas fontes: 1/);
assert.match(reply,/https:\/\/www.camara.leg.br\/noticias/);
assert.doesNotMatch(reply,/Alertas registrados: 0/);
assert.match(formatNewsMonitorReply({...report,history:{ok:false}},{mode:"history"}),/Não foi possível consultar/);
const worker=readFileSync(new URL("../backend/worker.js",import.meta.url),"utf8");
assert.match(worker,/if\(mode==="history"\)report.history=await readWorldNewsHistory\(env\)/);
assert.match(worker,/url.searchParams.get\("history"\)==="1"/);
console.log("WORLD NEWS HISTORY QUERY PASS: exact user Test B, real D1 timeline, source links, uncertainty and no generic overview");
