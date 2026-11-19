/**
 * Authenticated, read-only public intelligence execution.
 * Auth is enforced by the account route, NOT by a client-provided memoryKey.
 * No phone/device actions, private memory reads, code execution or audio here.
 */
import {planAgents,executeAgents} from "./intelligent-task-hub.js";
import {loadGlobalWeather} from "./weather-global.js";
import {loadLiveNewsContext} from "./news-context.js";
import {safeLocationQuery,globalWeatherScenario} from "../modules/jarvis-global-weather.js";
import {validateGeoScenario} from "../modules/jarvis-geospatial-model.js";

const cap=(v,n=170)=>String(v??"").replace(/[\r\n<>]/g," ").trim().slice(0,n);
const isHttps=v=>{try{const u=new URL(v);return u.protocol==="https:"&&!u.username&&!u.password;}catch{return false;}};
const fail=(error,status=422,extra={})=>({ok:false,status,error,...extra});
const allowed=new Set(["meteorology","news","visual"]);
export async function runVerifiedReadOnlyIntelligence(input={},{
  weatherLoader=loadGlobalWeather,newsLoader=loadLiveNewsContext,now=()=>Date.now()
}={}){
  const message=typeof input?.message==="string"?input.message.trim():"";
  if(!message||message.length>500)return fail("INVALID_COMMAND",400);
  const plan=planAgents(message,{maxSteps:4});
  if(!plan.steps.length)return fail("NO_AFFIRMATIVE_ACTION",422,{plan});
  if(plan.steps.some(s=>!allowed.has(s.agent)))return fail("AGENT_NOT_AVAILABLE",422,{
    supported:["meteorology","news"],unsupported:plan.steps.filter(s=>!allowed.has(s.agent)).map(s=>s.agent)
  });
  const needWeather=plan.steps.some(s=>s.agent==="meteorology");
  const city=needWeather?safeLocationQuery(input.city):null;
  if(needWeather&&!city)return fail("CITY_REQUIRED",400,{hint:"Forneça uma cidade válida em city; não presumir localização."});
  const days=input.days===undefined?7:Number(input.days);
  if(needWeather&&![3,7,16].includes(days))return fail("DAYS_INVALID",400);
  // Loading functions have their own upstream timeouts and fixed hosts.
  const agents={
    meteorology:async()=>{
      const report=await weatherLoader({query:city,days});
      if(report?.ok!==true||report.kind!=="global-short-term-forecast"||
         !report.location?.label||!report.source?.url||!isHttps(report.source.url)||
         !Array.isArray(report.days)||!report.days.length||!report.fetchedAt)return {ok:false};
      // Reuse the same scientific 2D/3D dataset that the existing weather
      // command uses. The browser must independently validate and actually
      // render it before any completion claim.
      const canLocate=report.location?.key?.startsWith("global-") &&
        Number.isFinite(report.location?.lat)&&Number.isFinite(report.location?.lng);
      const scenario=canLocate?globalWeatherScenario(report):null;
      const geoScenario=scenario?validateGeoScenario(scenario):null;
      return {ok:true,result:{
        type:"forecast-model",location:cap(report.location.label,130),
        fetchedAt:report.fetchedAt,source:{name:cap(report.source.name,110),url:report.source.url},
        current:report.current,days:report.days.slice(0,days),
        disclaimer:cap(report.source.disclaimer,350),isOfficialAlert:false,
        ...(geoScenario?{geoScenario}:{})
      }};
    },
    news:async()=>{
      // Fixed public-news query: never convert private conversation into a search request.
      const report=await newsLoader("notícias Brasil hoje",{limit:6});
      const timestamp=now();
      const articles=(Array.isArray(report?.articles)?report.articles:[])
        .filter(a=>{
          const date=Date.parse(a?.publishedAt);
          return isHttps(a?.url)&&Number.isFinite(date)&&date>=timestamp-72*3600000&&date<=timestamp+300000&&a?.title;
        }).slice(0,5).map(a=>({
          title:cap(a.title,190),url:a.url,source:cap(a.source,100),
          publishedAt:a.publishedAt,description:cap(a.description,260),
          image:isHttps(a.image)?a.image:null
        }));
      return articles.length?{ok:true,result:{type:"news",fetchedAt:new Date(timestamp).toISOString(),
        articles,sourceCount:new Set(articles.map(a=>a.source)).size}}:{ok:false};
    }
  };
  // No "visual" agent is registered on the Worker: rendering must be confirmed
  // by the browser's real Neural Ring, never simulated as completed here.
  const executed=await executeAgents(plan,{agents,concurrency:2});
  const steps=executed.steps.map(s=>({
    id:s.id,agent:s.agent,status:s.status,
    ...(s.status==="completed"?{result:s.result}:{}),
    ...(s.reason?{reason:s.reason}:{})
  }));
  return {
    ok:executed.ok,partial:!executed.ok&&steps.some(s=>s.status==="completed"),
    status:executed.ok?200:207,mode:"authenticated-read-only",
    plan:{advisory:true,steps:plan.steps.map(s=>({agent:s.agent,tool:s.tool}))},
    steps,rendered:false,deviceActions:false,voiceEnabled:false,
    ...(plan.steps.some(s=>s.agent==="visual")?{
      nextAction:"The Neural Ring client must independently validate and render these sourced results."
    }:{})
  };
}
