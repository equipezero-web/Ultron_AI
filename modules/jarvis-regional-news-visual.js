// Read-only regional news view over already collected, source-attributed articles.
// No invented images, summaries, geocoding, private data, or remote device actions.
const DAY=24*60*60*1000;
const TWO_HOURS=2*60*60*1000;
const clean=value=>String(value??"").replace(/[<>\r\n]/g," ").replace(/\s+/g," ").trim();
function verifiedTime(value,now,maxAge){
 const at=Date.parse(String(value??""));
 return Number.isFinite(at)&&at<=now+5*60_000&&now-at>=-5*60_000&&now-at<=maxAge;
}
function publicHttps(value){
 try{
  const u=new URL(String(value||""));
  if(u.protocol!=="https:"||u.username||u.password||u.port)return null;
  if(/^(?:localhost|127\.|0\.0\.0\.0|10\.|192\.168\.|\[)/i.test(u.hostname)||
     /^\d+\.\d+\.\d+\.\d+$/.test(u.hostname))return null;
  return u.href;
 }catch{return null;}
}
export function buildRegionalNewsVisual(visualData,{region="brasil",now=Date.now()}={}){
 if(!["brasil","mundo"].includes(region))return {ok:false,reason:"invalid-region"};
 const briefing=visualData?.briefing;
 if(briefing?.ok!==true||!verifiedTime(briefing.fetchedAt,now,TWO_HOURS))
  return {ok:false,reason:"briefing-unavailable-or-stale"};
 const groups=(briefing.topics||[]).filter(group=>region==="brasil"
  ?["brasil","santa-catarina"].includes(group?.id)
  :!["brasil","santa-catarina"].includes(group?.id));
 const cards=[],seen=new Set();
 for(const group of groups){
  for(const article of (Array.isArray(group.articles)?group.articles:[])){
   const url=publicHttps(article?.url);
   const title=clean(article?.title).slice(0,180);
   if(!url||!title||!verifiedTime(article?.publishedAt,now,DAY))continue;
   const key=url.split("#")[0].split("?")[0].toLowerCase();
   if(seen.has(key))continue;
   seen.add(key);
   const imageUrl=publicHttps(article?.imageUrl||article?.image);
   cards.push({
    title,url,source:clean(article.source||group.label||"Fonte publicada").slice(0,80),
    publishedAt:article.publishedAt,
    description:clean(article.description||article.summary||"").slice(0,550),
    ...(imageUrl?{imageUrl}:{}),
    category:group.id
   });
   if(cards.length>=6)break;
  }
  if(cards.length>=6)break;
 }
 if(!cards.length)return {ok:false,reason:"no-current-verified-regional-news"};
 const imageCount=cards.filter(card=>Boolean(card.imageUrl)).length;
 const area=region==="brasil"?"Brasil":"mundo";
 const introduction="Notícias recentes do "+area+" com fontes e datas verificáveis. "+
  (imageCount?"Imagens exibidas somente quando fornecidas pelas notícias. ":
   "As fontes desta seleção não forneceram imagens verificáveis. ")+
  "Confira as reportagens originais para detalhes.";
 return {ok:true,region,count:cards.length,imageCount,
  visual:{mode:"news",cards,introduction}};
}
