// Time-bounded, PUBLIC-news continuity in D1. A match means "likely same
// event", not verification of a reported fact. Never persist operator context.
const clean=(value,max=350)=>String(value??"").replace(/\s+/g," ").trim().slice(0,max);
const STOP=new Set("a o os as de da do dos das e em no na nos nas um uma para por com que ao aos apos sobre hoje agora noticia noticias brasil mundo nesta neste segundo".split(" "));
const normalize=value=>clean(value,500).normalize("NFD").replace(/[\u0300-\u036f]/g,"")
 .toLowerCase().replace(/\b\d{1,8}\b/g," ").replace(/[^a-z ]/g," ").split(/\s+/)
 .filter(word=>word.length>=3&&!STOP.has(word));
const signature=title=>[...new Set(normalize(title))].sort();
const overlap=(left,right)=>{
 const a=new Set(left),b=new Set(right);
 if(a.size<4||b.size<4)return 0;
 const matches=[...a].filter(word=>b.has(word)).length;
 return matches/Math.max(a.size,b.size,1);
};
const validId=id=>/^news-event-[0-9a-f]{8}$/.test(String(id||""));
const safeUrl=value=>{
 try{const u=new URL(String(value||""));if(!["https:","http:"].includes(u.protocol)||u.username||u.password)return null;
 u.hash="";for(const key of [...u.searchParams.keys()])if(/^utm_|^(fbclid|gclid|igshid)$/i.test(key))u.searchParams.delete(key);
 return u.href.replace(/\/$/,"").toLowerCase();
 }catch{return null;}
};
const urls=event=>[...new Set((Array.isArray(event?.sources)?event.sources:[])
 .slice(0,8).map(s=>safeUrl(s.url)).filter(Boolean))];
const safeDate=now=>new Date(now).toISOString();
const maxEvents=6;
const SQL=[
 "CREATE TABLE IF NOT EXISTS jarvis_world_event_state ("+
 "event_id TEXT PRIMARY KEY,first_seen TEXT NOT NULL,last_seen TEXT NOT NULL,"+
 "event_json TEXT NOT NULL)",
 "CREATE INDEX IF NOT EXISTS idx_jarvis_world_event_state_last_seen "+
 "ON jarvis_world_event_state(last_seen DESC)"
];
const summaryEntry=event=>({
 title:clean(event.title,220),
 publishedAt:event.timestamp||null,
 sources:(Array.isArray(event.sources)?event.sources:[]).slice(0,8).map(s=>({
  url:safeUrl(s.url),title:clean(s.title,220),publishedAt:s.publishedAt||null
 })).filter(s=>s.url),
 potentialDiscrepancies:(event.evidenceReview?.discrepancies||[]).length,
});
const links=entry=>new Map((entry.sources||[]).map(s=>[safeUrl(s.url),s]).filter(([url])=>url));
function compareSnapshots(previous,current){
 const before=links(previous),after=links(current);
 const addedSources=[...after.keys()].filter(url=>!before.has(url));
 const updatedSources=[...after.keys()].filter(url=>{
  if(!before.has(url))return false;
  const a=before.get(url),b=after.get(url);
  return a.title!==b.title||a.publishedAt!==b.publishedAt;
 });
 // Any differing numbers must remain unverified, even if reported later.
 const differenceChanged=previous.potentialDiscrepancies!==current.potentialDiscrepancies;
 const descriptionChanged=previous.title!==current.title;
 return {addedSources:addedSources.slice(0,8),updatedSources:updatedSources.slice(0,8),
  possibleDiscrepancyChanged:differenceChanged,titleChanged:descriptionChanged,
  hasChange:Boolean(addedSources.length||updatedSources.length||differenceChanged||descriptionChanged)};
}
export function matchWorldEvent(event,previousEvents,{now=Date.now(),maxAgeDays=7,usedIds=[]}={}){
 const ownUrls=new Set(urls(event));
 const words=signature(event.title);
 let best=null,score=0;
 for(const record of Array.isArray(previousEvents)?previousEvents:[]){
  if(!validId(record?.event_id)||usedIds.includes(record.event_id))continue;
  const seen=Date.parse(record.last_seen||"");
  if(!Number.isFinite(seen)||seen>now+3600000||now-seen>Math.min(7,Math.max(1,maxAgeDays))*86400000)continue;
  const previousUrls=new Set(record.sourceUrls||[]);
  const repeated=[...ownUrls].some(url=>previousUrls.has(url));
  const titleOverlap=overlap(words,record.titleWords||[]);
  // A common URL is strong evidence of continuity; headlines with no URL
  // intersection require near-identical *specific* text, not generic terms.
  const matchScore=repeated?2:titleOverlap>=0.85?titleOverlap:0;
  if(matchScore>score){score=matchScore;best=record;}
 }
 return best;
}
function serialize(event,id,seenAt,old,change){
 const current=summaryEntry(event);
 const previous=old?.data||null;
 const timeline=Array.isArray(old?.timeline)?old.timeline.slice(-7):[];
 if(!previous||change.hasChange){
  timeline.push({
   observedAt:seenAt,
   kind:!previous?"first-observed":"source-update",
   title:current.title,
   addedSources:change.addedSources,
   updatedSources:change.updatedSources,
   possibleDiscrepancyChanged:change.possibleDiscrepancyChanged
  });
 }
 return {
  event_id:id,title:current.title,titleWords:signature(current.title),
  sourceUrls:[...new Set([...(old?.sourceUrls||[]),...urls(event)])].slice(-24),
  firstSeen:old?.firstSeen||seenAt,lastSeen:seenAt,
  data:current,timeline:timeline.slice(-8),
  verificationStatus:"not-independently-verified"
 };
}
export async function advanceWorldEventTimeline(env,correlation,{now=Date.now()}={}){
 if(!correlation||!Array.isArray(correlation.events)||!correlation.events.length)
  return {correlation,summary:{available:false,reason:"no-events"}};
 if(!env?.ULTRON_DB?.prepare)return {correlation,summary:{available:false,reason:"d1-unavailable"}};
 const observedAt=safeDate(now),cutoff=safeDate(now-7*86400000);
 try{
  for(const sql of SQL)await env.ULTRON_DB.prepare(sql).run();
  const rows=await env.ULTRON_DB.prepare(
   "SELECT event_id,first_seen,last_seen,event_json FROM jarvis_world_event_state "+
   "WHERE last_seen >= ? ORDER BY last_seen DESC LIMIT 80"
  ).bind(cutoff).all();
  const previous=(Array.isArray(rows?.results)?rows.results:[]).flatMap(row=>{
   try{
    const data=JSON.parse(row.event_json);
    return validId(row.event_id)?[{...data,event_id:row.event_id,last_seen:row.last_seen}]:[];
   }catch{return [];}
  });
  const usedIds=[],events=[];let created=0,updated=0,unchanged=0;
  for(const event of correlation.events.slice(0,maxEvents)){
   if(!validId(event.event_id)){events.push(event);continue;}
   const existing=matchWorldEvent(event,previous,{now,usedIds});
   const id=existing?.event_id||event.event_id;
   // Do not silently merge two distinct items from the same batch into one
   // historical record. Preserve their separately correlated results.
   if(usedIds.includes(id)){events.push(event);continue;}
   usedIds.push(id);
   const current=summaryEntry(event);
   const changes=compareSnapshots(existing?.data||{sources:[],title:null,potentialDiscrepancies:0},current);
   const stored=serialize(event,id,observedAt,existing,changes);
   const evolution={
    event_id:id,firstSeen:stored.firstSeen,lastSeen:observedAt,
    status:!existing?"first-observed":changes.hasChange?"updated":"unchanged",
    changes:{newSources:changes.addedSources.length,updatedSources:changes.updatedSources.length,
      possibleDiscrepancyChanged:changes.possibleDiscrepancyChanged},
    timeline:stored.timeline.slice(-6).map(t=>({
      observedAt:t.observedAt,kind:t.kind,title:t.title,
      newSources:t.addedSources.length,updatedSources:t.updatedSources.length,
      possibleDiscrepancyChanged:t.possibleDiscrepancyChanged
    })),
    limitations:"Mudanças entre coletas de publicações; não confirma fatos nem distingue, sozinho, correções de atualizações."
   };
   await env.ULTRON_DB.prepare(
    "INSERT INTO jarvis_world_event_state(event_id,first_seen,last_seen,event_json) VALUES(?,?,?,?) "+
    "ON CONFLICT(event_id) DO UPDATE SET last_seen=excluded.last_seen,event_json=excluded.event_json"
   ).bind(id,stored.firstSeen,observedAt,JSON.stringify(stored)).run();
   if(!existing)created++;else if(changes.hasChange)updated++;else unchanged++;
   events.push({...event,event_id:id,evolution});
   // Include newly encountered events as candidates within the same run
   // only if they have NOT already been assigned to a different story.
  }
  await env.ULTRON_DB.prepare("DELETE FROM jarvis_world_event_state WHERE last_seen < ?")
   .bind(cutoff).run();
  return {correlation:{...correlation,events:[
   ...events,...correlation.events.slice(maxEvents)
  ]},summary:{available:true,created,updated,unchanged,processed:events.length,retentionDays:7}};
 }catch(error){
  return {correlation,summary:{available:false,reason:"d1-failed",
   error:clean(error?.message||error,120)}};
 }
}
