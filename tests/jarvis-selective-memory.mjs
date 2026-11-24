import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {selectMemoriesForTurn,rankMemories} from "../backend/memory-relevance.js";
const rows=[
 {content:"Minha cor favorita é dourado",importance:100,updated_at:"2026-11-24"},
 {content:"Prefiro visualizar meteorologia no globo em Recife",importance:65,updated_at:"2026-11-23"},
 {content:"Tenho preferência por notícias do Brasil",importance:70,updated_at:"2026-11-20"}
];
assert.equal(selectMemoriesForTurn(rows,"Que horas são em Tóquio?").length,0,
 "Unrelated memory must not contaminate a factual answer");
assert.equal(selectMemoriesForTurn(rows,"Eae, Jarvis?").length,0,
 "Small talk must not load past projects");
const weather=selectMemoriesForTurn(rows,"Quero ver meteorologia no globo");
assert.equal(weather.length,1);
assert.match(weather[0].content,/meteorologia/);
assert.equal(selectMemoriesForTurn(rows,"minhas preferências").length,3,
 "Explicit request for preferences can see saved memories");
assert.equal(rankMemories(rows,"assunto sem correspondencia",{limit:1}).length,1,
 "Legacy administrative ranking remains backward-compatible");
const memory=readFileSync(new URL("../backend/memory.js",import.meta.url),"utf8");
assert.match(memory,/selectMemoriesForTurn\(memoryResult\?\.results/);
console.log("SELECTIVE MEMORY PASS: topical recall without unrelated D1 injection");
