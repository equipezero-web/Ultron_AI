import {contextualMapCandidates} from "./jarvis-contextual-geo.js";

// Phase XII: a deterministic presentation plan over already verified sources.
// Never infer coordinates, synthesize media, classify hazard severity or run tools.
const HOUR=3600_000;
const safe=(s,max=170)=>String(s??"").replace(/[<>\r\n]/g," ").replace(/\s+/g," ").trim().slice(0,max);
const age=(timestamp,now)=>{
 const t=Date.parse(String(timestamp??""));
 return Number.isFinite(t)&&t<=now+300000&&now-t>=-300000?now-t:null;
};
function trusted(url){
 try{
  const u=new URL(String(url||""));
  if(u.protocol!=="https:"||u.username||u.password||u.port)return null;
  if(/^(?:localhost|127\.|0\.0\.0\.0|\[|10\.|192\.168\.)/i.test(u.hostname))return null;
  return u.href;
 }catch{return null;}
}
export function buildVisualStoryboard({digest=null,news=null,now=Date.now()}={}){
 if(!Number.isFinite(now))throw Error("Horário inválido");
 const freshDigest=digest?.ok===true&&age(digest.generatedAt,now)!==null&&
  age(digest.generatedAt,now)<=5*60_000;
 const priorityEntries=freshDigest&&Array.isArray(digest.items)?digest.items.slice(0,6).flatMap(item=>{
  const url=trusted(item?.url),t=age(item?.publishedAt,now);
  if(!url||t===null||!safe(item?.title))return [];
  if(item?.type==="news"&&t>24*HOUR)return [];
  if(item?.type==="cataloged"&&t>7*24*HOUR)return [];
  if(item?.type==="official-alert"&&t>2*HOUR)return [];
  return [{
   id:safe(item.key,100),title:safe(item.title,140),type:item.type,
   source:safe(item.source,65),url,publishedAt:item.publishedAt,
   category:safe(item.category,45),nearBrazil:item.nearBrazil===true,
   isNew:item.isNew===true
  }];
 }):[];
 const confirmedNews=news?.count>0&&Number.isInteger(news.count)&&
   age(news.lastUpdate,now)!==null&&age(news.lastUpdate,now)<=2*HOUR;
 const points=freshDigest?contextualMapCandidates(digest,{now}):[];
 const scenes=[];
 if(confirmedNews)scenes.push({
  id:"news",label:"Notícias e imagens",
  title:"NOTÍCIAS · MONITOR VERIFICADO",
  description:"Exibe notícias já coletadas pelo monitor de 24 horas. Imagens aparecem somente quando fornecidas pela fonte; não são geradas ou presumidas.",
  sourceLabel:"Monitor de notícias",sourceUrl:null,
  checkedAt:news.lastUpdate,records:Math.min(news.count,30)
 });
 if(priorityEntries.length)scenes.push({
  id:"priorities",label:"Prioridades",
  title:"PRIORIDADES · FONTES CONFIRMADAS",
  description:"Resumo de acontecimentos publicados, ordenados editorialmente. A posição na lista não é gravidade nem previsão de risco.",
  sourceLabel:"Fontes das prioridades",sourceUrl:null,
  checkedAt:digest.generatedAt,records:priorityEntries.length,
  entries:priorityEntries
 });
 if(points.length){
  const first=points[0];
  scenes.push({
   id:"map",label:"Mapa 2D",
   title:"MAPA · LOCALIZAÇÕES PUBLICADAS",
   description:"Mostra somente coordenadas fornecidas ou representativas de eventos catalogados. Pinos não delimitam impacto territorial.",
   sourceLabel:"Fonte do primeiro evento",sourceUrl:trusted(first.source),
   checkedAt:digest.generatedAt,records:points.length,
   focusKey:first.id
  });
  scenes.push({
   id:"tour",label:"Exploração 3D",
   title:"GLOBO · EXPLORAÇÃO GUIADA",
   description:"Centraliza um evento georreferenciado e permite navegar manualmente entre registros. A câmera não simula o progresso de um desastre.",
   sourceLabel:"Fonte do primeiro evento",sourceUrl:trusted(first.source),
   checkedAt:digest.generatedAt,records:points.length,focusKey:first.id
  });
 }
 return {
  ok:scenes.length>0,generatedAt:new Date(now).toISOString(),
  scenes,available:scenes.map(s=>s.id),
  counts:{news:confirmedNews?news.count:0,priorities:priorityEntries.length,geocoded:points.length},
  fresh:{news:confirmedNews,priorities:priorityEntries.length>0,geospatial:points.length>0},
  disclaimer:"Fontes e datas verificadas antes de apresentar. Imagens sem fonte e mapas de impacto inferidos não são criados.",
  reason:scenes.length?"READY":"NO_CURRENT_VERIFIED_VISUALS"
 };
}
export function createVisualSceneNavigator(plan){
 if(!plan?.ok||!Array.isArray(plan.scenes)||!plan.scenes.length)
  throw Error("Não há visualizações verificadas");
 const choices=new Set(plan.scenes.map(scene=>scene.id));
 if(choices.size!==plan.scenes.length)throw Error("Cenas duplicadas");
 let index=0;
 const snapshot=()=>({ok:true,index,count:plan.scenes.length,
  current:{...plan.scenes[index],entries:plan.scenes[index].entries?.map(x=>({...x}))},
  previous:index>0,next:index<plan.scenes.length-1});
 const at=id=>{
  const next=plan.scenes.findIndex(scene=>scene.id===id);
  if(next<0)return {ok:false,reason:"SCENE_NOT_AVAILABLE"};
  index=next;return snapshot();
 };
 const step=direction=>{
  if(direction!==1&&direction!==-1)return {ok:false,reason:"INVALID_DIRECTION"};
  if(index+direction<0||index+direction>=plan.scenes.length)
   return {ok:false,reason:"END_OF_SEQUENCE"};
  index+=direction;return snapshot();
 };
 return {snapshot,choose:at,step};
}
