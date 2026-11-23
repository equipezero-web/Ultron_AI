import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {dualDisplaySettings} from "../modules/jarvis-dual-display.js";
assert.deepEqual(dualDisplaySettings(),{split:50,ringSide:"left"});
assert.deepEqual(dualDisplaySettings({split:20,ringSide:"right"}),{split:30,ringSide:"right"});
assert.deepEqual(dualDisplaySettings({split:99,ringSide:"left"}),{split:70,ringSide:"left"});
assert.deepEqual(dualDisplaySettings({split:63.7,ringSide:"unknown"}),{split:64,ringSide:"left"});
const css=readFileSync(new URL("../modules/jarvis-dual-display.css",import.meta.url),"utf8");
assert.match(css,/min-width:1500px/);
assert.match(css,/ultron-dual-display/);
assert.match(css,/dual-ring-right/);
assert.match(css,/grid-row:2 \/ 4/);
const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
assert.match(html,/jarvis-dual-display\.css/);
assert.match(html,/jarvis-dual-display\.js/);
const {parseLocalCommand}=await import("../modules/jarvis-local-commands.js");
for(const phrase of ["modo duas telas","Jarvis, ativar modo duas telas","abra duas telas","dois monitores","tela dupla"])
 assert.deepEqual(parseLocalCommand(phrase),{type:"dual-display",action:"activate"},phrase);
for(const phrase of ["desativar modo duas telas","modo normal"])
 assert.deepEqual(parseLocalCommand(phrase),{type:"dual-display",action:"disable"},phrase);
assert.deepEqual(parseLocalCommand("inverter lado do neural ring"),{type:"dual-display",action:"swap"});
for(const phrase of ["como ativar modo duas telas?","não ativar modo duas telas","dois computadores"])
 assert.notEqual(parseLocalCommand(phrase)?.type,"dual-display",phrase);
console.log("DUAL DISPLAY PASS: bounded split, optional mode, adaptive layout, original UI preserved");
