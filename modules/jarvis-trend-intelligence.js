import API_CONFIG from "../config.js";

const BASE=String(API_CONFIG?.backendUrl||"").replace(/\/+$/,"");
const host=document.querySelector(".jarvis-cc-center")||document.querySelector(".orb-stage");
const clean=(v,max=160)=>String(v??"").replace(/[<>]/g," ").replace(/\s+/g," ").trim().slice(0,max);
const safeLink=v=>{try{const u=new URL(String(v||""));
 return u.protocol==="https:"&&!u.username&&!u.password&&!u.port?u.href:null;
 }catch{return null;}};
const date=raw=>{const t=Date.parse(raw||"");return Number.isFinite(t)?
 new Date(t).toLocaleString("pt-BR",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"}):
 "horário não verificado";};
const element=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;
 if(text!==undefined)e.textContent=text;return e;};
let panel=null,visible=false,last=null,loading=false,requestId=0;
function build(){
 if(panel||!host)return;
 panel=element("section","jarvis-trends-panel");
 panel.id="jarvis-trends-panel";
 panel.setAttribute("aria-label","Tendências verificadas e sinais públicos");
 panel.hidden=true;
 const h=element("header","jarvis-trends-head");
 h.append(element("strong","","J.A.R.V.I.S. // INTELIGÊNCIA DE TENDÊNCIAS"));
 const status=element("p","jarvis-trends-status","Fontes ainda não consultadas.");
 status.id="jarvis-trends-status";
 const feed=element("div","jarvis-trends-feed");feed.id="jarvis-trends-feed";
 h.append(element("small","","FONTES ABERTAS • SINAIS DE BUSCA ≠ MANCHETES"));
 panel.append(h,status,feed);
 host.append(panel);
}
const headings={br:"BRASIL",world:"MUNDO",all:"BRASIL + MUNDO"};
function render(data,{region="all",category="all"}={}){
 build();if(!panel)return;
 const status=panel.querySelector("#jarvis-trends-status"),feed=panel.querySelector("#jarvis-trends-feed");
 feed.replaceChildren();
 if(!data?.ok){
  status.textContent="Sem coleta confirmada. "+clean(data?.error||"Conexão indisponível.",210);
  return;
 }
 status.textContent=headings[region]+" • "+(category==="all"?"TODOS OS SETORES":category.toUpperCase())+
  " • COLETA "+date(data.checkedAt)+(data.stale?" • DADOS DEFASADOS":"")+
  (data.coverage?" • SETORES/FEEDS: "+data.coverage.observed+"/"+data.coverage.expected:"")+
  (data.partial?" • COBERTURA PARCIAL":"")+
  " • AMOSTRA PÚBLICA, NÃO COBERTURA TOTAL";
 const signals=(Array.isArray(data.items)?data.items:[])
  .filter(x=>x?.kind==="search-trend"||x?.kind==="news-observation").slice(0,45);
 if(!signals.length){
  feed.append(element("p","jarvis-trends-empty",
   "As fontes responderam, mas não há registros recentes neste filtro. Nenhuma tendência foi presumida."));
  return;
 }
 for(const item of signals){
  const article=element("article","jarvis-trends-entry");
  const top=element("div","jarvis-trends-entry-top");
  top.append(element("small","",item.kind==="search-trend"?"BUSCA EM ALTA · "+clean(item.region):
   "MANCHETE RECENTE · "+clean(item.category)));
  if(item.stale)top.append(element("small","","DEFASADO"));
  const url=safeLink(item.url),title=element(url?"a":"span","jarvis-trends-title",clean(item.title,155));
  if(url){title.href=url;title.target="_blank";title.rel="noopener noreferrer";}
  const stats=element("small","jarvis-trends-meta",
   clean(item.source,55)+" · "+date(item.observedAt)+
   (item.approximateSearches?" · BUSCAS APROX. "+clean(item.approximateSearches,20):"")+
   (item.observedCycles>=2?" · PRESENTE EM "+item.observedCycles+" COLETAS":""));
  const explanation=element("p","jarvis-trends-evidence",clean(item.evidence,220));
  article.append(top,title,stats,explanation);
  const verifiedReferences=(Array.isArray(item.newsReferences)?item.newsReferences:[])
    .filter(x=>safeLink(x.url)).slice(0,2);
  for(const ref of verifiedReferences){
   const link=element("a","jarvis-trends-reference","Referência: "+clean(ref.source||ref.title,75));
   link.href=safeLink(ref.url);link.target="_blank";link.rel="noopener noreferrer";
   article.append(link);
  }
  feed.append(article);
 }
 const disclaimer=element("p","jarvis-trends-disclaimer",
   clean(data.interpretation||"Tendências são sinais observados nas fontes, não certezas.",330)+
   " Origem: feeds públicos. Não há coleta de dados pessoais.");
 feed.append(disclaimer);
}
async function getData({region="all",category="all"}={}){
 if(!BASE)throw Error("Backend ainda não configurado.");
 const q=new URLSearchParams({region,category}),ctl=new AbortController();
 const timeout=setTimeout(()=>ctl.abort(),9000);
 try{
  const res=await fetch(BASE+"/api/intelligence/trends?"+q,{signal:ctl.signal,cache:"no-store"});
  const data=await res.json().catch(()=>({ok:false,error:"Resposta inválida do monitor."}));
  if(!res.ok||!data?.ok)throw Error(clean(data?.error||"Monitor ainda não disponível.",180));
  return data;
 }finally{clearTimeout(timeout);}
}
async function open({region="all",category="all",refresh=false}={}){
 build();
 if(!panel)return {ok:false,error:"Neural Ring ainda indisponível"};
 if(loading)return {ok:false,error:"Atualização de tendências já em andamento"};
 visible=true;panel.hidden=false;loading=true;
 const id=++requestId;
 panel.querySelector("#jarvis-trends-status").textContent="Conferindo os registros públicos persistidos, sem inventar tendências…";
 try{
  const data=await getData({region,category});
  if(id!==requestId)return {ok:false,error:"Comando substituído"};
  last=data;render(data,{region,category});
  return {ok:true,visible:true,count:data.items.length,region,category,
   stale:data.stale,checkedAt:data.checkedAt,
   message:"Exibidos "+data.items.length+" sinais com fontes públicas e data de coleta. "+
    (data.stale?"Amostra defasada.":"Sinais não equivalem a previsões de popularidade.")};
 }catch(error){
  if(id===requestId)render({ok:false,error:String(error.message||error)},{region,category});
  return {ok:false,error:clean(error.message||error,185)};
 }finally{loading=false;}
}
function close(){++requestId;visible=false;if(panel)panel.hidden=true;
 return {ok:true,message:"Painel de tendências fechado. Coletas públicas continuam no backend."};}
// At voice activation provide useful grounded public BR-first briefing context,
// without silently triggering microphones or interrupting the existing news TTS.
let lastWake=0;
window.addEventListener("ultron:wake-state",event=>{
 if(!event?.detail?.awake||Date.now()-lastWake<20000)return;
 lastWake=Date.now();
 void getData({region:"br"}).then(data=>{
  if(!data?.items?.length)return;
  const top=data.items.filter(x=>!x.stale).slice(0,3);
  const msg=top.length?"BRASIL · tendências observadas: "+
   top.map(x=>clean(x.title,65)).join(" · "):
   "Monitor de tendências do Brasil: últimos sinais disponíveis estão defasados.";
  const log=document.querySelector("#jarvis-cc-log");
  if(log){
   const p=element("p","jarvis-trends-wake",msg+" · "+
     date(data.checkedAt)+" · sinais baseados em feeds, não fatos independentemente confirmados.");
   log.prepend(p);while(log.querySelectorAll(".jarvis-trends-wake").length>2)
    log.querySelector(".jarvis-trends-wake:last-of-type")?.remove();
  }
  window.dispatchEvent(new CustomEvent("ultron:trends-update",{detail:{
   checkedAt:data.checkedAt,stale:data.stale,highlights:top.map(x=>({
    title:x.title,category:x.category,source:x.source,url:x.url,kind:x.kind
   }))}}));
 }).catch(()=>{ /* No new event without verified public data. */ });
});
window.addEventListener("ultron:new-conversation",close);
window.JARVIS_TREND_INTELLIGENCE={open,close,refresh:open,
 get state(){return {visible,loading,checkedAt:last?.checkedAt||null,
  stale:last?.stale??true,count:last?.items?.length||0};}};
