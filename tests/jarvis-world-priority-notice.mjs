import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";
import {buildContextualPriorities,readPriorityLedger,markPriorityReviewed}
  from "../modules/jarvis-contextual-priority.js";

const moduleText=readFileSync(new URL("../modules/jarvis-contextual-alerts.js",import.meta.url),"utf8");
const events=new Map(),logs=[],published=[];
const output={appendChild(node){logs.push(String(node.textContent||""));},scrollTop:0,scrollHeight:0};
const doc={
 getElementById(id){return id==="output-box"?output:null;},
 querySelector(){return null;},
 createElement(){return {textContent:"",className:""};}
};
const storage=new Map();
const listeners={addEventListener(name,fn){events.set(name,fn);},
 dispatchEvent(event){published.push(event);},
 ULTRON_CONTINUITY:{snapshot:null},ULTRON_INTELLIGENCE:{visualData:{history:null}}};
class CustomEvent{
 constructor(type,{detail}={}){this.type=type;this.detail=detail;}
}
const withoutImport=moduleText.replace(
 'import {buildContextualPriorities,readPriorityLedger,markPriorityReviewed} from "./jarvis-contextual-priority.js";',""
);
assert.notEqual(moduleText,withoutImport,"test harness must load the whole priority runtime");
vm.runInNewContext(withoutImport,{
 window:listeners,document:doc,CustomEvent,Date,console,
 buildContextualPriorities,readPriorityLedger,markPriorityReviewed,
 localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)},
 setTimeout,clearTimeout
},{filename:"jarvis-contextual-alerts.js"});

events.get("ultron:continuity-report")({detail:{ok:false}});
events.get("ultron:intelligence-visual-update")({detail:{ok:false}});
assert.equal(logs.filter(l=>l.includes("Fontes persistidas não verificadas")).length,1,
 "two collectors cannot produce duplicate unverified-priority warnings");
assert.equal(published.filter(e=>e.type==="ultron:contextual-priorities").length,2,
 "every updated digest remains visible to the Neural Ring");
const readyTime=new Date().toISOString();
listeners.ULTRON_CONTINUITY.snapshot={
 collection:"read-only-persisted",generatedAt:readyTime,
 world:{state:"partial",checkedAt:readyTime,highlights:[],sources:[]}
};
events.get("ultron:continuity-report")({detail:{ok:true}});
listeners.ULTRON_CONTINUITY.snapshot=null;
events.get("ultron:continuity-report")({detail:{ok:false}});
assert.equal(logs.filter(l=>l.includes("Fontes persistidas não verificadas")).length,2,
 "the warning returns when verified data transitions back to unavailable");
await listeners.ULTRON_CONTEXTUAL.review();
assert.equal(logs.filter(l=>l.includes("Fontes persistidas não verificadas")).length,3,
 "explicit operator review still shows an honest warning");
console.log("WORLD PRIORITY NOTICE PASS: startup events deduplicated, status changes surfaced, manual reviews never suppressed");
