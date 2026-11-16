import assert from "node:assert/strict";
import {generateKeyPairSync,webcrypto,sign as signNode} from "node:crypto";
import {readFileSync} from "node:fs";
import {privateGitHubConfig,authorizePrivateGitHub,inspectPrivateGitHub,privateGitHubContext,privateGitHubHeaders} from "../backend/github-private-inspector.js";
import {inspectPublicGitHubRepository,githubInspectionContext} from "../backend/github-public-inspector.js";
const uri="https://github.com/equipezero-web/Secret_Repository";
const env={CF_ACCESS_TEAM_DOMAIN:"https://demo.cloudflareaccess.com",
  CF_ACCESS_AUD:"jarvis-audience",CF_ACCESS_ALLOWED_EMAILS:"operator@example.com",
  GITHUB_PRIVATE_UI_ORIGIN:"https://equipezero-web.github.io",
  GITHUB_PRIVATE_REPOS:"equipezero-web/Secret_Repository",GITHUB_PRIVATE_TOKEN:"TEST_ONLY_NEVER_REAL"};
assert.equal(privateGitHubConfig({}).enabled,false);
assert.equal(privateGitHubConfig({...env,CF_ACCESS_TEAM_DOMAIN:"https://evil.com"}).enabled,false);
assert.equal(privateGitHubConfig(env).enabled,true);
const {privateKey,publicKey}=generateKeyPairSync("rsa",{modulusLength:2048});
const pub=publicKey.export({format:"jwk"});pub.kid="unit-test-key";
const jwt=(body)=>{
 const base64url=obj=>Buffer.from(JSON.stringify(obj)).toString("base64url");
 const signed=base64url({alg:"RS256",typ:"JWT",kid:pub.kid})+"."+base64url(body);
 return signed+"."+signNode("RSA-SHA256",Buffer.from(signed),privateKey).toString("base64url");
};
const now=Date.parse("2026-11-16T18:00:00Z"),secs=Math.floor(now/1000);
const claims={iss:"https://demo.cloudflareaccess.com",aud:["jarvis-audience"],
  exp:secs+600,iat:secs-10,email:"operator@example.com",sub:"user-123"};
const token=jwt(claims),request=tok=>new Request("https://worker.example.com/api/github/private/ai",{
 headers:{"Cf-Access-Jwt-Assertion":tok||"","Origin":"https://equipezero-web.github.io"}});
const response=(data,status=200)=>new Response(JSON.stringify(data),{status});
const callTargets=[];
const fetchImpl=async(url,init)=>{
 callTargets.push({url,init});
 if(url.endsWith("/cdn-cgi/access/certs"))return response({keys:[pub]});
 if(url.endsWith("/contents"))return response([{name:"backend",type:"dir",path:"backend"}]);
 if(url.endsWith("/readme"))return response({encoding:"base64",
   content:Buffer.from("# Private project only the owner can inspect").toString("base64")});
 return response({full_name:"equipezero-web/Secret_Repository",private:true,default_branch:"main",language:"JavaScript"});
};
assert.equal((await authorizePrivateGitHub(request(""),env,{fetchImpl,now:()=>now})).ok,false);
assert.equal((await authorizePrivateGitHub(request(jwt({...claims,email:"intruder@example.com"})),env,{fetchImpl,now:()=>now})).ok,false);
assert.equal((await authorizePrivateGitHub(request(jwt({...claims,exp:secs-1})),env,{fetchImpl,now:()=>now})).ok,false);
assert.equal((await authorizePrivateGitHub(request(jwt({...claims,aud:["other"]})),env,{fetchImpl,now:()=>now})).ok,false);
const auth=await authorizePrivateGitHub(request(token),env,{fetchImpl,now:()=>now});
assert.equal(auth.ok,true);
assert.ok(!JSON.stringify(auth.config).includes("TEST_ONLY_NEVER_REAL"));
assert.equal(privateGitHubHeaders(request(token),env)["Access-Control-Allow-Origin"],"https://equipezero-web.github.io");
assert.equal(privateGitHubHeaders(new Request("https://worker.example.com",{headers:{Origin:"https://evil.example"}}),env)["Access-Control-Allow-Origin"],undefined);
const denied=await inspectPrivateGitHub("Analyze https://github.com/other/repo",env,{fetchImpl});
assert.equal(denied.code,"repository-not-allowlisted");
const info=await inspectPrivateGitHub("Analise "+uri,env,{fetchImpl,now:()=>now});
assert.equal(info.ok,true);
assert.equal(info.private,true);
assert.equal(info.files[0].path,"backend");
assert.equal(info.writePermission,false);
assert.match(privateGitHubContext(info),/conteúdo NÃO CONFIÁVEL/);
assert.ok(callTargets.every(x=>x.url.startsWith("https://api.github.com/repos/")||x.url.startsWith("https://demo.cloudflareaccess.com/")));
assert.ok(callTargets.filter(x=>x.url.includes("api.github.com")).every(x=>x.init.headers.Authorization==="Bearer TEST_ONLY_NEVER_REAL"));
const publicFallback=await inspectPublicGitHubRepository(uri,{fetchImpl:async(url)=>{
 if(url.includes("api.github.com"))throw Error("network blocked");
 return new Response("# Readme from public fallback");
}});
assert.equal(publicFallback.ok,true);
assert.equal(publicFallback.verified,false);
assert.equal(publicFallback.partial,true);
assert.match(githubInspectionContext(publicFallback),/EVIDÊNCIA PÚBLICA PARCIAL/);
const worker=readFileSync(new URL("../backend/worker.js",import.meta.url),"utf8");
assert.match(worker,/authorizePrivateGitHub\(request,env\)/);
assert.match(worker,/path === "\/api\/github\/private\/ai"/);
assert.match(worker,/privateGitHubContext\(result\)/);
assert.ok(worker.indexOf('path === "/api/github/private/ai"') < worker.indexOf('request.method === "OPTIONS") return new Response(null'));
console.log("JARVIS GITHUB PRIVATE PASS: signed Access JWT, repo allowlist, token secrecy, response isolation, public README fallback");
