// Autonomous PUBLIC news monitor for the existing Worker cron.
// No private/operator data, external push, voice or microphone activation.
import {loadLiveNewsContext} from "./news-context.js";
import {advanceWorldEventTimeline} from "./news-world-evolution.js";
import {collectPublicNewsFallback} from "./news-public-sources.js";
import {correlateNewsEvents} from "./news-event-correlation.js";
import {reviewCorrelatedEvents} from "./news-evidence-review.js";
const SCHEMA=[
 "CREATE TABLE IF NOT EXISTS jarvis_world_news_monitor_runs ("+
 "bucket TEXT PRIMARY KEY,checked_at TEXT NOT NULL,status TEXT NOT NULL,article_count INTEGER NOT NULL)",
 "CREATE TABLE IF NOT EXISTS jarvis_world_news_alerts ("+
 "id TEXT PRIMARY KEY,event_id TEXT NOT NULL,created_at TEXT NOT NULL,alert_json TEXT NOT NULL)",
 "CREATE INDEX IF NOT EXISTS idx_world_news_alerts_created ON jarvis_world_news_alerts(created_at DESC)",
 "CREATE TABLE IF NOT EXISTS jarvis_world_news_monitor_snapshots ("+
 "bucket TEXT PRIMARY KEY,checked_at TEXT NOT NULL,events_json TEXT NOT NULL)",
 "CREATE TABLE IF NOT EXISTS jarvis_world_news_monitor_diagnostics ("+
 "bucket TEXT PRIMARY KEY,diagnostics_json TEXT NOT NULL)"
];
const validEvent=id=>/^news-event-[a-f0-9]{8}$/.test(String(id||""));
const url=value=>{try{const u=new URL(String(value||""));return ["https:","http:"].includes(u.protocol)&&!u.username&&!u.password?u.href:null;}catch{return null;}};
const clean=(value,n=200)=>String(value||"").replace(/\s+/g," ").trim().slice(0,n);
const at=ms=>new Date(ms).toISOString();
const bucketFor=ms=>at(ms).slice(0,14)+(new Date(ms).getUTCMinutes()<30?"00":"30");
async function setup(db){for(const sql of SCHEMA)await db.prepare(sql).run();}
export function selectWorldNewsAlerts(events,{now=Date.now(),limit=6}={}){
 return (Array.isArray(events)?events:[]).filter(event=>
   validEvent(event?.event_id)&&event.evolution?.status==="updated"&&
   (Number(event.evolution?.changes?.newSources)||0)>0||
   validEvent(event?.event_id)&&event.evolution?.status==="updated"&&
   (Number(event.evolution?.changes?.updatedSources)||0)>0||
   validEvent(event?.event_id)&&event.evolution?.status==="updated"&&
   event.evolution?.changes?.possibleDiscrepancyChanged
 ).slice(0,Math.min(8,Math.max(1,limit))).map(event=>{
  const sources=(Array.isArray(event.sources)?event.sources:[]).slice(0,5)
   .map(source=>({name:clean(source.source||source.domain,80),
    url:url(source.url),publishedAt:source.publishedAt||null})).filter(source=>source.url);
  return {
   id:bucketFor(now)+":"+event.event_id,event_id:event.event_id,
   createdAt:at(now),title:clean(event.title,230),
   newSources:Math.min(8,Number(event.evolution?.changes?.newSources)||0),
   updatedSources:Math.min(8,Number(event.evolution?.changes?.updatedSources)||0),
   possibleDiscrepancyChanged:Boolean(event.evolution?.changes?.possibleDiscrepancyChanged),
   sources,verificationStatus:"not-independently-verified",
   caveat:"Mudança detectada em publicações públicas; não constitui checagem factual."
  };
 }).filter(alert=>alert.sources.length);
}
export async function pollWorldNewsMonitor(env,{now=Date.now(),loadNews=loadLiveNewsContext,
 advance=advanceWorldEventTimeline,collectFallback=collectPublicNewsFallback,trigger="scheduled"}={}){
 const db=env?.ULTRON_DB;
 if(!db?.prepare)return {ok:false,reason:"d1-unavailable"};
 if(!Number.isFinite(now))return {ok:false,reason:"invalid-clock"};
 const bucket=bucketFor(now);
 try{
  await setup(db);
  const reservation=await db.prepare(
   "INSERT OR IGNORE INTO jarvis_world_news_monitor_runs "+
   "(bucket,checked_at,status,article_count) VALUES(?,?,?,?)"
  ).bind(bucket,at(now),"running",0).run();
  if(!Number(reservation?.meta?.changes))return {ok:true,skipped:"already-started",bucket};
  const news=await loadNews("notícias Brasil hoje",{limit:6,timeoutMs:6000});
  const attempts=Array.isArray(news?.attempts)?news.attempts.slice(0,12).map(item=>({
   provider:clean(item.label,60),ok:Boolean(item.ok),count:Number(item.count||0),
   error:item.error?clean(item.error,100):null
  })):[];
  let count=Array.isArray(news?.articles)?news.articles.length:0;
  let correlation=news?.eventCorrelation;
  let recovered=false;
  let selectedByProvider=[];
  // Retry via an established, public RSS feed only if the primary
  // GDELT/Google News pipeline yielded no correlatable articles.
  if(!news?.active||!count||!correlation?.events?.length){
   const fallback=await collectFallback({now,limit:8});
   const sourceDiagnostics=Array.isArray(fallback.diagnostics?.providers)?
    fallback.diagnostics.providers:
    [{provider:"agencia-brasil-rss",ok:Boolean(fallback.ok),
      count:fallback.articles?.length||0,error:fallback.diagnostics?.error||null,
      stale:fallback.diagnostics?.stale||0,invalid:fallback.diagnostics?.invalid||0}];
   attempts.push(...sourceDiagnostics.slice(0,4));
   selectedByProvider=Array.isArray(fallback.diagnostics?.selectedByProvider)?fallback.diagnostics.selectedByProvider.slice(0,4):[];
   if(fallback.ok&&Array.isArray(fallback.articles)&&fallback.articles.length){
    correlation=reviewCorrelatedEvents(correlateNewsEvents(fallback.articles));
    count=fallback.articles.length;
    recovered=Boolean(correlation?.events?.length);
   }
  }
  // Provider diagnostics contain public fetch status only, never user data.
  try{await db.prepare(
   "INSERT OR REPLACE INTO jarvis_world_news_monitor_diagnostics (bucket,diagnostics_json) VALUES (?,?)"
  ).bind(bucket,JSON.stringify({providers:attempts.slice(0,14),recovered,
   successfulProviders:attempts.filter(item=>item.ok&&item.count>0).length,
   selectedByProvider,selectedPublisherCount:selectedByProvider.filter(item=>item.count>0).length,
   checkedAt:at(now)})).run();}catch{}
  if(!count||!correlation?.events?.length){
   await db.prepare("UPDATE jarvis_world_news_monitor_runs SET status=?,article_count=? WHERE bucket=?")
    .bind(trigger==="on-demand"?"on-demand-no-results":"no-results",count,bucket).run();
   return {ok:false,reason:"no-reliable-news",bucket,articleCount:count};
  }
  const evolution=await advance(env,correlation,{now});
  if(!evolution.summary?.available){
   await db.prepare("UPDATE jarvis_world_news_monitor_runs SET status=? WHERE bucket=?")
    .bind(trigger==="on-demand"?"on-demand-history-unavailable":"history-unavailable",bucket).run();
   return {ok:false,reason:"history-unavailable",bucket};
  }
  const snapshotEvents=(Array.isArray(evolution.correlation?.events)?evolution.correlation.events:[])
   .filter(e=>validEvent(e?.event_id)).slice(0,80).map(e=>({
    id:e.event_id,title:clean(e.title,200),
    urls:[...new Set((Array.isArray(e.sources)?e.sources:[]).map(s=>url(s.url)).filter(Boolean))].slice(0,10)
   }));
  await db.prepare("INSERT OR REPLACE INTO jarvis_world_news_monitor_snapshots (bucket,checked_at,events_json) VALUES(?,?,?)")
   .bind(bucket,at(now),JSON.stringify(snapshotEvents)).run();
  const alerts=selectWorldNewsAlerts(evolution.correlation.events,{now});
  for(const alert of alerts){
   await db.prepare("INSERT OR IGNORE INTO jarvis_world_news_alerts "+
    "(id,event_id,created_at,alert_json) VALUES(?,?,?,?)")
    .bind(alert.id,alert.event_id,alert.createdAt,JSON.stringify(alert)).run();
  }
  await db.prepare("UPDATE jarvis_world_news_monitor_runs SET status=?,article_count=? WHERE bucket=?")
   .bind(trigger==="on-demand"?
     (recovered?"on-demand-completed-rss-recovery":"on-demand-completed"):
     (recovered?"completed-rss-recovery":"completed"),count,bucket).run();
  const cutoff=at(now-7*86400000);
  await db.prepare("DELETE FROM jarvis_world_news_monitor_runs WHERE checked_at < ?").bind(cutoff).run();
  await db.prepare("DELETE FROM jarvis_world_news_alerts WHERE created_at < ?").bind(cutoff).run();
  await db.prepare("DELETE FROM jarvis_world_news_monitor_diagnostics WHERE bucket < ?").bind(bucketFor(now-7*86400000)).run();
  await db.prepare("DELETE FROM jarvis_world_news_monitor_snapshots WHERE checked_at < ?").bind(cutoff).run();
  return {ok:true,bucket,articleCount:count,recovered,alerts:alerts.length,
   firstObserved:evolution.summary.created,updated:evolution.summary.updated,intervalMinutes:30};
 }catch(error){
  try{await db.prepare("UPDATE jarvis_world_news_monitor_runs SET status=? WHERE bucket=?")
   .bind(trigger==="on-demand"?"on-demand-failed":"failed",bucket).run();}catch{}
  return {ok:false,bucket,reason:"monitor-failed",error:clean(error?.message||error,140)};
 }
}
export async function latestWorldNewsAlerts(env,{limit=8}={}){
 const db=env?.ULTRON_DB;
 if(!db?.prepare)return {ok:false,reason:"d1-unavailable",alerts:[]};
 try{
  await setup(db);
  const [run,rows]=await Promise.all([
   db.prepare("SELECT bucket,checked_at,status,article_count FROM jarvis_world_news_monitor_runs "+
    "ORDER BY checked_at DESC LIMIT 1").first(),
   db.prepare("SELECT alert_json FROM jarvis_world_news_alerts ORDER BY created_at DESC LIMIT ?")
    .bind(Math.max(1,Math.min(12,limit))).all()
  ]);
  const alerts=(Array.isArray(rows?.results)?rows.results:[]).flatMap(row=>{
   try{
    const parsed=JSON.parse(row.alert_json);
    return validEvent(parsed.event_id)?[parsed]:[];
   }catch{return [];}
  });
  let diagnostics=null;
  if(run?.bucket){
   try{
    const row=await db.prepare(
      "SELECT diagnostics_json FROM jarvis_world_news_monitor_diagnostics WHERE bucket = ? LIMIT 1"
    ).bind(run.bucket).first();
    diagnostics=row?.diagnostics_json?JSON.parse(row.diagnostics_json):null;
   }catch{}
  }
  return {ok:true,alerts,scheduledRunObserved:Boolean(run&&!String(run.status).startsWith("on-demand-")),latestRun:run?{
   diagnostics,checkedAt:run.checked_at,status:run.status,
   articleCount:run.article_count,bucket:run.bucket
  }:null,monitoring:"public-news-30-minute-cron",
  disclaimer:"Alertas são alterações de fontes não verificadas; sem notificações externas."};
 }catch(error){return {ok:false,alerts:[],reason:"d1-read-failed"};}
}


// Compare exactly two completed, persisted observation windows. Earlier runs cannot
// be reconstructed from an event's latest D1 state and must not be fabricated.
export async function readWorldNewsBatchComparison(env){
 const db=env?.ULTRON_DB;
 if(!db?.prepare)return {ok:false,reason:"d1-unavailable"};
 try{
  await setup(db);
  const result=await db.prepare(
   "SELECT s.bucket,s.checked_at,s.events_json FROM jarvis_world_news_monitor_snapshots s "+
   "JOIN jarvis_world_news_monitor_runs r ON r.bucket=s.bucket "+
   "WHERE r.status IN ('completed','completed-rss-recovery','on-demand-completed','on-demand-completed-rss-recovery') "+
   "ORDER BY s.checked_at DESC LIMIT 2"
  ).all();
  const rows=Array.isArray(result?.results)?result.results:[];
  if(rows.length<2)return {ok:true,ready:false,available:rows.length};
  const parse=row=>{
   const events=JSON.parse(row.events_json);
   if(!Array.isArray(events))throw Error("invalid-snapshot");
   return {checkedAt:row.checked_at,count:events.length,events:events.filter(e=>validEvent(e?.id))};
  };
  const current=parse(rows[0]),previous=parse(rows[1]);
  const before=new Map(previous.events.map(e=>[e.id,e]));
  const after=new Map(current.events.map(e=>[e.id,e]));
  const summarize=e=>({eventId:e.id,title:clean(e.title,180),urls:e.urls||[]});
  const added=current.events.filter(e=>!before.has(e.id)).map(summarize);
  const retained=current.events.filter(e=>before.has(e.id)).map(summarize);
  const missing=previous.events.filter(e=>!after.has(e.id)).map(summarize);
  const sourceChanges=current.events.filter(e=>before.has(e.id)).flatMap(e=>{
   const oldUrls=new Set(before.get(e.id).urls||[]);
   const addedUrls=(e.urls||[]).filter(u=>!oldUrls.has(u));
   return addedUrls.length?[{...summarize(e),addedUrls}]:[];
  });
  return {ok:true,ready:true,current:{checkedAt:current.checkedAt,count:current.count},
   previous:{checkedAt:previous.checkedAt,count:previous.count},
   added,retained,missing,sourceChanges,scope:"two-persisted-monitor-batches"};
 }catch{return {ok:false,reason:"d1-batch-comparison-failed"};}
}

// Read-only historical event snapshots. The last-seen time is a recorded observation,
// not proof that the whole world was unchanged between cron windows.
export async function readWorldNewsHistory(env,{limit=6}={}){
 const db=env?.ULTRON_DB;
 if(!db?.prepare)return {ok:false,reason:"d1-unavailable",events:[]};
 try{
  const records=await db.prepare(
   "SELECT event_id,first_seen,last_seen,event_json FROM jarvis_world_event_state "+
   "ORDER BY last_seen DESC LIMIT ?"
  ).bind(Math.max(1,Math.min(12,limit))).all();
  const events=(Array.isArray(records?.results)?records.results:[]).flatMap(row=>{
   try{
    const entry=JSON.parse(row.event_json);
    if(!validEvent(row.event_id))return [];
    const timeline=(Array.isArray(entry.timeline)?entry.timeline:[]).slice(-6).map(t=>({
     observedAt:t.observedAt||null,kind:t.kind==="source-update"?"source-update":"first-observed",
     newSources:Array.isArray(t.addedSources)?t.addedSources.length:0,
     updatedSources:Array.isArray(t.updatedSources)?t.updatedSources.length:0,
     sourceUrls:[...(Array.isArray(t.addedSources)?t.addedSources:[]),
       ...(Array.isArray(t.updatedSources)?t.updatedSources:[])].slice(0,5).map(url).filter(Boolean)
    }));
    const sources=(Array.isArray(entry.data?.sources)?entry.data.sources:[]).slice(0,4)
     .map(item=>({url:url(item.url),publishedAt:item.publishedAt||null})).filter(item=>item.url);
    return [{eventId:row.event_id,title:clean(entry.title||entry.data?.title,200),
     firstSeen:row.first_seen,lastSeen:row.last_seen,timeline,sources}];
   }catch{return [];}
  });
  return {ok:true,events,scope:"recent-observed-events",
   disclaimer:"Somente eventos preservados no D1, não uma comparação exaustiva de notícias."};
 }catch{return {ok:false,reason:"d1-history-read-failed",events:[]};}
}

// Commands about monitored updates are NOT generic news searches.
export function isWorldNewsMonitorStatusIntent(message){
 const value=String(message||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
 return /\b(monitorad[ao]s?|monitoramento|monitor|coletas?|agendador|alertas?)\b/.test(value)&&
  /\b(noticias?|acontecimentos?|inteligencia mundial|novas fontes|ultima coleta|atualizacoes?)\b/.test(value)&&
  /\b(apresente|mostre|informe|liste|consult|verific|qual|quando|status|estado|houve|tem|existem)\w*\b/.test(value);
}

// A read can establish an initial D1 baseline when the cron never ran.
// It is explicitly marked ON-DEMAND, not presented as a successful cron run.
export async function readWorldNewsMonitorWithBootstrap(env,{now=Date.now(),startIfEmpty=true,poll=pollWorldNewsMonitor}={}){
 let report=await latestWorldNewsAlerts(env);
 if(!report.ok||report.latestRun||!startIfEmpty)return report;
 const bootstrap=await poll(env,{now,trigger:"on-demand"});
 report=await latestWorldNewsAlerts(env);
 return {...report,bootstrap:bootstrap.ok?
   {attempted:true,ok:true,status:bootstrap.skipped||"completed"}:
   {attempted:true,ok:false,reason:bootstrap.reason||"failed"},
  scheduledRunObserved:Boolean(report.scheduledRunObserved)};
}
export function buildWorldNewsMonitorStatusReply(report,{now=Date.now()}={}){
 if(!report?.ok)return "Não foi possível consultar o monitor mundial no D1. "+
  "Não tenho uma hora de coleta confirmada e não posso afirmar que houve novas fontes.";
 const run=report.latestRun;
 const lines=["J.A.R.V.I.S. // MONITOR MUNDIAL DE NOTÍCIAS"];
 if(!run){
  lines.push("Última coleta: nenhuma execução registrada no D1.");
 }else{
  lines.push("Última coleta registrada: "+run.checkedAt+
   ". Situação: "+run.status+". Artigos encontrados: "+Number(run.articleCount||0)+".");
  if(run.diagnostics?.providers?.length){
   lines.push("Diagnóstico das fontes: "+
    run.diagnostics.providers.map(p=>clean(p.provider,45)+": "+Number(p.count||0)+
     " artigo(s)"+(p.error?" (erro: "+clean(p.error,85)+")":"")).join("; ")+".");
  }
  if(!report.scheduledRunObserved){
   lines.push("Execução agendada: ainda não confirmada. "+
    "Este registro pode ter sido criado por uma consulta inicial sob demanda.");
  }
  const age=now-Date.parse(run.checkedAt);
  if(Number.isFinite(age)&&age>75*60000)
   lines.push("A última coleta registrada está atrasada; verifique o Cron Trigger do Cloudflare Worker.");
 }
 if(report.bootstrap?.attempted)
  lines.push("Inicialização sob demanda: "+(report.bootstrap.ok?"solicitada e registrada":"falhou")+
   (report.bootstrap.reason?"; motivo: "+report.bootstrap.reason:"")+".");
 const alerts=Array.isArray(report.alerts)?report.alerts.slice(0,6):[];
 if(!alerts.length)lines.push("Alertas de novas fontes: nenhum alerta registrado no D1 até esta consulta. "+
  "Isso não comprova ausência de mudanças no noticiário.");
 for(const item of alerts){
  const sources=(Array.isArray(item.sources)?item.sources:[]).slice(0,3)
   .map(s=>url(s.url)).filter(Boolean);
  lines.push(clean(item.title,200)+" — novas fontes: "+Number(item.newSources||0)+
   "; fontes alteradas: "+Number(item.updatedSources||0)+
   "; observado em: "+String(item.createdAt||"sem data")+
   ". Fontes: "+(sources.join(" ; ")||"sem links disponíveis")+".");
 }
 lines.push("Aviso: o sistema acompanha mudanças nas publicações, sem verificação factual independente.");
 return lines.join("\n\n");
}
