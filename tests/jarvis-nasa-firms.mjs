import assert from "node:assert/strict";
import {parseFirmsCsv,collectFirms,pollFirms,latestFirms} from "../backend/nasa-firms-monitor.js";
const now=Date.parse("2026-11-23T16:00:00Z");
const csv=[
 "latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,confidence,version,bright_ti5,frp,daynight",
 "-8.1000,-38.4000,330,0.4,0.5,2026-11-23,1545,N20,n,2.0,295,8.4,D",
 "-200,-38.4000,330,0.4,0.5,2026-11-23,1545,N20,n,2.0,295,8.4,D",
 "-9,-39,330,0.4,0.5,2026-10-01,1545,N20,n,2.0,295,8.4,D"
].join("\n");
const parsed=parseFirmsCsv(csv,{now});
assert.equal(parsed.receivedCount,3);assert.equal(parsed.acceptedCount,1);
assert.equal(parsed.discardedCount,2);assert.equal(parsed.events.length,1);
assert.equal(parsed.events[0].frp,8.4);
assert.equal(parsed.events[0].kind,"heatDetection");
assert.equal(parsed.events[0].eventAt,"2026-11-23T15:45:00Z");
assert.equal(parsed.events[0].url,"https://firms.modaps.eosdis.nasa.gov/");
assert.throws(()=>parseFirmsCsv("not,a,firms,feed",{now}),/schema/);
const noKey=await collectFirms({},{now:()=>now});
assert.equal(noKey.ok,false);assert.equal(noKey.configured,false);
let calls=0;
const fetchImpl=async url=>{
 ++calls;
 assert.match(url,/firms\.modaps\.eosdis\.nasa\.gov\/api\/area\/csv\//);
 assert.match(url,/\/VIIRS_NOAA20_NRT\/-74,-34,-34,6\/1$/);
 return {ok:true,headers:{get:()=>null},text:async()=>csv};
};
const env={NASA_FIRMS_MAP_KEY:"private-test-only"};
const collected=await collectFirms(env,{now:()=>now,fetchImpl});
assert.equal(collected.ok,true);assert.equal(collected.acceptedCount,1);
assert.ok(!JSON.stringify(collected).includes(env.NASA_FIRMS_MAP_KEY));
const rows=new Map();
const db={prepare(sql){return {
 async run(){return {success:true}},
 bind(...args){return {
 async first(){if(sql.includes("WHERE bucket"))return rows.get(args[0])||null;
 if(sql.includes("ORDER BY"))return [...rows.values()].at(-1)||null;return null},
 async run(){if(sql.includes("INSERT OR IGNORE"))rows.set(args[0],{snapshot_json:args[1],checked_at:args[2]});return {success:true}}
 }},
 async first(){if(sql.includes("ORDER BY"))return [...rows.values()].at(-1)||null;return null}
}}};
env.ULTRON_DB=db;
assert.equal((await pollFirms(env,{now:()=>now,fetchImpl})).ok,true);
assert.equal((await pollFirms(env,{now:()=>now+60_000,fetchImpl})).skipped,true);
assert.equal(calls,2,"One direct test plus one scheduled fetch; no duplicate 30m poll");
const latest=await latestFirms(env,{now:()=>now+60_000});
assert.equal(latest.ok,true);assert.equal(latest.persistence,"cloudflare-d1");
assert.equal(latest.cadenceMinutes,30);
console.log("NASA FIRMS PASS: bounded CSV, server-only key, half-hour D1 dedup, safe public snapshot");
