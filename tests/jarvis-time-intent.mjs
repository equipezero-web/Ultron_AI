import assert from "node:assert/strict";
import {isClockQuestion,clockAnswer} from "../backend/jarvis-time-intent.js";

const instant=new Date("2026-11-24T14:26:00.000Z");
for(const message of [
  "Que horas são?", "Jarvis, que horas são agora?",
  "Qual é o horário de Brasília?", "Qual o horário atual?",
  "Horário agora", "Hora oficial de Brasília"
]){
 assert.equal(isClockQuestion(message),true,message);
 const reply=clockAnswer(message,instant);
 assert.match(reply.text,/11:26:00/);
 assert.match(reply.text,/24 de novembro de 2026/);
 assert.equal(reply.clock.official,false);
 assert.equal(reply.clock.timezone,"America/Sao_Paulo");
 assert.equal(reply.provider,"jarvis-local");
 assert.equal(reply.webResearch.used,false);
}
const withDevice=clockAnswer("Que horas são? Meu notebook mostra 11:26.",instant);
assert.match(withDevice.text,/Uma diferença entre os horários não comprova, por si só, problema no relógio do seu dispositivo\./);
assert.doesNotMatch(withDevice.text,/sincroniz(e|ar) seu notebook|está errado|incorreto/i);
for(const message of ["Que horas abre a loja?", "Quantas horas de viagem?", "Ajuste o alarme", "Qual o fuso horário de Tóquio?"]){
 assert.equal(isClockQuestion(message),false,message);
 assert.equal(clockAnswer(message,instant),null);
}
console.log("CLOCK PASS: server observation, no stale-source claims, no accusation of device drift");
