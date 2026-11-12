import assert from "node:assert/strict";
import {analyzeApacRain,apacBand,mmLabel,apacProjection,apacInsideMainland,
 parseApacBoundary,loadApacBoundary} from "../modules/jarvis-rain-understanding.js";
const rain={ok:true,hours:3,stations:[
 {id:"1",city:"Recife",name:"Centro",lat:-8.05,lng:-34.9,value:0},
 {id:"2",city:"Olinda",name:"Praça",lat:-8,lng:-34.87,value:1.5},
 {id:"3",city:"Caruaru",name:"Aeroporto",lat:-8.2,lng:-35.98,value:18.4},
 {id:"4",city:"Petrolina",name:"Base",lat:-9.4,lng:-40.5,value:64},
 {id:"5",city:"Recife",name:"Boa Vista",lat:-8.04,lng:-34.88,value:0}
]};
const a=analyzeApacRain(rain);
assert.equal(a.count,5);assert.equal(a.withRain,3);assert.equal(a.withoutRain,2);
assert.equal(a.municipalityCount,4);assert.equal(a.maximum.city,"Petrolina");
assert.equal(a.bands.reduce((sum,x)=>sum+x.count,0),5);
assert.equal(a.bands[0].count,2);assert.equal(apacBand(0).short,"0 mm");
assert.equal(apacBand(125).short,">100 mm");
assert.equal(mmLabel(18.4),"18,4 mm");
const b=analyzeApacRain(rain,{search:"caruarú",rainOnly:true});
assert.equal(b.filtered.length,1);assert.equal(b.filtered[0].name,"Aeroporto");
const c=analyzeApacRain(rain,{search:"Recife",rainOnly:true});
assert.equal(c.filtered.length,0);
assert.ok(apacInsideMainland(rain.stations[3]));
const pt=apacProjection(-34.9,-8.05);assert.ok(pt.x>0&&pt.x<900&&pt.y>0&&pt.y<450);
assert.equal(apacInsideMainland({lng:-32.4,lat:-3.9}),false);
const geom={type:"FeatureCollection",features:[{type:"Feature",geometry:{
 type:"Polygon",coordinates:[[[-41,-9],[-40,-9],[-40,-8],[-41,-9]]]}}]};
assert.equal(parseApacBoundary(geom).length,1);
const boundary=await loadApacBoundary({fetchImpl:async url=>{
 assert.match(url,/MapServer\/8\/query/);
 return {ok:true,json:async()=>geom};
}});
assert.equal(boundary.length,1);
assert.deepEqual(await loadApacBoundary({fetchImpl:async()=>{throw Error("CORS blocked");}}),[]);
console.log("APAC UNDERSTANDING PASS: rain totals, no-rain counts, ranked cities, semantically honest 2D projection, state outline fallback");
