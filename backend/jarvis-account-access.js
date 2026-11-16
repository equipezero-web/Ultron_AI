/**
 * Account-scoped Cloudflare Access identity. Client memoryKey is NEVER auth.
 * Accounts are isolated by the signed Access subject (iss + sub), not by email
 * strings supplied in a request. No passwords or login cookies are stored.
 */
const normalize=value=>String(value||"").trim();
const emails=value=>normalize(value).split(/[,;\n]/).map(v=>v.trim().toLowerCase()).filter(Boolean);
function issuerFrom(env){
  let issuer=null;
  try{
    const input=normalize(env.CF_ACCESS_TEAM_DOMAIN);
    const url=new URL(input.startsWith("https://")?input:"https://"+input);
    if(url.protocol==="https:"&&/^[a-z0-9-]+\.cloudflareaccess\.com$/i.test(url.hostname)&&
       url.pathname==="/"&&!url.search&&!url.hash)issuer=url.origin;
  }catch{}
  return issuer;
}
function validOrigin(str){
  try{const u=new URL(str);return u.protocol==="https:"&&u.origin===str?str:null;}catch{return null;}
}
export function accountAccessConfig(env={}){
 const issuer=issuerFrom(env),audience=normalize(env.CF_ACCESS_AUD);
 const origins=emails(env.JARVIS_ACCOUNT_UI_ORIGIN).map(validOrigin).filter(Boolean);
 const allowedEmails=emails(env.CF_ACCESS_ACCOUNT_EMAILS)
   .filter(v=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v));
 return {enabled:Boolean(issuer&&audience&&origins.length&&allowedEmails.length),
   issuer,audience,origins,allowedEmails};
}
export function accountAccessHeaders(request,env){
  const conf=accountAccessConfig(env),origin=request.headers.get("Origin");
  const headers={"Content-Type":"application/json; charset=utf-8",
    "Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff",
    "Referrer-Policy":"no-referrer","Vary":"Origin"};
  if(origin&&conf.origins.includes(origin)){
    headers["Access-Control-Allow-Origin"]=origin;
    headers["Access-Control-Allow-Credentials"]="true";
    headers["Access-Control-Allow-Methods"]="GET,POST,OPTIONS";
    headers["Access-Control-Allow-Headers"]="Content-Type";
  }
  return headers;
}
const result=(code,status=403)=>({ok:false,status,code});
function decodePart(value){
  if(!/^[A-Za-z0-9_-]{1,12000}$/.test(value||""))throw Error("bad jwt");
  const b=value.replace(/-/g,"+").replace(/_/g,"/");
  return atob(b+"=".repeat((4-b.length%4)%4));
}
const parse=v=>JSON.parse(decodePart(v));
async function remoteKeys(url,fetchImpl){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),4500);
  try{
    const res=await fetchImpl(url,{method:"GET",signal:controller.signal,redirect:"error",
      headers:{"Accept":"application/json"}});
    if(!res.ok)return {keys:[],error:"access-certs-http-error"};
    const raw=await res.text();
    if(raw.length>90000)return {keys:[],error:"access-certs-too-large"};
    const data=JSON.parse(raw);
    return Array.isArray(data?.keys)?{keys:data.keys.slice(0,12),error:null}:{keys:[],error:"access-certs-invalid-json-shape"};
  }catch(e){
    // Server-only diagnostics: no JWTs, certificate bodies, emails, or URLs.
    console.warn("[JARVIS ACCESS] Certificate fetch failed",{
      type:typeof e?.name==="string"?e.name.slice(0,80):"unknown",
      causeType:typeof e?.cause?.name==="string"?e.cause.name.slice(0,80):"unknown"
    });
    return {keys:[],error:e?.name==="AbortError"?"access-certs-timeout":"access-certs-fetch-failed"};
  }finally{clearTimeout(timer);}
}
async function digest(str){
  const raw=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(str));
  return [...new Uint8Array(raw)].map(n=>n.toString(16).padStart(2,"0")).join("");
}
export async function authorizeJarvisAccount(request,env,{fetchImpl=fetch,now=Date.now}={}){
 const config=accountAccessConfig(env);
 if(!config.enabled)return result("account-login-not-configured",503);
 const origin=request.headers.get("Origin");
 if(origin&&!config.origins.includes(origin))return result("origin-not-allowed");
 const token=normalize(request.headers.get("Cf-Access-Jwt-Assertion"));
 if(!token||token.length>12000||token.split(".").length!==3)
   return result("account-login-required",401);
 try{
   const parts=token.split("."),header=parse(parts[0]),payload=parse(parts[1]);
   if(header.alg!=="RS256"||typeof header.kid!=="string"||header.kid.length>200||!header.kid)
     return result("account-token-invalid",401);
   const time=Math.floor(now()/1000),aud=Array.isArray(payload.aud)?payload.aud:[payload.aud];
   if(payload.iss!==config.issuer||!aud.includes(config.audience)||
      !Number.isFinite(payload.exp)||payload.exp<=time||payload.exp>time+86400||
      (payload.nbf!==undefined&&payload.nbf>time+60)||
      (payload.iat!==undefined&&payload.iat>time+60)||
      typeof payload.sub!=="string"||payload.sub.length<5||payload.sub.length>160)
      return result("account-token-invalid",401);
   const email=normalize(payload.email).toLowerCase();
   if(!config.allowedEmails.includes(email))return result("account-not-allowed");
   const certs=await remoteKeys(config.issuer+"/cdn-cgi/access/certs",fetchImpl);
   if(certs.error)return result(certs.error,503);
   const jwk=certs.keys.find(k=>k.kid===header.kid&&k.kty==="RSA"&&k.n&&k.e);
   if(!jwk)return result("access-certs-key-not-found",503);
   const key=await crypto.subtle.importKey("jwk",
     {kty:"RSA",n:jwk.n,e:jwk.e,alg:"RS256",ext:true,key_ops:["verify"]},
     {name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["verify"]);
   const verified=await crypto.subtle.verify("RSASSA-PKCS1-v1_5",key,
     Uint8Array.from(decodePart(parts[2]),c=>c.charCodeAt(0)),
     new TextEncoder().encode(parts[0]+"."+parts[1]));
   if(!verified)return result("account-token-invalid",401);
   // Identity cannot be forged by a client-supplied account or memory key.
   const accountId=await digest("jarvis-account-v1:"+config.issuer+"|"+payload.sub);
   return {ok:true,accountId,email};
 }catch{return result("account-token-invalid",401);}
}
