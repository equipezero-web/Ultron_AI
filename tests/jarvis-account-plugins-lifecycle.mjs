import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {revokeAccountPluginDevice,executeAccountPlugin} from "../backend/jarvis-account-plugins.js";

const aa="a".repeat(64),bb="b".repeat(64);
const id="12345678-1234-4234-8234-123456789abc";
const device={id,account:aa,status:"active",commands:[
 {status:"pending",payload:{title:"Private calendar event"}},
 {status:"claimed",payload:{title:"Private calendar event"}}
]};
let batchCount=0;
const env={ULTRON_DB:{
 prepare(sql){
  return {
   sql,args:[],
   bind(...args){this.args=args;return this;},
   async run(){return {meta:{changes:1}};},
   async first(){
     if(sql.includes("SELECT id FROM devices"))
       return device.status==="active"&&this.args[0]===id&&this.args[1]===device.account?{id}:null;
     if(sql.includes("SELECT enabled FROM jarvis_account_plugins"))return {enabled:1};
     return null;
   },
   async all(){
     if(sql.includes("FROM devices d")){
       if(this.args[0]!==device.account)return {results:[]};
       return {results:[{id:device.id,deviceType:"mobile",deviceName:"Android paired",
         status:device.status,lastSeenAt:new Date().toISOString(),
         capabilitiesJson:JSON.stringify(["app.open","calendar.open"])}]};
     }
     return {results:[]};
   }
  };
 },
 async batch(statements){
  batchCount++;
  assert.equal(statements.length,2);
  assert.match(statements[0].sql,/UPDATE device_commands SET status='cancelled'/);
  assert.match(statements[0].sql,/operator_id=\?/);
  assert.deepEqual(statements[0].args,[id,aa]);
  assert.match(statements[1].sql,/status='revoked'/);
  assert.deepEqual(statements[1].args,[id,aa]);
  device.commands.forEach(x=>{x.status="cancelled";x.payload={};});
  device.status="revoked";
  return [{meta:{changes:2}},{meta:{changes:1}}];
 }
}};
assert.equal((await revokeAccountPluginDevice(env,aa,{deviceId:id})).error,
 "device-revocation-confirmation-required");
assert.equal((await revokeAccountPluginDevice(env,bb,{deviceId:id,confirm:true})).error,
 "account-device-not-found-or-revoked");
assert.equal(batchCount,0,"Cannot revoke without confirmation and same account");
const revoked=await revokeAccountPluginDevice(env,aa,{deviceId:id,confirm:true});
assert.equal(revoked.ok,true);
assert.equal(revoked.credentialsInvalidated,true);
assert.equal(revoked.pendingCommandsCancelled,true);
assert.equal(batchCount,1);
assert.equal(device.status,"revoked");
assert.ok(device.commands.every(x=>x.status==="cancelled"&&Object.keys(x.payload).length===0));
assert.equal((await revokeAccountPluginDevice(env,aa,{deviceId:id,confirm:true})).ok,false);
const blocked=await executeAccountPlugin(env,aa,{pluginId:"youtube",actionId:"youtube.open",deviceId:id});
assert.equal(blocked.ok,false);
assert.equal(blocked.error,"account-device-offline-or-not-paired");
const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const worker=read("backend/worker.js"),bridge=read("backend/device-bridge.js");
const client=read("modules/jarvis-account-plugins-client.js");
const panel=read("modules/jarvis-account-plugin-panel.js");
const shell=read("modules/jarvis-command-center-v4330.js");
const html=read("index.html");
assert.match(worker,/revokeAccountPluginDevice\(env,auth.accountId,body\)/);
assert.match(worker,/\/api\/account\/devices\/revoke/);
assert.match(bridge,/OR command = 'calendar\.create'/);
assert.match(client,/revoke:\(deviceId,confirm\)=>io/);
assert.match(client,/receipt:commandId=>io/);
assert.match(panel,/CONFIRMAR REVOGAÇÃO/);
assert.match(panel,/api\.revoke\(id,true\)/);
assert.match(panel,/result\?\.status!=="revoked"/);
assert.match(panel,/state==="completed"/);
assert.match(panel,/document\.createElement/);
assert.doesNotMatch(panel,/\.innerHTML\s*=/);
assert.match(shell,/Plugins permanentes/);
assert.match(html,/jarvis-account-plugin-panel\.js/);
assert.doesNotMatch(html,/<body[^>]*jarvis-voice-output-disabled/);
assert.match(html,/id="btn-toggle-speech"/);
console.log("JARVIS ACCOUNT PLUGIN LIFECYCLE PASS: owner-only revoke, pending scrub, no cross-account action, UI confirmation, text-only mode");
