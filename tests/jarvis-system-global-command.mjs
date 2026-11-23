import assert from "node:assert/strict";
import {parseSystemGlobalCommand} from "../modules/jarvis-system-global-command.js";
for(const command of [
 "J.A.R.V.I.S., apresente o estado dos sistemas e abra a Inteligência Mundial no globo 3D",
 "Jarvis, mostre o status dos sistemas e abra a inteligencia global no globo 3d",
 "Ultron: exiba o diagnóstico do sistema e mostre o monitoramento mundial no globo"
]){
 const parsed=parseSystemGlobalCommand(command);
 assert.equal(parsed?.type,"system-global-composite",command);
 assert.equal(parsed?.view,"3d");
}
for(const command of [
 "Como apresento o estado dos sistemas e abro a inteligência mundial no globo 3D?",
 "Não apresente o estado dos sistemas e abra a inteligência mundial no globo 3D",
 "Jarvis, qual o estado dos sistemas?",
 "Jarvis, abra a inteligência global no globo 3D",
 "Apresente o estado dos sistemas e abra o aplicativo de mensagens"
])assert.equal(parseSystemGlobalCommand(command),null,command);
console.log("SYSTEM GLOBAL ROUTE PASS: strict compound request, negative/question guard");
