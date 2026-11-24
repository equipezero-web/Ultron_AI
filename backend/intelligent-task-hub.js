import {classifyJarvisTurn} from "./jarvis-conversation-router.js";
// Bounded multi-agent planner. Explicitly registered read-only agents only.
export const AGENTS=Object.freeze({
  research:{tools:["research.search"],level:1},
  meteorology:{tools:["weather.read"],level:1},
  news:{tools:["news.read"],level:1},
  devices:{tools:["devices.status"],level:1},
  memory:{tools:["memory.recall"],level:1},
  visual:{tools:["visual.render"],level:2},
  programming:{tools:["code.inspect","tests.read"],level:1}
});
const ACTIONS=[
  {agent:"meteorology",pattern:/\b(clima|tempo|chuva|meteorolog\w*|el nino|previs\w*)\b/,tool:"weather.read"},
  {agent:"news",pattern:/\b(notici\w*|acontecimentos|manchetes)\b/,tool:"news.read"},
  {agent:"devices",pattern:/\b(dispositivos|celular|android|tv|computador)\b/,tool:"devices.status"},
  {agent:"programming",pattern:/\b(codigo|repositorio|erro|programa\w*|bug|teste\w*)\b/,tool:"code.inspect"},
  {agent:"memory",pattern:/\b(memoria|lembre|anteriores|historico)\b/,tool:"memory.recall"},
  {agent:"research",pattern:/\b(pesquise|pesquisar|investigue|busque|procure)\b/,tool:"research.search"},
  {agent:"visual",pattern:/\b(globo|mapa|visualiz\w*|neural ring)\b/,tool:"visual.render"}
];
const NEGATORS=/\b(?:nao|nunca|jamais|sem|evite|dispense)\b/g;
// Coordinated requests can contain independent positive and negative clauses:
 // "não quero notícias e quero a previsão" must keep the forecast.
const CLAUSE_BOUNDARY=/[,;.!?]+|\b(?:mas|porem|contudo|e sim|em vez disso)\b|\be\s+(?=(?:quero|preciso|mostre|mostrar|exiba|exibir|consulte|consultar|verifique|verificar|pesquise|pesquisar|analise|analisar|visualize|visualizar|abra|abrir|veja|lembre|use)\b)/;
// A negative instruction is not authorization to plan its opposite. Each
// capability is matched within an affirmative clause, never just by keywords.
const DEVICE_ACTION=/\b(?:status|estado|bateria|conexao|conectado|pareado|pareamento|sincroniz\w*|notificac\w*|verifique|verificar|teste|testar|conecte|conectar|monitore|monitorar|inspecione|inspecionar|desconecte|desconectar)\b/;
function isDeviceAction(clause,action){
  if(action.agent!=="devices")return true;
  // A display target is not a request to control or inspect a device:
  // "notícias no celular" / "previsão na TV".
  return /\bdispositivos?\b/.test(clause)||DEVICE_ACTION.test(clause);
}
function affirmativeMatch(clause,pattern) {
  const matcher=new RegExp(pattern.source,"g");
  let hit;
  while((hit=matcher.exec(clause))) {
    const prefix=clause.slice(Math.max(0,hit.index-100),hit.index);
    const negations=[...prefix.matchAll(NEGATORS)];
    const last=negations[negations.length-1];
    if(last){
      const between=prefix.slice(last.index+last[0].length);
      if(between.trim().split(/\s+/).filter(Boolean).length<=7)continue;
    }
    return true;
  }
  return false;
}
export function planAgents(input,{maxSteps=6}={}) {
  const turn=classifyJarvisTurn(input);
  if(turn.isSocial||turn.kind==="contextual-observation")
    return {steps:[],parallelizable:false,requiresApproval:false,advisory:true,
      reason:"NO_CLEAR_AGENT_INTENT"};
  const message=String(input||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().slice(0,2000).trim();
  if(!message)return {steps:[],parallelizable:false,requiresApproval:false,advisory:true,reason:"EMPTY_COMMAND"};
  const clauses=message.split(CLAUSE_BOUNDARY).map(x=>x.trim()).filter(Boolean);
  const recognized=ACTIONS.filter(a=>clauses.some(c=>
    isDeviceAction(c,a)&&affirmativeMatch(c,a.pattern)));
  // A fully negated request must not silently become an unrelated web search.
  const onlyNegation=recognized.length===0&&clauses.some(c=>/\b(?:nao|nunca|jamais|sem|evite|dispense)\b/.test(c));
  const selected=recognized; // Unknown requests are not permission to start a research agent.
  const steps=selected.slice(0,Math.max(1,Math.min(6,Number(maxSteps)||6))).map((a,i)=>({
    id:"step-"+(i+1),agent:a.agent,tool:a.tool,level:AGENTS[a.agent].level,
    requiresApproval:AGENTS[a.agent].level>2
  }));
  return {steps,parallelizable:steps.every(x=>x.level===1),requiresApproval:steps.some(x=>x.requiresApproval),
    advisory:true,reason:onlyNegation?"NO_AFFIRMATIVE_ACTION":!selected.length?"NO_CLEAR_AGENT_INTENT":"RECOGNIZED_INTENT"};
}
export async function executeAgents(plan,{agents={},signal,onStep=()=>{},approved=false,concurrency=2}={}) {
  const tasks=plan?.steps;
  if(!Array.isArray(tasks)||!tasks.length||tasks.length>6)return {ok:false,error:"PLAN_INVALID"};
  if(tasks.some(s=>!AGENTS[s.agent]?.tools.includes(s.tool)||s.level!==AGENTS[s.agent].level))
    return {ok:false,error:"PLAN_NOT_ALLOWED"};
  // Pure read agents may run together; visual rendering must be a barrier
  // after the data they refer to, never before or in parallel with them.
  if(tasks.some((step,index)=>step.level===1&&tasks.slice(0,index).some(prev=>prev.level===2)))
    return {ok:false,error:"PLAN_INVALID_ORDER"};
  if(tasks.some(s=>s.level>2)&&!approved)return {ok:false,error:"APPROVAL_REQUIRED"};
  const limit=Math.max(1,Math.min(3,Number(concurrency)||2)),results=new Array(tasks.length);
  const notify=step=>{try{onStep(step);}catch{/* Observability cannot change execution outcome. */}};
  async function runStep(index) {
    const step=tasks[index];
    if(signal?.aborted){
      results[index]={id:step.id,status:"cancelled",agent:step.agent};notify(results[index]);return;
    }
    if(typeof agents[step.agent]!=="function"){
      results[index]={id:step.id,status:"unavailable",agent:step.agent};notify(results[index]);return;
    }
    try {
      // Only allowlisted tool and cancellation token reach the registered agent.
      const response=await agents[step.agent]({tool:step.tool,signal});
      const ok=response?.ok===true&&!signal?.aborted;
      results[index]={id:step.id,status:signal?.aborted?"cancelled":ok?"completed":"failed",
        agent:step.agent,result:ok?response?.result??null:null};
    } catch(error) {
      results[index]={id:step.id,status:signal?.aborted?"cancelled":"failed",agent:step.agent,
        error:String(error?.message||error).slice(0,160)};
    }
    notify(results[index]);
  }
  let cursor=0;
  while(cursor<tasks.length&&!signal?.aborted){
    if(tasks[cursor].level===2){
      // Never display a supposedly sourced visual when any preceding read failed.
      const index=cursor++;
      if(results.slice(0,index).some(x=>x?.status!=="completed")){
        const step=tasks[index];
        results[index]={id:step.id,status:"blocked",agent:step.agent,reason:"PREREQUISITE_NOT_COMPLETED"};
        notify(results[index]);
      }else await runStep(index);
      continue;
    }
    const batch=[];
    while(cursor<tasks.length&&tasks[cursor].level===1)batch.push(cursor++);
    let next=0;
    async function worker(){
      while(next<batch.length&&!signal?.aborted)await runStep(batch[next++]);
    }
    await Promise.all(Array.from({length:Math.min(limit,batch.length)},()=>worker()));
  }
  return {ok:!signal?.aborted&&results.every(x=>x?.status==="completed"),cancelled:Boolean(signal?.aborted),
    steps:tasks.map((step,index)=>results[index]||{id:step.id,status:"cancelled",agent:step.agent})};
}
