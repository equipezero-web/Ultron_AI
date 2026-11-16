import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';
import {enqueueCommand, completeCommand} from '../backend/device-bridge.js';

if(!globalThis.crypto)globalThis.crypto=webcrypto;
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const manifest=read('android-bridge/app/src/main/AndroidManifest.xml');
const android=read('android-bridge/app/src/main/java/com/ultron/bridge/RemoteFiles.java');
const bridge=read('android-bridge/app/src/main/java/com/ultron/bridge/BridgeService.java');
const js=read('modules/jarvis-phone-files.js');
const html=read('index.html');
const workflow=read('.github/workflows/android-bridge.yml');
const backend=read('backend/device-bridge.js');
const gateway=read('backend/device-control-v2.js');
const secure=read('android-bridge/app/src/main/java/com/ultron/bridge/SecureStore.java');

assert.match(manifest,/MANAGE_EXTERNAL_STORAGE/);
assert.match(android,/Environment\.isExternalStorageManager\(\)/);
assert.match(android,/MessageDigest\.isEqual/);
assert.match(android,/String expected/);
assert.match(android,/SESSION_MS = 10 \* 60_000L/);
assert.match(android,/enablePermanent\(Context context\)/);
assert.match(android,/StringBuilder value = new StringBuilder\(32\)/);
assert.match(android,/SecureStore\.getRemoteFilesKey/);
assert.match(secure,/AndroidKeyStore/);
assert.match(secure,/clearRemoteFilesKey/);
assert.match(android,/MAX_REMOTE_TRANSFER_BYTES = 16L/);
assert.match(android,/protectedPath\.startsWith\("\/android\/data\/"\)/);
assert.match(android,/protectedPath\.startsWith\("\/android\/obb\/"\)/);
assert.match(android,/getCanonicalPath\(\)/);
assert.match(android,/resolve\(roots, path\)/);
assert.doesNotMatch(android,/\.delete\(|\.renameTo\(|FileOutputStream|Runtime\.getRuntime\(\)/);
assert.match(bridge,/case "files.list":/);
assert.match(bridge,/case "files.read":/);
assert.match(bridge,/RemoteFiles\.execute\(this, command, payload\)/);
assert.match(backend,/payload_json = CASE WHEN command LIKE 'files.%' THEN '\{\}'/);
assert.match(gateway,/SET result_json = NULL/);
assert.match(js,/ARQUIVOS DO CELULAR/);
assert.match(js,/window\.ULTRON_DEVICES\.sendCommand/);
assert.match(js,/TRANSFER_MAX = 16 \* 1024 \* 1024/);
assert.match(js,/const CHUNK_MAX = 80 \* 1024/);
assert.match(html,/jarvis-phone-files\.js\?v=/);
assert.match(workflow,/jarvis-bridge-v0\.8\.0-debug/);

// The D1 endpoint enforces mobile-only file commands and a bounded operator PIN.
const calls=[];
let targetType='mobile';
const env={ULTRON_DB:{prepare(sql){
  const entry={sql,params:[]};calls.push(entry);
  return {
    bind(...params){entry.params=params;return this;},
    async run(){return{meta:{changes:1}};},
    async first(){
      if(sql.includes('SELECT id, device_type FROM devices'))
        return{id:'dev123',device_type:targetType};
      return null;
    }
  };
}}};
const base={operatorId:'op',deviceId:'dev123',command:'files.list'};
const invalid=await enqueueCommand(env,{...base,payload:{accessCode:'bad',path:''}});
assert.equal(invalid.ok,false);
assert.match(invalid.error,/PIN/);
const valid=await enqueueCommand(env,{...base,payload:{accessCode:'12345678',path:''}});
assert.equal(valid.ok,true);
assert.ok(valid.commandId);
const permanent=await enqueueCommand(env,{...base,payload:{accessCode:'A'.repeat(32),path:''}});
assert.equal(permanent.ok,true,'Keystore-backed key accepted for persistent access');
const invalidShortKey=await enqueueCommand(env,{...base,payload:{accessCode:'A'.repeat(20),path:''}});
assert.equal(invalidShortKey.ok,false);
targetType='desktop';
const wrong=await enqueueCommand(env,{...base,payload:{accessCode:'12345678'}});
assert.equal(wrong.ok,false);
assert.match(wrong.error,/celular/);
const removed=await enqueueCommand(env,{...base,command:'files.delete',payload:{accessCode:'12345678'}});
assert.equal(removed.ok,false,'Remote file deletion is not an allowed command');
assert.equal(calls.some(x=>/INSERT INTO device_commands/.test(x.sql)),true);
assert.equal(backend.includes('"files.write"'),false);
console.log('JARVIS REMOTE PHONE STORAGE PASS: permission, PIN, path boundaries, read-only commands, expiring session, result scrubbing.');
