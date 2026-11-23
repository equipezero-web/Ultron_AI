import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";

const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const runtime=read("modules/camera-runtime.js");
const camera=read("modules/camera.js");
const script=read("script.js");
const bootstrap=read("modules/stark-bootstrap.js");
const html=read("index.html");

let startCalls=0;
let inventoryCalls=0;
let active=false;
const devices=[{deviceId:"device-1",label:"VGA Camera"}];
const controller={
  async start(){startCalls++;active=true;return {ok:true};},
  async refreshDevices(){inventoryCalls++;return devices;},
  async permissionState(){return "granted";},
  isActive(){return active;},
  selectedDeviceId:""
};
const listeners=new Map(),timers=[];
const browser={
  isSecureContext:true,
  ULTRON_CAMERA_CONTROLLER:controller,
  addEventListener(name,callback){listeners.set(name,callback);}
};
const permission={state:"granted",onchange:null};
const context={
  window:browser,
  document:{getElementById(){return null;},querySelector(){return null;}},
  navigator:{
    permissions:{async query(){return permission;}},
    mediaDevices:{async getUserMedia(){throw Error("must not capture");}}
  },
  setTimeout(callback){timers.push(callback);return timers.length;},
  clearTimeout(){},
  Date,Promise,console
};
vm.runInNewContext(runtime,context,{filename:"camera-runtime.js"});
const flush=()=>new Promise(resolve=>setImmediate(resolve));
assert.equal(timers.length,1,"only passive permission inventory refresh is scheduled");
listeners.get("ultron:camera-devices")({detail:{
  devices,count:1,previousCount:0,becameAvailable:true
}});
await flush();
assert.equal(startCalls,0,"granted device hotplug must NOT open local camera");

// Start-up inventory refresh and a browser permission grant are read-only.
await timers[0]();
assert.equal(inventoryCalls,1);
assert.equal(typeof permission.onchange,"function");
permission.state="granted";
await permission.onchange();
assert.equal(startCalls,0,"grant notification must not start capture");
assert.ok(inventoryCalls>=2);

// Driver transient events and interrupted streams must never retry by timer.
listeners.get("ultron:camera-transient")({detail:{reason:"enumeration-zero"}});
listeners.get("ultron:camera-devices")({detail:{devices:[],count:0,transientZero:true}});
listeners.get("ultron:camera-stream")({detail:{active:false,reason:"track-ended"}});
assert.equal(timers.length,1,"stream-ended must not schedule a recovery attempt");
assert.equal(startCalls,0);
assert.equal(browser.ULTRON_CAMERA_RUNTIME.active,false);

// An explicit operator retry still works; the mobile Bridge is unaffected.
await browser.ULTRON_CAMERA_RUNTIME.retry();
assert.equal(startCalls,1,"manual retry must remain possible");
assert.equal(browser.ULTRON_CAMERA_RUNTIME.active,true);

// The controller itself must reject background restoration even if an older
// runtime/plugin tries to invoke start({restored:true}).
assert.match(camera,/async canAutoStart\(\) \{\s*return false;/);
assert.match(camera,/async restoreIfGranted\(\) \{\s*return false;/);
const guard=camera.indexOf("async start({ restored = false } = {})");
const media=camera.indexOf("navigator.mediaDevices?.getUserMedia",guard);
const denied=camera.indexOf("if (restored) {",guard);
assert.ok(guard>=0&&denied>guard&&media>denied);
assert.match(camera.slice(guard,media),/NotAllowedError/);
assert.doesNotMatch(runtime,/start\(\{\s*restored:\s*true\s*\}\)/,
  "runtime must never invoke restored webcam starts");
assert.equal(runtime.includes("const MAX_STREAM_RECOVERY = 0;"),true);
assert.equal(script.includes("camera.restoreIfGranted ="),false,
  "no superficial monkey-patch required after fixing the controller");
assert.match(script,/camera\.js\?v=5\.65\.0/);
assert.match(bootstrap,/camera-runtime\.js\?v=4\.16\.1/);
assert.match(html,/script\.js\?v=5\.65\.0/);
assert.match(html,/stark-bootstrap\.js\?v=5\.59\.0/);
console.log("JARVIS LOCAL CAMERA CONSENT PASS: zero capture on startup, permission grant, hotplug or track-ended; explicit manual start retained");
