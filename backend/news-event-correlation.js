// Conservative, deterministic source correlation. This is NOT a truth oracle:
// multiple outlets repeating a claim do not prove that claim to be true.
const STOP=new Set("a o os as de da do das dos em no na nos nas e ou que para por com um uma uns umas ao aos à às sobre após foi são será esta está esse essa estes essas como mais nova novo brasil mundo hoje agora ultimas últimas noticia notícias notícia".normalize("NFD").replace(/[\u0300-\u036f]/g,"").split(/\s+/));
const clean=v=>String(v||"").replace(/\s+/g," ").trim().slice(0,500);
const tokens=text=>clean(text).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9 ]/g," ")
 .split(/\s+/).filter(t=>t.length>=3&&!STOP.has(t));
const hostname=url=>{try{const x=new URL(url);return ["https:","http:"].includes(x.protocol)?x.hostname.replace(/^www\./,"").toLowerCase():null;}catch{return null;}};
const canonical=url=>{try{const x=new URL(url);if(!["https:","http:"].includes(x.protocol))return null;
 x.hash="";for(const key of [...x.searchParams.keys()])if(/^utm_|^(fbclid|gclid|igshid)$/i.test(key))x.searchParams.delete(key);
 return x.href.replace(/\/$/,"").toLowerCase();}catch{return null;}};
const hash=value=>{let h=2166136261;for(const ch of value){h=Math.imul(h^ch.charCodeAt(0),16777619);}return (h>>>0).toString(16).padStart(8,"0");};
const similarity=(a,b)=>{const aSet=new Set(a),bSet=new Set(b);const intersection=[...aSet].filter(t=>bSet.has(t)).length;
 return intersection/Math.max(aSet.size,bSet.size,1);};
function validArticle(a){
 const url=canonical(a?.url),title=clean(a?.title),publishedAt=Date.parse(a?.publishedAt||"");
 if(!url||!title||tokens(title).length<3||!Number.isFinite(publishedAt))return null;
 return {...a,title,url,domain:hostname(url),publishedAt:new Date(publishedAt).toISOString()};
}
export function correlateNewsEvents(articles,{maxGroups=30,maxArticles=80,windowHours=36}={}){
 const rows=(Array.isArray(articles)?articles:[]).slice(0,Math.max(1,Math.min(150,maxArticles))).map(validArticle).filter(Boolean);
 const groups=[],seenUrl=new Set(),duplicateUrls=[];
 for(const article of rows){
  if(seenUrl.has(article.url)){duplicateUrls.push(article.url);continue;}seenUrl.add(article.url);
  const words=tokens(article.title);
  let group=null;
  for(const candidate of groups){
   const gap=Math.abs(Date.parse(candidate.articles[0].publishedAt)-Date.parse(article.publishedAt));
   if(gap>Math.max(1,Math.min(72,windowHours))*3600000)continue;
   if(similarity(candidate.words,words)>=0.72 && Math.min(candidate.words.length,words.length)>=3){
    group=candidate;break;
   }
  }
  if(!group){
   if(groups.length>=Math.max(1,Math.min(60,maxGroups)))continue;
   group={words,articles:[]};groups.push(group);
  }
  group.articles.push(article);
 }
 const output=groups.map(g=>{
  const sorted=[...g.articles].sort((a,b)=>Date.parse(a.publishedAt)-Date.parse(b.publishedAt)||a.url.localeCompare(b.url));
  const representative=sorted[0];
  const sources=sorted.map(a=>({title:a.title,url:a.url,source:clean(a.source||a.domain).slice(0,120),
   domain:a.domain,publishedAt:a.publishedAt,description:clean(a.description)}));
  const domains=new Set(sources.map(s=>s.domain));
  const titles=new Set(sorted.map(a=>tokens(a.title).join(" ")));
  const descriptions=new Set(sorted.map(a=>tokens(a.description).join(" ")).filter(Boolean));
  const potentialDifferences=titles.size>1||descriptions.size>1;
  const id="news-event-"+hash(sorted.map(a=>a.url).sort()[0]||representative.title);
  return {event_id:id,title:representative.title,summary:clean(representative.description)||null,
   timestamp:representative.publishedAt,sourceCount:sources.length,independentDomains:domains.size,
   sources,verificationStatus:"not-independently-verified",
   correlationMethod:"conservative-title-similarity",
   potentialDifferences,
   divergenceStatus:potentialDifferences?"review-needed":"not-detected",
   caveat:"Agrupamento por títulos; não atesta identidade perfeita do evento nem veracidade dos fatos."};
 });
 output.sort((a,b)=>Date.parse(b.timestamp)-Date.parse(a.timestamp));
 return {events:output,metrics:{received:rows.length,uniqueUrls:seenUrl.size,duplicateUrls:duplicateUrls.length,
  groupedEvents:output.length,multiSourceEvents:output.filter(e=>e.sourceCount>1).length,
  multiDomainEvents:output.filter(e=>e.independentDomains>1).length},
  limitations:"Correlação heurística. Não afirmar verificação factual ou 95% de acerto sem avaliação humana."};
}
