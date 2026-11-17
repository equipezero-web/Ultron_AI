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
  {agent:"meteorology",pattern:/\b(clima|tempo|chuva|meteorolog|el nino|previsao)\b/,tool:"weather.read"},
  {agent:"news",pattern:/\b(noticias|noticias|acontecimentos|manchetes)\b/,tool:"news.read"},
  {agent:"devices",pattern:/\b(dispositivos|celular|android|tv|computador)\b/,tool:"devices.status"},
  {agent:"programming",pattern:/\b(codigo|repositorio|erro|programa|bug|teste)\b/,tool:"code.inspect"},
  {agent:"memory",pattern:/\b(memoria|lembre|anteriores|historico)\b/,tool:"memory.recall"},
  {agent:"research",pattern:/\b(pesquise|pesquisar|investigue|busque|procure)\b/,tool:"research.search"},
  {agent:"visual",pattern:/\b(globo|mapa|visualiz|neural ring)\b/,tool:"visual.render"}
];
export function planAgents(input,{maxSteps=6}={}) {
  const message=String(input||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().slice(0,2000);
  const recognized=ACTIONS.filter(a=>a.pattern.test(message));
  const selected=recognized.length?recognized:[{agent:"research",tool:"research.search"}];
  const steps=selected.slice(0,Math.max(1,Math.min(6,maxSteps))).map((a,i)=>({
    id:"step-"+(i+1),agent:a.agent,tool:a.tool,level:AGENTS[a.agent].level,
    requiresApproval:AGENTS[a.agent].level>2
  }));
  return {steps,parallelizable:steps.every(x=>x.level===1),requiresApproval:steps.some(x=>x.requiresApproval),
    advisory:true};
}
export async function executeAgents(plan,{agents={},signal,onStep=()=>{},approved=false,concurrency=2}={}) {
  const tasks=plan?.steps;
  if(!Array.isArray(tasks)||!tasks.length||tasks.length>6)return {ok:false,error:"PLAN_INVALID"};
  if(tasks.some(s=>!AGENTS[s.agent]?.tools.includes(s.tool)||s.level!==AGENTS[s.agent].level))
    return {ok:false,error:"PLAN_NOT_ALLOWED"};
  if(tasks.some(s=>s.level>2)&&!approved)return {ok:false,error:"APPROVAL_REQUIRED"};
  const limit=Math.max(1,Math.min(3,Number(concurrency)||2)),results=new Array(tasks.length);
  let next=0;
  async function worker() {
    while(next<tasks.length) {
      if(signal?.aborted)return;
      const index=next++,step=tasks[index];
      if(typeof agents[step.agent]!=="function") {
        results[index]={id:step.id,status:"unavailable",agent:step.agent};onStep(results[index]);continue;
      }
      try {
        // Never pass arbitrary instructions to privileged agents. Tools are fixed by plan.
        const response=await agents[step.agent]({tool:step.tool,signal});
        const ok=response?.ok===true;
        results[index]={id:step.id,status:ok?"completed":"failed",agent:step.agent,
          result:ok?response?.result??null:null};onStep(results[index]);
      } catch(error) {
        results[index]={id:step.id,status:signal?.aborted?"cancelled":"failed",agent:step.agent,
          error:String(error?.message||error).slice(0,160)};onStep(results[index]);
      }
    }
  }
  await Promise.all(Array.from({length:Math.min(limit,tasks.length)},()=>worker()));
  return {ok:!signal?.aborted&&results.every(x=>x?.status==="completed"),cancelled:Boolean(signal?.aborted),
    steps:results.map((r,i)=>r||{id:tasks[i].id,status:"cancelled",agent:tasks[i].agent})};
}
