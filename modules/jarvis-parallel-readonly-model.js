// JARVIS local-safe parallel tasks. No device writes, financial actions or arbitrary code.
// User gestures start tasks. Each task is a read-only function supplied by the UI.
// Concurrency is bounded and duplicate running tasks are rejected; P0 aborts.
// This is in-page multitasking, not a persistent/background cloud worker.
export const JARVIS_SAFE_TASK_TYPES=Object.freeze(["world-cameras","device-status","meteorology-status","data-intelligence"]);
export function validateSafeTask(name){
 return typeof name==="string"&&JARVIS_SAFE_TASK_TYPES.includes(name);
}
export function normalizeTaskSelection(value){
 if(!Array.isArray(value))return [];
 return [...new Set(value.filter(validateSafeTask))].slice(0,4);
}
export function createParallelTaskCenter({handlers={},maxConcurrent=3,now=()=>new Date().toISOString()}={}){
 const limit=Math.min(3,Math.max(1,Number(maxConcurrent)||2));
 const active=new Map(),history=[],listeners=new Set();
 let sequence=0,controller=null,batchInFlight=false;
 const notify=()=>{for(const fn of [...listeners])try{fn(snapshot());}catch{}};
 const bounded=s=>String(s??"").replace(/[\r\n<>]/g," ").slice(0,380);
 const snapshot=()=>({
  running:active.size,
  busy:batchInFlight,
  maxConcurrent:limit,
  recent:history.slice(0,12).map(x=>({...x})),
  tasks:[...active.values()].map(x=>({...x}))
 });
 function subscribe(fn){if(typeof fn!=="function")return()=>{};listeners.add(fn);fn(snapshot());return()=>listeners.delete(fn);}
 async function start(names){
  if(active.size)return {ok:false,error:"Já existe um lote de tarefas em execução."};
  const selected=normalizeTaskSelection(names);
  if(!selected.length)return {ok:false,error:"Selecione tarefas seguras conhecidas."};
  // A second start() could otherwise launch three more workers while the first
  // batch is still active, violating the global concurrency cap and P0 fence.
  if(batchInFlight)return {ok:false,error:"Outra rodada de consultas está em execução. Use PARAR MULTITAREFAS ou aguarde a conclusão."};
  batchInFlight=true;notify();
  const duplicates=selected.filter(x=>active.has(x));
  if(duplicates.length)return {ok:false,error:"Uma tarefa já está em execução: "+duplicates.join(", ")};
  const pending=[...selected],results=[];
  if(!controller||controller.signal.aborted)controller=new AbortController();
  const signal=controller.signal;
  const workers=Array.from({length:Math.min(limit,pending.length)},async()=>{
   while(pending.length&&!signal.aborted){
    const name=pending.shift();
    if(active.has(name))continue;
    const item={id:"safe-"+(++sequence),name,status:"running",startedAt:now()};
    active.set(name,item);notify();
    let result;
    try{
     const fn=handlers[name];
     if(typeof fn!=="function")throw Error("Tarefa não instalada.");
     const value=await fn({signal});
     if(signal.aborted){result={...item,status:"cancelled",finishedAt:now(),message:"Parada pelo operador."};}
     else if(value?.ok===false){result={...item,status:"failed",finishedAt:now(),
      message:bounded(value?.error||"Leitura indisponível.")};}
     else result={...item,status:"completed",finishedAt:now(),
      message:bounded(value?.summary||"Consulta concluída."),verified:value?.verified===true};
    }catch(error){result={...item,status:signal.aborted?"cancelled":"failed",finishedAt:now(),
      message:signal.aborted?"Parada pelo operador.":bounded(error?.message||"Consulta falhou.")};}
    active.delete(name);history.unshift(result);history.length=Math.min(history.length,12);
    results.push(result);notify();
   }
  });
  await Promise.all(workers);
  if(signal.aborted&&pending.length){
   for(const name of pending)history.unshift({id:"cancelled-"+(++sequence),name,status:"cancelled",startedAt:null,
    finishedAt:now(),message:"Não iniciada após parada."});
   history.length=Math.min(history.length,12);notify();
  }
  const outcome={ok:results.length>0&&results.every(r=>r.status==="completed")&&!signal.aborted,
    results,cancelled:signal.aborted};
  // Release only after all active handlers settle; P0 must not allow a new
  // batch to overlap an old one whose asynchronous read has not returned.
  batchInFlight=false;notify();
  return outcome;
 }
 function stop(){controller?.abort();notify();return {ok:true,stopping:true};}
 return {start,stop,subscribe,snapshot,get state(){return snapshot();}};
}
