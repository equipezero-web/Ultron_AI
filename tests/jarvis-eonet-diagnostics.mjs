import assert from "node:assert/strict";
import {GLOBAL_INTEL_SOURCES,parseEonetEvents,collectGlobalIntelligence}
 from "../backend/global-intelligence-monitor.js";

const now=Date.parse("2026-11-23T15:00:00Z");
const ago=days=>new Date(now-days*86400000).toISOString();
const feature=(id,{date=ago(2),geometryDates=[],categories=[{id:"wildfires"}],geometry={type:"Point",coordinates:[-50,-10]}}={})=>({
 type:"Feature",id,geometry,
 properties:{id,title:"Observed event "+id,date,geometryDates,categories,
  link:"https://eonet.gsfc.nasa.gov/api/v3/events/"+id}
});
const feed={type:"FeatureCollection",features:[
 feature("recent"),feature("older-active",{date:ago(90),geometryDates:[ago(60),ago(4)]}),
 feature("category-title",{categories:[{id:999,title:"Severe Storms"}]}),
 feature("too-old",{date:ago(45)}),feature("no-geometry",{geometry:null}),
 feature("unsupported",{categories:[{id:"unknown-category"}]})
]};
const parsed=parseEonetEvents(feed,{now});
assert.equal(parsed.length,3);
assert.equal(parsed.find(x=>x.id==="nasa:older-active")?.eventAt,ago(4));
assert.equal(parsed.find(x=>x.id==="nasa:category-title")?.kind,"severeStorms");
assert.deepEqual(parsed.diagnostics.reasons,{
 invalid_or_out_of_window_date:1,invalid_geometry:1,unsupported_category:1
});
assert.equal(parsed.diagnostics.receivedCount,6);
assert.equal(parsed.diagnostics.acceptedCount,3);
assert.equal(parsed.diagnostics.discardedCount,3);
assert.match(GLOBAL_INTEL_SOURCES.nasa.url,/status=all&days=30&limit=300/);
const report=await collectGlobalIntelligence({now:()=>now,fetchImpl:async url=>{
 if(url.startsWith(GLOBAL_INTEL_SOURCES.nasa.url))return {ok:true,json:async()=>feed};
 throw Error("other source offline");
}});
assert.equal(report.ok,true);
const nasa=report.sourceStatus.find(x=>x.source==="nasa");
assert.equal(nasa.count,3);
assert.equal(nasa.receivedCount,6);
assert.equal(nasa.discardedCount,3);
assert.equal(nasa.discardReasons.unsupported_category,1);
console.log("NASA EONET PASS: recent geometries, category titles, 30-day window and discard diagnostics");
