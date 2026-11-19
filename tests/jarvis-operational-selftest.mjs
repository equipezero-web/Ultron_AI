import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
  parseJarvisOperationalSelfTest,testJarvisGlobe,testJarvisAccess,
  runJarvisOperationalSelfTest
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
assert.doesNotMatch(authHandler,/accountId|email|memoryKey|token|secret|deviceSecret/);
assert.match(worker,/\/api\/account\/session\/verify"\)return handleAccountSessionVerify/);
const orchestrator=readFileSync(new URL("../modules/ultron-orchestrator-v4270.js",import.meta.url),"utf8");
assert.match(orchestrator,/source==="terminal"&&parseJarvisOperationalSelfTest\(message\)/);
assert.match(orchestrator,/isCancelled:\(\)=>generation!==queueGeneration/);
const audio=readFileSync(new URL("../modules/jarvis-audio-maintenance.js",import.meta.url),"utf8");
assert.match(audio,/enabled:false,mode:"text-only"/);
console.log("JARVIS OPERATIONAL SELFTEST PASS: lazy globe, visible canvas, signed JWT gate, P0, no identity leak, voice OFF");
