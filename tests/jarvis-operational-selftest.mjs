import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
  parseJarvisOperationalSelfTest,testJarvisGlobe,testJarvisAccess,
  diagnoseJarvisAccessTransport,runJarvisOperationalSelfTest,jarvisAccessLoginUrl
} from "../modules/jarvis-operational-selftest.js";

assert.deepEqual(parseJarvisOperationalSelfTest("Jarvis, testar globo e acesso"),
  {kind:"globe-and-access-selftest"});
assert.deepEqual(parseJarvisOperationalSelfTest("Ultron, verifique o globo e Cloudflare Access"),
  {kind:"globe-and-access-selftest"});
assert.equal(parseJarvisOperationalSelfTest("Jarvis, abra o globo"),null);
assert.equal(parseJarvisOperationalSelfTest("Jarvis, desativar escuta"),null);
assert.equal(parseJarvisOperationalSelfTest("Jarvis, pesquisar notícias"),null);
const state={available:true,ready:false,visible:false,mode:"not-opened",view:null};
let opens=0,closes=0;
const canvas={
  isConnected:true,width:640,height:400,
  getBoundingClientRect:()=>({width:320,height:200})
};
const browser={
  ULTRON_EARTH:{
    get state(){return state;},
    async open(){
      opens++;Object.assign(state,{ready:true,visible:true,mode:"globe-3d",
        view:{lat:-8.04,lng:-34.87,altitude:2.5}});
      return {ok:true,mode:"globe-3d"};
    },
    close(){closes++;state.visible=false;}
  },
  document:{querySelector:()=>canvas}
};
const checked=await testJarvisGlobe({browser});
assert.equal(checked.ok,true);
assert.equal(checked.status,"observed");
assert.equal(opens,1);
assert.equal(closes,0);
assert.match(checked.detail,/câmera e canvas visível/);

const falseCanvas=await testJarvisGlobe({browser:{
  ...browser,document:{querySelector:()=>({...canvas,width:0})}
}});
assert.equal(falseCanvas.ok,false);
assert.equal(falseCanvas.status,"partial");
assert.equal(closes,0,"failed render check must not close a preexisting globe");
const missing=await testJarvisGlobe({browser:{ULTRON_EARTH:{state:{available:false}}}});
assert.equal(missing.status,"unavailable");
const cancelled=await testJarvisGlobe({browser,isCancelled:()=>true});
assert.equal(cancelled.status,"cancelled");
assert.equal(closes,0,"never close an already open globe because P0 was fired");

const backend="https://ultron-backend.lucaalves17-20.workers.dev";
let calls=0;
const fetchOk=async (url,init)=>{
  calls++;
  assert.equal(url,backend+"/api/account/session/verify");
  assert.equal(init.method,"GET");
  assert.equal(init.credentials,"include");
  assert.equal(init.redirect,"error");
  assert.equal(init.cache,"no-store");
  assert.equal(init.mode,"cors");
  assert.deepEqual(Object.keys(init.headers),["Accept"]);
  return {status:200,text:async()=>JSON.stringify({
    ok:true,authenticated:true,verifiedBy:"cloudflare-access-jwt",
    sessionScope:"read-only",voiceEnabled:false
  })};
};
assert.equal((await testJarvisAccess({fetchImpl:fetchOk})).ok,true);
assert.equal(calls,1);
for(const [status,expected] of [
  [401,"login-required"],[403,"forbidden"],[503,"unavailable"],[404,"not-confirmed"]
]){
  const result=await testJarvisAccess({
    fetchImpl:async()=>({status,text:async()=>"{\"error\":\"rejected\"}"})
  });
  assert.equal(result.status,expected,"HTTP "+status+" must not claim login");
  assert.equal(result.ok,false);
}
const fake200=await testJarvisAccess({
  fetchImpl:async()=>({status:200,text:async()=>JSON.stringify({ok:true})})
});
assert.equal(fake200.ok,false);
// The reported live failure is a browser-level CORS/redirect error, not HTTP 401.
const backendHealth=(originAllowed=true,configured=true)=>({
  status:"online",workerEntrypoint:"worker.js",
  accountPlugins:{configured,uiOriginAllowed:originAllowed}
});
async function blockedAccessWithPublicHealth(health){
  const observed=[];
  const result=await testJarvisAccess({fetchImpl:async(url,init)=>{
    observed.push({url,init});
    if(url.endsWith("/api/account/session/verify"))throw new TypeError("Failed to fetch");
    if(url.endsWith("/api/health"))return {status:200,text:async()=>JSON.stringify(health)};
    throw Error("unexpected host");
  }});
  assert.equal(observed.length,2);
  assert.equal(observed[0].init.credentials,"include");
  assert.equal(observed[1].init.credentials,"omit");
  assert.equal(observed[1].init.method,"GET");
  assert.deepEqual(Object.keys(observed[1].init.headers),["Accept"]);
  assert.equal(observed[1].url,backend+"/api/health");
  return result;
}
const corsAllowed=await blockedAccessWithPublicHealth(backendHealth(true));
assert.equal(corsAllowed.ok,false);
assert.equal(corsAllowed.status,"access-or-cookie-blocked");
assert.match(corsAllowed.detail,/Worker responde e origem está autorizada/);
assert.match(corsAllowed.detail,/cookies entre github.io e workers.dev/);
const corsDenied=await blockedAccessWithPublicHealth(backendHealth(false));
assert.equal(corsDenied.status,"origin-not-allowed");
assert.match(corsDenied.detail,/JARVIS_ACCOUNT_UI_ORIGIN/);
const accessMissing=await blockedAccessWithPublicHealth(backendHealth(false,false));
assert.equal(accessMissing.status,"access-not-configured");
const staleDeploy=await blockedAccessWithPublicHealth({
  status:"online",workerEntrypoint:"worker.js",accountPlugins:{configured:true}
});
assert.equal(staleDeploy.status,"access-configuration-unverified");
const diagnostic=await diagnoseJarvisAccessTransport({
  fetchImpl:async()=>({status:200,text:async()=>JSON.stringify(backendHealth(true))})
});
assert.equal(diagnostic.status,"access-or-cookie-blocked");
const probeDenied=await diagnoseJarvisAccessTransport({
  fetchImpl:async()=>({status:403,text:async()=>""})
});
assert.equal(probeDenied.status,"not-confirmed");
const offline=await diagnoseJarvisAccessTransport({
  fetchImpl:async()=>{throw Error("offline");}
});
assert.equal(offline.status,"not-confirmed");
const noRequests=await diagnoseJarvisAccessTransport({
  isCancelled:()=>true,fetchImpl:async()=>{throw Error("must not send request");}
});
assert.equal(noRequests.status,"cancelled");

const unsafe=await testJarvisAccess({
  backendUrl:"https://attacker.invalid",
  fetchImpl:async()=>{throw Error("untrusted network request");}
});
assert.equal(unsafe.ok,false);
const down=await testJarvisAccess({
  fetchImpl:async()=>{throw Error("CORS");}
});
assert.equal(down.status,"not-confirmed");
assert.equal((await testJarvisAccess({fetchImpl:fetchOk,isCancelled:()=>true})).status,
  "cancelled");
assert.equal(calls,1,"P0 cannot send new probes");

const report=await runJarvisOperationalSelfTest({browser,fetchImpl:fetchOk});
assert.equal(report.ok,true);
assert.equal(report.globe.ok,true);
assert.equal(report.access.ok,true);
assert.equal(report.certifiedCapabilitiesIncrement,0);
assert.equal(report.voiceEnabled,false);
assert.match(report.text,/2\/2 testes pontuais confirmados/);
assert.match(report.text,/NÃO concede homologação/);
assert.equal(report.displayed,false,"do not cover the successful 3D globe with text overlay");
const failure=await runJarvisOperationalSelfTest({browser:{
  ULTRON_EARTH:{state:{available:false}},ULTRON_NEURAL_ANSWER:{show:()=>{}}
},fetchImpl:async()=>({status:401,text:async()=>"{\"error\":\"account-login-required\"}"})});
assert.equal(failure.ok,false);
assert.match(failure.text,/0\/2 testes pontuais confirmados/);
assert.equal(failure.certifiedCapabilitiesIncrement,0);
let stop=false;
const cancelledReport=await runJarvisOperationalSelfTest({
 browser,fetchImpl:async()=>{stop=true;return {status:401,text:async()=>""};},
 isCancelled:()=>stop,
 showAnswer:()=>{throw Error("P0 cannot display stale response");}
});
assert.equal(cancelledReport.status,"cancelled");
const worker=readFileSync(new URL("../backend/worker.js",import.meta.url),"utf8");
const authHandler=worker.slice(worker.indexOf("async function handleAccountSessionVerify("),
  worker.indexOf("async function handleAccountIntelligence("));
assert.match(authHandler,/request\.method!=="GET"/);
assert.match(authHandler,/authorizeJarvisAccount\(request,env\)/);
assert.match(authHandler,/if\(!auth\.ok\)/);
assert.doesNotMatch(authHandler,/auth\.(?:accountId|email|token)|bodyOf\(|memoryKey|deviceSecret/);
assert.match(worker,/\/api\/account\/session\/verify"\)return handleAccountSessionVerify/);
const orchestrator=readFileSync(new URL("../modules/ultron-orchestrator-v4270.js",import.meta.url),"utf8");
assert.match(orchestrator,/source==="terminal"&&parseJarvisOperationalSelfTest\(message\)/);
assert.match(orchestrator,/isCancelled:\(\)=>generation!==queueGeneration/);
const audio=readFileSync(new URL("../modules/jarvis-audio-maintenance.js",import.meta.url),"utf8");
assert.match(audio,/enabled:false,mode:"text-only"/);
// Explicit navigation must never be triggered in the background by a failed
// diagnostic. The browser opens the protected domain only after a real click.
assert.equal(jarvisAccessLoginUrl(),
  "https://ultron-backend.lucaalves17-20.workers.dev/api/account/session/verify");
assert.equal(jarvisAccessLoginUrl("https://attacker.invalid"),null);
assert.equal(jarvisAccessLoginUrl(
  "https://user:pass@ultron-backend.lucaalves17-20.workers.dev"),null);
assert.equal(jarvisAccessLoginUrl(
  "https://ultron-backend.lucaalves17-20.workers.dev/other"),null);
assert.equal(jarvisAccessLoginUrl(
  "https://ultron-backend.lucaalves17-20.workers.dev?jwt=secret"),null);
const EventBackup=globalThis.CustomEvent;
class TestCustomEvent{
  constructor(type,{detail}={}){this.type=type;this.detail=detail;}
}
globalThis.CustomEvent=TestCustomEvent;
const emitted=[];
const loginBrowser={...browser,dispatchEvent:event=>{emitted.push(event);return true;}};
const loginSuggested=await runJarvisOperationalSelfTest({
  browser:loginBrowser,
  fetchImpl:async()=>({status:401,text:async()=>JSON.stringify({error:"account-login-required"})})
});
assert.equal(loginSuggested.access.status,"login-required");
assert.equal(emitted.length,1);
assert.equal(emitted[0].type,"jarvis:access-signin-required");
assert.deepEqual(emitted[0].detail,{status:"login-required"});
assert.equal(loginSuggested.certifiedCapabilitiesIncrement,0);
emitted.length=0;
await runJarvisOperationalSelfTest({
  browser:loginBrowser,
  fetchImpl:async()=>({status:403,text:async()=>JSON.stringify({error:"account-not-allowed"})})
});
assert.equal(emitted.length,0,"forbidden origin must not suggest a login bypass");
emitted.length=0;
await runJarvisOperationalSelfTest({browser:loginBrowser,fetchImpl:fetchOk});
assert.equal(emitted.length,0,"authenticated sessions must not trigger login UI");
globalThis.CustomEvent=EventBackup;
const commandCenter=readFileSync(new URL("../modules/jarvis-command-center-v4330.js",import.meta.url),"utf8");
assert.match(commandCenter,/window\.addEventListener\('jarvis:access-signin-required'/);
assert.match(commandCenter,/jarvisAccessLoginUrl\(\)/);
assert.match(commandCenter,/label:'Entrar no Cloudflare Access'/);
assert.match(commandCenter,/run:\(\)=>\{\s*\/\/ Runs synchronously/);
assert.match(commandCenter,/window\.open\(loginUrl,'_blank','noopener,noreferrer'\)/);
assert.equal((commandCenter.match(/window\.open\(loginUrl/g)||[]).length,1);
console.log("JARVIS OPERATIONAL SELFTEST PASS: lazy globe, visible canvas, signed JWT gate, P0, no identity leak, voice OFF");
