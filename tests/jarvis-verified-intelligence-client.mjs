import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {parseVerifiedIntelligenceCommand,runVerifiedIntelligenceCommand} from "../modules/jarvis-verified-intelligence-client.js";

assert.equal(parseVerifiedIntelligenceCommand("Jarvis, mostre as notícias"),null,
 "ordinary commands must preserve their existing route");
assert.equal(parseVerifiedIntelligenceCommand("Não execute inteligência verificada: notícias"),null);
assert.equal(parseVerifiedIntelligenceCommand("Jarvis, inteligência verificada: notícias").city,null);
assert.deepEqual(parseVerifiedIntelligenceCommand(
  "Jarvis, inteligência verificada: previsão do tempo em Recife"),{
  message:"previsão do tempo em Recife",city:"Recife",days:7
});
assert.equal(parseVerifiedIntelligenceCommand(
  "Jarvis, inteligência verificada: previsão do tempo em Tóquio no globo por 16 dias").city,"Tóquio");
assert.equal(parseVerifiedIntelligenceCommand(
  "Jarvis, inteligência verificada: previsão do tempo em Tóquio por 16 dias").days,16);

const requested=[];
let rendered=[];
const apiResult={ok:false,partial:true,rendered:false,steps:[
  {id:"step-1",agent:"meteorology",status:"completed",result:{
    location:"Recife, Brasil",current:{temperatureC:29},
    days:[{rainMm:3.5}],fetchedAt:"2026-11-19T12:00:00Z",
    source:{name:"Open-Meteo",url:"https://open-meteo.com"}}},
  {id:"step-2",agent:"news",status:"completed",result:{articles:[
    {title:"Notícia atual",source:"Agência pública",publishedAt:"2026-11-19T12:00:00Z",
     url:"https://example.org/atual",description:"Resumo",image:null},
    {title:"Link inseguro",url:"javascript:alert(1)"}
  ]}},
  {id:"step-3",agent:"visual",status:"unavailable"}
]};
const fetchImpl=async(url,init)=>{
  requested.push({url,init});
  return {ok:true,json:async()=>apiResult};
};
const showAnswer=()=>((text,options)=>rendered.push({text,options}));
const result=await runVerifiedIntelligenceCommand(
  parseVerifiedIntelligenceCommand("Jarvis, inteligência verificada: previsão do tempo em Recife"),
  {fetchImpl,showAnswer});
assert.equal(result.ok,true,"verified source data can be reported even if globe is pending");
assert.equal(result.partial,true);
assert.equal(result.renderedInGlobe,false);
assert.equal(result.displayed,true);
assert.equal(result.voiceEnabled,false);
assert.equal(requested.length,1);
assert.ok(requested[0].url.endsWith("/api/account/intelligence/execute"));
assert.equal(requested[0].init.credentials,"include");
assert.equal(requested[0].init.method,"POST");
const payload=JSON.parse(requested[0].init.body);
assert.equal(payload.city,"Recife");
assert.equal(payload.days,7);
assert.ok(!Object.hasOwn(payload,"memoryKey"));
assert.equal(rendered.length,1);
assert.match(rendered[0].text,/Globo 3D: nenhuma renderização/);
assert.match(rendered[0].text,/Open-Meteo/);
assert.equal(rendered[0].options.visual.cards.length,1,"unsafe image/news link rejected");
assert.equal(rendered[0].options.visual.cards[0].url,"https://example.org/atual");

rendered=[];
const denied=await runVerifiedIntelligenceCommand({message:"notícias",days:7},{
  fetchImpl:async()=>({ok:false,json:async()=>({ok:false,error:"account-login-required",status:401})}),
  showAnswer});
assert.equal(denied.ok,false);
assert.equal(denied.displayed,undefined);
assert.match(denied.text,/account-login-required/);
assert.equal(rendered.length,0,"do not show fake cards after denied login");

rendered=[];
const cancelled=await runVerifiedIntelligenceCommand({message:"notícias",days:7},{
  fetchImpl,isCancelled:()=>true,showAnswer});
assert.equal(cancelled.status,"cancelled");
assert.equal(rendered.length,0,"P0 cancellation cannot publish stale content");

const orchestrator=readFileSync(new URL("../modules/ultron-orchestrator-v4270.js",import.meta.url),"utf8");
const hook=orchestrator.indexOf("const verifiedIntent=parseVerifiedIntelligenceCommand(message);");
const pairing=orchestrator.indexOf("const mobilePairingIntent=parseMobilePairingIntent(message);");
assert.ok(hook>0&&pairing>hook,"explicit verified command must bypass generic research and pairing");
assert.match(orchestrator.slice(hook,pairing),/generation!==queueGeneration/);
assert.match(orchestrator,/import \{parseVerifiedIntelligenceCommand,runVerifiedIntelligenceCommand\}/);
const audio=readFileSync(new URL("../modules/jarvis-audio-maintenance.js",import.meta.url),"utf8");
assert.match(audio,/enabled:false,mode:"text-only"/);
const commandCenter=readFileSync(new URL("../modules/jarvis-command-center-v4330.js",import.meta.url),"utf8");
assert.match(commandCenter,/audioInMaintenance = window\.JARVIS_AUDIO_POLICY\?\.enabled === false/);
assert.match(commandCenter,/audioInMaintenance \? 'DESATIVADA' : 'ENABLED'/);
assert.match(commandCenter,/if\(audioInMaintenance\)return;state\.textContent='FALANDO'/);
console.log("VERIFIED INTELLIGENCE CLIENT PASS: explicit terminal route, signed requests, sourced Neural news, no false globe claim, P0 and voice OFF");
