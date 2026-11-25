// Autonomous PUBLIC news monitor for the existing Worker cron.
// No private/operator data, external push, voice or microphone activation.
import {loadLiveNewsContext} from "./news-context.js";
import {advanceWorldEventTimeline} from "./news-world-evolution.js";
const SCHEMA=[
 "CREATE TABLE IF NOT EXISTS jarvis_world_news_monitor_runs ("+
 "bucket TEXT PRIMARY KEY,checked_at TEXT NOT NULL,status TEXT NOT NULL,article_count INTEGER NOT NULL)",
 "CREATE TABLE IF NOT EXISTS jarvis_world_news_alerts ("+
 "id TEXT PRIMARY KEY,event_id TEXT NOT NULL,created_at TEXT NOT NULL,alert_json TEXT NOT NULL)",
 "CREATE INDEX IF NOT EXISTS idx_world_news_alerts_created ON jarvis_world_news_alerts(created_at DESC)"
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
 advance=advanceWorldEventTimeline}={}){
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
  const news=await loadNews("notícias Brasil hoje",{limit:6});
  const count=Array.isArray(news?.articles)?news.articles.length:0;
  if(!news?.active||!count||!news.eventCorrelation?.events?.length){
   await db.prepare("UPDATE jarvis_world_news_monitor_runs SET status=?,article_count=? WHERE bucket=?")
    .bind("no-results",count,bucket).run();
   return {ok:false,reason:"no-reliable-news",bucket,articleCount:count};
  }
  const evolution=await advance(env,news.eventCorrelation,{now});
  if(!evolution.summary?.available){
   await db.prepare("UPDATE jarvis_world_news_monitor_runs SET status=? WHERE bucket=?")
    .bind("history-unavailable",bucket).run();
   return {ok:false,reason:"history-unavailable",bucket};
  }
  const alerts=selectWorldNewsAlerts(evolution.correlation.events,{now});
  for(const alert of alerts){
   await db.prepare("INSERT OR IGNORE INTO jarvis_world_news_alerts "+
    "(id,event_id,created_at,alert_json) VALUES(?,?,?,?)")
    .bind(alert.id,alert.event_id,alert.createdAt,JSON.stringify(alert)).run();
  }
  await db.prepare("UPDATE jarvis_world_news_monitor_runs SET status=?,article_count=? WHERE bucket=?")
   .bind("completed",count,bucket).run();
  const cutoff=at(now-7*86400000);
  await db.prepare("DELETE FROM jarvis_world_news_monitor_runs WHERE checked_at < ?").bind(cutoff).run();
  await db.prepare("DELETE FROM jarvis_world_news_alerts WHERE created_at < ?").bind(cutoff).run();
  return {ok:true,bucket,articleCount:count,alerts:alerts.length,
   firstObserved:evolution.summary.created,updated:evolution.summary.updated,intervalMinutes:30};
 }catch(error){
  try{await db.prepare("UPDATE jarvis_world_news_monitor_runs SET status=? WHERE bucket=?")
   .bind("failed",bucket).run();}catch{}
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
  return {ok:true,alerts,latestRun:run?{
   checkedAt:run.checked_at,status:run.status,
   articleCount:run.article_count,bucket:run.bucket
  }:null,monitoring:"public-news-30-minute-cron",
  disclaimer:"Alertas são alterações de fontes não verificadas; sem notificações externas."};
 }catch(error){return {ok:false,alerts:[],reason:"d1-read-failed"};}
}
