/**
 * Local-only Node developer server protections.
 * Cloudflare's canonical production worker is not affected by this module.
 */
import {timingSafeEqual} from "node:crypto";

const TRUSTED_SITE="https://equipezero-web.github.io";
const LOCAL_ORIGIN=/^http:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?$/i;
const LOOPBACK=new Set(["127.0.0.1","::1","localhost"]);
const MAX_KEYS=4096;

export function allowLocalOrigin(value,{extra=""}={}){
  if(value==null)return true; // No browser Origin: CLI tools.
  if(typeof value!=="string"||value.length>250||value==="null")return false;
  if(value===TRUSTED_SITE||LOCAL_ORIGIN.test(value))return true;
  const explicit=String(extra||"").split(/[,;\n]/).map(s=>s.trim()).filter(Boolean);
  // LAN origins must be deliberately listed; no wildcard support.
  return explicit.some(origin=>{
    try{
      const url=new URL(origin);
      return url.origin===origin&&(url.protocol==="https:"||
        url.protocol==="http:"&&["localhost","127.0.0.1","[::1]"].includes(url.hostname))&&
        value===origin;
    }catch{return false;}
  });
}

export function requireSafeLocalBind(host,token){
  const bind=String(host||"127.0.0.1").trim();
  if(!bind||bind.includes("/")||bind.length>200)throw Error("INVALID_LOCAL_BIND");
  if(!LOOPBACK.has(bind)&&String(token||"").length<32)
    throw Error("NETWORK_BIND_REQUIRES_LOCAL_API_TOKEN");
  return {host:bind,networkExposed:!LOOPBACK.has(bind)};
}
export function tokenMatches(header,expected){
  const token=String(header||"").startsWith("Bearer ")?
    String(header).slice(7):"";
  const pass=String(expected||"");
  if(pass.length<32||token.length!==pass.length||token.length>2048)return false;
  return timingSafeEqual(Buffer.from(token),Buffer.from(pass));
}

export function createLocalApiGuard({
  now=Date.now,windowMs=60000,limits={"/api/ai":20,"/api/vision/analyze":10},
  originExtra="",networkToken="",networkExposed=false
}={}){
  const buckets=new Map();
  return function localApiGuard(req,res,next){
    const origin=req.headers?.origin;
    if(!allowLocalOrigin(origin,{extra:originExtra}))
      return res.status(403).json({ok:false,error:"origin-not-allowed"});
    const path=req.path||"";
    if(networkExposed&&path.startsWith("/api/")&&path!=="/api/health"&&req.method!=="OPTIONS"&&
       !tokenMatches(req.headers?.authorization,networkToken))
      return res.status(401).json({ok:false,error:"local-api-token-required"});
    if(req.method!=="POST"||!Object.hasOwn(limits,path))return next();
    // Trust the socket, not an easily spoofed X-Forwarded-For header.
    const ip=String(req.socket?.remoteAddress||"unidentified").slice(0,80);
    const key=ip+"|"+path,ts=Number(now());
    if(!Number.isFinite(ts))return res.status(503).json({ok:false,error:"local-clock-unavailable"});
    if(buckets.size>=MAX_KEYS){
      for(const [k,v] of buckets)if(v.reset<=ts)buckets.delete(k);
      if(buckets.size>=MAX_KEYS&&!buckets.has(key))
        return res.status(503).json({ok:false,error:"rate-limiter-capacity"});
    }
    const limit=Math.max(1,Math.min(1000,Number(limits[path])||1));
    const previous=buckets.get(key);
    const bucket=previous&&previous.reset>ts?previous:{count:0,reset:ts+windowMs};
    if(bucket.count>=limit){
      res.set("Retry-After",String(Math.max(1,Math.ceil((bucket.reset-ts)/1000))));
      return res.status(429).json({ok:false,error:"too-many-requests"});
    }
    bucket.count++;
    buckets.set(key,bucket);
    res.set("X-RateLimit-Limit",String(limit));
    res.set("X-RateLimit-Remaining",String(Math.max(0,limit-bucket.count)));
    return next();
  };
}
