import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { mobileBridgeSummary } from '../modules/bridge-status.js';

const filename=new URL('../modules/mobile-link-simple-v4250.js',import.meta.url);
const source=readFileSync(filename,'utf8').replace(/^import .*;\r?\n/,'');
const events={};
const elements=new Map();
class Element {
  constructor(id){this.id=id;this.textContent='';this.children=[];this.handlers={};this.scrollTop=0;this.scrollHeight=0;}
  addEventListener(type,fn){this.handlers[type]=fn;}
  appendChild(child){this.children.push(child);}
}
for(const id of ['btn-pair-mobile','output-box','bridge-link-state',
  'bridge-session-state','bridge-device-name','bridge-camera-state']){
  elements.set(id,new Element(id));
}
const document={
  getElementById:id=>elements.get(id)||null,
  createElement:tag=>new Element(tag)
};
const oldPhone={
  id:'old-android-install',deviceType:'mobile',deviceName:'Celular anterior',
  status:'active',online:false,lastSeenAt:'2026-10-11 00:00:00'
};
const livePhone={
  id:'new-android-install',deviceType:'mobile',deviceName:'Novo Android',
  status:'active',online:true,lastSeenAt:'2026-11-16 14:00:00'
};
let devices=[oldPhone], newCodes=0, allowListing=true;
const window={
  addEventListener:(name,handler)=>events[name]=handler,
  ULTRON_DEVICES:{
    listDevices:async()=>{if(!allowListing)throw Error('Sem rede');return devices;},
    startPairing:async(type,name)=>{
      assert.equal(type,'mobile');assert.equal(name,'Ultron Mobile Bridge');
      newCodes++;return {code:'004321',expiresInSeconds:600};
    }
  },
  ULTRON_MOBILE_CAMERA:{state:{active:false}}
};
vm.runInNewContext(source,{
  document,window,mobileBridgeSummary,Date,console,
  setTimeout:()=>0,setInterval:()=>0
},{filename:'mobile-link-simple-v4250.js'});
assert.equal(typeof window.ULTRON_MOBILE_LINK?.connect,'function');

// A stale record is NOT a reason to refuse a new pairing.
const first=await window.ULTRON_MOBILE_LINK.connect();
assert.equal(first.status,'pairing');
assert.equal(first.paired,true);
assert.equal(first.online,false);
assert.equal(newCodes,1);
assert.equal(elements.get('bridge-session-state').textContent,'CODE 004321');
assert.match(elements.get('output-box').children.at(-1).textContent,/REGISTRO ANTIGO OFFLINE/);
assert.match(elements.get('output-box').children.at(-1).textContent,/VINCULAR ESTE CELULAR/);

// A seven-second status refresh must not erase an unclaimed code.
const status=await window.ULTRON_MOBILE_LINK.refresh();
assert.equal(status.status,'pairing');
assert.equal(elements.get('bridge-link-state').textContent,'PAIRING');
assert.equal(elements.get('bridge-session-state').textContent,'CODE 004321');

// An additional click must reuse the current valid code.
await window.ULTRON_MOBILE_LINK.connect();
assert.equal(newCodes,1);

// When the new Android Bridge polls the Cloud, the UI must show real ONLINE.
devices=[oldPhone,livePhone];
const connected=await window.ULTRON_MOBILE_LINK.refresh();
assert.equal(connected.status,'online');
assert.equal(connected.device.id,'new-android-install');
assert.equal(elements.get('bridge-link-state').textContent,'ONLINE');
assert.equal(elements.get('bridge-session-state').textContent,'READY');

// Network failures must never be reinterpreted as no registered devices.
allowListing=false;
const failure=await window.ULTRON_MOBILE_LINK.connect();
assert.equal(failure,false);
assert.equal(newCodes,1);
assert.equal(elements.get('bridge-link-state').textContent,'GATEWAY OFF');

console.log('JARVIS MOBILE RE-PAIR PASS: stale registration, explicit new code, preserved pending code, live Cloud, no phantom pairing.');
