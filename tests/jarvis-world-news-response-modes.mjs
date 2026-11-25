import assert from "node:assert/strict";
import {newsMonitorQueryMode,formatNewsMonitorReply} from "../backend/news-monitor-response.js";
const request1="J.A.R.V.I.S., consulte o Monitor Mundial de Notícias e informe a data, o horário, a situação da última coleta e a quantidade de artigos encontrados.";
const request2="J.A.R.V.I.S., consulte os alertas de notícias e informe quais acontecimentos receberam novas fontes, mostrando seus links e horários.";
const request4="J.A.R.V.I.S., consulte o monitoramento de notícias e informe o diagnóstico das fontes utilizadas na última coleta.";
assert.equal(newsMonitorQueryMode(request1),"overview");
assert.equal(newsMonitorQueryMode(request2),"alerts");
assert.equal(newsMonitorQueryMode(request4),"diagnostics");
const report={ok:true,scheduledRunObserved:true,alerts:[],latestRun:{
 checkedAt:"2026-11-25T11:30:29.499Z",status:"completed-rss-recovery",articleCount:8,
 diagnostics:{providers:[
 {provider:"google-news-rss",ok:false,count:0,error:"timeout"},
 {provider:"agencia-brasil-rss",ok:true,count:8,error:null}
 ],recovered:true}}};
const first=formatNewsMonitorReply(report);
assert.match(first,/Artigos: 8/);
const second=formatNewsMonitorReply(report,{mode:"alerts"});
assert.match(second,/ALERTAS E NOVAS FONTES/);
assert.match(second,/Nenhum alerta registrado/);
assert.doesNotMatch(second,/Google|timeout/);
const fourth=formatNewsMonitorReply(report,{mode:"diagnostics"});
assert.match(fourth,/DIAGNÓSTICO DE COLETA/);
assert.match(fourth,/google-news-rss.*timeout/);
assert.match(fourth,/agencia-brasil-rss.*8/);
assert.match(fourth,/Recuperação alternativa: utilizada/);
assert.doesNotMatch(first,/DIAGNÓSTICO DE COLETA/);
assert.doesNotMatch(second,/DIAGNÓSTICO DE COLETA/);
const sourceReport={...report,alerts:[{
 title:"Alterações no orçamento",newSources:1,updatedSources:0,
 createdAt:"2026-11-25T12:00:00Z",sources:[
  {url:"https://agenciabrasil.ebc.com.br/noticia"},
  {url:"javascript:alert(1)"}
 ]}]};
const linked=formatNewsMonitorReply(sourceReport,{mode:"alerts"});
assert.match(linked,/https:\/\/agenciabrasil.ebc.com.br\/noticia/);
assert.doesNotMatch(linked,/javascript:/);
assert.match(formatNewsMonitorReply({ok:false},{mode:"diagnostics"}),/Não foi possível/);
console.log("MONITOR RESPONSE MODES PASS: separate status, alerts, provider diagnostics, verified URLs and unknown D1 state");
