import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {checkJarvisProduction} from "../scripts/jarvis-production-proof.mjs";
const page="https://equipezero-web.github.io/Ultron_AI/";
const backend="https://ultron-backend.lucaalves17-20.workers.dev";
const local=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const health={
 status:"online",workerEntrypoint:"worker.js",singleEntrypoint:true,
 legacyWorkerChain:false,voiceOutputEnabled:false,
 voiceMaintenance:{mode:"text-only",inputEnabled:false,outputEnabled:false,remoteMicEnabled:false}
};
const fetchFactory=({backendOnline=true,accessConfigured=true,staleFrontend=false}={})=>
  async (url,options={})=>{
    assert.ok([page,backend].some(origin=>url.startsWith(origin)),
      "the production probe must access only fixed public hosts");
    assert.equal(options.redirect,"manual");
    const u=new URL(url);
    if(u.host==="equipezero-web.github.io"){
      const path=u.pathname.slice("/Ultron_AI/".length)||"index.html";
      const content=local(path);
      return new Response(staleFrontend&&path==="index.html"?content+"\n<!-- stale -->":content,
        {status:200,headers:{"Content-Type":path.endsWith(".json")?"application/json":"text/plain"}});
    }
    if(u.pathname==="/api/health")
      return new Response(JSON.stringify(backendOnline?health:{...health,voiceOutputEnabled:true}),
        {status:200,headers:{"Content-Type":"application/json"}});
    if(u.pathname==="/api/account/intelligence/execute"){
      assert.equal(options.method,"POST");
      assert.equal(options.body,"{}","only unsigned harmless JSON should be used");
      return new Response(JSON.stringify(accessConfigured?
        {ok:false,error:"account-login-required"}:{ok:false,error:"account-login-not-configured"}),
        {status:accessConfigured?401:503,headers:{"Content-Type":"application/json"}});
    }
    throw Error("unexpected probe: "+u.pathname);
  };
const time=()=>Date.parse("2026-11-19T15:00:00.000Z");
const verified=await checkJarvisProduction({fetchImpl:fetchFactory(),now:time});
assert.equal(verified.passed,true);
assert.equal(verified.verified,verified.total);
assert.ok(verified.total>=8,"must verify entry + full static artifacts + health + login gate");
assert.equal(verified.limits.physicalDevices,"not-tested");
assert.equal(verified.limits.accessAuthenticatedQuery,"not-tested-no-jwt");
assert.equal(verified.limits.capabilityCertification,"not-implied");
const stale=await checkJarvisProduction({fetchImpl:fetchFactory({staleFrontend:true}),now:time});
assert.equal(stale.passed,false);
assert.equal(stale.checks["frontend-index.html"].status,"failed");
assert.equal(stale.checks["frontend-index.html"].reason,"deployed-version-differs");
const staleWorker=await checkJarvisProduction({fetchImpl:fetchFactory({backendOnline:false}),now:time});
assert.equal(staleWorker.passed,false);
assert.equal(staleWorker.checks["backend-health"].status,"failed",
  "voice unexpectedly active must fail deployment certification");
const loginMissing=await checkJarvisProduction({fetchImpl:fetchFactory({accessConfigured:false}),now:time});
assert.equal(loginMissing.passed,false);
assert.equal(loginMissing.checks["unauthenticated-account-denial"].reason,
  "access-configuration-or-provider-unavailable");
const networkDown=await checkJarvisProduction({fetchImpl:async()=>{throw Error("DNS offline");},now:time});
assert.equal(networkDown.passed,false);
assert.equal(networkDown.verified,0);
assert.ok(Object.values(networkDown.checks).every(x=>x.status==="failed"));
console.log("JARVIS PRODUCTION PROOF UNIT PASS: exact deploy bytes, account gate, voice-off, explicit deployment failures");
