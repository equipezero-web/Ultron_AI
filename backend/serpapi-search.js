/**
 * Read-only SerpApi Google Search fallback.
 * Runs ONLY on the Worker; never expose the URL, credential, error objects or raw response.
 * The integration makes a maximum of two API calls per fallback, not per user keystroke.
 */
const ENDPOINT="https://serpapi.com/search.json";
const MAX_QUERY=500, MAX_BODY=450000;
const clean=(v,n=200)=>String(v??"").replace(/[\r\n<>]/g," ").replace(/\s+/g," ").trim().slice(0,n);
const safeUrl=v=>{try{const u=new URL(String(v||""));return ["http:","https:"].includes(u.protocol)?u.href:null;}catch{return null;}};
async function apiSearch({key,q,engine,fetchImpl,timeoutMs=6000}){
 const params=new URLSearchParams({engine,q,gl:"br",hl:"pt-br",api_key:key});
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),timeoutMs);
 try{
  // Credential exists in this outbound URL only. Do not log or return it.
  const res=await fetchImpl(ENDPOINT+"?"+params,{signal:controller.signal,redirect:"error",cache:"default",headers:{Accept:"application/json"}});
  if(!res.ok)throw new Error("HTTP "+res.status);
  const len=Number(res.headers?.get?.("content-length")||0);
  if(len>MAX_BODY)throw new Error("Response too large");
  const text=await res.text();
  if(text.length>MAX_BODY)throw new Error("Response too large");
  const data=JSON.parse(text);
  if(data?.error)throw new Error("Provider rejected request");
  return data;
 }finally{clearTimeout(timer);}
}
export async function searchSerpApi(env,question,{includeImages=false,limit=6,fetchImpl=fetch}={}){
 const key=String(env?.SERPAPI_API_KEY||"").trim();
 const q=clean(question,MAX_QUERY);
 if(!key)return {configured:false,ok:false,provider:"serpapi-google",error:"SERPAPI_API_KEY não configurada."};
 if(!q)return {configured:true,ok:false,provider:"serpapi-google",error:"Consulta vazia."};
 try{
  const google=await apiSearch({key,q,engine:"google",fetchImpl});
  const organic=Array.isArray(google.organic_results)?google.organic_results:[];
  const results=organic.slice(0,20).map((x,i)=>({
   title:clean(x.title,220),link:safeUrl(x.link),snippet:clean(x.snippet,650),
   position:Number(x.position)||i+1,date:clean(x.date,80)
  })).filter(x=>x.title&&x.link).slice(0,Math.max(3,Math.min(8,Number(limit)||6)));
  let images=[],imageError=null;
  if(includeImages){
   try{
    const imageData=await apiSearch({key,q,engine:"google_images",fetchImpl});
    images=(Array.isArray(imageData.images_results)?imageData.images_results:[])
     .map(x=>({src:safeUrl(x.original||x.thumbnail),
       thumbnail:safeUrl(x.thumbnail),alt:clean(x.title||q,160),
       sourceUrl:safeUrl(x.link)}))
     .filter(x=>x.src&&x.sourceUrl).slice(0,4);
   }catch{imageError="Pesquisa de imagens SerpApi indisponível";}
  }
  return {configured:true,ok:results.length>0||images.length>0,provider:"serpapi-google",
   providerLabel:"Google Search via SerpApi",results,images,
   error:results.length||images.length?null:"Nenhum resultado válido retornado pela SerpApi.",
   mediaStatus:{automatic:true,imageCount:images.length,videoCount:0,imageError,videoError:null}};
 }catch{
  return {configured:true,ok:false,provider:"serpapi-google",
   error:"Pesquisa SerpApi indisponível ou sem créditos."};
 }
}
