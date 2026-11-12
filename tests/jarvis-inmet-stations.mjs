import assert from "node:assert/strict";
import {normalizeInmetStations,loadInmetStations,INMET_STATIONS_URL} from "../modules/jarvis-inmet-stations.js";
const data=[{CD_ESTACAO:"A001",DC_NOME:"Recife",SG_ESTADO:"PE",
   VL_LATITUDE:"-8.05",VL_LONGITUDE:"-34.88",CD_SITUACAO:"Operante"},
 {CD_ESTACAO:"A002",DC_NOME:"Olinda",SG_ESTADO:"PE",
   VL_LATITUDE:"-8.0",VL_LONGITUDE:"-34.86",CD_SITUACAO:"Pane"},
 {CD_ESTACAO:"A001",DC_NOME:"Duplicada",SG_ESTADO:"PE",
   VL_LATITUDE:"-8.06",VL_LONGITUDE:"-34.88",CD_SITUACAO:"Operante"},
 {CD_ESTACAO:"bad",DC_NOME:"Fake",SG_ESTADO:"PE",
   VL_LATITUDE:"NaN",VL_LONGITUDE:"-34.88",CD_SITUACAO:"Operante"}];
const result=normalizeInmetStations(data);
assert.equal(result.count,2);assert.equal(result.operational,1);
assert.equal(result.stations[0].name,"Recife");
assert.match(result.disclaimer,/NÃO são dados de chuva/);
assert.equal(normalizeInmetStations({}),null);
const good=await loadInmetStations({fetchImpl:async url=>{
 assert.equal(url,INMET_STATIONS_URL);return{ok:true,json:async()=>data};
}});
assert.equal(good.count,2);
const no=await loadInmetStations({fetchImpl:async()=>{throw Error("cross-site")}});
assert.equal(no.ok,false);
console.log("INMET STATIONS PASS: metadata positions, operational state, no invented rainfall, offline fallback");
