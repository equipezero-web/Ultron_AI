import assert from "node:assert/strict";
import {tokens, scoreMemory, rankMemories} from "../backend/memory-relevance.js";

const now=Date.parse("2026-11-17T12:00:00Z");
const rows=[
  {operator_id:"user-a",category:"general",content:"Prefiro ver alertas meteorológicos no globo",importance:85,updated_at:"2026-11-16T12:00:00Z",use_count:3},
  {operator_id:"user-a",category:"general",content:"Minha cor favorita é dourado",importance:90,updated_at:"2026-11-17T09:00:00Z",use_count:1},
  {operator_id:"user-a",category:"general",content:"PREFIRO VER ALERTAS METEOROLOGICOS NO GLOBO",importance:75,updated_at:"2026-11-16T12:00:00Z",use_count:0}
];
assert.deepEqual([...tokens("Alértás meteorológicos!")],["alertas","meteorologicos"]);
const result=rankMemories(rows,"Mostre alertas meteorológicos no globo",{now,limit:10});
assert.equal(result.length,2,"case-and-accent duplicates should be collapsed");
assert.match(result[0].content,/meteorológicos/);
assert.ok(result[0].retrieval.score>result[1].retrieval.score);
assert.match(result[0].retrieval.tier,/HOT|WARM|COLD/);
assert.equal(rankMemories([], "anything").length,0);
assert.equal(rankMemories(rows,"",{limit:1}).length,1);
assert.ok(scoreMemory({importance:999,content:"x"},"",now).score <= 65);
console.log("JARVIS MEMORY RELEVANCE PASS: contextual rank, tiers, duplicate collapse, bounds");
