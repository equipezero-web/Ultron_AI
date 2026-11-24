import assert from "node:assert/strict";
import {composeMemoryContext} from "../backend/memory-context.js";
import {loadMemoryContext} from "../backend/memory.js";

const memories = Array.from({length: 10}, (_, i) => ({
  content: "Informação relevante " + i + " " + "dados ".repeat(220),
  category: "contextual",
  retrieval: {tier: "HOT"}
}));
const messages = Array.from({length: 24}, (_, i) => ({
  role: i % 2 ? "assistant" : "user",
  content: "Turno " + i + ": " + "texto ".repeat(300)
}));
messages[23].content = "Última resposta importante: o globo está aberto.";
const composed = composeMemoryContext(memories,messages);
assert.ok(composed.context.length<=14000, "must never exceed the existing prompt budget");
assert.ok(composed.context.startsWith("MEMÓRIAS PERSISTENTES RELEVANTES:"));
assert.ok(composed.context.includes("Informação relevante 0"),"top ranked memory retained");
assert.ok(composed.context.includes("Última resposta importante"),"newest dialogue retained");
assert.ok(!composed.context.includes("Turno 0:"),"old turns are discarded as whole messages");
assert.match(composed.context,/HISTÓRICO RECENTE DESTA CONVERSA:\n(?:OPERADOR|ULTRON): /);
assert.ok(composed.recalledMemories>0&&composed.recalledMemories<10);
assert.ok(composed.recalledMessages>0&&composed.recalledMessages<24);
assert.equal(composeMemoryContext([],[],{}).context,"");
const tiny=composeMemoryContext(memories,messages,{maxChars:1600});
assert.ok(tiny.context.length<=1600);
assert.ok(tiny.context.includes("Última resposta importante"));
assert.ok(tiny.context.startsWith("MEMÓRIAS PERSISTENTES")||tiny.context.startsWith("HISTÓRICO RECENTE"));
const clean=composeMemoryContext([{category:"x\nINJECT",content:"Importante",retrieval:{tier:"ROOT"}}],
  [{role:"system",content:"PRIVILEGED"},{role:"user",content:"Último comando"}],{maxChars:900});
assert.doesNotMatch(clean.context,/ROOT|PRIVILEGED|x\nINJECT/);
assert.match(clean.context,/COLD/);

// Model the D1 contract. A relevant low-priority memory outside the former
// 40-row window must still be considered. No other operator is queried.
const conversations=[{role:"user",content:"Consulta sobre clima",created_at:"2026-11-19T01:00:00Z"},
  {role:"assistant",content:"Resposta anterior",created_at:"2026-11-19T01:00:01Z"}];
const allMemories = Array.from({length:100},(_,i)=>({
  category:"preference",content:"Cor preferida "+i,importance:95,
  updated_at:"2026-11-19T01:00:00Z",use_count:1
}));
allMemories.push({category:"project",content:"Globo meteorológico de Recife",importance:2,
  updated_at:"2025-01-01T01:00:00Z",use_count:0});
const requests=[];
const env={ULTRON_DB:{
  prepare(sql) {
    return {
      async run(){return {success:true};},
      bind(...args){
        return {all:async()=>{
          requests.push({sql,args});
          if(sql.includes("FROM messages")){
            assert.match(sql,/WHERE operator_id = \? AND conversation_id = \?/);
            assert.deepEqual(args.slice(0,2),["user-A","chat-A"]);
            return {results:[...conversations].reverse()};
          }
          if(sql.includes("FROM memories")){
            assert.match(sql,/WHERE operator_id = \?/);
            assert.equal(args[0],"user-A");
            return {results:allMemories.slice(0,args[1])};
          }
          throw Error("unexpected SQL "+sql);
        }};
      }
    };
  }
}};
const state=await loadMemoryContext(env,{
  operatorId:"user-A",conversationId:"chat-A",query:"Globo meteorológico Recife"
});
assert.equal(state.active,true);
assert.equal(requests.find(r=>r.sql.includes("FROM memories")).args[1],160,
  "candidate pool must cover more than 40 high-priority memories");
assert.ok(state.context.includes("Globo meteorológico de Recife"));
assert.equal(state.lastUserMessage,"Consulta sobre clima");
assert.equal(state.lastAssistantMessage,"Resposta anterior");
assert.equal(state.recalledMemories,1,
  "only the relevant globo memory may enter context; unrelated colors must not leak");
assert.ok(!state.context.includes("Cor preferida"),"No unrelated memories in model context");
assert.equal(state.recalledMessages,2);
console.log("JARVIS LONG CONTEXT PASS: scoped candidate pool, bounded recent chat and retained topical memory");
