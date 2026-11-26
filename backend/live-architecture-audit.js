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
// Public read-only degraded mode when GitHub REST is unreachable.
// A raw /main/ read is LIVE but not commit-pinned; explicitly label it.
async function fetchRawMainFile(path,fetchImpl){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),5000);
  try{
    const response=await fetchImpl("https://raw.githubusercontent.com/equipezero-web/Ultron_AI/main/"+path,{
      method:"GET",headers:{"Accept":"text/plain","User-Agent":"JARVIS-Live-Architecture-ReadOnly"},
      redirect:"error",signal:controller.signal
    });
    if(!response?.ok)return {ok:false,error:"github-raw-http-"+(response?.status||0)};
    if(Number(response.headers?.get?.("content-length")||0)>160000)
      return {ok:false,error:"github-raw-too-large"};
    const source=await response.text();
    if(!source||source.length>160000||source.startsWith("<!DOCTYPE"))
      return {ok:false,error:"github-raw-invalid"};
    return {ok:true,source};
  }catch(e){return {ok:false,error:e?.name==="AbortError"?"github-raw-timeout":"github-raw-unavailable"};}
  finally{clearTimeout(timer);}
}
function decodeFile(value){
  if(value?.encoding!=="base64"||typeof value.content!=="string"||value.content.length>180000)return null;
  try{
    const raw=value.content.replace(/\s/g,"");
    if(!/^[a-zA-Z0-9+/]*={0,2}$/.test(raw))return null;
    return new TextDecoder("utf-8",{fatal:true}).decode(Uint8Array.from(atob(raw),c=>c.charCodeAt(0)));
  }catch{return null;}
}
async function loadTrustedMirror(env){
  if(typeof env?.ULTRON_DB?.prepare!=="function")return null;
  try{
    const result=await env.ULTRON_DB.prepare(
      "SELECT commit_sha, synced_at, data_json FROM jarvis_architecture_snapshots WHERE id = ?"
    ).bind("latest").first();
    if(!result||typeof result.data_json!=="string"||result.data_json.length>12000)return null;
    const data=JSON.parse(result.data_json);
    const allowed=new Set(FILES);
    if(data.repository!=="equipezero-web/Ultron_AI"||
      data.source!=="github-actions-checked-out-main"||
      !/^[a-f0-9]{40}$/.test(data.commit||"")||
      data.commit!==result.commit_sha||
      typeof data.syncedAt!=="string"||data.syncedAt!==result.synced_at||
      !Number.isFinite(Date.parse(data.syncedAt))||
      Date.parse(data.syncedAt)>Date.now()+300000||
      !Array.isArray(data.files)||data.files.length!==FILES.length||
      data.files.some(f=>!allowed.has(f.path)||!/^[a-f0-9]{64}$/.test(f.sha256||""))||
      !COLUMNS.every(c=>data.columns?.includes(c))||
      !Number.isSafeInteger(data.cooldownMs)||data.cooldownMs<1000||
      data.providersVerified!==true)return null;
    return data;
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
  }else{
    // Degraded, clearly marked fresh reads. Never infer a commit from raw/main.
    const results=await Promise.all(FILES.map(path=>fetchRawMainFile(path,fetchImpl)));
    for(let i=0;i<FILES.length;i++){
      const data=results[i];
      files.push({path:FILES[i],ok:data.ok,source:data.source||null,
        error:data.ok?null:data.error});
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
  // GitHub egress may be blocked in Workers. Read the latest trusted
  // checkout snapshot from D1, published by GitHub Actions after deploy.
  // This is a live D1 read of LAST SYNC, not a live GitHub HTTP request.
  const mirror=!commit&&!files.some(f=>f.ok)?await loadTrustedMirror(env):null;
  const mirrorFiles=mirror?.files?.map(f=>({path:f.path,ok:true,error:null,sha256:f.sha256}))||null;
  return {checkedAt,repository:"equipezero-web/Ultron_AI",commit:commit||mirror?.commit||null,backendVersion,
    github:{verified:Boolean(commit),snapshotPinned:Boolean(commit),
      liveReadAvailable:files.some(f=>f.ok),
      snapshotAvailable:Boolean(mirror),
      snapshotSyncedAt:mirror?.syncedAt||null,
      mode:commit?"github-rest-commit":mirror?"github-actions-d1-snapshot":"github-raw-main-unpinned",
      error:head.error||(!commit?"github-commit-not-verified":null),
      files:mirrorFiles||files.map(({path,ok,error})=>({path,ok,error}))},
    memory:{verified:Boolean(mirror||memorySchema&&columns.length===COLUMNS.length),
      columns:mirror?.columns||(memorySchema?columns:[]),schemaSource:"backend/memory.js"},
    providers:{verified:Boolean(mirror?.providersVerified||provider)&&/providerCircuitBreaker|generateWithProviders/.test(provider)||Boolean(mirror?.providersVerified),
      source:"backend/providers.js"},
    circuitBreaker:{verified:mirror?true:cooldownMs!==null,
      cooldownMs:mirror?.cooldownMs??cooldownMs,source:"backend/provider-circuit-breaker.js"},
    diagnostics:{verified:Boolean(mirror?.diagnosticsVerified||diagnostics),source:"backend/provider-diagnostics.js"},
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
    "Commit "+(result.github.mode==="github-actions-d1-snapshot"?"da última sincronização GitHub Actions":"HEAD/main consultado")+": "+(result.commit||"indisponível"),
    "Worker em execução: versão informada "+result.backendVersion+"; commit de deploy NÃO comprovado.",
    "GitHub API: "+yes(result.github.verified)+(result.github.error?" ("+result.github.error+")":""),
    "Leitura GitHub: "+(result.github.snapshotPinned?"arquivos do commit verificado":
      result.github.snapshotAvailable?"retrato verificável do checkout do GitHub Actions, sincronizado em "+result.github.snapshotSyncedAt+
        "; NÃO houve acesso HTTP direto ao GitHub nesta consulta":
      result.github.liveReadAvailable?"fallback RAW/main ao vivo SEM commit verificado, arquivos podem ser de revisões distintas":
      "nenhuma leitura de arquivo confirmada"),
    "Arquivos "+(result.github.snapshotAvailable?"sincronizados pelo GitHub Actions":"realmente consultados nesta execução")+": "+
      (result.github.files.map(f=>f.path+" ["+(f.ok?"confirmado":f.error)+"]").join("; ")||"nenhum"),
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
    "Origem do código: "+result.github.mode+
      "; repositório canônico fixo: "+result.repository+".",
    "Nenhum arquivo foi alterado e nenhum segredo ou conteúdo de preferências foi consultado."
  ];
  return lines.join("\n\n");
}
