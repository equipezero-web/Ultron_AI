import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';
import { heartbeatDevice } from '../backend/device-bridge.js';

if (!globalThis.crypto) globalThis.crypto = webcrypto;
const secret = 'secure-bridge-secret-example-0123456789abcdef';
const credentialHash = createHash('sha256').update(secret).digest('hex');
const statements = [];
let refreshed=0;
let active=true;
const env={ULTRON_DB:{
  prepare(sql) {
    statements.push(sql);
    let params=[];
    return {
      bind(...values){params=values;return this;},
      async run() {
        if (sql.includes('UPDATE devices SET last_seen_at')) {
          assert.equal(params[0],'real-device-01');
          refreshed++;
        }
        return {meta:{changes:1}};
      },
      async first(){
        if (!sql.includes('JOIN device_credentials')) {
          throw new Error('Unexpected query');
        }
        assert.equal(params[0],'real-device-01');
        return active ? {
          id:'real-device-01',operatorId:'operator-01',
          deviceType:'mobile',deviceName:'Test Android',
          status:'active',authHash:credentialHash
        } : null;
      }
    };
  }
}};
const ok=await heartbeatDevice(env,{
  deviceId:'real-device-01',deviceSecret:secret
});
assert.deepEqual({ok:ok.ok,connected:ok.connected,deviceType:ok.deviceType},
  {ok:true,connected:true,deviceType:'mobile'});
assert.equal(ok.deviceName,'Test Android');
assert.ok(!Number.isNaN(Date.parse(ok.serverTime)));
assert.equal(refreshed,1);
const bad=await heartbeatDevice(env,{
  deviceId:'real-device-01',deviceSecret:'X'.repeat(48)
});
assert.equal(bad.ok,false,'Wrong secret must be rejected');
assert.equal(refreshed,1,'Bad credentials must not refresh device heartbeat');
active=false;
const disabled=await heartbeatDevice(env,{deviceId:'real-device-01',deviceSecret:secret});
assert.equal(disabled.ok,false,'Inactive/revoked device must be rejected');
assert.equal(refreshed,1);
assert.equal(statements.some(q=>/UPDATE device_commands|SET status\s*=\s*'claimed'/i.test(q)),false,
  'A heartbeat must never lease, alter or consume pending commands');
console.log('BRIDGE AUTH HEARTBEAT PASS: valid device, invalid/revoked device, no queue consumption');
