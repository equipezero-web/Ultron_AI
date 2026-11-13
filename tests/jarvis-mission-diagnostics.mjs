import assert from "node:assert/strict";
import {
  missionRequirements,inspectMissionDependencies,missionStepOutcome,createMissionJournal
} from "../modules/jarvis-mission-diagnostics.js";

const mockIntent=text=>{
  if(/\btv\b/i.test(text))return {deviceType:"mobile",command:"tv.volume.up"};
  if(/\bcomputador\b/i.test(text))return {deviceType:"desktop",command:"desktop.status"};
  return null;
};
const parts=["Ligue a TV","consulte o status do computador","aumente o volume da TV"];
assert.deepEqual(missionRequirements(["Ligue a TV"],()=>null).map(x=>x.key),
  ["router:devices"],"No device parser must not silently approve a physical command");
const missingRouter=await inspectMissionDependencies(["Ligue a TV"],{parseDeviceIntent:()=>null});
assert.equal(missingRouter.ready,false);
assert.deepEqual(missingRouter.blocking,["DEVICE_ROUTER_UNAVAILABLE"]);
const req=missionRequirements(parts,mockIntent);
assert.deepEqual(req.map(x=>x.key),["bridge:mobile","bridge:desktop"],"One check per bridge type");
let calls=0;
const devices=[
  {deviceType:"mobile",status:"active",online:true,deviceName:"Android"},
  {deviceType:"desktop",status:"active",online:false,deviceName:"PC"}
];
const inspect=await inspectMissionDependencies(parts,{
  parseDeviceIntent:mockIntent,listDevices:async()=>{calls++;return devices;}
});
assert.equal(calls,1,"One read-only inventory request per mission");
assert.equal(inspect.ready,false);
assert.equal(inspect.checked,2);
assert.deepEqual(inspect.blocking,["DEVICE_OFFLINE"]);
assert.equal(inspect.checks[0].code,"BRIDGE_ONLINE");
assert.match(inspect.checks[0].detail,/ACK/);
const allOnline=await inspectMissionDependencies(parts,{
  parseDeviceIntent:mockIntent,listDevices:async()=>devices.map(d=>({...d,online:true}))
});
assert.equal(allOnline.ready,true,"Both bridges present with genuine heartbeat");
const notPaired=await inspectMissionDependencies(["Ligue a TV"],{
  parseDeviceIntent:mockIntent,listDevices:async()=>[]
});
assert.equal(notPaired.blocking[0],"DEVICE_NOT_PAIRED");
const badGateway=await inspectMissionDependencies(parts,{
  parseDeviceIntent:mockIntent,listDevices:async()=>{throw new Error("network unavailable");}
});
assert.equal(badGateway.ready,false);
assert.deepEqual(badGateway.blocking,["GATEWAY_UNAVAILABLE","GATEWAY_UNAVAILABLE"]);
const noInternet=await inspectMissionDependencies(["Ligue a TV"],{
  parseDeviceIntent:mockIntent,listDevices:async()=>new Promise(()=>{})
},{timeoutMs:10});
assert.equal(noInternet.blocking[0],"GATEWAY_UNAVAILABLE","Timed-out lookup must not pass");
const camera=await inspectMissionDependencies(["Ative a câmera","mostre status"],{
  isCameraActivation:part=>/camera|câmera/i.test(part),
  cameraAvailable:()=>true
});
assert.equal(camera.ready,true);
assert.equal(camera.checks[0].code,"CAMERA_API_PRESENT");
assert.match(camera.checks[0].detail,/permissão/);
assert.equal((await inspectMissionDependencies(["Ative a câmera"],{
  isCameraActivation:()=>true,cameraAvailable:()=>false
})).blocking[0],"CAMERA_API_UNAVAILABLE");
const local=await inspectMissionDependencies(["Mostre o mapa 2D","depois aproxime o globo"],{
  parseDeviceIntent:mockIntent
});
assert.equal(local.checked,0,"No fictional verification of geospatial data");
assert.match(local.limitations,/Somente dependências identificadas/);

assert.equal(missionStepOutcome({ok:true}),"completed");
assert.equal(missionStepOutcome({ok:true,result:{status:"submitted"}}),"submitted");
assert.equal(missionStepOutcome({ok:true,submitted:true}),"submitted");
assert.equal(missionStepOutcome({ok:true,waitingConfirmation:true}),"waiting-confirmation");
assert.equal(missionStepOutcome({ok:true},true),"cancelled");
assert.equal(missionStepOutcome({ok:false}),"failed");

let now=5000;
const journal=createMissionJournal({now:()=>now,maxEntries:2});
const run=journal.create({id:"local-abc",total:3,source:"terminal",localOnly:true});
assert.equal(run.steps[1].dependsOn,1);
assert.equal(journal.beginStep("local-abc",1),false,"Step 2 cannot begin before Step 1");
assert.equal(journal.beginStep("local-abc",0),true);
assert.equal(journal.finishStep("local-abc",0,"completed","device-control"),true);
now+=200;
assert.equal(journal.beginStep("local-abc",1),true);
assert.equal(journal.finishStep("local-abc",1,"submitted","device-control"),true);
assert.equal(journal.beginStep("local-abc",2),false,"Submitted is not completed");
journal.preflight("local-abc",{ready:true,checks:[{label:"Mobile",state:"online",code:"BRIDGE_ONLINE",ready:true}]});
assert.equal(journal.finish("local-abc","submitted"),true);
assert.equal(journal.latest().status,"submitted");
assert.equal(journal.latest().steps[2].status,"queued");
assert.equal(journal.latest().preflight.checks[0].code,"BRIDGE_ONLINE");
assert.equal(journal.finish("local-abc","completed"),false,"Terminal state is immutable");

journal.create({id:"run-b",total:1});
assert.equal(journal.beginStep("run-b",0),true);
journal.finishStep("run-b",0,"failed","geospatial");
journal.finish("run-b","failed");
journal.create({id:"run-c",total:1});
assert.equal(journal.list().length,2);
assert.equal(journal.get("local-abc"),null,"Bounded non-sensitive history");
assert.equal(journal.latest().status,"running");
const another=journal.latest();another.status="completed";
assert.equal(journal.latest().status,"running","Journal snapshots are immutable copies");
assert.equal(journal.finish("run-c","completed"),true);
assert.equal(journal.latest().status,"failed","Never claim success with incomplete steps");

console.log("PHASE VI PASS: read-only preflight, offline/failure safety, dependencies and evidence journal");
