/**
 * Network probe executed by GitHub Actions. It does not log in, change data,
 * bypass Cloudflare Access or certify devices. It only verifies public assets
 * and the signed-account endpoint's refusal of unsigned requests.
 */
import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {validateJarvisAcceptanceManifest} from "../modules/jarvis-acceptance-validation.js";

const PAGE="https://equipezero-web.github.io/Ultron_AI/";
const WORKER="https://ultron-backend.lucaalves17-20.workers.dev";
const publicFiles=["index.html","data/jarvis-100-acceptance-manifest.json",
  "modules/jarvis-evidence-progress.js","modules/jarvis-acceptance-validation.js"];
const hash=s=>createHash("sha256").update(s).digest("hex");
// Only a redirect to the Cloudflare Access login path is proof that the
// anonymous request was rejected at the edge. Other 3xx responses fail.
// We intentionally never retain or log Location query strings or cookies.
export function isCloudflareAccessLoginRedirect(value){
  if(typeof value!=="string"||!value||value.length>4096)return false;
  try{
    const url=new URL(value,WORKER);
    const team=url.hostname.toLowerCase().split(".cloudflareaccess.com");
    const teamHost=team.length===2&&team[1]===""&&
      /^[a-z0-9-]+$/i.test(team[0]);
    const trustedHost=url.origin===WORKER||teamHost;
    const loginPath=url.pathname==="/cdn-cgi/access/login"||
      url.pathname.startsWith("/cdn-cgi/access/login/");
    return url.protocol==="https:"&&!url.username&&!url.password&&trustedHost&&loginPath;
  }catch{return false;}
}
function safeError(e){
  return String(e?.message||e||"unavailable").replace(/https?:\/\/\S+/g,"[source]")
    .replace(/[\r\n\t]/g," ").slice(0,140);
}
async function getResponse(fetchImpl,url,init={},{allowAccessLoginRedirect=false}={}){
  const r=await fetchImpl(url,{redirect:"manual",cache:"no-store",
    signal:AbortSignal.timeout(16000),...init});
  if(r.status>=300&&r.status<400){
    if(allowAccessLoginRedirect)return {status:r.status,body:"",
      accessLoginRedirect:isCloudflareAccessLoginRedirect(r.headers?.get?.("location"))};
    throw Error("unexpected-redirect");
  }
  const size=Number(r.headers?.get?.("content-length")||0);
  if(size>1_000_000)throw Error("response-too-large");
  const body=await r.text();
  if(body.length>1_000_000)throw Error("response-too-large");
  return {status:r.status,body};
}
export async function checkJarvisProduction({fetchImpl=fetch,now=Date.now,readFile=readFileSync}={}){
  const checks={};
  const date=new Date(now()).toISOString();
  for(const path of publicFiles){
    const label="frontend-"+path;
    try{
      const local=readFile(new URL("../"+path,import.meta.url),"utf8");
      const remote=await getResponse(fetchImpl,PAGE+path.replace(/^index\.html$/,""));
      const equal=remote.status===200&&hash(local)===hash(remote.body);
      checks[label]={status:equal?"verified":"failed",httpStatus:remote.status,
        source:PAGE+path.replace(/^index\.html$/,""),
        reason:equal?"same-bytes-as-repository":remote.status!==200?"http-error":"deployed-version-differs"};
    }catch(error){checks[label]={status:"failed",reason:safeError(error)};}
  }
  try{
    const html=await getResponse(fetchImpl,PAGE);
    checks["frontend-entry"]={status:html.status===200&&
      /jarvis-audio-maintenance\.js/.test(html.body)&&
      /ultron-orchestrator-v4270\.js/.test(html.body)?"verified":"failed",
      httpStatus:html.status,source:PAGE};
  }catch(error){checks["frontend-entry"]={status:"failed",reason:safeError(error)};}
  try{
    const result=await getResponse(fetchImpl,WORKER+"/api/health");
    const info=JSON.parse(result.body);
    const approved=result.status===200&&info.status==="online"&&
      info.workerEntrypoint==="worker.js"&&info.singleEntrypoint===true&&
      info.legacyWorkerChain===false&&info.voiceOutputEnabled===false&&
      info.voiceMaintenance?.mode==="text-only"&&
      info.voiceMaintenance?.inputEnabled===false&&
      info.voiceMaintenance?.remoteMicEnabled===false;
    checks["backend-health"]={status:approved?"verified":"failed",
      httpStatus:result.status,source:WORKER+"/api/health",
      reason:approved?"online-voice-off":"health-contract-mismatch"};
  }catch(error){checks["backend-health"]={status:"failed",reason:safeError(error)};}
  try{
    const result=await getResponse(fetchImpl,WORKER+"/api/account/intelligence/execute",{
      method:"POST",headers:{"Content-Type":"application/json"},body:"{}"
    },{allowAccessLoginRedirect:true});
    let body={};
    try{body=JSON.parse(result.body);}catch{}
    const workerDenied=result.status===401&&body?.error==="account-login-required";
    const edgeDenied=result.status===302&&result.accessLoginRedirect===true;
    const denied=workerDenied||edgeDenied;
    checks["unauthenticated-account-denial"]={
      status:denied?"verified":"failed",httpStatus:result.status,
      source:WORKER+"/api/account/intelligence/execute",
      reason:edgeDenied?"anonymous-redirected-to-cloudflare-access-login":
        workerDenied?"anonymous-request-denied-by-worker":
        result.status>=300&&result.status<400?"unrecognized-login-redirect":
        result.status===503?"access-configuration-or-provider-unavailable":"auth-contract-not-verified",
      boundary:edgeDenied?"cloudflare-access-edge":workerDenied?"worker-jwt":"not-verified"
    };
  }catch(error){checks["unauthenticated-account-denial"]={status:"failed",reason:safeError(error)};}
  // An exact manifest hash is necessary but NOT enough to certify the
  // capabilities it lists. Read published manifest shape only as a cross-check.
  try{
    const result=await getResponse(fetchImpl,PAGE+"data/jarvis-100-acceptance-manifest.json");
    const manifest=JSON.parse(result.body);
    const valid=validateJarvisAcceptanceManifest(manifest,{now});
    checks["published-acceptance-schema"]={
      status:result.status===200&&valid.ok?"verified":"failed",
      source:PAGE+"data/jarvis-100-acceptance-manifest.json",
      reason:valid.ok?"60-capability-manifest-valid":valid.error
    };
  }catch(error){checks["published-acceptance-schema"]={status:"failed",reason:safeError(error)};}
  const verified=Object.values(checks).filter(x=>x.status==="verified").length;
  const report={
    schemaVersion:1,kind:"production-observation",observedAt:date,
    commit:typeof process!=="undefined"?process.env.GITHUB_SHA||null:null,
    checks,verified,total:Object.keys(checks).length,passed:verified===Object.keys(checks).length,
    limits:{
      accessAuthenticatedQuery:"not-tested-no-jwt",
      cloudflareSecrets:"not-accessed",
      physicalDevices:"not-tested",
      liveGlobeScene:"not-tested",
      capabilityCertification:"not-implied"
    }
  };
  return report;
}
