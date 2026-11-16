import assert from "node:assert/strict";
import {parseLocalCommand,runLocalCommand} from "../modules/jarvis-local-commands.js";

const samples=[
  "Jarvis, abra a pasta Downloads do celular",
  "Jarvis, abrir Downloads do celular",
  "abra o arquivo Downloads do celular",
  "mostre os arquivos da pasta Downloads do celular",
  "exiba a pasta Download do meu Android",
  "acesse Downloads do telefone"
];
for(const query of samples) {
  const intent=parseLocalCommand(query);
  assert.equal(intent?.type,"remote-phone-folder",query);
  assert.equal(intent?.path,"internal:Download",query);
}
// Requests for explanations must not execute device actions.
for(const query of [
  "Como abrir Downloads do celular?",
  "Não abra Downloads do celular",
  "Quais são os meus arquivos?",
  "Abra Downloads do computador"
]) {
  assert.notEqual(parseLocalCommand(query)?.type,"remote-phone-folder",query);
}
assert.deepEqual(parseLocalCommand("Jarvis, abra o editor de arquivos"),{type:"scoped-file-editor"});
for(const query of ["Jarvis, mostre os arquivos do celular","abra os arquivos do celular","abra a memória do meu celular"]){
  const intent=parseLocalCommand(query);
  assert.equal(intent?.type,"remote-phone-folder",query);
  assert.equal(intent?.path,"",query);
}
const original=globalThis.window;
try{
  const calls=[];
  globalThis.window={
    JARVIS_PHONE_FILES:{
      async openFolder(path){calls.push(path);return{ok:true,waitingAuthorization:true,path};}
    }
  };
  const pending=await runLocalCommand(samples[0]);
  assert.equal(pending.ok,true);
  assert.equal(pending.handled,true);
  assert.equal(pending.route,"remote-phone-files");
  assert.match(pending.text,/digite o PIN temporário ou a chave permanente/i);
  assert.match(pending.text,/pressione Enter/i);
  assert.doesNotMatch(pending.text,/toque em ABRIR MEMÓRIA/i);
  assert.doesNotMatch(pending.text,/pasta download do celular aberta/i);
  assert.deepEqual(calls,["internal:Download"]);
  globalThis.window.JARVIS_PHONE_FILES.openFolder=async path=>({ok:true,opened:true,path});
  const opened=await runLocalCommand(samples[1]);
  assert.equal(opened.ok,true);
  assert.match(opened.text,/aberta no Neural Ring/i);
  globalThis.window.JARVIS_PHONE_FILES.openFolder=async path=>({ok:false,error:"Celular offline"});
  const offline=await runLocalCommand(samples[0]);
  assert.equal(offline.ok,false);
  assert.match(offline.text,/offline/i);
  delete globalThis.window.JARVIS_PHONE_FILES;
  const missing=await runLocalCommand(samples[0]);
  assert.equal(missing.ok,false);
  assert.match(missing.text,/ainda não carregado/i);
}finally{
  if(original===undefined)delete globalThis.window;
  else globalThis.window=original;
}
console.log("JARVIS PHONE FOLDER COMMAND PASS: imperative routes to Downloads, no web search, consent before access.");
