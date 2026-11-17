import assert from "node:assert/strict";
import {parseLocalCommand,runLocalCommand} from "../modules/jarvis-local-commands.js";
import {clearVisibleInterface} from "../modules/jarvis-clear-interface.js";

for(const phrase of [
  "LIMPAR TUDO","Jarvis, limpe tudo","Ultron, limpa tudo",
  "Limpar a tela","Jarvis, limpe o painel neural"
]){
  assert.equal(parseLocalCommand(phrase)?.type,"clear-interface",phrase);
}
for(const phrase of ["limpar terminal","Jarvis, limpar o terminal","clear","cls"]){
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
// Regression: these UI commands must not be sent to Cloud AI as generic text.
const {readFileSync}=await import("node:fs");
const orchestration=readFileSync(new URL("../modules/ultron-orchestrator-v4270.js",import.meta.url),"utf8");
assert.match(orchestration,/function isRingHomeCommand\(message\)/);
assert.match(orchestration,/isRingHomeCommand\(clean\)/);
assert.match(orchestration,/isRingHomeCommand\(message\)/);
assert.match(orchestration,/state\.lastRoute="local-neural-ring"/);
assert.match(orchestration,/\["clear-interface","capabilities","meteorological-close"\]\.includes\(parseLocalCommand\(message\)\?\.type\)/);
assert.match(orchestration,/state\.lastRoute="local-meteorological-close"/);
assert.match(orchestration,/ULTRON_WORLD_CAMERAS\.hide/);
assert.match(orchestration,/executeMessage\(message,source,approvedMission\)/);

for(const cmd of ["Jarvis, mostre suas funcionalidades.","mostre suas funcionalidades"]){
 assert.equal(parseLocalCommand(cmd)?.type,"capabilities",cmd);
}
const weather={state:{visible:true,tab:"forecast"},close(){
 this.state.visible=false;calls.push("meteo-close");return {ok:true};}};
window.ULTRON_METEO_CENTER=weather;
const closeWeather=await runLocalCommand("Jarvis, feche previsão do tempo");
assert.equal(closeWeather.ok,true);
assert.equal(closeWeather.route,"local-meteorological-close");
assert.equal(weather.state.visible,false);
assert.ok(calls.includes("meteo-close"));
const closedTwice=await runLocalCommand("fechar previsão");
assert.equal(closedTwice.ok,false,"Second close must not fabricate an action");
weather.state={visible:true,tab:"radar"};
const mismatched=await runLocalCommand("fechar previsão");
assert.equal(mismatched.ok,false);
assert.equal(weather.state.visible,true,"Closing forecast must not close active radar");
const proper=await runLocalCommand("fechar radar");
assert.equal(proper.ok,true);
assert.equal(weather.state.visible,false);

// Browser ES modules are URL-keyed. Dynamic imports must use the SAME
// version as the index; otherwise a second controller can overwrite the first.
const pageHtml=readFileSync(new URL("../index.html",import.meta.url),"utf8");
const localSource=readFileSync(new URL("../modules/jarvis-local-commands.js",import.meta.url),"utf8");
const meteoModule=readFileSync(new URL("../modules/jarvis-meteorological-center.js",import.meta.url),"utf8");
const globalModule=readFileSync(new URL("../modules/jarvis-global-intelligence-ring.js",import.meta.url),"utf8");
const meteoBridge=readFileSync(new URL("../modules/jarvis-meteo-ring-bridge.js",import.meta.url),"utf8");
for(const [module,version] of [
 ["jarvis-meteorological-center.js","4.99.3"],
 ["jarvis-global-intelligence-ring.js","5.25.2"]
]){
 assert.ok(pageHtml.includes(module+"?v="+version),"Indexed module must be cache-busted");
 assert.ok(localSource.includes("./"+module+"?v="+version),"Dynamic import must match static script URL");
}
assert.match(meteoModule,/function installMeteorologicalCenter\(\)/);
assert.match(meteoModule,/existing\?\.isConnected/);
assert.match(meteoModule,/ultron:meteo-center-ready/);
assert.match(globalModule,/function installGlobalIntelligence\(\)/);
assert.match(globalModule,/existing\?\.isConnected/);
const geoModule=readFileSync(new URL("../modules/jarvis-geospatial-visual.js",import.meta.url),"utf8");
const actionModule=readFileSync(new URL("../modules/jarvis-action-engine.js",import.meta.url),"utf8");
const contextualMap=readFileSync(new URL("../modules/jarvis-contextual-map.js",import.meta.url),"utf8");
assert.match(geoModule,/function installGeospatialVisual\(\)/);
assert.match(geoModule,/existing\?\.isConnected/);
for(const [label,source] of [
 ["index",pageHtml],["action",actionModule],["contextual",contextualMap],["global",globalModule]
])assert.ok(source.includes("jarvis-geospatial-visual.js?v=4.96.1"),label+
 " must use canonical geospatial module URL to prevent scene replacement");

assert.ok(globalModule.includes('jarvis-geospatial-visual.js?v=4.96.1'),
 "Global map must use the same geospatial module URL as the host page");
assert.match(meteoBridge,/ultron:meteo-center-ready/);

console.log("VISIBLE CLEAR PASS: exact local voice intent, visual reset, idempotency, no external research and no stored data deletion");
