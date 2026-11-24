// Evidence review for already-grouped PUBLIC headlines. Never assert a source
// is true because other sites repeat it. Only flag comparable numeric claims.
const norm=value=>String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/\s+/g," ").trim();
const STOP=new Set(["de","do","da","das","dos","no","na","em","um","uma","o","a","os","as","com","para","por","e","sao","mais","pelo","pela"]);
const comparableClaimLabels=new Set([
 "mortos","mortes","feridos","desabrigados","desalojados","vitimas",
 "casos","internados","resgatados","desaparecidos","pessoas","familias","moradias"
]);
function numericClaims(title){
 const text=norm(title);
 const claims=[];
 // Use an explicit noun immediately after the count. Avoid dates, money and
 // quantities without an identified comparable category.
 const pattern=/\b(\d{1,5})\s+(mortos|mortes|feridos|desabrigados|desalojados|vitimas|casos|internados|resgatados|desaparecidos|pessoas|familias|moradias)\b/g;
 for(const found of text.matchAll(pattern)){
  const number=Number(found[1]),label=found[2];
  if(!Number.isSafeInteger(number)||!comparableClaimLabels.has(label))continue;
  claims.push({label,value:number});
 }
 return claims;
}
function storyFingerprint(title){
 return norm(title).replace(/\b\d+(?:[.,]\d+)?\b/g," ")
  .replace(/[^a-z ]/g," ").split(/\s+/).filter(word=>word.length>2&&!STOP.has(word)).join(" ");
}
export function reviewEventEvidence(event){
 const sources=(Array.isArray(event?.sources)?event.sources:[]).slice(0,15);
 const byLabel=new Map();
 for(const source of sources){
  const domain=String(source?.domain||"").trim();
  const title=String(source?.title||"");
  if(!domain||!title)continue;
  for(const claim of numericClaims(title)){
   const list=byLabel.get(claim.label)||[];
   list.push({value:claim.value,domain,url:String(source.url||"").slice(0,1000),
    fingerprint:storyFingerprint(title)});
   byLabel.set(claim.label,list);
  }
 }
 const discrepancies=[];
 for(const [label,claims] of byLabel){
  // Titles must have the same nonnumeric framing, on distinct domains, and
  // be different counts. Still ONLY a candidate for human/verified review.
  for(let a=0;a<claims.length;a++)for(let b=a+1;b<claims.length;b++){
   const left=claims[a],right=claims[b];
   if(left.domain===right.domain||left.value===right.value||left.fingerprint!==right.fingerprint)continue;
   discrepancies.push({kind:"potential-numeric-discrepancy",label,
    sources:[{domain:left.domain,url:left.url,value:left.value},
     {domain:right.domain,url:right.url,value:right.value}]});
   if(discrepancies.length>=4)break;
  }
 }
 const independentDomains=new Set(sources.map(s=>s.domain).filter(Boolean)).size;
 return {
  evidenceStatus:discrepancies.length?"potential-discrepancy":
   independentDomains>=2?"multi-source-unverified":"single-source-unverified",
  factChecked:false,sourceCount:sources.length,independentDomains,
  discrepancies:discrepancies.slice(0,4),
  limitations:"Comparação automática apenas de alegações numéricas com contexto equivalente; não prova falsidade, verdade ou independência editorial."
 };
}
export function reviewCorrelatedEvents(correlation){
 if(!correlation||!Array.isArray(correlation.events))return correlation;
 const events=correlation.events.map(event=>{
  const evidenceReview=reviewEventEvidence(event);
  return {...event,evidenceReview,
   // The original heuristic still owns the basic grouping warnings.
   divergenceStatus:evidenceReview.discrepancies.length?"potential-numeric-discrepancy":event.divergenceStatus,
   verificationStatus:"not-independently-verified"};
 });
 return {...correlation,events,
  evidenceSummary:{reviewed:events.length,potentialNumericDiscrepancies:events.filter(
   item=>item.evidenceReview.discrepancies.length>0).length,
   factChecked:0},
  limitations:"Agrupamento e comparação limitada de números em manchetes; nenhuma verificação factual independente foi realizada."};
}
