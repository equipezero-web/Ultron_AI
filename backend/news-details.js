import {searchGoogle} from "./web-research.js";

const clean=(v,n=1100)=>String(v||"").replace(/\s+/g," ").trim().slice(0,n);
const norm=v=>clean(v).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9 ]/g," ").replace(/\s+/g," ").trim();
const stop=new Set(["para","como","sobre","mais","hoje","apos","pela","pelo","entre","contra","esta","este","essa","esse","noticia","noticias","agora","Brasil"]);
const tokens=v=>new Set(norm(v).split(" ").filter(t=>t.length>=4&&!stop.has(t)));
export function meaningfulDescription(description,title){
 const d=norm(description),t=norm(title);
 return d.length>=100&&d!==t&&!(d.startsWith(t)&&d.length-t.length<65);
}
function related(title,candidate){
 const a=tokens(title),b=tokens(candidate);
 if(!a.size)return false;
 const shared=[...a].filter(x=>b.has(x)).length;
 return shared>=Math.min(3,a.size)&&shared/a.size>=.45;
}
export async function deepenNews(env,stories){
 const selected=(Array.isArray(stories)?stories:[]).filter(s=>typeof s?.title==="string"&&s.title.trim()).slice(0,6);
 return Promise.all(selected.map(async (story,index)=>{
   const title=clean(story.title,240);
   const original=clean(story.description,1100);
   const result={index,title,description:meaningfulDescription(original,title)?original:"",sources:[],status:"limited"};
   // Search the actual headline, not generic daily news. No article URL is fetched from user input.
   try{
     const research=await searchGoogle(env,title,{limit:5,media:false});
     const matches=(research.results||[]).filter(r=>related(title,r.title)&&meaningfulDescription(r.snippet,title));
     const excerpts=[];
     if(result.description)excerpts.push(result.description);
     for(const source of matches){
       const snippet=clean(source.snippet,650);
       if(excerpts.some(x=>norm(x).includes(norm(snippet))||norm(snippet).includes(norm(x))))continue;
       excerpts.push(snippet);
       result.sources.push({title:source.title,url:source.url,source:source.source,date:source.date||null});
       if(excerpts.length>=3)break;
     }
     // Keep source excerpts together rather than inventing details. The original
     // publisher paragraph is preferred; additional sources add factual context.
     result.description=excerpts.join("\n\n").slice(0,1800);
     result.status=meaningfulDescription(result.description,title)?"detailed":"limited";
   }catch{}
   return result;
 }));
}
