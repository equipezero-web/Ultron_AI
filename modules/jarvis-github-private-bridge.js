// Authenticated PRIVATE GitHub inspection only, after failed public lookup.
// No GitHub credentials reach the browser, and a public denial is not bypassed.
import API_CONFIG from "../config.js";
const BACKEND=String(API_CONFIG?.backendUrl||"").replace(/\/+$/,"");
const previous=window.fetch.bind(window);
function requestedUrl(message){
  return /https?:\/\/(?:www\.)?github\.com\/[a-z0-9-]{1,39}\/[a-z0-9_.-]{1,100}(?=[\/?#\s)\],.!?]|$)/i.test(message||"");
}
function target(input,init){
  try{
    const url=new URL(typeof input==="string"?input:input?.url,location.href);
    return url.origin===new URL(BACKEND).origin && url.pathname==="/api/ai"&&
      String(init?.method||"").toUpperCase()==="POST";
  }catch{return false;}
}
window.fetch=async function jarvisPrivateGitHubFetch(input,init={}){
  if(!BACKEND||!target(input,init))return previous(input,init);
  let body=null;
  try{body=JSON.parse(init.body||"{}");}catch{}
  if(!requestedUrl(body?.message))return previous(input,init);
  const publicResponse=await previous(input,init);
  let publicInfo=null;
  try{publicInfo=await publicResponse.clone().json();}catch{}
  const error=String(publicInfo?.githubInspection?.code||"");
  if(publicInfo?.githubInspection?.ok!==false||
    !/^(?:github-http-(?:401|403|404)|github-timeout|github-unavailable|not-confirmed-public)$/.test(error))return publicResponse;
  try{
    const response=await previous(BACKEND+"/api/github/private/ai",{
      method:"POST",credentials:"include",mode:"cors",redirect:"error",
      cache:"no-store",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({message:String(body.message).slice(0,3000)})
    });
    if(!response.ok)return publicResponse;
    const data=await response.json();
    if(!data?.ok||!data?.githubInspection?.verified||data.githubInspection.private!==true||
      typeof data.text!=="string")return publicResponse;
    window.dispatchEvent(new CustomEvent("ultron:github-private-authorized",{
      detail:{repository:data.githubInspection.repository,verified:true,access:"read-only"}
    }));
    return new Response(JSON.stringify(data),{status:200,
      headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});
  }catch{return publicResponse;}
};
window.JARVIS_GITHUB_PRIVATE={readOnly:true,requiresCloudflareAccess:true};
