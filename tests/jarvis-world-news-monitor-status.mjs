import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
 isWorldNewsMonitorStatusIntent,buildWorldNewsMonitorStatusReply,
 readWorldNewsMonitorWithBootstrap
} from "../backend/world-news-monitor.js";
const query="J.A.R.V.I.S., apresente as atualizações monitoradas da Inteligência Mundial, informe quando ocorreu a última coleta e mostre os acontecimentos que receberam novas fontes.";
assert.equal(isWorldNewsMonitorStatusIntent(query),true);
assert.equal(isWorldNewsMonitorStatusIntent("Mostre as últimas notícias do Brasil"),false);
assert.equal(isWorldNewsMonitorStatusIntent("Consulte o estado dos alertas de notícias"),true);
const noRun={ok:true,alerts:[],latestRun:null,scheduledRunObserved:false};
assert.match(buildWorldNewsMonitorStatusReply(noRun),/nenhuma execução registrada/);
assert.doesNotMatch(buildWorldNewsMonitorStatusReply(noRun),/Principais acontecimentos das fontes consultadas/);
const pending={
 ok:true,alerts:[],scheduledRunObserved:false,
 latestRun:{checkedAt:"2026-11-25T10:00:00.000Z",status:"on-demand-no-results",articleCount:0}
};
assert.match(buildWorldNewsMonitorStatusReply(pending,{now:Date.parse("2026-11-25T10:10:00Z")}),/ainda não confirmada/);
assert.match(buildWorldNewsMonitorStatusReply(pending),/nenhum alerta registrado/);
const withAlerts={ok:true,alerts:[{title:"Chuva forte em Recife",createdAt:"2026-11-25T12:00:00Z",
 newSources:2,updatedSources:1,sources:[{url:"https://example.org/a"},{url:"javascript:alert(1)"}]}],
 scheduledRunObserved:true,latestRun:{checkedAt:"2026-11-25T12:00:00Z",status:"completed",articleCount:5}};
const response=buildWorldNewsMonitorStatusReply(withAlerts,{now:Date.parse("2026-11-25T12:05:00Z")});
assert.match(response,/novas fontes: 2/);
assert.match(response,/https:\/\/example.org\/a/);
assert.doesNotMatch(response,/javascript:/);
let current=null;let calls=0;
const mock={
 ULTRON_DB:{prepare(sql){
  return {
   bind(){return this;},
   async run(){return {meta:{changes:1}};},
   async first(){return current;},
   async all(){return {results:[]};}
  };
 }}
};
const bootstrap=await readWorldNewsMonitorWithBootstrap(mock,{
 now:Date.parse("2026-11-25T12:05:00Z"),
 poll:async(_,options)=>{
  calls++;
  assert.equal(options.trigger,"on-demand");
  current={bucket:"2026-11-25T12:00",checked_at:"2026-11-25T12:05:00Z",
   status:"on-demand-completed",article_count:4};
  return {ok:true,bucket:current.bucket};
 }
});
assert.equal(calls,1);
assert.equal(bootstrap.latestRun.status,"on-demand-completed");
assert.equal(bootstrap.scheduledRunObserved,false);
assert.equal(bootstrap.bootstrap.ok,true);
await readWorldNewsMonitorWithBootstrap(mock,{poll:async()=>{calls++}});
assert.equal(calls,1,"existing baseline does not restart polling");
const worker=readFileSync(new URL("../backend/worker.js",import.meta.url),"utf8");
assert.match(worker,/if\(isWorldNewsMonitorStatusIntent\(originalBody\?\.message\)\|\|newsMonitorQueryMode\(originalBody\?\.message\)==="history"\)/);
assert.match(worker,/formatNewsMonitorReply\(report,\{mode:newsMonitorQueryMode\(originalBody\?\.message\)\}\)/);
assert.match(worker,/readWorldNewsMonitorWithBootstrap\(env\)/);
console.log("WORLD NEWS MONITOR STATUS PASS: intent routing, null-run bootstrap, explicit cron uncertainty, safe source URLs and no invented alerts");
