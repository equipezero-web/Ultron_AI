import assert from "node:assert/strict";
import {generateKeyPairSync,sign as rsaSign} from "node:crypto";
import {readFileSync} from "node:fs";
import {authorizeJarvisAccount,accountAccessHeaders,accountAccessConfig} from "../backend/jarvis-account-access.js";
import {parseAccountPluginCommand} from "../backend/jarvis-account-plugin-intents.js";
import {accountPluginInstall,accountPluginList,executeAccountPlugin,
  validateAccountPluginExecution} from "../backend/jarvis-account-plugins.js";

const env={CF_ACCESS_TEAM_DOMAIN:"https://demo.cloudflareaccess.com",
 CF_ACCESS_AUD:"jarvis-accounts-aud",
 CF_ACCESS_ACCOUNT_EMAILS:"first@example.org,second@example.org",
 JARVIS_ACCOUNT_UI_ORIGIN:"https://equipezero-web.github.io"};
assert.equal(accountAccessConfig({}).enabled,false);
assert.equal(accountAccessConfig(env).enabled,true);
assert.equal(accountAccessConfig({...env,JARVIS_ACCOUNT_UI_ORIGIN:"https://evil.test/path"}).enabled,false);
const {privateKey,publicKey}=generateKeyPairSync("rsa",{modulusLength:2048});
const key=publicKey.export({format:"jwk"});key.kid="test-signing";
const enc=o=>Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt=o=>{const msg=enc({alg:"RS256",kid:key.kid})+"."+enc(o);
 return msg+"."+rsaSign("RSA-SHA256",Buffer.from(msg),privateKey).toString("base64url");};
const now=Date.parse("2026-11-16T19:00:00Z"),time=Math.floor(now/1000);
const claims=sub=>({iss:"https://demo.cloudflareaccess.com",aud:"jarvis-accounts-aud",
 sub:"signed-"+sub,email:sub==="one"?"first@example.org":"second@example.org",
 exp:time+1200,iat:time-60});
const req=token=>new Request("https://worker.example/api/account/plugins",{headers:{
 Origin:"https://equipezero-web.github.io","Cf-Access-Jwt-Assertion":token||""
}});
const mockFetch=async url=>new Response(JSON.stringify({keys:[key]}));
assert.equal((await authorizeJarvisAccount(req(""),env,{fetchImpl:mockFetch,now:()=>now})).ok,false);
const one=await authorizeJarvisAccount(req(jwt(claims("one"))),env,{fetchImpl:mockFetch,now:()=>now});
const two=await authorizeJarvisAccount(req(jwt(claims("two"))),env,{fetchImpl:mockFetch,now:()=>now});
assert.equal(one.ok,true);assert.equal(two.ok,true);
assert.notEqual(one.accountId,two.accountId);
assert.ok(/^[a-f0-9]{64}$/.test(one.accountId));
assert.equal((await authorizeJarvisAccount(req(jwt({...claims("one"),exp:time-1})),env,{fetchImpl:mockFetch,now:()=>now})).ok,false);
assert.equal((await authorizeJarvisAccount(req(jwt({...claims("one"),email:"intruder@other.org"})),env,{fetchImpl:mockFetch,now:()=>now})).ok,false);
assert.equal(accountAccessHeaders(req(jwt(claims("one"))),env)["Access-Control-Allow-Origin"],env.JARVIS_ACCOUNT_UI_ORIGIN);
assert.equal(accountAccessHeaders(new Request("https://worker.example",{headers:{Origin:"https://evil.test"}}),env)["Access-Control-Allow-Origin"],undefined);

assert.deepEqual(parseAccountPluginCommand("Jarvis instale plugin youtube"),{kind:"install",pluginId:"youtube"});
assert.deepEqual(parseAccountPluginCommand("Jarvis abra o YouTube no meu celular"),
 {kind:"execute",pluginId:"youtube",actionId:"youtube.open",preferredType:"mobile"});
assert.deepEqual(parseAccountPluginCommand("Jarvis abra agenda no computador"),
 {kind:"execute",pluginId:"agenda",actionId:"calendar.open",preferredType:"desktop"});
assert.deepEqual(parseAccountPluginCommand("Jarvis faça diagnóstico do armazenamento no meu celular"),
 {kind:"execute",pluginId:"armazenamento",actionId:"storage.diagnostics"});
assert.equal(parseAccountPluginCommand("Não abra YouTube no celular"),null);
assert.equal(parseAccountPluginCommand("Como abrir YouTube no celular?"),null);
assert.equal(validateAccountPluginExecution({pluginId:"agenda",actionId:"calendar.create",
 deviceId:"4a1f2b30-1234-5678-1234-123456789abc"}).ok,false);
assert.equal(validateAccountPluginExecution({pluginId:"youtube",actionId:"storage.diagnostics",
 deviceId:"4a1f2b30-1234-5678-1234-123456789abc"}).ok,false);

const installs=new Map(),queued=[];
const androidId="f92d91ed-1234-487a-9def-123456789abc";
const desktopId="c82d26aa-1234-487a-9def-123456789abc";
const lastSeen=new Date().toISOString().replace("T"," ").slice(0,19);
const mockDB={
 prepare(query){
  let values=[];
  return {
   bind(...v){values=v;return this;},
   async run(){
    if(query.includes("INSERT INTO jarvis_account_plugins"))installs.set(values[0]+"/"+values[1],values[2]);
    if(query.includes("INSERT INTO device_commands"))queued.push({account:values[2],device:values[1],command:values[3],payload:JSON.parse(values[4])});
    return {meta:{changes:1}};
   },
   async first(){
    if(query.includes("SELECT enabled FROM jarvis_account_plugins"))
      return installs.has(values[0]+"/"+values[1])?{enabled:installs.get(values[0]+"/"+values[1])}:null;
    return null;
   },
   async all(){
    if(query.includes("FROM jarvis_account_plugins"))
      return {results:[...installs].filter(([k])=>k.startsWith(values[0]+"/")).map(([k,enabled])=>({
         pluginId:k.split("/")[1],enabled,installedAt:lastSeen}))};
    if(query.includes("FROM devices d"))
      return {results:values[0]===one.accountId?[
       {id:androidId,deviceType:"mobile",deviceName:"Android pessoal",status:"active",lastSeenAt:lastSeen,
        capabilitiesJson:JSON.stringify(["app.open","calendar.open","calendar.create","storage.diagnostics"])},
       {id:desktopId,deviceType:"desktop",deviceName:"Notebook pessoal",status:"active",lastSeenAt:lastSeen,
        capabilitiesJson:JSON.stringify(["desktop.open.url"])}
      ]:[]};
    return {results:[]};
   }
  };
 }
};
const appEnv={ULTRON_DB:mockDB};
assert.equal((await accountPluginList(appEnv,one.accountId)).plugins[0].installed,false);
assert.equal((await accountPluginInstall(appEnv,one.accountId,{pluginId:"youtube",action:"install"})).installed,true);
assert.equal((await accountPluginList(appEnv,two.accountId)).plugins[0].installed,false);
assert.equal((await executeAccountPlugin(appEnv,two.accountId,{pluginId:"youtube",actionId:"youtube.open",deviceId:androidId})).ok,false);
let sent=await executeAccountPlugin(appEnv,one.accountId,{pluginId:"youtube",actionId:"youtube.open",deviceId:androidId});
assert.equal(sent.ok,true);
assert.equal(queued.at(-1).command,"app.open");
assert.equal(queued.at(-1).payload.packageName,"com.google.android.youtube");
sent=await executeAccountPlugin(appEnv,one.accountId,{pluginId:"youtube",actionId:"youtube.open",deviceId:desktopId});
assert.equal(sent.ok,true);
assert.deepEqual(queued.at(-1).payload,{url:"https://www.youtube.com"});
assert.equal(queued.at(-1).command,"desktop.open.url");
assert.equal((await executeAccountPlugin(appEnv,one.accountId,{pluginId:"youtube",actionId:"storage.diagnostics",deviceId:androidId})).ok,false);
await accountPluginInstall(appEnv,one.accountId,{pluginId:"youtube",action:"uninstall"});
assert.equal((await executeAccountPlugin(appEnv,one.accountId,{pluginId:"youtube",actionId:"youtube.open",deviceId:androidId})).ok,false);
const files=[
 "backend/worker.js","android-bridge/app/src/main/java/com/ultron/bridge/BridgeService.java",
 "android-bridge/app/src/main/java/com/ultron/bridge/BridgeApi.java",
 "android-bridge/app/src/main/java/com/ultron/bridge/AccountPluginActions.java",
 "modules/jarvis-account-plugins-client.js","index.html"
].map(path=>readFileSync(new URL("../"+path,import.meta.url),"utf8"));
assert.match(files[0],/authorizeJarvisAccount\(request,env\)/);
assert.match(files[0],/path.startsWith\("\/api\/account\/"\)/);
assert.match(files[1],/AccountPluginActions\.execute/);
assert.match(files[2],/capabilities\.put\("calendar\.create"\)/);
assert.match(files[3],/CalendarContract\.Events\.CONTENT_URI/);
assert.match(files[3],/StatFs/);
assert.match(files[3],/requiresUserTap/);
assert.match(files[4],/credentials:"include"/);
assert.match(files[5],/jarvis-account-plugins-client\.js/);
console.log("JARVIS ACCOUNT PLUGINS PASS: signed per-account isolation, persistent install, device targeting, native safety");
