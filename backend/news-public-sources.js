// Resilient 30-minute collection of two documented public institutional RSS feeds.
// Two institutions are two publishers, not proof of independent fact-checking.
import {collectAgencyBrasilNews} from "./news-public-rss.js";
import {collectCamaraNews} from "./news-camara-rss.js";
export async function collectPublicNewsFallback({
 now=Date.now(),limit=10,
 agency=collectAgencyBrasilNews,camara=collectCamaraNews
}={}){
 const results=await Promise.allSettled([
  agency({now,limit:Math.min(8,limit)}),
  camara({now,limit:Math.min(6,limit)})
 ]);
 const providers=[],seen=new Set(),articles=[],pools=[];
 const names=["agencia-brasil-rss","agencia-camara-rss"];
 for(let i=0;i<results.length;i++){
  const result=results[i],feed=result.status==="fulfilled"?result.value:null;
  const rows=Array.isArray(feed?.articles)?feed.articles:[];
  providers.push({provider:names[i],ok:Boolean(feed?.ok),count:rows.length,
   error:result.status==="rejected"?
    String(result.reason?.message||result.reason||"unavailable").slice(0,120):
    feed?.diagnostics?.error||null,
   stale:feed?.diagnostics?.stale||0,invalid:feed?.diagnostics?.invalid||0});
  const pool=[];
  for(const article of rows){
   if(!article?.url||seen.has(article.url))continue;
   seen.add(article.url);pool.push(article);
  }
  pool.sort((a,b)=>Date.parse(b.publishedAt)-Date.parse(a.publishedAt));
  pools.push(pool);
 }
 // Fair round-robin across sources: both publishers appear when both
 // have valid articles, instead of truncating everything to the newest feed.
 const max=Math.max(1,Math.min(12,limit)),offsets=pools.map(()=>0);
 while(articles.length<max){
  let added=false;
  for(let i=0;i<pools.length&&articles.length<max;i++){
   const next=pools[i][offsets[i]++];
   if(!next)continue;
   articles.push(next);added=true;
  }
  if(!added)break;
 }
 articles.sort((a,b)=>Date.parse(b.publishedAt)-Date.parse(a.publishedAt));
 const selectedByProvider=providers.map((p,i)=>({
  provider:p.provider,count:articles.filter(a=>pools[i].includes(a)).length
 }));
 return {ok:articles.length>0,articles,
  diagnostics:{providers,selectedByProvider,selectedCount:articles.length,
   providerCount:providers.filter(item=>item.ok).length,
   distinctDomains:new Set(articles.map(a=>a.domain).filter(Boolean)).size}};
}
