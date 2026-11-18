import assert from "node:assert/strict";
import {webcrypto} from "node:crypto";
globalThis.crypto=webcrypto;
import {validatePushSubscription,pushConfiguration,encryptPushPayload,vapidToken,removePush}
 from "../backend/jarvis-push.js";
const e=new TextEncoder(),d=new TextDecoder();
const b64=x=>Buffer.from(x).toString("base64url");
const bytes=x=>new Uint8Array(Buffer.from(x,"base64url"));
const concat=(...parts)=>{
 const out=new Uint8Array(parts.reduce((n,x)=>n+x.length,0));let p=0;
 for(const x of parts){out.set(x,p);p+=x.length;}return out;
};
async function hkdf(ikm,salt,info,bits){
 const key=await crypto.subtle.importKey("raw",ikm,"HKDF",false,["deriveBits"]);
 return new Uint8Array(await crypto.subtle.deriveBits({name:"HKDF",hash:"SHA-256",salt,info},key,bits));
}
const receiver=await crypto.subtle.generateKey({name:"ECDH",namedCurve:"P-256"},true,["deriveBits"]);
const publicReceiver=new Uint8Array(await crypto.subtle.exportKey("raw",receiver.publicKey));
const secret=crypto.getRandomValues(new Uint8Array(16));
const endpoint="https://fcm.googleapis.com/fcm/send/valid-token";
const subscription={endpoint,keys:{p256dh:b64(publicReceiver),auth:b64(secret)}};
assert.ok(validatePushSubscription(subscription));
for(const host of ["https://evil.example/fcm/send/valid","http://fcm.googleapis.com/fcm/send/valid",
 "https://fcm.googleapis.com.evil.example/fcm/send/valid"]){
 assert.equal(validatePushSubscription({...subscription,endpoint:host}),null);
}
assert.equal(validatePushSubscription({...subscription,keys:{...subscription.keys,auth:b64(new Uint8Array(8))}}),null);
const payload={kind:"official-alert",id:"INMET-123",title:"Aviso do INMET",body:"Confira a região",url:"https://avisos.inmet.gov.br/",publishedAt:new Date().toISOString()};
const encrypted=await encryptPushPayload(payload,{p256dh:subscription.keys.p256dh,auth_secret:subscription.keys.auth});
assert.equal(encrypted.length>100,true);
assert.deepEqual([...encrypted.slice(16,21)],[0,0,16,0,65]);
const salt=encrypted.slice(0,16),sender=encrypted.slice(21,86),cipher=encrypted.slice(86);
const senderKey=await crypto.subtle.importKey("raw",sender,{name:"ECDH",namedCurve:"P-256"},false,[]);
const shared=await crypto.subtle.deriveBits({name:"ECDH",public:senderKey},receiver.privateKey,256);
const info=concat(e.encode("WebPush: info\0"),publicReceiver,sender);
const ikm=await hkdf(new Uint8Array(shared),secret,info,256);
const cek=await hkdf(ikm,salt,e.encode("Content-Encoding: aes128gcm\0"),128);
const nonce=await hkdf(ikm,salt,e.encode("Content-Encoding: nonce\0"),96);
const key=await crypto.subtle.importKey("raw",cek,{name:"AES-GCM"},false,["decrypt"]);
const decrypted=new Uint8Array(await crypto.subtle.decrypt({name:"AES-GCM",iv:nonce},key,cipher));
assert.equal(decrypted.at(-1),2);
assert.deepEqual(JSON.parse(d.decode(decrypted.slice(0,-1))),payload);
const vapid=await crypto.subtle.generateKey({name:"ECDSA",namedCurve:"P-256"},true,["sign","verify"]);
const jwk=await crypto.subtle.exportKey("jwk",vapid.privateKey);
const rawPub=new Uint8Array(await crypto.subtle.exportKey("raw",vapid.publicKey));
const env={ULTRON_DB:{prepare(){}},JARVIS_PUSH_VAPID_PUBLIC_KEY:b64(rawPub),
 JARVIS_PUSH_VAPID_PRIVATE_JWK:JSON.stringify(jwk),JARVIS_PUSH_SUBJECT:"mailto:admin@example.org"};
assert.equal(pushConfiguration(env).enabled,true);
const now=Date.now();
const token=await vapidToken(env,endpoint,now);
const parts=token.split(".");
assert.equal(parts.length,3);
const claims=JSON.parse(Buffer.from(parts[1],"base64url").toString());
assert.equal(claims.aud,"https://fcm.googleapis.com");
assert.ok(claims.exp>now/1000);
const valid=await crypto.subtle.verify({name:"ECDSA",hash:"SHA-256"},vapid.publicKey,
 bytes(parts[2]),e.encode(parts[0]+"."+parts[1]));
assert.equal(valid,true,"VAPID JWT signature must verify");
assert.equal(pushConfiguration({...env,JARVIS_PUSH_VAPID_PUBLIC_KEY:b64(publicReceiver)}).enabled,false);
// A different authenticated account must not delete another user's subscription history.
const owner="a".repeat(64),other="b".repeat(64),writes=[];
const db={prepare(sql){return {
 run:async()=>({}),
 bind(...args){return {
  first:async()=>sql.startsWith("SELECT account_id")?{account_id:owner}:null,
  run:async()=>{writes.push({sql,args});return {};}
 };}};}};
assert.equal((await removePush({ULTRON_DB:db},other,endpoint)).ok,true);
assert.equal(writes.filter(x=>x.sql.startsWith("DELETE")).length,0);
assert.equal((await removePush({ULTRON_DB:db},owner,endpoint)).ok,true);
assert.equal(writes.filter(x=>x.sql.startsWith("DELETE")).length,2);

console.log("WEB PUSH CRYPTO PASS: RFC 8291 payload roundtrip, VAPID JWT signature, endpoint allowlist and configuration");
