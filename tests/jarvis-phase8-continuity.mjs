import assert from "node:assert/strict";
import {buildContinuityStatus} from "../backend/continuity-status.js";
import {continuityView} from "../modules/jarvis-continuity-model.js";

const now=Date.parse("2026-11-13T12:00:00.000Z");
const time=offset=>new Date(now-offset*60_000).toISOString();
const sources=["usgs","nasa","gdacs"].map(source=>({source,ok:true,count:2}));
const e=(id,source,nearBrazil,priority,minutes=20,url)=>( {
  id,title:"Evento "+id,source,kind:source==="usgs"?"earthquake":"wildfires",
  lat:nearBrazil?-8.0:35.0,lng:nearBrazil?-35.0:110.0,nearBrazil,
  eventAt:time(minutes),priority,url:url||({
    usgs:"https://earthquake.usgs.gov/earthquakes/eventpage/"+id,
    nasa:"https://eonet.gsfc.nasa.gov/api/v3/events/"+id,
    gdacs:"https://www.gdacs.org/report.aspx?eventid="+id
  })[source]
});
const events=[
 e("g1","gdacs",false,100),e("b1","usgs",true,2),
 e("b2","gdacs",true,5),e("n1","nasa",false,1),
 e("bad","usgs",true,999,20,"https://malicious.example.com"),
 e("old","usgs",true,10,8*24*60)
];
const weatherRegions=[
 ["recife","Recife","BR"],["florianopolis","Florianópolis","BR"],["miami","Miami","US"],
 ["london","Londres","GB"],["tokyo","Tóquio","JP"],["sydney","Sydney","AU"]
].map(([region,name,country])=>({region,name,country,temperatureC:25,
 rainChancePercent:30,source:"Open-Meteo.com",checkedAt:time(50)}));
const globalReport={ok:true,checkedAt:time(35),events,sourceStatus:sources};
const weatherReport={ok:true,checkedAt:time(45),regions:weatherRegions};

const fresh=buildContinuityStatus({globalReport,weatherReport,now});
assert.equal(fresh.ok,true);
assert.equal(fresh.collection,"read-only-persisted");
assert.equal(fresh.world.state,"healthy");
assert.equal(fresh.weather.state,"healthy");
assert.equal(fresh.healthy,true);
assert.equal(fresh.degraded,false);
assert.equal(fresh.world.sources.length,3);
assert.equal(fresh.world.sourceCount,3);
assert.equal(fresh.world.highlights[0].id,"b2");
assert.equal(fresh.world.highlights[1].id,"b1");
assert.equal(fresh.world.brazilProximityCount,2);
assert.equal(fresh.world.highlights.some(x=>x.id==="bad"||x.id==="old"),false);
assert.equal(fresh.world.highlights[0].nearBrazil,true);
assert.equal(fresh.weather.sampledRegions,6);
assert.equal(fresh.weather.highlights[0].country,"BR");
assert.ok(fresh.weather.note.includes("Open-Meteo"));
assert.match(fresh.disclaimer,/não substitui INMET/i);
const formatted=continuityView(fresh);
assert.equal(formatted.ok,true);
assert.match(formatted.ring,/MUNDO ATUALIZADA/);
assert.match(formatted.ring,/CLIMA ATUALIZADA/);
assert.match(formatted.lines.join(" "),/PRÓXIMO AO BRASIL/);
assert.match(formatted.lines.join(" "),/Proximidade não significa impacto/);
assert.equal(continuityView({ok:true}).ok,false,"Unknown schemas fail closed");

const partial=buildContinuityStatus({globalReport:{...globalReport,
  sourceStatus:[{source:"usgs",ok:true},{source:"nasa",ok:false},{source:"gdacs",ok:true}]},
  weatherReport:{...weatherReport,regions:weatherRegions.slice(0,2)},now});
assert.equal(partial.world.state,"partial");
assert.equal(partial.world.sourceCount,2);
assert.equal(partial.world.highlights.some(x=>x.source==="NASA"),false,"No claim from failed source");
assert.equal(partial.weather.state,"partial");
assert.equal(partial.weather.sampledRegions,2);
assert.match(continuityView(partial).lines.join(" "),/NASA/);

const stale=buildContinuityStatus({
  globalReport:{...globalReport,checkedAt:time(200)},
  weatherReport:{...weatherReport,checkedAt:time(360),
    regions:weatherRegions.map(x=>({...x,checkedAt:time(360)}))},now
});
assert.equal(stale.world.state,"stale");
assert.equal(stale.weather.state,"stale");
assert.equal(stale.world.sourceCount,0,"Stale source must not be called available");
assert.equal(stale.weather.sampledRegions,0);
assert.match(continuityView(stale).lines.join(" "),/DESATUALIZADA/);
assert.match(continuityView(stale).lines.join(" "),/nenhum destaque deve ser considerado atual/);

const empty=buildContinuityStatus({globalReport:{ok:false,error:"D1 offline"},weatherReport:null,now});
assert.equal(empty.ok,true,"The report is transport-valid but feeds unavailable");
assert.equal(empty.healthy,false);
assert.equal(empty.degraded,true);
assert.equal(empty.world.state,"unavailable");
assert.equal(empty.weather.state,"unavailable");
assert.equal(empty.world.highlights.length,0);
assert.equal(empty.world.brazilProximityCount,0);
assert.match(continuityView(empty).ring,/INDISPONÍVEL/);

const future=buildContinuityStatus({globalReport:{...globalReport,checkedAt:time(-40)},
 weatherReport:{...weatherReport,checkedAt:time(-40)},now});
assert.equal(future.world.state,"unavailable","Future-dated snapshots cannot be current");
assert.equal(future.weather.state,"unavailable");
assert.throws(()=>buildContinuityStatus({now:NaN}),/inválido/);

console.log("PHASE VIII PASS: Brazil-first persisted facts, stale timestamps, partial coverage, official source links and read-only formatting");
