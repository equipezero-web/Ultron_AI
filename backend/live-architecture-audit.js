/**
 * Runtime, read-only self-architecture evidence. Never claims deploy==GitHub HEAD.
 * Fixed GitHub repository/file allowlist, no arbitrary URLs or access tokens.
 */
const API="https://api.github.com/repos/equipezero-web/Ultron_AI";
const FILES=["backend/memory.js","backend/providers.js","backend/provider-circuit-breaker.js","backend/provider-diagnostics.js"];
const COLUMNS=["id","operator_id","category","content","importance","source_message_id","created_at","updated_at","last_used_at","use_count"];
const headers={"Accept":"application/vnd.github+json","User-Agent":"JARVIS-Live-Architecture-ReadOnly"};
const fetchJson=async(path,fetchImpl)=>{
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),4800);
  try{
    const response=await fetchImpl(API+path,{method:"GET",headers,redirect:"error",signal:controller.signal});
    if(!response?.ok)return {ok:false,error:"github-http-"+(response?.status||0)};
    if(Number(response.headers?.get?.("content-length")||0)>180000)return {ok:false,error:"github-response-too-large"};
    const raw=await response.text();
    if(raw.length>180000)return {ok:false,error:"github-response-too-large"};
    return {ok:true,data:JSON.parse(raw)};
  }catch(e){return {ok:false,error:e?.name==="AbortError"?"github-timeout":"github-unavailable"};}
  finally{clearTimeout(timer);}
};
function decodeFile(value){
  if(value?.encoding!=="base64"||typeof value.content!=="string"||value.content.length>180000)return null;
  try{
    const raw=value.content.replace(/\s/g,"");
    if(!/^[a-zA-Z0-9+/]*={0,2}$/.test(raw))return null;
    return new TextDecoder("utf-8",{fatal:true}).decode(Uint8Array.from(atob(raw),c=>c.charCodeAt(0)));
  }catch{return null;}
}
export async function inspectLiveJarvisArchitecture(env,{fetchImpl=fetch,now=Date.now,backendVersion="unknown"}={}){
  const checkedAt=new Date(now()).toISOString();
  const head=await fetchJson("/commits/main",fetchImpl);
  const commit=head.ok&&/^[a-f0-9]{40}$/.test(head.data?.sha||"")?head.data.sha:null;
  const files=[];
  if(commit){
    const results=await Promise.all(FILES.map(path=>
      fetchJson("/contents/"+path+"?ref="+commit,fetchImpl)));
    for(let i=0;i<FILES.length;i++){
      const data=results[i],source=data.ok?decodeFile(data.data):null;
      files.push({path:FILES[i],ok:Boolean(source),source,
        error:source?null:(data.error||"github-file-unreadable")});
    }
  }
  const find=path=>files.find(f=>f.path===path);
  const memory=find("backend/memory.js")?.source||"";
  const provider=find("backend/providers.js")?.source||"";
  const breaker=find("backend/provider-circuit-breaker.js")?.source||"";
  const diagnostics=find("backend/provider-diagnostics.js")?.source||"";
  const memorySchemaMatch=memory.match(/CREATE TABLE IF NOT EXISTS memories\s*\(([\s\S]*?)\n\s*\)/);
  const memorySchema=memorySchemaMatch?.[1]||"";
  const columns=COLUMNS.filter(c=>new RegExp("^\\s*"+c+"\\s+","m").test(memorySchema));
  const cooldownMatch=breaker.match(/const MAX_COOLDOWN_MS\s*=\s*(\d+)/);
  const cooldownMs=cooldownMatch?Number(cooldownMatch[1]):null;
  // PRAGMA reads only schema metadata, not preference values or credentials.
  let d1={ready:false,configured:Boolean(env?.ULTRON_DB?.prepare),columns:[],error:"d1-not-configured"};
  if(d1.configured){
    try{
      const result=await env.ULTRON_DB.prepare("PRAGMA table_info(memories)").all();
      const values=Array.isArray(result?.results)?result.results.map(v=>String(v.name||"")):[];
      d1={ready:values.length>0,configured:true,columns:values,
        error:values.length?"":"d1-table-not-found"};
    }catch{d1={ready:false,configured:true,columns:[],error:"d1-query-failed"};}
  }
  return {checkedAt,repository:"equipezero-web/Ultron_AI",commit,backendVersion,
    github:{verified:Boolean(commit),error:head.error||(!commit?"github-commit-not-verified":null),
      files:files.map(({path,ok,error})=>({path,ok,error}))},
    memory:{verified:Boolean(memorySchema&&columns.length===COLUMNS.length),
      columns:memorySchema?columns:[],schemaSource:"backend/memory.js"},
    providers:{verified:Boolean(provider)&&/providerCircuitBreaker|generateWithProviders/.test(provider),
      source:"backend/providers.js"},
    circuitBreaker:{verified:cooldownMs!==null,cooldownMs,source:"backend/provider-circuit-breaker.js"},
    diagnostics:{verified:Boolean(diagnostics),source:"backend/provider-diagnostics.js"},
    d1,
    comparison:"O commit GitHub consultado não foi comparado criptograficamente ao Worker publicado.",
    writePermission:false};
}
export function formatLiveJarvisArchitecture(result){
  const yes=v=>v?"confirmado":"não verificado";
  const lines=[
    "J.A.R.V.I.S. // AUDITORIA DE ARQUITETURA AO VIVO (SOMENTE LEITURA)",
    "Consulta UTC: "+result.checkedAt,
    "GitHub: https://github.com/"+result.repository,
    "Commit HEAD/main consultado: "+(result.commit||"indisponível"),
    "Worker em execução: versão informada "+result.backendVersion+"; commit de deploy NÃO comprovado.",
    "GitHub API: "+yes(result.github.verified)+(result.github.error?" ("+result.github.error+")":""),
    "Arquivos realmente consultados: "+(result.github.files.map(f=>f.path+" ["+(f.ok?"lido":f.error)+"]").join("; ")||"nenhum"),
    "Memória (fonte GitHub): "+yes(result.memory.verified)+
      (result.memory.verified?"; colunas memories: "+result.memory.columns.join(", "):"; esquema não confirmado nesta leitura"),
    "D1 no Worker: "+(result.d1.ready?"consulta PRAGMA realizada; colunas atuais: "+result.d1.columns.join(", "):
      "não confirmado ("+result.d1.error+")"),
    "Provedores: "+yes(result.providers.verified)+" em "+result.providers.source+
      "; disponibilidade real dos provedores NÃO foi testada.",
    "Circuit breaker: "+(result.circuitBreaker.verified?
      "valor no código consultado = "+result.circuitBreaker.cooldownMs+" ms":
      "não confirmado nesta inspeção"),
    "Diagnósticos: "+yes(result.diagnostics.verified)+" em "+result.diagnostics.source,
    "Integridade: "+result.comparison,
    "Nenhum arquivo foi alterado e nenhum segredo ou conteúdo de preferências foi consultado."
  ];
  return lines.join("\n\n");
}
