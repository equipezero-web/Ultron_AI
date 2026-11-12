import assert from "node:assert/strict";
import {parseLocalCommand,runLocalCommand} from "../modules/jarvis-local-commands.js";
import {clearVisibleInterface} from "../modules/jarvis-clear-interface.js";

for(const phrase of [
  "LIMPAR TUDO","Jarvis, limpe tudo","Ultron, limpa tudo",
  "Limpar a tela","Jarvis, limpe o painel neural"
]){
  assert.equal(parseLocalCommand(phrase)?.type,"clear-interface",phrase);
}
for(const phrase of [
  "Como limpar tudo?","Não limpe tudo","Se eu limpar tudo, perco dados?",
  "Limpe o histórico do navegador","Apague meus arquivos",
  "Limpar todos os dados do meu celular","Quero apagar minha memória"
]){
  assert.equal(parseLocalCommand(phrase),null,phrase);
}
const calls=[];
const terminal={childNodes:[1,2],replaceChildren(){this.childNodes=[];calls.push("terminal");}};
const field={value:"texto anterior"};
const audio={pause(){calls.push("pause");},duration:0,currentTime:3};
const doc={getElementById(id){return {
  "output-box":terminal,"command-input":field,"voice-audio":audio
}[id]||null;}};
const earth={state:{visible:true},close(){this.state.visible=false;calls.push("earth");}};
const geo={state:{visible:true,playing:true},close(){this.state.visible=false;this.state.playing=false;calls.push("geo");}};
const answer={visible:true,clear(){this.visible=false;calls.push("answer");}};
const win={ULTRON_GEO_VISUAL:geo,ULTRON_EARTH:earth,ULTRON_NEURAL_ANSWER:answer,
 ULTRON_VISUAL_PANEL:{
  clearImages(){calls.push("images");},clearCards(){calls.push("cards");},
  setCaption(t){assert.equal(t,"");calls.push("caption");}
 },
 JARVIS_COMMAND_CENTER:{setVisualMode(v){assert.equal(v,"ring");calls.push("ring");}},
 ULTRON_MEMORY:{erase(){throw Error("PERSISTENT MEMORY MUST NEVER BE CLEARED");}},
 localStorage:{clear(){throw Error("STORAGE MUST NEVER BE CLEARED");}}
};
const result=clearVisibleInterface({win,doc});
assert.equal(result.ok,true,JSON.stringify(result));
assert.equal(result.scope,"visible-interface");
assert.deepEqual(calls,["geo","earth","answer","images","cards","caption","ring","terminal","pause"]);
assert.equal(geo.state.playing,false);
assert.equal(field.value,"");
assert.equal(terminal.childNodes.length,0);
const again=clearVisibleInterface({win,doc});
assert.equal(again.ok,true,"A second clear is harmless and idempotent");
globalThis.window=win;
globalThis.document=doc;
const direct=await runLocalCommand("Jarvis, limpar tudo");
assert.equal(direct.ok,true);
assert.equal(direct.route,"local-clear-interface");
assert.equal(direct.quiet,true);
assert.equal(direct.provider,"jarvis-local");
console.log("VISIBLE CLEAR PASS: exact local voice intent, visual reset, idempotency, no external research and no stored data deletion");
