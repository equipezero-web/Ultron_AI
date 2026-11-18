import {normalizeWarnings} from "./world-briefing.js";
// Web Push (RFC 8291 + VAPID) for authenticated Cloudflare Access accounts.
// No default subscriptions, no device access, no arbitrary destination URLs.
const encoder=new TextEncoder();
const INMET="https://apiprevmet3.inmet.gov.br/avisos/ativos";
const TABLE="jarvis_push_subscriptions";
const SCHEMA=[
 "CREATE TABLE IF NOT EXISTS "+TABLE+" (endpoint_hash TEXT PRIMARY KEY,account_id TEXT NOT NULL,endpoint TEXT NOT NULL,p256dh TEXT NOT NULL,auth_secret TEXT NOT NULL,last_notice_id TEXT,created_at TEXT NOT NULL,last_sent_at TEXT)",
 "CREATE INDEX IF NOT EXISTS idx_jarvis_push_account ON "+TABLE+"(account_id)",
 "CREATE INDEX IF NOT EXISTS idx_jarvis_push_delivery ON "+TABLE+"(last_sent_at)",
 "CREATE TABLE IF NOT EXISTS jarvis_push_deliveries (endpoint_hash TEXT NOT NULL,notice_id TEXT NOT NULL,sent_at TEXT NOT NULL,PRIMARY KEY(endpoint_hash,notice_id))",
 "CREATE INDEX IF NOT EXISTS idx_jarvis_push_deliveries_time ON jarvis_push_deliveries(sent_at)"
];
let prepared=false;
const fail=(status,reason)=>({ok:false,status,error:reason});
const validAccount=x=>typeof x==="string"&&/^[0-9a-f]{64}$/.test(x);
const b64bytes=value=>{
 if(typeof value!=="string"||!/^[A-Za-z0-9_-]+$/.test(value)||value.length>200)return null;
 try{const str=atob(value.replace(/-/g,"+").replace(/_/g,"/")+"=".repeat((4-value.length%4)%4));
  return Uint8Array.from(str,c=>c.charCodeAt(0));}catch{return null;}
};
const b64url=bytes=>{
 let str="";for(const byte of bytes)str+=String.fromCharCode(byte);
 return btoa(str).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
};
const concat=(...parts)=>{
 const arrays=parts.map(x=>x instanceof Uint8Array?x:new Uint8Array(x));
 const out=new Uint8Array(arrays.reduce((n,x)=>n+x.length,0));let offset=0;
 for(const part of arrays){out.set(part,offset);offset+=part.length;}return out;
};
const allowedHost=host=>host==="fcm.googleapis.com"||
 host==="updates.push.services.mozilla.com"||
 host==="web.push.apple.com"||
 /^wns[0-9a-z-]*\.notify\.windows\.com$/.test(host);
export function validatePushSubscription(subscription){
 const endpoint=subscription?.endpoint,p256dh=subscription?.keys?.p256dh,auth=subscription?.keys?.auth;
 if(typeof endpoint!=="string"||endpoint.length>1700)return null;
 let url;try{url=new URL(endpoint);}catch{return null;}
 if(url.protocol!=="https:"||url.username||url.password||url.port||url.hash||
   !allowedHost(url.hostname)||url.pathname.length<5)return null;
 const pub=b64bytes(p256dh),secret=b64bytes(auth);
 if(pub?.length!==65||pub[0]!==4||secret?.length!==16)return null;
 return {endpoint:url.href,p256dh,auth};
}
export function pushConfiguration(env={}){
 const publicKey=String(env.JARVIS_PUSH_VAPID_PUBLIC_KEY||"");
 const subject=String(env.JARVIS_PUSH_SUBJECT||"");
 let jwk=null;
 try{jwk=JSON.parse(String(env.JARVIS_PUSH_VAPID_PRIVATE_JWK||""));}catch{}
 const pub=b64bytes(publicKey);
 const subjectValid=/^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/.test(subject);
 const privateValid=jwk?.kty==="EC"&&jwk?.crv==="P-256"&&
  ["x","y","d"].every(k=>b64bytes(jwk[k])?.length===32);
 const publicMatches=privateValid&&pub?.length===65&&pub[0]===4&&
  b64url(pub.slice(1,33))===jwk.x&&b64url(pub.slice(33))===jwk.y;
 return {enabled:Boolean(subjectValid&&privateValid&&publicMatches&&env?.ULTRON_DB?.prepare),
  publicKey:publicMatches?publicKey:null,subject:subjectValid?subject:null};
}
async function setup(env){
 const db=env?.ULTRON_DB;if(!db?.prepare)return null;
 if(!prepared){for(const query of SCHEMA)await db.prepare(query).run();prepared=true;}
 return db;
}
async function hash(value){
 const digest=await crypto.subtle.digest("SHA-256",encoder.encode(value));
 return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,"0")).join("");
}
export async function pushAccountStatus(env,accountId){
 if(!validAccount(accountId))return fail(401,"account-invalid");
 const conf=pushConfiguration(env);
 if(!conf.enabled)return {ok:true,configured:false,publicKey:null,subscriptions:0,backgroundPush:false};
 try{const db=await setup(env);
  const row=await db.prepare("SELECT COUNT(*) AS count FROM "+TABLE+" WHERE account_id=?").bind(accountId).first();
  return {ok:true,configured:true,publicKey:conf.publicKey,subscriptions:Number(row?.count)||0,
   backgroundPush:true,delivery:"official-INMET-warnings",cadenceMinutes:15};
 }catch{return fail(503,"push-storage-unavailable");}
}
export async function registerPush(env,accountId,raw){
 if(!validAccount(accountId))return fail(401,"account-invalid");
 if(!pushConfiguration(env).enabled)return fail(503,"push-not-configured");
 const sub=validatePushSubscription(raw);if(!sub)return fail(400,"invalid-push-subscription");
 try{
  const db=await setup(env),endpointHash=await hash(sub.endpoint);
  const existing=await db.prepare("SELECT account_id FROM "+TABLE+" WHERE endpoint_hash=?").bind(endpointHash).first();
  if(existing&&existing.account_id!==accountId)return fail(409,"subscription-already-owned");
  const count=await db.prepare("SELECT COUNT(*) AS count FROM "+TABLE+" WHERE account_id=?").bind(accountId).first();
  if(!existing&&Number(count?.count)>=3)return fail(409,"subscription-limit");
  await db.prepare("INSERT INTO "+TABLE+" (endpoint_hash,account_id,endpoint,p256dh,auth_secret,created_at) VALUES (?,?,?,?,?,?) "+
   "ON CONFLICT(endpoint_hash) DO UPDATE SET p256dh=excluded.p256dh,auth_secret=excluded.auth_secret")
   .bind(endpointHash,accountId,sub.endpoint,sub.p256dh,sub.auth,new Date().toISOString()).run();
  return {ok:true,registered:true,backgroundPush:true};
 }catch{return fail(503,"push-storage-unavailable");}
}
export async function removePush(env,accountId,endpoint){
 if(!validAccount(accountId))return fail(401,"account-invalid");
 if(typeof endpoint!=="string"||endpoint.length>1700)return fail(400,"invalid-endpoint");
 try{const db=await setup(env);
  const endpointHash=await hash(endpoint);
  await db.prepare("DELETE FROM "+TABLE+" WHERE account_id=? AND endpoint_hash=?")
   .bind(accountId,endpointHash).run();
  await db.prepare("DELETE FROM jarvis_push_deliveries WHERE endpoint_hash=?").bind(endpointHash).run();
  return {ok:true,registered:false};
 }catch{return fail(503,"push-storage-unavailable");}
}
async function deriveHKDF(ikm,salt,info,bits){
 const key=await crypto.subtle.importKey("raw",ikm,"HKDF",false,["deriveBits"]);
 return new Uint8Array(await crypto.subtle.deriveBits({
  name:"HKDF",hash:"SHA-256",salt,info},key,bits));
}
async function encryptPayload(payload,sub){
 const receiver=b64bytes(sub.p256dh),auth=b64bytes(sub.auth_secret);
 const receiverKey=await crypto.subtle.importKey("raw",receiver,{name:"ECDH",namedCurve:"P-256"},false,[]);
 const ephemeral=await crypto.subtle.generateKey({name:"ECDH",namedCurve:"P-256"},true,["deriveBits"]);
 const sender=new Uint8Array(await crypto.subtle.exportKey("raw",ephemeral.publicKey));
 const shared=await crypto.subtle.deriveBits({name:"ECDH",public:receiverKey},ephemeral.privateKey,256);
 const info=concat(encoder.encode("WebPush: info\0"),receiver,sender);
 const ikm=await deriveHKDF(new Uint8Array(shared),auth,info,256);
 const salt=crypto.getRandomValues(new Uint8Array(16));
 const cek=await deriveHKDF(ikm,salt,encoder.encode("Content-Encoding: aes128gcm\0"),128);
 const nonce=await deriveHKDF(ikm,salt,encoder.encode("Content-Encoding: nonce\0"),96);
 const key=await crypto.subtle.importKey("raw",cek,{name:"AES-GCM"},false,["encrypt"]);
 const plaintext=concat(encoder.encode(JSON.stringify(payload)),new Uint8Array([2]));
 const encrypted=new Uint8Array(await crypto.subtle.encrypt({name:"AES-GCM",iv:nonce},key,plaintext));
 return concat(salt,new Uint8Array([0,0,16,0,65]),sender,encrypted);
}
async function vapidToken(env,endpoint,now){
 const conf=pushConfiguration(env);if(!conf.enabled)throw Error("vapid-not-configured");
 const jwk=JSON.parse(env.JARVIS_PUSH_VAPID_PRIVATE_JWK);
 const key=await crypto.subtle.importKey("jwk",{...jwk,ext:true,key_ops:["sign"]},
  {name:"ECDSA",namedCurve:"P-256"},false,["sign"]);
 const header=b64url(encoder.encode(JSON.stringify({typ:"JWT",alg:"ES256"})));
 const claims=b64url(encoder.encode(JSON.stringify({aud:new URL(endpoint).origin,
  exp:Math.floor(now/1000)+12*3600,sub:conf.subject})));
 const message=header+"."+claims;
 const signature=await crypto.subtle.sign({name:"ECDSA",hash:"SHA-256"},key,encoder.encode(message));
 return message+"."+b64url(new Uint8Array(signature));
}
async function sendPush(env,sub,payload,{fetchImpl=fetch,now=Date.now()}={}){
 if(!validatePushSubscription({endpoint:sub.endpoint,keys:{p256dh:sub.p256dh,auth:sub.auth_secret}}))
  return {ok:false,status:400};
 const token=await vapidToken(env,sub.endpoint,now);
 const body=await encryptPayload(payload,sub);
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),6500);
 try{
  const res=await fetchImpl(sub.endpoint,{method:"POST",redirect:"error",signal:controller.signal,
   headers:{"Authorization":"vapid t="+token+", k="+pushConfiguration(env).publicKey,
    "Content-Encoding":"aes128gcm","Content-Type":"application/octet-stream",
    "TTL":"3600","Urgency":"normal"},body});
  return {ok:res.ok,status:res.status};
 }finally{clearTimeout(timer);}
}
export async function pollOfficialPush(env,{now=()=>new Date(),fetchImpl=fetch}={}){
 const date=now();
 if(!pushConfiguration(env).enabled)return {ok:true,skipped:true,reason:"not-configured"};
 if(date.getUTCMinutes()%15!==0)return {ok:true,skipped:true,reason:"not-delivery-window"};
 try{
  const db=await setup(env);
  const subscriptions=await db.prepare("SELECT endpoint_hash,account_id,endpoint,p256dh,auth_secret,last_notice_id FROM "+
   TABLE+" ORDER BY COALESCE(last_sent_at,created_at) ASC LIMIT 100").all();
  const rows=subscriptions.results||[];
  if(!rows.length)return {ok:true,skipped:true,reason:"no-consenting-subscribers"};
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),6000);
  let data;
  try{
   const response=await fetchImpl(INMET,{signal:controller.signal,redirect:"error",headers:{"Accept":"application/json"}});
   if(!response.ok)throw Error("inmet-unavailable");
   data=await response.json();
  }finally{clearTimeout(timer);}
  const warnings=normalizeWarnings(data,date.getTime()).filter(w=>
   /perigo/i.test(w.severity)&&w.id&&w.title&&w.url&&
   (!w.endsAt||Date.parse(w.endsAt)>=date.getTime()));
  if(!warnings.length)return {ok:true,sent:0,reason:"no-verified-danger-warnings"};
  let sent=0,expired=0,failed=0;
  for(const row of rows){
   const delivered=await db.prepare("SELECT notice_id FROM jarvis_push_deliveries WHERE endpoint_hash=?").bind(row.endpoint_hash).all();
   const known=new Set((delivered.results||[]).map(x=>x.notice_id));
   const alert=warnings.find(w=>!known.has(w.id));
   if(!alert)continue;
   const region=alert.regions?.length?" UFs: "+alert.regions.join(", ")+".":" Confira a região afetada.";
   const payload={kind:"official-alert",id:String(alert.id).slice(0,90),
    title:"INMET · "+String(alert.severity).slice(0,50),
    body:String(alert.title).slice(0,120)+"."+region+" Verifique validade e área.",
    publishedAt:date.toISOString(),url:alert.url};
   try{
    const delivery=await sendPush(env,row,payload,{fetchImpl,now:date.getTime()});
    if(delivery.ok){
     sent++;
     await db.prepare("UPDATE "+TABLE+" SET last_notice_id=?,last_sent_at=? WHERE endpoint_hash=?")
      .bind(alert.id,date.toISOString(),row.endpoint_hash).run();
     await db.prepare("INSERT OR IGNORE INTO jarvis_push_deliveries (endpoint_hash,notice_id,sent_at) VALUES (?,?,?)")
      .bind(row.endpoint_hash,alert.id,date.toISOString()).run();
    }else if([404,410].includes(delivery.status)){
     expired++;await db.prepare("DELETE FROM "+TABLE+" WHERE endpoint_hash=?").bind(row.endpoint_hash).run();
     await db.prepare("DELETE FROM jarvis_push_deliveries WHERE endpoint_hash=?").bind(row.endpoint_hash).run();
    }else failed++;
   }catch{failed++;}
  }
  await db.prepare("DELETE FROM jarvis_push_deliveries WHERE sent_at < ?")
   .bind(new Date(date.getTime()-30*86400000).toISOString()).run();
  return {ok:true,sent,expired,failed,checkedAt:date.toISOString(),source:"INMET",notifications:true};
 }catch{return fail(503,"official-push-collection-unavailable");}
}
