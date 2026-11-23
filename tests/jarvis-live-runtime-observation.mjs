import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {observeJarvisRuntime} from "../modules/jarvis-live-runtime-observation.js";
import {showJarvisEvolutionProgress} from "../modules/jarvis-evidence-progress.js";

const backend="https://ultron-backend.lucaalves17-20.workers.dev";
const browser={
  location:{origin:"https://equipezero-web.github.io",pathname:"/Ultron_AI/"},
  ULTRON_NEURAL_ANSWER:{show:()=>{}},
  ULTRON_EARTH:{state:{ready:true,visible:false}},
  JARVIS_AUDIO_POLICY:{enabled:false,mode:"text-only"}
};
const healthy={
  status:"online",workerEntrypoint:"worker.js",singleEntrypoint:true,
  legacyWorkerChain:false,voiceOutputEnabled:false,
  voiceMaintenance:{mode:"text-only",inputEnabled:false,remoteMicEnabled:false},
  accountPlugins:{configured:true}
};
let requests=[];
const fetchHealth=async(url,options)=>{
  requests.push({url,options});
  assert.equal(url,backend+"/api/health");
  assert.equal(options.method,"GET");
  assert.equal(options.credentials,"omit","never send Access, session or device cookies");
  assert.equal(options.mode,"cors");
  assert.equal(options.redirect,"error");
  assert.equal(options.cache,"no-store");
  assert.equal(options.headers.Accept,"application/json");
  return {status:200,text:async()=>JSON.stringify(healthy)};
};
const confirmed=await observeJarvisRuntime({browser,fetchImpl:fetchHealth,
  now:()=> "2026-11-19T15:00:00.000Z"});
assert.equal(confirmed.total,6);
assert.equal(confirmed.observed,5);
assert.equal(confirmed.certificationCountIncrement,0,
  "runtime status must never auto-grant capability acceptance");
assert.equal(confirmed.checks[4].label,"Backend Cloudflare");
assert.equal(confirmed.checks[4].state,"observed");
assert.equal(confirmed.checks[5].state,"configured-unverified");
assert.match(confirmed.text,/NÃO É HOMOLOGAÇÃO/);
assert.match(confirmed.text,/5\/6 sinais básicos, NÃO capacidades homologadas/);
assert.match(confirmed.text,/autenticação real/);
assert.equal(requests.length,1);

const badVoice=await observeJarvisRuntime({browser,fetchImpl:async()=>({
 status:200,text:async()=>JSON.stringify({...healthy,voiceOutputEnabled:true})
})});
assert.equal(badVoice.checks[4].state,"not-confirmed",
 "voice enabled unexpectedly must fail public backend verification");
const loginDisabled=await observeJarvisRuntime({browser,fetchImpl:async()=>({
 status:200,text:async()=>JSON.stringify({...healthy,accountPlugins:{configured:false}})
})});
assert.equal(loginDisabled.checks[5].state,"not-confirmed");
const wrongUiOrigin=await observeJarvisRuntime({browser,fetchImpl:async()=>({
 status:200,text:async()=>JSON.stringify({
  ...healthy,accountPlugins:{configured:true,uiOriginAllowed:false}
 })
})});
assert.equal(wrongUiOrigin.checks[5].state,"not-confirmed");
assert.match(wrongUiOrigin.checks[5].description,/JARVIS_ACCOUNT_UI_ORIGIN/);
const allowedUiOrigin=await observeJarvisRuntime({browser,fetchImpl:async()=>({
 status:200,text:async()=>JSON.stringify({
  ...healthy,accountPlugins:{configured:true,uiOriginAllowed:true}
 })
})});
assert.equal(allowedUiOrigin.checks[5].state,"configured-unverified");
assert.match(allowedUiOrigin.checks[5].description,/sessão JWT e política de Access não testadas/);
const corsBlocked=await observeJarvisRuntime({browser,fetchImpl:async()=>{throw Error("CORS blocked");}});
assert.equal(corsBlocked.checks[4].state,"not-confirmed");
assert.equal(corsBlocked.checks[5].state,"not-tested");
assert.match(corsBlocked.checks[4].description,/CORS/);
const lazyGlobe=await observeJarvisRuntime({browser:{
 ...browser,ULTRON_EARTH:{state:{available:true,ready:false,mode:"not-opened"}}
},fetchImpl:fetchHealth});
assert.equal(lazyGlobe.checks[2].state,"awaiting-activation");
assert.match(lazyGlobe.checks[2].description,/iniciado sob demanda/);
assert.equal(lazyGlobe.observed,4,"lazy globe must not count as confirmed");
assert.match(lazyGlobe.text,/EM ESPERA · Globo 3D/);
const noBrowser=await observeJarvisRuntime({
 browser:{location:{origin:"http://localhost:3000",pathname:"/"}},
 fetchImpl:fetchHealth
});
assert.equal(noBrowser.checks[0].state,"not-confirmed");
assert.equal(noBrowser.checks[3].state,"not-confirmed");
const fakeBackend=await observeJarvisRuntime({
 browser,backendUrl:"https://attacker.invalid",
 fetchImpl:async()=>{throw Error("must not call untrusted host");}
});
assert.equal(fakeBackend.checks[4].state,"not-confirmed");

const manifest=JSON.parse(readFileSync(new URL("../data/jarvis-100-acceptance-manifest.json",import.meta.url),"utf8"));
const shown=[];
const combined=await showJarvisEvolutionProgress({
 fetchImpl:async()=>({ok:true,json:async()=>manifest}),
 runtimeObserver:async()=>confirmed,
 showAnswer:text=>shown.push(text)
});
assert.equal(combined.ok,true);
assert.equal(combined.accepted,manifest.capabilities.filter(x=>x.acceptance==="accepted").length);
assert.equal(combined.partial,manifest.capabilities.filter(x=>x.acceptance==="pending"&&
  x.checks?.code?.state==="partial-scope-verified"&&
  x.checks?.ci?.state==="partial-scope-verified").length);
assert.equal(combined.liveObserved,5);
assert.equal(combined.liveTotal,6);
assert.equal(shown.length,1);
assert.match(shown[0],/0\/60 capacidades aceitas integralmente/);
assert.match(shown[0],/5\/6 sinais básicos, NÃO capacidades homologadas/);
assert.equal(combined.voiceEnabled,false);
let cancelled=false;
const afterCancel=await showJarvisEvolutionProgress({
 fetchImpl:async()=>({ok:true,json:async()=>manifest}),
 runtimeObserver:async()=>{cancelled=true;return confirmed;},
 isCancelled:()=>cancelled,
 showAnswer:()=>{throw Error("cancelled report must not render");}
});
assert.equal(afterCancel.status,"cancelled");
const audio=readFileSync(new URL("../modules/jarvis-audio-maintenance.js",import.meta.url),"utf8");
assert.match(audio,/enabled:false,mode:"text-only"/);
console.log("JARVIS LIVE RUNTIME OBSERVATION PASS: real public health, fail closed, Access not overclaimed, 0/60 separate, P0 and audio OFF");
