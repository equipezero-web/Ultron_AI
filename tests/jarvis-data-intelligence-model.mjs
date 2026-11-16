import assert from "node:assert/strict";
import {
 JARVIS_EVIDENCE_SCHEMA,forecastEvidence,apacEvidence,evidenceSummary,isJarvisEvidence
} from "../modules/jarvis-data-intelligence-model.js";
import {normalizeGlobalForecast,normalizeGlobalLocation} from "../modules/jarvis-global-weather.js";
import {normalizeApacResponse} from "../modules/jarvis-meteorological-sources.js";

const now=()=> "2026-11-16T10:00:00.000Z";
const city=normalizeGlobalLocation({
 id:1076130,name:"Recife",country:"Brazil",country_code:"BR",admin1:"Pernambuco",
 latitude:-8.0476,longitude:-34.877,timeZone:"America/Recife",timezone:"America/Recife"
});
assert.equal(city.label,"Recife, Pernambuco, Brazil");
const times=["2026-11-16","2026-11-17","2026-11-18"];
const payload={
 utc_offset_seconds:-10800,
 current:{time:"2026-11-16T07:00",temperature_2m:27,
  relative_humidity_2m:82,precipitation:0.5,wind_speed_10m:9},
 daily:{time:times,
 temperature_2m_min:[23,24,22],temperature_2m_max:[29,32,30],
 precipitation_sum:[0.5,15.25,3.05],
 precipitation_probability_max:[30,90,50]}
};
const forecast=normalizeGlobalForecast(payload,city,{days:3,now});
assert.equal(forecast.ok,true);
const evidence=forecastEvidence(forecast,{now});
assert.equal(evidence.schema,JARVIS_EVIDENCE_SCHEMA);
assert.equal(evidence.sources.length,1);
assert.equal(evidence.sources[0].origin,"external-numerical-model");
assert.equal(evidence.verification.independentCorroboration,"not-performed");
assert.equal(evidence.verification.sensorCalibration,"not-checked");
assert.equal(evidence.kind,"numerical-forecast");
assert.equal(evidence.derived[0].value,18.8);
assert.equal(evidence.derived[1].value,15.25);
assert.equal(evidence.derived[1].date,"2026-11-17");
assert.equal(evidence.derived[2].value,32);
assert.equal(evidence.derived[3].value,22);
assert.equal(evidence.observations[0].category,"model-estimate");
assert.ok(evidenceSummary(evidence).includes("NÃO corroborada independentemente"));
assert.ok(evidenceSummary(evidence).includes("Cálculo próprio"));
assert.equal(isJarvisEvidence(evidence),true);
assert.equal(forecastEvidence({...forecast,days:[{...forecast.days[0],rainMm:-1}]},{now}),null);
assert.equal(forecastEvidence({...forecast,days:[{...forecast.days[0],minC:40,maxC:20}]},{now}),null);
assert.equal(forecastEvidence({...forecast,kind:"verified-real-time-sensor"},{now}),null);
assert.equal(forecastEvidence({...forecast,fetchedAt:"2027-01-01T00:00:00Z"},{now}),null);
const stale=forecastEvidence(forecast,{now:()=>"2026-11-17T18:00:00Z"});
assert.equal(stale.verification.timeliness,"stale-retrieval");
const partial=forecastEvidence({...forecast,days:forecast.days.slice(0,2),partialForecast:true},{now});
assert.equal(partial.completeness.partial,true);
assert.equal(partial.completeness.daysProvided,2);
assert.equal(partial.completeness.daysRequested,3);
const malformed=forecastEvidence({...forecast,days:[...forecast.days,{...forecast.days[2],date:"2026-11-18"}]},{now});
assert.equal(malformed,null,"Reject non-increasing/duplicate forecast dates");
const apac=normalizeApacResponse({
 features:[
  {attributes:{objectid:1,nome:"Estação A",municipio:"Recife",latitude:-8.05,longitude:-34.88,horas_24:23.5,
    ultima_leitura_data_hora:"2026-11-16 06:50"}},
  {attributes:{objectid:2,nome:"Estação B",municipio:"Olinda",latitude:-8.01,longitude:-34.85,horas_24:0}},
  {attributes:{objectid:3,nome:"Estação falsa",municipio:"PE",latitude:50,longitude:50,horas_24:100}},
  {attributes:{objectid:4,nome:"Estação inválida",latitude:-8,longitude:-35,horas_24:-12}}
 ]
},{hours:24,checkedAt:now()});
assert.equal(apac.ok,true);
assert.equal(apac.count,2);
const observed=apacEvidence(apac,{now});
assert.equal(observed.kind,"station-observation");
assert.equal(observed.sources[0].origin,"external-station-observations");
assert.equal(observed.derived[0].value,2);
assert.equal(observed.derived[1].value,1);
assert.equal(observed.derived[2].value,23.5);
assert.equal(observed.derived[2].station,"Estação A");
assert.equal(observed.verification.independentCorroboration,"not-performed");
assert.match(observed.observations[1].dataTimeBasis,/idade não confirmada/);
assert.match(evidenceSummary(observed),/Medições externas/);
assert.ok(observed.limitations.every(x=>!x.includes("calibração verificada")));
assert.equal(apacEvidence({...apac,type:"confirmed-storm-warning"},{now}),null);
assert.equal(apacEvidence({...apac,stations:[]},{now}),null);
const missingRead=apacEvidence({...apac,stations:apac.stations.map(s=>({...s,lastReading:""}))},{now});
assert.equal(missingRead.observations[0].dataTime,"não informado");
console.log("JARVIS EVIDENCE MODEL PASS: attributed external observations/forecast, bounded valid values, time provenance, own arithmetic, staleness, no fabricated confirmation or alerts");
