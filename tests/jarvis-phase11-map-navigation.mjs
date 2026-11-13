import assert from "node:assert/strict";

// Exercise the real Phase X/XI map controller with a mock map engine. The
// published source data still goes through contextualGeoScene validation.
const now=()=>new Date().toISOString();
let digest={
 ok:true,worldState:"healthy",generatedAt:now(),
 items:[
  {key:"g:br1",type:"cataloged",category:"earthquake",
   title:"Sismo publicado por fonte oficial",source:"USGS",
   url:"https://earthquake.usgs.gov/earthquakes/eventpage/br1",
   lat:-8.2,lng:-35.1,publishedAt:now(),representative:false},
  {key:"g:na1",type:"cataloged",category:"wildfires",
   title:"Incêndio catalogado pela NASA",source:"NASA",
   url:"https://eonet.gsfc.nasa.gov/api/v3/events/na1",
   lat:21.3,lng:125.4,publishedAt:now(),representative:true}
 ]
};
const calls={open:0,focus:0,setMode:0};
let state={visible:false,scenario:null,mode:null};
const geo={
 get state(){return {...state};},
 async open({data,view}){
  calls.open++;
  state={visible:true,scenario:data.id,mode:view};
  return {ok:true,mode:view};
 },
 async setMode(mode){
  calls.setMode++;
  if(mode==="3d")return {ok:false,error:"No WebGL"};
  state.mode=mode;return {ok:true,mode};
 },
 focusPoint(id){
  calls.focus++;
  if(!id||!state.visible)return {ok:false,error:"Map hidden"};
  return {ok:true,id};
 }
};
globalThis.window={
 ULTRON_CONTEXTUAL:{preview:()=>({...digest,generatedAt:now()})},
 ULTRON_GEO_VISUAL:geo,
 dispatchEvent:()=>{}
};
globalThis.CustomEvent=class{
 constructor(name,{detail}={}){this.type=name;this.detail=detail;}
};
globalThis.document={
 getElementById:()=>null,querySelector:()=>null
};
await import("../modules/jarvis-contextual-map.js");
const control=window.ULTRON_CONTEXTUAL_MAP;
const first=await control.open({focusKey:"g:br1",view:"2d"});
assert.equal(first.ok,true);
assert.equal(first.view,"2d");
assert.equal(calls.open,1);
assert.equal(calls.focus,1);
const second=await control.focus({focusKey:"g:na1",view:"2d"});
assert.equal(second.ok,true);
assert.equal(second.selectedPoint,"g:na1");
assert.equal(calls.open,1,"Regenerated preview timestamp must not rebuild same geo dataset");
assert.equal(calls.focus,2);
const fallback=await control.focus({focusKey:"g:br1",view:"3d"});
assert.equal(fallback.ok,true);
assert.equal(fallback.view,"2d");
assert.equal(fallback.fallback3d,true);
assert.equal(calls.open,1,"3D fallback must use existing 2D dataset");
assert.equal(calls.setMode,2,"Tried 3D then confirmed 2D");
digest={...digest,items:digest.items.map(item=>item.key==="g:na1"?{
 ...item,lat:22.1,title:"Updated verified coordinate"
}:item)};
const updated=await control.focus({focusKey:"g:na1"});
assert.equal(updated.ok,true);
assert.equal(calls.open,2,"Actual changed point must reload the verified map dataset");
assert.equal(calls.focus,4);
const prevCount=calls.focus;
const fake=await control.focus({focusKey:"g:wrong"});
assert.equal(fake.ok,false);
assert.equal(calls.focus,prevCount,"Unknown event cannot move camera");
digest={...digest,worldState:"stale"};
const stale=await control.focus({focusKey:"g:br1"});
assert.equal(stale.ok,false);
assert.equal(calls.open,2);
assert.equal(calls.focus,prevCount);
console.log("PHASE XI MAP PASS: navigate without reinitializing WebGL, 3D-to-2D fallback, source change reload and stale rejection");
