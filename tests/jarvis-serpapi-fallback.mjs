import assert from "node:assert/strict";
import {searchGoogle} from "../backend/web-research.js";
import {searchSerpApi} from "../backend/serpapi-search.js";
const mockKey="private-fake-serpapi-credential";
const original=globalThis.fetch;
let serpapiCalls=0,serperCalls=0;
globalThis.fetch=async (url,opts)=>{
 const u=String(url);
 if(u.startsWith("https://google.serper.dev/")){
  serperCalls++;
  return new Response(JSON.stringify({organic:[]}),{status:200});
 }
 if(u.startsWith("https://serpapi.com/search.json?")){
  serpapiCalls++;
  const p=new URL(u).searchParams;
  assert.equal(p.get("api_key"),mockKey);
  assert.equal(p.get("gl"),"br");assert.equal(p.get("hl"),"pt-br");
  if(p.get("engine")==="google_images")
   return new Response(JSON.stringify({images_results:[{
    title:"Recife aerial view",original:"https://example.com/photo.jpg",
    thumbnail:"https://example.com/thumb.jpg",link:"https://example.com/page"
   }]}),{status:200});
  return new Response(JSON.stringify({organic_results:[{
   title:"Recife official",link:"https://example.org/recife",
   snippet:"Informações oficiais da cidade",position:1,date:"Nov 2026"
  }]}),{status:200});
 }
 throw Error("Unexpected request host");
};
try{
 const env={SERPER_API_KEY:"fake-serper",SERPAPI_API_KEY:mockKey};
 const report=await searchGoogle(env,"Recife, Pernambuco",{media:false});
 assert.equal(report.provider,"serpapi-google");
 assert.equal(report.results[0].url,"https://example.org/recife");
 assert.equal(report.fallback.used,true);
 assert.equal(serpapiCalls,1);
 assert.ok(!JSON.stringify(report).includes(mockKey));
 assert.ok(serperCalls>=1);
 const images=await searchSerpApi(env,"Recife",{includeImages:true});
 assert.equal(images.results.length,1);
 assert.equal(images.images[0].src,"https://example.com/photo.jpg");
 assert.ok(!JSON.stringify(images).includes(mockKey));
 assert.equal(serpapiCalls,3,"One web call and two optional visual calls");
 globalThis.fetch=async (url)=>{
  if(String(url).startsWith("https://google.serper.dev/"))
   return new Response(JSON.stringify({organic:[{title:"Primary",link:"https://example.net/primary",snippet:"Serper source"}]}),{status:200});
  throw Error("SerpApi must not run if Serper has organic results");
 };
 const preferred=await searchGoogle(env,"Recife",{media:false});
 assert.equal(preferred.provider,"serper-google");
 assert.equal(preferred.results[0].title,"Primary");
 const withoutKey=await searchSerpApi({},"Recife");
 assert.equal(withoutKey.configured,false);
 console.log("SERPAPI PASS: Serper-first, fallback, media, non-leaking key");
}finally{globalThis.fetch=original;}
