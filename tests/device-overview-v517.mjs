import assert from "node:assert/strict";
import { describeDevice, summarizeDevices } from "../modules/device-overview.js";
import { isCompatibleDeviceForCommand } from "../backend/device-control-v2.js";

const sample = [
  { id:"a", deviceType:"mobile", deviceName:"Moto", status:"active", online:true, capabilities:["tv.status"] },
  { id:"b", deviceType:"desktop", deviceName:"Windows", status:"active", online:false },
  { id:"c", deviceType:"mobile", deviceName:"Revogado", status:"disabled", online:true },
  { id:"d", deviceType:"mobile", deviceName:"Sem confirmação de heartbeat", status:"active" }
];
const result = summarizeDevices(sample);
assert.equal(result.total,4);
assert.equal(result.online,1);
assert.equal(result.pairedOffline,2);
assert.equal(result.inactive,1);
assert.equal(result.items[0].state,"ONLINE");
assert.equal(result.items[1].state,"PAREADO / OFFLINE");
assert.equal(result.items[2].state,"DESATIVADO");
assert.equal(result.items[2].online,false);
assert.equal(result.items[3].online,false);
assert.deepEqual(describeDevice({}).capabilities,[]);
assert.throws(()=>summarizeDevices(null),TypeError);

// A caller may not select a desktop bridge for mobile/TV commands,
// or an Android device for desktop commands, even by explicit device ID.
assert.equal(isCompatibleDeviceForCommand("desktop.shutdown","desktop"),true);
assert.equal(isCompatibleDeviceForCommand("desktop.shutdown","mobile"),false);
assert.equal(isCompatibleDeviceForCommand("tv.volume.up","mobile"),true);
assert.equal(isCompatibleDeviceForCommand("tv.volume.up","desktop"),false);
assert.equal(isCompatibleDeviceForCommand("app.open","desktop"),false);
assert.equal(isCompatibleDeviceForCommand("device.status","mobile"),true);
console.log("Device overview and command-target policy: OK");
