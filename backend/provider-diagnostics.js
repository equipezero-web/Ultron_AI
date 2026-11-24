// Diagnostics are aggregate, bounded, isolate-local observations, not a
// credential/configuration probe or global provider availability monitor.
// Never persist user prompts, upstream error bodies, keys or operator IDs.
const PROVIDERS = ["gemini","groq","openrouter","cloudflare","cohere"];
const WINDOW_MS = 15*60*1000;
const MAX_EVENTS = 120;
const events = [];

function clean(value) {
  return String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .toLowerCase().replace(/[^a-z0-9 ]+/g," ").replace(/\s+/g," ").trim();
}

export function isProviderDiagnosticsIntent(message){
  const q=clean(message).replace(/^(?:(?:ei|ola|oi) )?(?:jarvis|ultron) /,"");
  if(!q || q.length>180)return false;
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

export function providerDiagnosticsAnswer(breaker, diagnostic=providerDiagnostics){
  const rows=diagnostic.report(breaker);
  const lines=rows.map(item=>{
    const count=item.successes+item.failures;
    const suffix=count?" ("+item.successes+" sucesso(s), "+item.failures+" falha(s) nos registros locais)": "";
    return item.provider+": "+item.state+suffix;
  });
  return {
    text:"Diagnóstico dos provedores de IA do J.A.R.V.I.S. (observações da instância atual, janela de 15 minutos):\n"+
      lines.join("\n")+"\nEsses dados não verificam disponibilidade mundial, nem provam que um provedor está online. "+
      "Instâncias diferentes do servidor podem ter registros diferentes; sem observações não significa falha.",
    provider:"jarvis-local",providerLabel:"J.A.R.V.I.S.",model:"provider-diagnostics",
    attempts:[],providerDiagnostics:{scope:"worker-isolate",windowMinutes:15,providers:rows},
    webResearch:{requested:false,used:false,sourceCount:0,sources:[]},
    audioBase64:null,audioMimeType:null
  };
}
