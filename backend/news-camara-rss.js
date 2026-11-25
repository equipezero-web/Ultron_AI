// Second public, documented RSS source for World News: Agência Câmara.
// These are institutional articles, not an independent fact-check.
// Feed URL: https://www.camara.leg.br/noticias/rss/ultimas-noticias
const FEED="https://www.camara.leg.br/noticias/rss/ultimas-noticias";
const clean=(v,n=650)=>String(v||"").replace(/\s+/g," ").trim().slice(0,n);
const decode=v=>String(v||"").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi,"$1")
 .replace(/&amp;/g,"&").replace(/&quot;/g,'"').replace(/&apos;|&#39;/g,"'")
 .replace(/&lt;/g,"<").replace(/&gt;/g,">")
 .replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim();
const tag=(block,name)=>{
 const match=String(block||"").match(new RegExp("<"+name+"(?:\\s[^>]*)?>([\\s\\S]*?)<\\/"+name+">","i"));
 return match?decode(match[1]):"";
};
const safeUrl=value=>{
 try{
  const u=new URL(String(value||"").trim());
  return u.protocol==="https:"&&u.hostname==="www.camara.leg.br"&&u.pathname.startsWith("/noticias/")?
   u.href:null;
 }catch{return null;}
};
export function parseCamaraRss(xml,{now=Date.now(),limit=6,maxAgeHours=72}={}){
 const items=[...String(xml||"").matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)];
 const cutoff=now-Math.max(1,Math.min(96,maxAgeHours))*3600000;
 const articles=[],seen=new Set();let invalid=0,stale=0;
 for(const match of items.slice(0,40)){
  const block=match[1],title=clean(tag(block,"title"),350),
   link=safeUrl(tag(block,"link")),date=Date.parse(tag(block,"pubDate")||tag(block,"dc:date"));
  if(!title||!link||!Number.isFinite(date)){invalid++;continue;}
  if(date<cutoff||date>now+300000){stale++;continue;}
  if(seen.has(link))continue;
  seen.add(link);
  articles.push({title,url:link,description:clean(tag(block,"description")),
   publishedAt:new Date(date).toISOString(),source:"Agência Câmara",
   domain:"www.camara.leg.br",image:null,region:"Brasil"});
  if(articles.length>=Math.max(1,Math.min(8,limit)))break;
 }
 return {articles,diagnostics:{provider:"agencia-camara-rss",received:items.length,
  accepted:articles.length,invalid,stale}};
}
export async function collectCamaraNews({now=Date.now(),fetchImpl=fetch,timeoutMs=6500,limit=6}={}){
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),Math.min(9000,Math.max(1500,timeoutMs)));
 try{
  const response=await fetchImpl(FEED,{signal:controller.signal,
   headers:{Accept:"application/rss+xml, application/xml, text/xml"}});
  if(!response?.ok)throw Error("Câmara RSS HTTP "+String(response?.status||"unavailable"));
  const result=parseCamaraRss(await response.text(),{now,limit});
  return {ok:result.articles.length>0,...result};
 }catch(error){
  return {ok:false,articles:[],diagnostics:{provider:"agencia-camara-rss",accepted:0,
   error:clean(error?.message||error,120)}};
 }finally{clearTimeout(timer);}
}
