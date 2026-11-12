import assert from "node:assert/strict";
import {parseMeteoIntent,normalizeApacResponse,loadApacObservations,METEO_VIEWERS} from "../modules/jarvis-meteorological-sources.js";
for(const [q,tab] of [
 ["Jarvis, mostre as chuvas em tempo real no Brasil","radar"],
 ["Jarvis, ative o satélite e acompanhe as nuvens","satellite"],
 ["Jarvis, mostre as chuvas registradas em Pernambuco","apac"],
 ["Jarvis, mostre a APAC em 3D","apac"],
 ["Jarvis, abra o mapa do INMET","inmet"],
 ["Jarvis, abra o centro meteorológico","radar"]
])assert.equal(parseMeteoIntent(q)?.tab,tab,q);
for(const q of ["Como funciona um radar?","Não ative o radar","O que é El Niño?","Se mostrar o satélite?","Me conte a previsão do tempo"])
 assert.equal(parseMeteoIntent(q),null,q);
const raw={features:[
 {attributes:{objectid:1,nome:"Recife",municipio:"Recife",latitude:-8.0476,longitude:-34.877,horas_24:32,ultima_leitura_data_hora:"2026-11-12 10:00"}},
 {attributes:{objectid:2,nome:"Inválida",latitude:55,longitude:60,horas_24:999}},
 {attributes:{objectid:3,nome:"Ausente",latitude:-8,longitude:-35,horas_24:null}},
 {attributes:{objectid:4,nome:"Olinda",municipio:"Olinda",latitude:-7.99,longitude:-34.85,horas_24:0}}
]};
const normalized=normalizeApacResponse(raw,{hours:24});
assert.equal(normalized.count,2);assert.equal(normalized.stations[0].value,32);
assert.equal(normalized.stations[0].lastReading,"2026-11-12 10:00");
assert.equal(normalized.type,"observed-rain-gauges");
assert.equal(normalizeApacResponse(raw,{hours:4}),null);
assert.ok(METEO_VIEWERS.radar.url.startsWith("https://sigma.cptec.inpe.br"));
assert.equal(parseMeteoIntent("Jarvis, mostre o radar em Pernambuco").tab,"radar",
  "A radar request must never silently become pluviometers");
assert.equal(normalized.stations[1].color,"#73899a","0 mm must be visibly distinct from small rain");
let checkedUrl="";
const report=await loadApacObservations({hours:24,fetchImpl:async url=>{
  checkedUrl=url;return {ok:true,json:async()=>raw};
}});
assert.equal(report.count,2);
assert.match(checkedUrl,/MapServer\/4\/query/);
assert.match(checkedUrl,/horas_24/);
const offline=await loadApacObservations({fetchImpl:async()=>{throw Error("CORS blocked");}});
assert.equal(offline.ok,false);assert.match(offline.error,/APAC/);
console.log("METEO SOURCES PASS: official origins, exact intents, APAC station validation, no fake radar, safe failure");
