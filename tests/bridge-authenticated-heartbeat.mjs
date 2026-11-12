import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';
import { heartbeatDevice } from '../backend/device-bridge.js';

if (!globalThis.crypto) globalThis.crypto = webcrypto;
const secret = 'secure-bridge-secret-example-0123456789abcdef';
const credentialHash = createHash('sha256').update(secret).digest('hex');
const statements = [];
let active=true;
let lastSeenAt=new Date(Date.now()-10_000).toISOString().slice(0,19).replace('T',' ');
const env={ULTRON_DB:{
  prepare(sql) {
    statements.push(sql);
    let params=[];
    return {
      bind(...values){params=values;return this;},
      async run() {
        assert.ok(!sql.includes('UPDATE devices SET last_seen_at'),
          'Diagnostic cannot update persistent background heartbeat');
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
          status:'active',lastSeenAt,authHash:credentialHash
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
assert.equal(ok.serviceOnline,true);
assert.equal(ok.lastSeenAt,lastSeenAt);
assert.ok(!Number.isNaN(Date.parse(ok.serverTime)));
lastSeenAt='2020-01-01 00:00:00';
const stale=await heartbeatDevice(env,{deviceId:'real-device-01',deviceSecret:secret});
assert.equal(stale.ok,true,'Valid authentication is independent of background service availability');
assert.equal(stale.serviceOnline,false,'Stale service heartbeat must stay offline after manual check');
const bad=await heartbeatDevice(env,{
  deviceId:'real-device-01',deviceSecret:'X'.repeat(48)
});
assert.equal(bad.ok,false,'Wrong secret must be rejected');

active=false;
const disabled=await heartbeatDevice(env,{deviceId:'real-device-01',deviceSecret:secret});
assert.equal(disabled.ok,false,'Inactive/revoked device must be rejected');

assert.equal(statements.some(q=>/UPDATE devices|UPDATE device_commands|SET status\s*=\s*'claimed'/i.test(q)),false,
  'A diagnostic must be read-only: cannot update last_seen or touch pending commands');
console.log('BRIDGE AUTH HEARTBEAT PASS: valid/revoked credentials, stale service stays OFFLINE, no DB writes');
