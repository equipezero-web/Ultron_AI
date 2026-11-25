import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {explicitMemoryCandidate,readExplicitInterfacePreference,saveExchange} from "../backend/memory.js";
import {shouldResearchBeforeAnswer} from "../backend/web-research.js";
import {interfacePreferenceIntent} from "../backend/jarvis-memory-intents.js";

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
assert.equal(interfacePreferenceIntent("Qual é a minha preferência de interface para este teste?"),"recall");
assert.equal(interfacePreferenceIntent("E qual foi a preferência que acabei de informar?"),"recall");
assert.equal(interfacePreferenceIntent("Pesquise informações sobre El Niño."),null);
assert.match(worker,/await readExplicitInterfacePreference\(env,\{operatorId\}\)/);
assert.match(worker,/memoryWrite=await saveExchange/);
assert.match(worker,/const askedForSources=/);
assert.match(worker,/Fontes consultadas/);
console.log("STAGE A CONVERSATION AND D1 PROOF PASS: explicit save, repeat, scoped recall, no raw telemetry");
