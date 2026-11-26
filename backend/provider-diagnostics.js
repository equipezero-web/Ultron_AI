// Diagnostics are aggregate, bounded, isolate-local observations, not a
// credential/configuration probe or global provider availability monitor.
// Never persist user prompts, upstream error bodies, keys or operator IDs.
const PROVIDERS = ["gemini","groq","openrouter","cloudflare","cohere","mistral","deepseek","cerebras"];
const WINDOW_MS = 15*60*1000;
const MAX_EVENTS = 120;
const events = [];

function clean(value) {
  return String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .toLowerCase().replace(/[^a-z0-9 ]+/g," ").replace(/\s+/g," ").trim();
}

export function isProviderDiagnosticsIntent(message){
  const q=clean(message).replace(/^(?:(?:ei|ola|oi) )?(?:jarvis|ultron) /,"");
  // Longer explicit health requests are common; limit to a bounded user turn,
  // not an arbitrary short sentence that routes diagnostics to another intent.
  if(!q || q.length>1000)return false;
  return /\b(?:provedor(?:es)? (?:de )?ia|modelos? (?:de )?ia|gateway (?:de )?ia)\b/.test(q)
    && /\b(?:status|estado|diagnostico|diagnosticos|saude|falhas|recuperacao|disponibilidade|monitoramento|monitorar)\b/.test(q);
}

export function createProviderDiagnostics({now=Date.now}={}){
  const observations=[];
  function prune(){
    const cut=now()-WINDOW_MS;
    while(observations.length && (observations[0].at<cut || observations.length>MAX_EVENTS))observations.shift();
  }
  return {
    record(attempt){
      const name=String(attempt?.provider||"").toLowerCase();
      const status=String(attempt?.status||"");
      if(!PROVIDERS.includes(name) || !["success","failed"].includes(status))return false;
      const ms=Number(attempt?.durationMs);
      observations.push({provider:name,status,at:now(),
        durationMs:Number.isFinite(ms)&&ms>=0?Math.min(ms,60000):null});
      prune();
      return true;
    },
    report(breaker){
      prune();
      return PROVIDERS.map(provider=>{
        const list=observations.filter(item=>item.provider===provider);
        const last=list.at(-1);
        const successes=list.filter(item=>item.status==="success");
        const failures=list.filter(item=>item.status==="failed");
        const durations=successes.map(item=>item.durationMs).filter(Number.isFinite);
        const cooling=Boolean(breaker?.isCooling?.(provider));
        return {
          provider,
          state:cooling?"resfriamento":last?.status==="success"?"sucesso observado":
            last?.status==="failed"?"falha observada":"sem observações",
          cooling,
          successes:successes.length,
          failures:failures.length,
          lastObservedAt:last?new Date(last.at).toISOString():null,
          averageSuccessMs:durations.length?Math.round(durations.reduce((a,b)=>a+b,0)/durations.length):null
        };
      });
    }
  };
}

export const providerDiagnostics=createProviderDiagnostics();

export function providerDiagnosticsAnswer(breaker, diagnostic=providerDiagnostics, persistent=null){
  const shared=persistent?.ok===true;
  const local=diagnostic.report(breaker);
  const rows=shared?local.map(item=>{
    const db=persistent.rows.find(row=>row.provider===item.provider);
    if(!db)return {...item,state:item.cooling?"resfriamento local":"sem observações",successes:0,failures:0,
      lastObservedAt:null,averageSuccessMs:null};
    const successes=Math.max(0,Number(db.successes)||0);
    const failures=Math.max(0,Number(db.failures)||0);
    const lastAt=Number(db.lastObservedMs);
    const mean=Number(db.averageSuccessMs);
    return {...item,successes,failures,
      state:item.cooling?"resfriamento local":db.lastOutcome==="success"?"sucesso observado":
        db.lastOutcome==="failed"?"falha observada":"sem observações",
      lastObservedAt:Number.isFinite(lastAt)&&lastAt>0?new Date(lastAt).toISOString():null,
      averageSuccessMs:db.averageSuccessMs!=null&&Number.isFinite(mean)?mean:null};
  }):local;
  const lines=rows.map(item=>{
    const count=item.successes+item.failures;
    return item.provider+": "+item.state+
      (count?" ("+item.successes+" sucesso(s), "+item.failures+" falha(s) observada(s))":"");
  });
  const scope=shared?"d1-shared":"worker-isolate";
  const title=shared?"registros compartilhados no Cloudflare D1":
    "observações desta instância (D1 indisponível ou ainda não configurado)";
  const disclaimer=shared?
    "Resultados agregados entre instâncias, sem teste ativo de disponibilidade. O resfriamento é local à instância; sem observações não significa offline.":
    "O histórico persistente não está disponível nesta consulta; estes registros são apenas locais. Sem observações não significa offline.";
  return {
    text:"Diagnóstico dos provedores de IA do J.A.R.V.I.S. ("+title+", últimos 15 minutos):\n"+
      lines.join("\n")+"\n"+disclaimer,
    provider:"jarvis-local",providerLabel:"J.A.R.V.I.S.",model:"provider-diagnostics",
    attempts:[],providerDiagnostics:{scope,windowMinutes:15,providers:rows,
      sharedStorage:shared,storageError:shared?null:(persistent?.reason||"d1-not-checked")},
    webResearch:{requested:false,used:false,sourceCount:0,sources:[]},
    audioBase64:null,audioMimeType:null
  };
}
