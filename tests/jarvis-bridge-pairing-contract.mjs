import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const bridge=read("backend/device-bridge.js");
const api=read("android-bridge/app/src/main/java/com/ultron/bridge/BridgeApi.java");
const service=read("android-bridge/app/src/main/java/com/ultron/bridge/BridgeService.java");
const manifest=read("android-bridge/app/src/main/AndroidManifest.xml");
const health=read("android-bridge/app/src/main/java/com/ultron/bridge/BridgeHealthStore.java");

assert.match(bridge,/const reservedType = normalizeDeviceType\(pairing\.device_type\)/);
assert.match(bridge,/normalizeDeviceType\(deviceType\) !== reservedType/);
assert.match(bridge,/const finalType = reservedType/);
assert.doesNotMatch(bridge,/normalizeDeviceType\(deviceType \|\| pairing\.device_type\)/);

for(const command of ["device.status","notification.push","app.open","app.list","files.list","files.read"]) {
  assert.ok(api.includes('capabilities.put("'+command+'")'),"Missing Android capability: "+command);
  assert.ok(bridge.includes('"'+command+'"'),"Missing backend command: "+command);
  assert.ok(service.includes('case "'+command+'"') || (command==="notification.push"&&service.includes('case "notification.push"')),
    "Missing Android handler: "+command);
}
assert.match(manifest,/android:usesCleartextTraffic="false"/);
assert.doesNotMatch(manifest,/BIND_ACCESSIBILITY_SERVICE|MANAGE_EXTERNAL_STORAGE|QUERY_ALL_PACKAGES/);
assert.match(health,/ONLINE \/ comunicação confirmada pelo Cloud/);
assert.match(service,/BridgeHealthStore\.recordFailure/);
console.log("JARVIS BRIDGE PAIRING CONTRACT PASS");
