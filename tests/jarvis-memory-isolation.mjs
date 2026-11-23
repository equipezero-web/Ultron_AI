import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {ensureMemorySchema,saveExchange,loadMemoryContext} from "../backend/memory.js";

// A transactional SQLite adapter emulates Cloudflare D1 prepared statements,
// batch results and foreign-key enforcement, with actual SQL execution.
function makeDb(){
  const db=new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys=ON");
  function run(sql,args=[]){
    const result=db.prepare(sql).run(...args);
    return {success:true,meta:{changes:Number(result.changes)}};
  }
  function prepare(sql,args=[]){
    return {
      bind(...values){return prepare(sql,values);},
      async run(){return run(sql,args);},
      async first(){return db.prepare(sql).get(...args)||null;},
      async all(){return {results:db.prepare(sql).all(...args)};}
    };
  }
  return {
    db,
    binding:{
      prepare,
      async batch(statements){
        db.exec("BEGIN IMMEDIATE");
        try{
          const results=[];
          for(const statement of statements)results.push(await statement.run());
          db.exec("COMMIT");return results;
        }catch(e){db.exec("ROLLBACK");throw e;}
      }
    }
  };
}
const first=makeDb(),env={ULTRON_DB:first.binding};
const aId="owner-alice",bId="owner-bob",sharedConversation="shared-client-id";
assert.equal(await ensureMemorySchema(env),true);
const initial=await saveExchange(env,{
  operatorId:aId,conversationId:sharedConversation,
  userMessage:"Lembre que minha prioridade é a cidade A",
  assistantMessage:"Entendido, cidade A"});
assert.deepEqual(initial,{saved:true,explicitMemorySaved:true});
let conv=first.db.prepare("SELECT operator_id,message_count FROM conversations WHERE id=?")
  .get(sharedConversation);
assert.equal(conv.operator_id,aId);assert.equal(conv.message_count,2);
const before=first.db.prepare("SELECT COUNT(*) AS n FROM messages").get().n;
const unrelated=await saveExchange(env,{
  operatorId:bId,conversationId:sharedConversation,
  userMessage:"Lembre que meu segredo é B",
  assistantMessage:"Entendido, segredo B"});
assert.equal(unrelated.saved,false);
assert.equal(unrelated.error,"CONVERSATION_SCOPE_CONFLICT");
assert.equal(first.db.prepare("SELECT COUNT(*) AS n FROM messages").get().n,before,
  "colliding user cannot insert messages into conversation belonging to Alice");
assert.equal(first.db.prepare("SELECT COUNT(*) AS n FROM memories WHERE operator_id=?")
  .get(bId).n,0,"colliding user cannot write cross-owned memories");
assert.equal(first.db.prepare("SELECT message_count FROM conversations WHERE id=?")
  .get(sharedConversation).message_count,2);
assert.equal(first.db.prepare("SELECT COUNT(*) AS n FROM messages WHERE operator_id=?")
  .get(bId).n,0);
const correctB=await saveExchange(env,{
  operatorId:bId,conversationId:"bob-own-chat",
  userMessage:"Lembre que B escolhe outra previsão",
  assistantMessage:"Entendido"});
assert.deepEqual(correctB,{saved:true,explicitMemorySaved:true});
assert.equal(first.db.prepare("SELECT COUNT(*) AS n FROM conversations").get().n,2);
assert.equal(first.db.prepare("SELECT COUNT(*) AS n FROM memories").get().n,2);
const againA=await saveExchange(env,{
  operatorId:aId,conversationId:sharedConversation,
  userMessage:"Como estará o clima na cidade A?",
  assistantMessage:"Previsão da cidade A"});
assert.deepEqual(againA,{saved:true,explicitMemorySaved:false});
assert.equal(first.db.prepare("SELECT message_count FROM conversations WHERE id=?")
  .get(sharedConversation).message_count,4);

const aContext=await loadMemoryContext(env,{operatorId:aId,conversationId:sharedConversation,
  query:"cidade A"});
const bContext=await loadMemoryContext(env,{operatorId:bId,conversationId:"bob-own-chat",
  query:"outra previsão"});
assert.equal(aContext.active,true);assert.equal(bContext.active,true);
assert.match(aContext.context,/cidade A/);assert.doesNotMatch(aContext.context,/B escolhe/);
assert.match(bContext.context,/B escolhe/);assert.doesNotMatch(bContext.context,/cidade A/);
const emptyB=await loadMemoryContext(env,{operatorId:bId,conversationId:sharedConversation});
assert.equal(emptyB.recalledMessages,0,"cannot retrieve other operator's colliding chat");

// Schema initialization is per binding, not one global bit in a reused Worker.
const second=makeDb(),env2={ULTRON_DB:second.binding};
assert.equal(await ensureMemorySchema(env2),true);
assert.ok(second.db.prepare("SELECT name FROM sqlite_master WHERE name='messages'").get());
assert.equal((await saveExchange(env2,{
  operatorId:"owner-charlie",conversationId:"new-db-chat",
  userMessage:"Olá",assistantMessage:"Olá"
})).saved,true);
first.db.close();second.db.close();
console.log("JARVIS D1 MEMORY ISOLATION PASS: atomic owner guard, colliding chats fail closed, accurate receipts, independent schemas");
