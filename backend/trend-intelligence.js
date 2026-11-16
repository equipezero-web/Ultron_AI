/**
 * J.A.R.V.I.S. Trend Intelligence v1.
 * Public, read-only discovery signals. No personalized searches or private
 * conversations ever enter these collectors or are stored in this table.
 * Google Trends RSS measures *search interest*; Google News RSS measures
 * *reported coverage*. Neither proves the accuracy of a headline or sales.
 */
export const TREND_DOMAINS=Object.freeze([
 ["politica","Política","politica governo congresso","politics government"],
 ["economia","Economia","inflação juros economia emprego","economy inflation jobs"],
 ["negocios","Negócios","varejo empreendedorismo empresas negócios","business retail startups"],
 ["tecnologia","Tecnologia e IA","inteligência artificial tecnologia produtos lançamentos","AI technology product launches"],
 ["ciencia","Ciência","pesquisa científica descobertas ciência","scientific discoveries research"],
 ["saude","Saúde","saúde medicina descobertas","health medicine research"],
 ["clima","Clima e meio ambiente","clima meio ambiente energia limpa","climate environment clean energy"],
 ["moda","Moda e estilo","moda tendências roupas acessórios marcas","fashion style trends apparel"],
 ["beleza","Beleza","beleza maquiagem cosméticos tendências","beauty cosmetics skincare trends"],
 ["alimentacao","Alimentação","gastronomia alimentação produtos tendência","food beverage restaurant trends"],
 ["entretenimento","Filmes e séries","filmes séries cinema streaming","movies television streaming releases"],
 ["musica","Música","música lançamentos artistas shows","music artists album releases"],
 ["esportes","Esportes","esportes futebol competições","sports football tournaments"],
 ["games","Games","jogos videogame lançamentos e-sports","video games esports releases"],
 ["educacao","Educação","educação universidades vestibular Enem","education universities college"],
 ["turismo","Turismo","viagens turismo destinos passagens","travel tourism destinations"],
 ["seguranca-digital","Segurança digital","cibersegurança golpes digitais vulnerabilidades","cybersecurity security vulnerabilities"],
 ["redes-sociais","Redes sociais","redes sociais criadores de conteúdo plataformas","social media creators platforms"],
 ["cultura","Cultura e comportamento","cultura comportamento consumo sociedade","culture society consumer behavior"],
 ["mobilidade","Mobilidade","carros motos mobilidade transportes","cars motorcycles mobility transport"]
].map(([id,label,br,world])=>Object.freeze({id,label,br,world})));

export const TREND_RSS_REGIONS=Object.freeze(["BR","US","GB","JP"]);
const GOOGLE_NEWS="https://news.google.com/rss/search";
const GOOGLE_TRENDS="https://trends.google.com/trending/rss";
const HOUR=3600000;
const MAX_AGE_NEWS=48*HOUR;
const MAX_AGE_SEARCH=48*HOUR;
const SQL=[
 "CREATE TABLE IF NOT EXISTS jarvis_trend_samples (sample_key TEXT PRIMARY KEY, observed_at TEXT NOT NULL, region TEXT NOT NULL, category TEXT NOT NULL, snapshot_json TEXT NOT NULL)",
 "CREATE INDEX IF NOT EXISTS idx_jarvis_trend_samples_latest ON jarvis_trend_samples(observed_at DESC,region,category)"
];
const bounded=(v,max=180)=>String(v??"").replace(/<[^>]+>/g," ").replace(/[\x00-\x1f]/g," ").replace(/\s+/g," ").trim().slice(0,max);
const entities=s=>String(s||"").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,"$1")
 .replace(/&(?:amp|lt|gt|quot|apos|nbsp|#39|#x27);/gi,m=>({
  "&amp;":"&","&lt;":"<","&gt;":">","&quot;":'"',"&apos;":"'","&nbsp;":" ","&#39;":"'","&#x27;":"'"
 }[m.toLowerCase()]||m))
 .replace(/&#(\d{1,6});/g,(_,n)=>{let v=Number(n);return v>=32&&v<=0x10ffff?String.fromCodePoint(v):" ";});
const tag=(xml,name)=>entities(String(xml||"").match(new RegExp("<"+name+"(?:\\s[^>]*)?>([\\s\\S]*?)<\\/"+name+">","i"))?.[1]||"");
const safeUrl=v=>{try{const u=new URL(entities(String(v||"").trim()));
 if(u.protocol!=="https:"||u.username||u.password||u.port||u.href.length>1500)return null;
 if(["localhost","127.0.0.1"].includes(u.hostname)||!u.hostname.includes("."))return null;
 return u.href;
 }catch{return null;}};
const published=(raw,now,maxAge)=>{const stamp=Date.parse(entities(String(raw||"")));
 return Number.isFinite(stamp)&&stamp<=now+300000&&stamp>=now-maxAge?
  new Date(stamp).toISOString():null;};
const items=xml=>[...String(xml||"").matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)].slice(0,70).map(m=>m[1]);
const normalizeTitle=v=>bounded(entities(v),180);
const stableKey=v=>String(v||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();

export function parseSearchTrends(xml,{region="BR",now=Date.now()}={}){
 const out=[],seen=new Set();
 for(const item of items(xml)){
  const title=normalizeTitle(tag(item,"title"));
  const at=published(tag(item,"pubDate"),now,MAX_AGE_SEARCH);
  const url=safeUrl(tag(item,"link"))||"https://trends.google.com/trending?geo="+encodeURIComponent(region);
  if(!title||!at||seen.has(stableKey(title)))continue;
  seen.add(stableKey(title));
  const articles=[...item.matchAll(/<ht:news_item\b[^>]*>([\s\S]*?)<\/ht:news_item>/gi)]
   .slice(0,3).map(m=>({
    title:normalizeTitle(tag(m[1],"ht:news_item_title")),
    source:bounded(tag(m[1],"ht:news_item_source"),80),
    url:safeUrl(tag(m[1],"ht:news_item_url"))
   })).filter(v=>v.title&&v.url);
  out.push({kind:"search-trend",region,category:"pesquisas",title,
   observedAt:at,source:"Google Trends",url,
   approximateSearches:bounded(tag(item,"ht:approx_traffic"),30)||null,
   newsReferences:articles,
   evidence:"Busca em alta identificada pelo Google Trends; volume aproximado, não é contagem exata.",
   confidence:"fonte-primaria-de-busca"});
  if(out.length>=10)break;
 }
 return out;
}
export function parseNewsTrends(xml,{region="br",category="tecnologia",now=Date.now()}={}){
 const out=[],seen=new Set();
 for(const item of items(xml)){
  const title=normalizeTitle(tag(item,"title")),url=safeUrl(tag(item,"link"));
  const at=published(tag(item,"pubDate"),now,MAX_AGE_NEWS);
  const source=bounded(tag(item,"source")||"Google Notícias",90);
  if(!title||!url||!at||seen.has(stableKey(title)))continue;
  seen.add(stableKey(title));
  out.push({kind:"news-observation",region,category,title,observedAt:at,
   source,url,evidence:"Manchete indexada na imprensa; não comprova popularidade nem valida o fato narrado.",
   confidence:"cobertura-a-verificar"});
  if(out.length>=8)break;
 }
 return out;
}
export function makeTrendFeedUrl(region,domain){
 if(!["br","world"].includes(region)||!domain||!TREND_DOMAINS.some(x=>x.id===domain.id))
  throw Error("Categoria ou região inválida.");
 const brazil=region==="br",url=new URL(GOOGLE_NEWS);
 url.searchParams.set("q",((brazil?domain.br:domain.world)+" when:2d").trim());
 url.searchParams.set("hl",brazil?"pt-BR":"en-US");
 url.searchParams.set("gl",brazil?"BR":"US");
 url.searchParams.set("ceid",brazil?"BR:pt-419":"US:en");
 return url.href;
}
export function planTrendScan(date=new Date()){
 if(!(date instanceof Date)||!Number.isFinite(date.getTime()))throw Error("Data inválida");
 const hour=date.getUTCHours();
 // Fixed rotation: all twenty categories for BR + international are checked
 // across five hourly cycles, with Google Trends search signals every hour.
 const active=TREND_DOMAINS.filter((_,i)=>i%5===hour%5);
 return [
  ...TREND_RSS_REGIONS.map(region=>({region:region==="BR"?"br":"world",category:"pesquisas",geo:region,
   provider:"Google Trends",url:GOOGLE_TRENDS+"?geo="+region})),
  ...active.flatMap(domain=>["br","world"].map(region=>({
   region,category:domain.id,provider:"Google Notícias",url:makeTrendFeedUrl(region,domain)})))
 ];
}
async function fetchFeed(url,{fetchImpl,timeoutMs=6200}){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
 try{
  const res=await fetchImpl(url,{signal:controller.signal,redirect:"error",
   headers:{Accept:"application/rss+xml, application/xml, text/xml"},cache:"no-store"});
  if(!res.ok)throw Error("Feed HTTP "+res.status);
  const type=String(res.headers?.get?.("content-type")||"").toLowerCase();
  if(type&&!/(xml|rss|text\/plain)/.test(type))throw Error("Formato RSS inesperado");
  const xml=await res.text();
  if(xml.length>650000||!/<rss\b|<channel\b/i.test(xml))throw Error("RSS inválido ou excedeu o limite");
  return xml;
 }finally{clearTimeout(timer);}
}
export async function collectTrendSample({now=()=>new Date(),fetchImpl=fetch}={}){
 const date=now(),checkedAt=date.toISOString(),plan=planTrendScan(date);
 const all=await Promise.all(plan.map(async feed=>{
  try{
   const xml=await fetchFeed(feed.url,{fetchImpl});
   const signals=feed.geo?parseSearchTrends(xml,{region:feed.geo,now:date.getTime()}):
    parseNewsTrends(xml,{region:feed.region,category:feed.category,now:date.getTime()});
   return {...feed,ok:true,signals:signals.slice(0,10),error:null};
  }catch(error){return {...feed,ok:false,signals:[],error:bounded(error?.message,120)};}
 }));
 const healthy=all.filter(x=>x.ok).length;
 return {ok:healthy>0,checkedAt,partial:healthy<all.length,
  planned:plan.length,available:healthy,feeds:all.map(({region,category,geo,provider,url,ok,signals,error})=>({
   region,category,geo:geo||null,provider,url,ok,signals,error
  }))};
}
async function ensure(db){
 if(!db||typeof db.prepare!=="function")return false;
 for(const sql of SQL)await db.prepare(sql).run();
 return true;
}
export async function pollTrendIntelligence(env,{now=()=>new Date(),fetchImpl=fetch,force=false}={}){
 const date=now(),db=env?.ULTRON_DB;
 if(!(date instanceof Date)||!Number.isFinite(date.getTime()))return {ok:false,error:"Hora inválida"};
 // The existing per-minute Cron calls this routine only near minute 10.
 // This avoids racing the on-the-hour official hazard monitoring.
 if(!force&&(date.getUTCMinutes()<10||date.getUTCMinutes()>14))
  return {ok:true,skipped:true,reason:"outside-scanning-window"};
 try{
  if(!await ensure(db))return {ok:false,error:"Cloudflare D1 indisponível"};
  const hour=date.toISOString().slice(0,13),probe=hour+":pesquisas:br:BR";
  if(!force&&await db.prepare("SELECT sample_key FROM jarvis_trend_samples WHERE sample_key=?")
   .bind(probe).first())return {ok:true,skipped:true,reason:"hour-already-sampled"};
  const collection=await collectTrendSample({now:()=>date,fetchImpl});
  if(!collection.ok)return {ok:false,error:"Nenhum provedor RSS respondeu; nenhum dado foi fabricado.",
   sourceStatus:collection.feeds.map(x=>({source:x.provider,ok:x.ok,error:x.error}))};
  let saved=0;
  for(const feed of collection.feeds){
   if(!feed.ok)continue; // Failed provider never overwrites prior valid snapshots.
   const key=hour+":"+feed.category+":"+feed.region+":"+(feed.geo||"-");
   const snapshot={checkedAt:collection.checkedAt,region:feed.region,category:feed.category,
    geo:feed.geo,provider:feed.provider,url:feed.url,signals:feed.signals};
   await db.prepare("INSERT OR IGNORE INTO jarvis_trend_samples (sample_key,observed_at,region,category,snapshot_json) VALUES (?,?,?,?,?)")
    .bind(key,collection.checkedAt,feed.region,feed.category,JSON.stringify(snapshot)).run();
   saved++;
  }
  const cutoff=new Date(date.getTime()-7*86400000).toISOString();
  await db.prepare("DELETE FROM jarvis_trend_samples WHERE observed_at<?").bind(cutoff).run();
  return {ok:true,saved,checkedAt:collection.checkedAt,partial:collection.partial,
   providers:collection.feeds.map(x=>({region:x.region,category:x.category,geo:x.geo,
    source:x.provider,ok:x.ok,count:x.signals.length,error:x.error}))};
 }catch(error){return {ok:false,error:"Monitor de tendências indisponível: "+bounded(error?.message,160)};}
}
export async function latestTrendIntelligence(env,{region="all",category="all",now=()=>Date.now()}={}){
 if(!["all","br","world"].includes(region)||category!=="all"&&category!=="pesquisas"&&!TREND_DOMAINS.some(x=>x.id===category))
  return {ok:false,status:400,error:"Filtro de tendência inválido"};
 const db=env?.ULTRON_DB;
 try{
  if(!await ensure(db))return {ok:false,status:503,error:"D1 não disponível"};
  const rows=await db.prepare(
   "SELECT snapshot_json,observed_at FROM jarvis_trend_samples WHERE observed_at>=? ORDER BY observed_at DESC LIMIT 260"
  ).bind(new Date(now()-30*HOUR).toISOString()).all();
  const result=[],seen=new Set(),health=[],categories=new Set();let newest=null;
  // Persistence of a searched term is measured ONLY by actual consecutive
  // collected RSS snapshots. We do not invent velocity, reach or market share.
  const searchHistory=new Map();
  for(const row of rows?.results||[]){
   let sample;try{sample=JSON.parse(row.snapshot_json);}catch{continue;}
   if(sample?.category!=="pesquisas"||!Array.isArray(sample.signals)||!sample.geo)continue;
   for(const item of sample.signals){
    if(item?.kind!=="search-trend"||!item.title)continue;
    const key=sample.geo+"|"+stableKey(item.title);
    if(!searchHistory.has(key))searchHistory.set(key,new Set());
    searchHistory.get(key).add(sample.checkedAt);
   }
  }
  for(const row of rows?.results||[]){
   let sample;try{sample=JSON.parse(row.snapshot_json);}catch{continue;}
   if(!sample?.checkedAt||!Array.isArray(sample.signals)||!sample.region||!sample.category)continue;
   if(region!=="all"&&sample.region!==region||category!=="all"&&sample.category!==category)continue;
   const key=sample.region+"|"+sample.category+"|"+(sample.geo||"-");
   if(seen.has(key))continue;
   seen.add(key);categories.add(sample.category);
   const age=now()-Date.parse(sample.checkedAt);
   const stale=!Number.isFinite(age)||age< -300000||age>7*HOUR;
   health.push({region:sample.region,category:sample.category,geo:sample.geo||null,
    source:sample.provider,checkedAt:sample.checkedAt,stale,observations:sample.signals.length});
   if(!newest||sample.checkedAt>newest)newest=sample.checkedAt;
   for(const item of sample.signals.slice(0,10)){
    if(!item?.title||!safeUrl(item.url)||!item.observedAt)continue;
    const cycles=item.kind==="search-trend"?
     [...(searchHistory.get(sample.geo+"|"+stableKey(item.title))||[])].sort():[];
    result.push({...item,checkedAt:sample.checkedAt,stale,
     ...(item.kind==="search-trend"?{
       observedCycles:cycles.length,firstObservedAt:cycles[0]||sample.checkedAt,
       persistence:cycles.length>=2?"observado-em-multiplas-coletas":"nova-observacao-no-monitor"
     }:{})});
   }
  }
  if(!health.length)return {ok:false,status:503,error:"Ainda não há tendências verificadas nas últimas 30 horas. O monitor tentará novas consultas.",region,category};
  result.sort((a,b)=>Number(a.stale)-Number(b.stale)||
    Number(b.region==="br")-Number(a.region==="br")||
    Date.parse(b.observedAt)-Date.parse(a.observedAt));
  const scopeCount=region==="all"?2:1;
  const trendFeeds=region==="all"?TREND_RSS_REGIONS.length:region==="br"?1:3;
  const expected=category==="all"?TREND_DOMAINS.length*scopeCount+trendFeeds:
    category==="pesquisas"?trendFeeds:scopeCount;
  const coverage={observed:health.length,expected,complete:health.length>=expected};
  return {ok:true,version:"1.1",region,category,checkedAt:newest,
   sampleBased:true,exhaustive:false,partial:!coverage.complete,coverage,
   stale:health.every(x=>x.stale),
   freshness:"Coletas por setor distribuídas em ciclos de até 5 horas; indisponibilidades podem atrasar setores.",
   interpretation:"Google Trends mede buscas em alta; manchetes apenas indicam cobertura jornalística, não comprovam popularidade nem verdade do relato.",
   privacy:"Somente fontes públicas. Nenhum comando, arquivo, câmera, conversa ou dado pessoal é enviado aos feeds.",
   availableCategories:[...categories],sourceStatus:health,items:result.slice(0,55)};
 }catch(error){return {ok:false,status:503,error:"Não foi possível ler as tendências verificadas: "+bounded(error?.message,120)};}
}
