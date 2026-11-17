import assert from "node:assert/strict";
import {FORECAST_CITIES,normalizeForecast,fetchForecast} from "../modules/jarvis-meteorological-forecast.js";
assert.ok(FORECAST_CITIES.length>=8);
const raw={timezone:"America/Recife",daily:{
 time:["2026-11-17","2026-11-18"],
 temperature_2m_max:[30,29],temperature_2m_min:[24,23],
 precipitation_sum:[2.3,0],precipitation_probability_max:[75,10],
 wind_speed_10m_max:[12,8]}};
const city=FORECAST_CITIES[0];
const result=normalizeForecast(raw,{city,checkedAt:"2026-11-17T17:00:00Z"});
assert.equal(result.ok,true);
assert.equal(result.days.length,2);
assert.equal(result.days[0].rain,2.3);
assert.equal(result.days[1].chance,10);
assert.match(result.note,/previsão/i);
assert.equal(normalizeForecast({...raw,daily:{...raw.daily,precipitation_sum:["invalid",0]}},{city}),null);
assert.equal(normalizeForecast({...raw,daily:{...raw.daily,precipitation_probability_max:[120,10]}},{city}),null);
assert.equal(normalizeForecast({...raw,daily:{...raw.daily,wind_speed_10m_max:[12]}},{city}),null);
let called="",options={};
const live=await fetchForecast("recife",{fetchImpl:async(url,opts)=>{
 called=url;options=opts;return {ok:true,json:async()=>raw};
}});
assert.equal(live.ok,true);
assert.match(called,/api.open-meteo.com\/v1\/forecast/);
assert.match(called,/forecast_days=7/);
assert.equal(options.cache,"no-store");
assert.equal((await fetchForecast("not-a-city",{fetchImpl:async()=>{throw Error("network must not run");}})).ok,false);
assert.equal((await fetchForecast("recife",{fetchImpl:async()=>{throw Error("offline");}})).ok,false);
console.log("METEO LIVE FORECAST PASS: real seven-day source, bounded cities, strict data validation, clear offline failure");
