import fs from "node:fs/promises";
import { createWorldBriefing } from "../backend/world-briefing.js";

const destination=new URL("../data/world-briefing.json",import.meta.url);
const result=await createWorldBriefing();
const hasConfirmed=Boolean(result.hasNews||result.alerts?.checked||result.enso?.bulletin);
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
