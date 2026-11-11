// Phase 1 (3/3): scoped operational memory, not a shadow copy of chat history.
// Only non-sensitive topic/region/mode is retained in sessionStorage. Reset on
// conversation change, inactivity expiry or explicit operator reset.
import {normalizeIntent,isPrivateTurn,classifyOperatorTurn} from "./jarvis-intent-engine.js?v=4.69.0";
const KEY="ultron_task_context_v1",TTL=2*60*60*1000;
const fresh=(at,conversationId)=>({version:1,conversationId:String(conversationId||""),topic:"",region:"",visualization:"ring",lastPublicQuestion:"",lastAction:"",updatedAt:at});
const clipped=(v,n)=>String(v||"").replace(/[\r\n<>]/g," ").replace(/\s+/g," ").trim().slice(0,n);
const cleanContext=(value,at,id)=>{
 const data=value&&typeof value==="object"?value:{};
 if(data.version!==1||data.conversationId!==String(id||"")||!Number.isFinite(data.updatedAt)||Math.abs(at-data.updatedAt)>TTL)return fresh(at,id);
 const s=fresh(at,id);
 for(const [key,limit] of [["topic",180],["region",100],["lastPublicQuestion",280],["lastAction",70]]) {
  const v=clipped(data[key],limit);if(!isPrivateTurn(v))s[key]=v;
 }
 s.visualization=["ring","globe","map-2d"].includes(data.visualization)?data.visualization:"ring";
 s.updatedAt=data.updatedAt;
 return s;
};
function extractTopic(question) {
 const q=clipped(question,280);
 const text=q.replace(/^(?:jarvis|ultron)[,!: ]+/i,"").replace(/^(?:pesquise|analise|explique|investigue|me fale|fale|qual o impacto|quais os impactos|o que aconteceu|como funciona|como esta|como anda)\s*/i,"").trim();
 const subject=text.match(/(?:impactos?|efeitos?|consequencias?|influencia)\s+(?:d[oea]s?\s+)?(.+?)(?=\s+(?:no|na|nos|nas|em|para)\s+|[?!.,]|$)/i);
 const about=text.match(/\b(?:sobre|a respeito d[eoas]|relacionad[oa]s?\s+a)\s+(.+?)(?=\s+(?:no|na|em|para)\s+|[?!.,]|$)/i);
 return clipped((subject||about)?.[1]||text,180);
}
export function createTaskContext({storage=null,now=()=>Date.now(),conversationId=()=>""}={}){
 let state;
 const id=()=>String(conversationId()||"");
 const load=()=>{
   if(state) {
     state=cleanContext(state,now(),id());
     return state;
   }
   try{state=cleanContext(JSON.parse(storage?.getItem(KEY)||"null"),now(),id());}
   catch{state=fresh(now(),id());}
   return state;
 };
 const persist=()=>{
   if(!state)return;
   state.updatedAt=now();
   try{storage?.setItem(KEY,JSON.stringify(state));}catch{}
 };
 const snapshot=()=>({...load()});
 const reset=()=>{
   state=fresh(now(),id());
   try{storage?.removeItem(KEY);}catch{}
   return snapshot();
 };
 const captureQuestion=(message)=>{
   if(isPrivateTurn(message))return snapshot();
   const type=classifyOperatorTurn(message);
   if(type.kind==="command"||type.kind==="negated")return snapshot();
   const raw=clipped(message,280);
   if(raw.length<9||/^(?:e |agora |entao |depois |isso |ele |ela |la\b)/i.test(normalizeIntent(raw)))return snapshot();
   const s=load();s.lastPublicQuestion=raw;s.topic=extractTopic(raw);
   persist();return snapshot();
 };
 const recordAction=(step,result={})=>{
   if(result.ok===false)return snapshot();
   const action=step?.action||"",args=step?.args||{};
   const s=load();
   if(action==="earth.locate"){
      const region=clipped(args.place,100);
      if(region&&!isPrivateTurn(region))s.region=region;
      s.visualization="globe";
   }else if(action==="earth.open")s.visualization="globe";
   else if(action==="earth.close")s.visualization="ring";
   else if(action==="ring.reset"||action==="ring.zoom")s.visualization="ring";
   else if(action==="visualization.2d")s.visualization="map-2d";
   s.lastAction=clipped(action||result.route,70);
   persist();return snapshot();
 };
 const resolve=(message)=>{
   const source=String(message||"").trim(),q=normalizeIntent(source);
   const snap=snapshot();
   if(isPrivateTurn(source))return {message:source,kind:"private",used:false,context:null};
   const hasHistory=Boolean(snap.lastPublicQuestion||snap.region);
   const focus=q.match(/^(?:agora\s+)?(?:foque|foca|focar|centralize|centralizar|localize|localizar|encontre|encontrar|ache|aproxime\s+(?:o|a)\s+visao\s+(?:para|de))\s+(?:somente\s+|so\s+)?(?:no|na|nos|nas|em|para|o|a)\s+(.+?)[?!.,]*$/);
   const region=clipped(focus?.[1],100);
   if(focus&&region&&!isPrivateTurn(region)&&(snap.visualization==="globe"||/\b(?:globo|mapa)\b/.test(q))){
      return {message:source,kind:"contextual-action",command:"Localize "+region+" no globo",used:true,region,context:snap};
   }
   const geoShortcut=q.match(/^(?:e |agora )?(?:no|na|em)\s+(.+?)\??$/);
   const comparison=q.match(/^(?:agora\s+)?(?:compare|comparar|comparacao|comparacao\s+com|e\s+compare)\s+(?:com\s+)?(.+?)[?!.,]*$/);
   const ambiguous=/^(?:e\s+(?:la|ali|agora|hoje|isso|ele|ela|como|quanto)|agora\s+(?:me diga|explique|compare)|(?:e\s+)?(?:mais detalhes|e os detalhes))\b/.test(q);
   const followup=Boolean(geoShortcut||comparison||ambiguous);
   if(hasHistory&&followup&&snap.lastPublicQuestion){
      const place=clipped(geoShortcut?.[1],100);
      const relative=/^(?:la|ali|isso|ele|ela)$/.test(place)?snap.region:place;
      const focusPart=relative&&isPrivateTurn(relative)===false?" Região em foco: "+relative+".":"";
      return {message:source,kind:"contextual-question",used:true,
       researchQuery:"Assunto anterior: "+snap.topic+". Pergunta anterior: "+snap.lastPublicQuestion+"."+focusPart+" Pergunta atual: "+source,
       context:snap,region:relative||snap.region||""};
   }
   return {message:source,kind:"ordinary",used:false,context:hasHistory?snap:null};
 };
 const publicContextFor=(message)=>{
   const r=resolve(message);
   if(!r.used||r.kind!=="contextual-question"||isPrivateTurn(message))return null;
   return {followup:true,topic:clipped(r.context?.topic,180),region:clipped(r.region,100),
     lastQuestion:clipped(r.context?.lastPublicQuestion,280),researchQuery:clipped(r.researchQuery,650),
     visualization:r.context?.visualization||"ring"};
 };
 return {snapshot,reset,captureQuestion,recordAction,resolve,publicContextFor};
}
export const TASK_CONTEXT=typeof window!=="undefined"?createTaskContext({
 storage:(()=>{try{return window.sessionStorage;}catch{return null;}})(),
 now:()=>Date.now(),
 conversationId:()=>window.ULTRON_MEMORY?.getConversationId?.()||""
}):null;
if(typeof window!=="undefined"){
 window.ULTRON_TASK_CONTEXT=TASK_CONTEXT;
 window.addEventListener("ultron:new-conversation",()=>TASK_CONTEXT?.reset());
 window.addEventListener("ultron:visual-mode",event=>{
   const mode=event.detail?.mode;
   if(["ring","globe"].includes(mode))TASK_CONTEXT?.recordAction({action:mode==="globe"?"earth.open":"earth.close"});
 });
}
