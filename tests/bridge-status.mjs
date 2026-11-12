import assert from 'node:assert/strict';
import { bridgeTimestampMs, bridgeAgeMs, bridgeIsOnline, sortMobileBridges, mobileBridgeSummary, BRIDGE_ONLINE_MAX_AGE_MS } from '../modules/bridge-status.js';

// Deterministic dates, including the exact D1 CURRENT_TIMESTAMP representation.
// Run this under both TZ=UTC and TZ=America/Recife.
const now = Date.parse('2026-11-12T19:30:15.000Z');
const onlineD1 = '2026-11-12 19:30:00';
const oldD1 = '2026-11-12 19:28:00';
assert.equal(bridgeTimestampMs(onlineD1), Date.parse('2026-11-12T19:30:00Z'));
assert.equal(bridgeTimestampMs('2026-11-12T16:30:00-03:00'), bridgeTimestampMs(onlineD1));
assert.equal(bridgeTimestampMs('2026-11-12T19:30:00Z'), bridgeTimestampMs(onlineD1));
assert.ok(Number.isNaN(bridgeTimestampMs('bad-date')));
assert.equal(bridgeAgeMs({lastSeenAt:onlineD1},now),15000);
assert.equal(bridgeAgeMs({lastSeenAt:oldD1},now),135000);
assert.equal(bridgeAgeMs({lastSeenAt:'2026-11-12 19:31:00'},now),0,
  'Small future clock skew must not render a negative age');
assert.equal(BRIDGE_ONLINE_MAX_AGE_MS,45000);

const phone=(lastSeenAt,online, status='active')=>({
  deviceType:'mobile',id:'phone',deviceName:'Android',lastSeenAt,online,status
});
assert.equal(bridgeIsOnline(phone(onlineD1,undefined),now),true,
  'D1 timestamps without a timezone are UTC even in Recife');
assert.equal(bridgeIsOnline(phone(oldD1,undefined),now),false);
assert.equal(bridgeIsOnline(phone(onlineD1,false),now),false,
  'When Cloud explicitly says offline, the browser must respect it');
assert.equal(bridgeIsOnline(phone(oldD1,true),now),true,
  'When Cloud explicitly says online, do not override it with local clock');
assert.equal(bridgeIsOnline(phone(onlineD1,true,'disabled'),now),false);
const online=phone(onlineD1,true);
const offline={...phone(oldD1,false),id:'phone-old'};
const desktop={...online,deviceType:'desktop',id:'pc'};
assert.deepEqual(sortMobileBridges([offline,desktop,online]).map(x=>x.id),['phone','phone-old']);
assert.deepEqual(sortMobileBridges(null),[]);
assert.deepEqual(mobileBridgeSummary([]),{
  status:'not-paired',paired:false,online:false,device:null,label:'NOT PAIRED',session:'AGUARDANDO'
});
assert.equal(mobileBridgeSummary([offline]).status,'offline');
assert.equal(mobileBridgeSummary([online]).session,'READY');
assert.equal(mobileBridgeSummary([online],{streaming:true}).session,'STREAMING');
assert.equal(mobileBridgeSummary([offline,online]).device.id,'phone');
console.log('BRIDGE HEARTBEAT PASS: UTC / timezone / real Cloud online / pairing / streaming state');
