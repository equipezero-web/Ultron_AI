import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {explicitMemoryCandidate,readExplicitInterfacePreference,saveExchange} from "../backend/memory.js";
import {shouldResearchBeforeAnswer} from "../backend/web-research.js";
import {interfacePreferenceIntent,verifiedSelfArchitectureReply} from "../backend/jarvis-memory-intents.js";

const message="Lembre-se de que minha preferência de interface para este teste é azul-marinho.";
assert.equal(explicitMemoryCandidate(message),message);
assert.equal(explicitMemoryCandidate("Qual é a minha preferência de interface para este teste?"),null);
for(const secret of [
 "Lembre que minha senha é super-secreta-123",
 "Guarde isso: meu token de acesso é abcdefghijkl",
 "Lembre que minha API key é secret-value",
 "Não esqueça meu CPF 123.456.789-00",
 "Lembre-se de que minha chave privada começa com -----BEGIN PRIVATE KEY-----"
])assert.equal(explicitMemoryCandidate(secret),null,"Do not store sensitive data as long-term memory");
assert.equal(explicitMemoryCandidate("Lembre que meu projeto é sobre meteorologia."),"Lembre que meu projeto é sobre meteorologia.");

assert.equal(shouldResearchBeforeAnswer(message).needed,false);

const architectureQuestion="J.A.R.V.I.S., antes de propor novas melhorias, analise sua arquitetura real. Identifique como funciona atualmente a memória D1, quais são as colunas utilizadas para armazenar preferências, como funciona o fallback entre Groq, Cloudflare e Cohere e quais mecanismos de diagnóstico já existem. Para cada afirmação, informe o arquivo ou módulo que a comprova.";
const architectureReply=verifiedSelfArchitectureReply(architectureQuestion);
assert.match(architectureReply,/backend\/memory\.js/);
assert.match(architectureReply,/operator_id/);
assert.match(architectureReply,/source_message_id/);
assert.match(architectureReply,/30 segundos/);
assert.match(architectureReply,/não é inspeção ao vivo/);
assert.doesNotMatch(architectureReply,/colunas key, value/i);
assert.equal(verifiedSelfArchitectureReply("Qual é minha preferência de interface?"),null);
assert.equal(verifiedSelfArchitectureReply("Planeje melhorias no seu sistema"),null);
const workerSource=readFileSync(new URL("../backend/worker.js",import.meta.url),"utf8");
assert.match(workerSource,/if\(verifiedSelfArchitectureReply\(originalBody\?\.message\)\)/);
assert.match(workerSource,/model:"live-architecture-audit"/);
assert.doesNotMatch(workerSource,/const architectureReply=verifiedSelfArchitectureReply\(message\)/);

const {inspectLiveJarvisArchitecture,formatLiveJarvisArchitecture}=await import("../backend/live-architecture-audit.js");
const sourceMap={
 "backend/memory.js":'CREATE TABLE IF NOT EXISTS memories (\n'+
   ' id TEXT,\n operator_id TEXT,\n category TEXT,\n content TEXT,\n importance INTEGER,\n'+
   ' source_message_id TEXT,\n created_at TEXT,\n updated_at TEXT,\n last_used_at TEXT,\n use_count INTEGER\n )',
 "backend/providers.js":"import {providerCircuitBreaker} from './provider-circuit-breaker.js';",
 "backend/provider-circuit-breaker.js":"const MAX_COOLDOWN_MS = 30000;",
 "backend/provider-diagnostics.js":"export const providerDiagnostics=true;"
};
const pinnedCommit="a".repeat(40),githubCalls=[];
const mockFetch=async(url,init)=>{
 githubCalls.push({url,init});
 const response=data=>new Response(JSON.stringify(data),{status:200,headers:{"Content-Type":"application/json"}});
 if(url.endsWith("/commits/main"))return response({sha:pinnedCommit});
 const file=Object.keys(sourceMap).find(p=>url.endsWith("/contents/"+p+"?ref="+pinnedCommit));
 if(!file)throw Error("Unexpected github URL");
 return response({encoding:"base64",content:Buffer.from(sourceMap[file]).toString("base64")});
};
const actualColumns=["id","operator_id","category","content","importance","source_message_id","created_at","updated_at","last_used_at","use_count"];
const liveAudit=await inspectLiveJarvisArchitecture({ULTRON_DB:{prepare:sql=>{
 assert.equal(sql,"PRAGMA table_info(memories)");
 return {all:async()=>({results:actualColumns.map(name=>({name}))})};
}}},{fetchImpl:mockFetch,now:()=>Date.parse("2026-11-26T14:00:00Z"),backendVersion:"4.30.1"});
assert.equal(liveAudit.github.verified,true);
assert.equal(liveAudit.github.files.length,4);
assert.equal(liveAudit.memory.verified,true);
assert.deepEqual(liveAudit.memory.columns,actualColumns);
assert.equal(liveAudit.circuitBreaker.cooldownMs,30000);
assert.equal(liveAudit.d1.ready,true);
assert.equal(liveAudit.commit,pinnedCommit);
assert.equal(liveAudit.writePermission,false);
assert.equal(githubCalls.length,5);
assert(githubCalls.every(c=>c.url.startsWith("https://api.github.com/repos/equipezero-web/Ultron_AI/")));
assert(githubCalls.every(c=>c.init.method==="GET" && !JSON.stringify(c.init.headers).includes("Authorization")));
assert.match(formatLiveJarvisArchitecture(liveAudit),/AUDITORIA DE ARQUITETURA AO VIVO/);
assert.match(formatLiveJarvisArchitecture(liveAudit),/PRAGMA realizada/);
const unavailable=await inspectLiveJarvisArchitecture({},{
 fetchImpl:async()=>new Response("{}",{status:503}),now:()=>Date.parse("2026-11-26T14:00:00Z")
});
assert.equal(unavailable.github.verified,false);
assert.equal(unavailable.memory.verified,false);
assert.equal(unavailable.d1.ready,false);
assert.doesNotMatch(formatLiveJarvisArchitecture(unavailable),/colunas memories: id, operator_id/);

const operator="operator-A";
const stored=[];
let duplicate=false;
const env={ULTRON_DB:{
 prepare(sql){
  return {
   run:async()=>({success:true,meta:{changes:1}}),
   bind(...args){
    return {
     all:async()=>{
      if(sql.includes("FROM memories")){
       assert.equal(args[0],operator,"Lookup must be operator-scoped");
       return {results:stored.filter(x=>x.operator===args[0]).map(x=>({content:x.content}))};
      }
      return {results:[]};
     },
     first:async()=>stored.find(x=>x.operator===args[0]&&x.content===args[1])?{id:"existing-memory"}:null
    };
   }
  };
 },
 batch:async(statements)=>{
  if(!duplicate)stored.push({operator,content:message});
  return statements.map((_,i)=>({meta:{changes:i===4&&duplicate?0:1}}));
 }
}};
const first=await saveExchange(env,{
 operatorId:operator,conversationId:"chat-A",userMessage:message,
 assistantMessage:"Solicitação recebida",provider:"jarvis-local"
});
assert.equal(first.saved,true);
assert.equal(first.explicitMemorySaved,true);
const recalled=await readExplicitInterfacePreference(env,{operatorId:operator});
assert.deepEqual(recalled,{found:true,ready:true,value:"azul-marinho"});
const other=await readExplicitInterfacePreference(env,{operatorId:"operator-B"});
assert.equal(other.found,false,"No other operator may read the preference");

duplicate=true;
const second=await saveExchange(env,{
 operatorId:operator,conversationId:"chat-A",userMessage:message,
 assistantMessage:"Solicitação repetida",provider:"jarvis-local"
});
assert.equal(second.saved,true);
assert.equal(second.explicitMemorySaved,true,
 "An already stored preference must be verified, not reported as unsaved");

const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const worker=read("backend/worker.js"),providers=read("backend/providers.js");
const currentPrompt=providers.slice(providers.indexOf("function promptFrom("),providers.indexOf("function chatMessages("));
assert.match(currentPrompt,/currentTurn/);
assert.doesNotMatch(currentPrompt,/JSON\.stringify\(telemetry \|\| \{\}\)/);
assert.equal(interfacePreferenceIntent(message),"store");
assert.equal(interfacePreferenceIntent("J.A.R.V.I.S., lembre-se de que minha preferência de interface para o teste de memória persistente é verde-esmeralda. Confirme se conseguiu salvar essa informação no banco D1."),"store");
assert.equal(interfacePreferenceIntent("Jarvis, lembre que minha preferência de interface é verde-esmeralda."),"store");
assert.equal(interfacePreferenceIntent("JARVIS, qual é minha preferência de interface?"),"recall");
assert.equal(interfacePreferenceIntent("J.A.R.V.I.S., qual é minha preferência de interface?"),"recall");
assert.equal(interfacePreferenceIntent("Jarvis, não salve minha preferência de interface."),null);

assert.equal(interfacePreferenceIntent("Qual é a minha preferência de interface para este teste?"),"recall");
assert.equal(interfacePreferenceIntent("E qual foi a preferência que acabei de informar?"),"recall");
assert.equal(interfacePreferenceIntent("Pesquise informações sobre El Niño."),null);
assert.match(worker,/await readExplicitInterfacePreference\(env,\{operatorId\}\)/);
assert.match(worker,/memoryWrite=await saveExchange/);
assert.match(worker,/const askedForSources=/);
assert.match(worker,/Fontes consultadas/);
console.log("STAGE A CONVERSATION AND D1 PROOF PASS: explicit save, repeat, scoped recall, no raw telemetry");
