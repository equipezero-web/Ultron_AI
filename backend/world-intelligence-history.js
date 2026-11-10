/**
 * Portable 24h intelligence archive. No browser, Node or external dependencies.
 * Every event must have a source URL and a real publication timestamp.
 * Background collectors store observations; waking never starts a collector.
 */
const HOUR=60*60*1000;
export const HISTORY_WINDOW_MS=24*HOUR;
const MAX_EVENTS=360;
const MAX_CHECKS=110;

function date(value){
  const ms=Date.parse(String(value||""));
  return Number.isFinite(ms)?ms:null;
}
function clean(value,max=220){
  return String(value??"").replace(/\s+/g," ").trim().slice(0,max);
}
function safeUrl(value){
  try{
    const u=new URL(value);
    if(!["https:","http:"].includes(u.protocol))return null;
    // Same story with different campaign parameters should be one observation.
    for(const key of [...u.searchParams.keys()]){
      if(/^utm_|^fbclid$|^gclid$|^oc$/i.test(key))u.searchParams.delete(key);
    }
    u.hash="";
    return u.href;
  } catch {return null;}
}
function validatedImage(value){
  if(typeof value!=="string"||value.length>1800)return null;
  try{
    const u=new URL(value);
    if(!["https:","http:"].includes(u.protocol)||u.username||u.password)return null;
    if(/^(localhost|\d+\.\d+\.\d+\.\d+|\[.+\])$/i.test(u.hostname))return null;
    return u.href;
  }catch{return null;}
}
function idFor(value){
  let hash=2166136261;
  for(const char of value){hash^=char.codePointAt(0);hash=Math.imul(hash,16777619);}
  return "event-"+(hash>>>0).toString(16);
}
const categoryRank={
  "santa-catarina":7,brasil:7,clima:7,mundo:4,
  "america-latina":5,europa:4,asia:4,africa:4,
  "oriente-medio":5,oceania:3
};
const urgentTerms=/(?:tornado|tempestad|temporal|enchent|inunda|deslizament|alagament|terremot|tsunami|furacao|ciclone|desastre|emergencia|evacua|vitima|morto|mortes|apagao|alerta|risco|defesa civil)/i;
function rank(event){
  const title=event.title.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
  return (categoryRank[event.category]||3)+(urgentTerms.test(title)?4:0);
}
function normalizeEvent(article,category,at,cutoff){
  const title=clean(article?.title,190);
  const url=safeUrl(article?.url);
  const published=date(article?.publishedAt);
  if(!title||!url||published===null||published<cutoff||published>at+30*60*1000)return null;
  const id=idFor(url.toLowerCase());
  return {
    id,category,title,url,
    description:clean(article?.description||article?.summary||'',650),
    imageUrl:validatedImage(article?.imageUrl||article?.image||""),
    source:clean(article?.source||new URL(url).hostname,65),
    publishedAt:new Date(published).toISOString(),
    firstSeenAt:new Date(at).toISOString(),
    lastSeenAt:new Date(at).toISOString()
  };
}
function validExisting(event,now,cutoff){
  if(!event||!safeUrl(event.url)||!clean(event.title)||!date(event.publishedAt))return null;
  const published=date(event.publishedAt);
  if(published<cutoff||published>now+30*60*1000)return null;
  const firstSeen=date(event.firstSeenAt);
  const lastSeen=date(event.lastSeenAt);
  return {
    id:clean(event.id||idFor(event.url),80),
    category:clean(event.category,50),
    title:clean(event.title,190),
    url:safeUrl(event.url),
    description:clean(event.description||event.summary||'',650),
    imageUrl:validatedImage(event.imageUrl||event.image||""),
    source:clean(event.source,65),
    publishedAt:new Date(published).toISOString(),
    firstSeenAt:new Date(firstSeen??now).toISOString(),
    lastSeenAt:new Date(lastSeen??now).toISOString()
  };
}
export function mergeIntelligenceHistory(previous,briefing,{now=Date.now()}={}){
  const at=Number(now),cutoff=at-HISTORY_WINDOW_MS;
  if(!Number.isFinite(at))throw Error("Horário de referência inválido");
  const old=previous&&typeof previous==="object"?previous:{};
  const stored=new Map();
  for(const item of old.events||[]){
    const event=validExisting(item,at,cutoff);
    if(event)stored.set(event.id,event);
  }
  const added=[];
  let observed=0;
  if(briefing?.ok){
    for(const topic of briefing.topics||[]){
      for(const item of topic.articles||[]){
        const event=normalizeEvent(item,topic.id,at,cutoff);
        if(!event)continue;
        observed++;
        const match=stored.get(event.id);
        if(match){
          // Preserve the first observation to determine what changed after wake.
          match.lastSeenAt=event.lastSeenAt;
          if(!match.imageUrl && event.imageUrl)match.imageUrl=event.imageUrl;
          if(!match.description&&event.description)match.description=event.description;
        } else {
          stored.set(event.id,event);added.push(event.id);
        }
      }
    }
  }
  const events=[...stored.values()]
    .sort((a,b)=>date(b.publishedAt)-date(a.publishedAt))
    .slice(0,MAX_EVENTS);
  const currentChecked=Boolean(briefing?.ok);
  const check={
    at:new Date(at).toISOString(),
    ok:currentChecked && (
      Boolean(briefing.hasNews)||Boolean(briefing.alerts?.checked)||Boolean(briefing.enso?.bulletin)
    ),
    partial:Boolean(briefing?.partial),
    observedArticles:observed,
    newArticles:added.length,
    categories:(briefing?.topics||[]).filter(t=>t.articles?.length).map(t=>t.id),
    inmetChecked:Boolean(briefing?.alerts?.checked),
    ensoChecked:Boolean(briefing?.enso?.bulletin)
  };
  const checkMap=new Map();
  for(const item of [...(old.checks||[]),check]){
    const stamp=date(item?.at);
    if(stamp===null||stamp<cutoff||stamp>at+300000)continue;
    const slot=Math.floor(stamp/60000);
    checkMap.set(slot,{...item,at:new Date(stamp).toISOString()});
  }
  const checks=[...checkMap.values()].sort((a,b)=>date(a.at)-date(b.at)).slice(-MAX_CHECKS);
  return {
    ok:true,version:"2.0",windowHours:24,
    monitoredBy:"github-actions-scheduled",
    targetIntervalMinutes:15,
    updatedAt:new Date(at).toISOString(),
    oldestEventAt:events.length?events[events.length-1].publishedAt:null,
    windowStartAt:new Date(cutoff).toISOString(),
    events,checks,
    checkCount:checks.length,
    lastSuccessfulAt:check.ok?check.at:(old.lastSuccessfulAt||null),
    latest:currentChecked?{
      alerts:{
        checked:Boolean(briefing.alerts?.checked),
        checkedAt:check.at,
        warnings:(briefing.alerts?.warnings||[]).slice(0,6)
      },
      enso:{
        checked:Boolean(briefing.enso?.checked),
        checkedAt:check.at,
        bulletin:briefing.enso?.bulletin||null
      }
    }:(old.latest||null)
  };
}
export function selectWakeIntelligence(archive,{
  now=Date.now(),lastWakeAt=null,limit=10
}={}){
  const cutoff=now-HISTORY_WINDOW_MS;
  const priorWake=date(lastWakeAt);
  const since=priorWake===null?cutoff:Math.max(cutoff,priorWake);
  const events=Array.isArray(archive?.events)?archive.events:[];
  const valid=events.filter(e=>{
    const published=date(e.publishedAt);
    return published!==null&&published>=cutoff&&published<=now+300000;
  });
  const unseen=valid.filter(e=>{
    const seen=date(e.firstSeenAt);
    return seen!==null&&seen>since;
  });
  const ordered=unseen.sort((a,b)=>
    rank(b)-rank(a)||date(b.publishedAt)-date(a.publishedAt)
  );
  const priorities=["brasil","santa-catarina","clima","mundo"];
  const chosen=[];
  const seenIds=new Set();
  // Ensure the waking user hears Brazil and SC before world highlights when available.
  for(const category of priorities){
    const picked=ordered.find(e=>e.category===category&&!seenIds.has(e.id));
    if(picked){chosen.push(picked);seenIds.add(picked.id);}
  }
  for(const e of ordered){
    if(chosen.length>=limit)break;
    if(!seenIds.has(e.id)){chosen.push(e);seenIds.add(e.id);}
  }
  const alerts=archive?.latest?.alerts;
  const alertAge=now-date(alerts?.checkedAt);
  const alertsCurrent=Boolean(alerts?.checked&&Number.isFinite(alertAge)&&alertAge>=0&&alertAge<=2*HOUR);
  return {
    windowHours:24,
    sinceAt:new Date(since).toISOString(),
    untilAt:new Date(now).toISOString(),
    lastWakeAt:priorWake===null?null:new Date(priorWake).toISOString(),
    total24h:valid.length,
    unseenCount:unseen.length,
    highlights:chosen.slice(0,Math.max(1,Math.min(15,limit))),
    recentHighlights:[...valid].sort((a,b)=>
      rank(b)-rank(a)||date(b.publishedAt)-date(a.publishedAt)
    ).slice(0,6),
    checks24h:(archive?.checks||[]).filter(c=>date(c.at)>=cutoff).length,
    lastCheckAt:archive?.updatedAt||null,
    lastSuccessfulAt:archive?.lastSuccessfulAt||null,
    alertStatus:alertsCurrent?"recently-checked":"not-currently-verified",
    alerts:alertsCurrent?(alerts.warnings||[]).filter(a=>
      !a.endsAt||date(a.endsAt)>=now
    ).slice(0,3):[],
    enso:archive?.latest?.enso?.bulletin||null,
    ensoCheckedAt:archive?.latest?.enso?.checkedAt||null
  };
}
