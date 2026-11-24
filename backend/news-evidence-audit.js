// Bounded public-news audit snapshots in D1. Separate from operator memories.
// This neither certifies facts nor grants execution permissions.
const SCHEMA=[
 "CREATE TABLE IF NOT EXISTS jarvis_news_evidence_audit ("+
 "id TEXT PRIMARY KEY, event_id TEXT NOT NULL, captured_at TEXT NOT NULL, "+
 "news_json TEXT NOT NULL, verification_status TEXT NOT NULL)",
 "CREATE INDEX IF NOT EXISTS idx_jarvis_news_evidence_audit_captured "+
 "ON jarvis_news_evidence_audit(captured_at DESC)"
];
const iso=now=>new Date(now).toISOString();
export async function recordWorldEvidenceAudit(env,correlation,{now=Date.now(),maxEvents=6}={}){
 if(!env?.ULTRON_DB?.prepare)return {saved:false,reason:"d1-unavailable"};
 if(!correlation||!Array.isArray(correlation.events)||!correlation.events.length)
  return {saved:false,reason:"no-events"};
 const capturedAt=iso(now),bucket=capturedAt.slice(0,13);
 const items=correlation.events.slice(0,Math.max(1,Math.min(8,maxEvents)));
 try{
  for(const sql of SCHEMA)await env.ULTRON_DB.prepare(sql).run();
  let inserted=0;
  for(const event of items){
   if(!/^news-event-[a-f0-9]{8}$/.test(String(event.event_id||"")))continue;
   // Persist public headlines and source provenance, never user prompt,
   // operator identity, IP, device context, or confidential data.
   const safe={
    event_id:event.event_id,title:String(event.title||"").slice(0,250),
    timestamp:event.timestamp||null,
    sources:(Array.isArray(event.sources)?event.sources:[]).slice(0,8)
     .map(s=>({url:String(s.url||"").slice(0,900),domain:String(s.domain||"").slice(0,140),
      title:String(s.title||"").slice(0,220),publishedAt:s.publishedAt||null})),
    verificationStatus:"not-independently-verified",
    evidenceReview:{
     evidenceStatus:event.evidenceReview?.evidenceStatus||"not-reviewed",
     factChecked:false,
     discrepancies:(event.evidenceReview?.discrepancies||[]).slice(0,4)
    }
   };
   const id=bucket+":"+event.event_id;
   const result=await env.ULTRON_DB.prepare(
    "INSERT OR IGNORE INTO jarvis_news_evidence_audit "+
    "(id,event_id,captured_at,news_json,verification_status) VALUES (?,?,?,?,?)"
   ).bind(id,event.event_id,capturedAt,JSON.stringify(safe),"not-independently-verified").run();
   if(Number(result?.meta?.changes)>0)inserted++;
  }
  const cutoff=iso(now-7*86400000);
  await env.ULTRON_DB.prepare("DELETE FROM jarvis_news_evidence_audit WHERE captured_at < ?")
   .bind(cutoff).run();
  return {saved:true,inserted,considered:items.length,retentionDays:7};
 }catch(error){
  return {saved:false,reason:"d1-write-failed",error:String(error?.message||error).slice(0,130)};
 }
}
