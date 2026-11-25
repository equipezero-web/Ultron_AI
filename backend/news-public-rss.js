// Public Agência Brasil RSS fallback for the periodic World News monitor.
// A source is not a fact checker; never fabricate links or publication dates.
const FEED="https://agenciabrasil.ebc.com.br/rss/ultimasnoticias/feed.xml";
const clean=value=>String(value||"").replace(/\s+/g," ").trim();
const decode=value=>String(value||"")
 .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi,"$1")
 .replace(/&amp;/g,"&").replace(/&quot;/g,'"').replace(/&apos;|&#39;/g,"'")
 .replace(/&lt;/g,"<").replace(/&gt;/g,">")
 .replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim();
const tag=(xml,name)=>{
 const m=String(xml||"").match(new RegExp("<"+name+"(?:\\s[^>]*)?>([\\s\\S]*?)<\\/"+name+">","i"));
 return m?decode(m[1]):"";
};
const safeLink=value=>{
 try{const u=new URL(clean(value));return u.protocol==="https:"&&u.hostname==="agenciabrasil.ebc.com.br"?
 u.href:null;}catch{return null;}
};
export function parseAgencyBrasilFeed(xml,{now=Date.now(),limit=8,maxAgeHours=72}={}){
 const entries=[...String(xml||"").matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)];
 const cutoff=now-Math.max(1,Math.min(96,maxAgeHours))*3600000;
 const seen=new Set(),articles=[];
 let stale=0,invalid=0;
 for(const entry of entries.slice(0,35)){
  const block=entry[1],url=safeLink(tag(block,"link")),title=tag(block,"title").slice(0,350);
  const publishedAt=Date.parse(tag(block,"pubDate")||tag(block,"dc:date"));
  if(!url||!title||!Number.isFinite(publishedAt)){invalid++;continue;}
  if(publishedAt<cutoff||publishedAt>now+300000){stale++;continue;}
  if(seen.has(url))continue;
  seen.add(url);
  articles.push({title,url,source:"Agência Brasil",domain:"agenciabrasil.ebc.com.br",
   publishedAt:new Date(publishedAt).toISOString(),
   description:tag(block,"description").slice(0,650),image:null,region:"Brasil"});
  if(articles.length>=Math.max(1,Math.min(10,limit)))break;
 }
 return {articles,diagnostics:{provider:"agencia-brasil-rss",received:entries.length,
   accepted:articles.length,stale,invalid,maxAgeHours}};
}
export async function collectAgencyBrasilNews({now=Date.now(),fetchImpl=fetch,limit=8,timeoutMs=6500}={}){
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),Math.max(1500,Math.min(9000,timeoutMs)));
 try{
  const response=await fetchImpl(FEED,{headers:{Accept:"application/rss+xml, application/xml, text/xml"},
   signal:controller.signal});
  if(!response?.ok)throw Error("RSS HTTP "+String(response?.status||"unavailable"));
  const xml=await response.text();
  const result=parseAgencyBrasilFeed(xml,{now,limit});
  return {ok:result.articles.length>0,...result};
 }catch(error){
  return {ok:false,articles:[],diagnostics:{provider:"agencia-brasil-rss",
    accepted:0,error:clean(error?.message||error).slice(0,120)}};
 }finally{clearTimeout(timer);}
}
