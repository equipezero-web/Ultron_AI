import fs from "node:fs/promises";
import { createWorldBriefing } from "../backend/world-briefing.js";

const destination=new URL("../data/world-briefing.json",import.meta.url);
const result=await createWorldBriefing();
const hasConfirmed=Boolean(result.hasNews||result.alerts?.checked||result.enso?.bulletin);
if (!result.enso?.bulletin) {
  const checks=[
    "https://www.cpc.ncep.noaa.gov/products/analysis_monitoring/enso_advisory/ensodisc.html",
    "https://www.weather.gov/twc/enso"
  ];
  for(const url of checks){
    const aborter=new AbortController(),timeout=setTimeout(()=>aborter.abort(),2800);
    try {
      const response=await fetch(url,{signal:aborter.signal,headers:{"Accept":"text/html"}});
      const html=await response.text();
      const marker=html.search(/ENSO.{0,25}Alert.{0,25}System.{0,25}Status/i);
      console.log("NOAA SOURCE DIAGNOSTIC",new URL(url).hostname,response.status,
        response.headers.get("content-type"),"length",html.length,"marker",marker,
        "text",html.slice(marker<0?0:marker,marker<0?210:marker+210).replace(/<[^>]+>/g," ").slice(0,210));
    } catch(error) {
      console.log("NOAA SOURCE DIAGNOSTIC",new URL(url).hostname,error?.message||String(error));
    } finally {clearTimeout(timeout);}
  }
}
if(!hasConfirmed){
  console.error("Nenhuma fonte confirmada nesta execução. Preservando a última coleta.");
  process.exitCode=1;
}else{
  const snapshot={
    ...result,
    delivery:"github-scheduled-snapshot",
    live:false,
    // This reflects the time of the last successful fetch, not "now" on each open.
    fetchedAt:result.fetchedAt,
    refreshedBy:"scheduled-github-action"
  };
  await fs.mkdir(new URL("../data/",import.meta.url),{recursive:true});
  await fs.writeFile(destination,JSON.stringify(snapshot,null,2)+"\n","utf8");
  console.log("ULTRON INTELLIGENCE SNAPSHOT:",snapshot.fetchedAt,
    "stories",snapshot.topics.reduce((sum,item)=>sum+item.articles.length,0),
    "INMET",snapshot.alerts.checked?"checked":"unavailable",
    "NOAA",snapshot.enso.bulletin?"checked":"unavailable");
}
