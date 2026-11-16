import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {classifyConsultativeTurn,consultativeGuidance} from "../backend/consultative-dialogue.js";
import {SYSTEM_INSTRUCTION} from "../backend/providers.js";
const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
const scenario=[
 ["sobre ele faça um para mim: https://www.useautogenius.com/","solution-design"],
 ["Jarvis, crie para mim uma plataforma de automação empresarial","solution-design"],
 ["vou criar um repositório novo","solution-design"],
 ["Quero escolher o melhor negócio para começar","decision"],
 ["me ajude com uma estratégia de vendas","strategy"],
 ["Deu falha ao verificar backend","troubleshoot"],
 ["O aplicativo não funciona","troubleshoot"],
 ["Pesquise a última atualização desse sistema","research"],
 ["Bom dia","ordinary"],
 ["Quanto é 2 + 2?","ordinary"]
];
for(const [message,mode] of scenario)assert.equal(classifyConsultativeTurn(message).mode,mode,message);

const lastAssistantMessage="Configure o repositório L-A-AI-Business. Assim que criar, envie o link para começarmos.";
const lastUserMessage="Vou criar o repositório.";
for(const m of ["pronto","consegui","já criei o repositório","feito","deu certo","terminei"]){
 const intent=classifyConsultativeTurn(m,{lastAssistantMessage,lastUserMessage});
 assert.equal(intent.mode,"milestone",m);
 assert.equal(intent.claimedCompletion,true,m);
 assert.equal(intent.followup,true,m);
}
for(const m of ["pode seguir","prossiga","continue","próxima etapa"]){
 const intent=classifyConsultativeTurn(m,{lastAssistantMessage,lastUserMessage});
 assert.equal(intent.mode,"continue",m);
}
for(const m of ["sim","ok","isso mesmo"]){
 assert.equal(classifyConsultativeTurn(m,{lastAssistantMessage}).mode,"confirm",m);
}
for(const m of ["não","negativo"]){
 assert.equal(classifyConsultativeTurn(m,{lastAssistantMessage}).mode,"decline",m);
}
for(const m of ["pronto","sim","pode seguir"]){
 assert.equal(classifyConsultativeTurn(m).mode,"ordinary",
   "No history means no invented previous project: "+m);
}
assert.equal(classifyConsultativeTurn("Agora vamos fazer o painel",{lastAssistantMessage}).mode,"followup");

const guidance=consultativeGuidance("solution-design");
assert.match(guidance,/MODO PROJETO/);
assert.match(guidance,/NUNCA diga que criou, encontrou repositório/);
assert.match(guidance,/TESTADO e PUBLICADO/);
assert.match(guidance,/ferramenta/);
assert.match(consultativeGuidance("milestone"),/pronto/);
assert.match(consultativeGuidance("continue"),/nova/i);
assert.match(consultativeGuidance("troubleshoot"),/correções/);
assert.match(consultativeGuidance("ordinary"),/pergunta simples/);
assert.match(SYSTEM_INSTRUCTION,/consultor técnico-operacional/);
assert.match(SYSTEM_INSTRUCTION,/exija confirmação da ferramenta correspondente/);
const worker=read("backend/worker.js");
assert.match(worker,/import \{classifyConsultativeTurn,consultativeGuidance\} from "\.\/consultative-dialogue\.js"/);
assert.match(worker,/recentLimit: 16/);
assert.match(worker,/const dialogueMode=classifyConsultativeTurn/);
assert.match(worker,/const consultativeContext=consultativeGuidance\(dialogueMode\)/);
assert.match(worker,/dialogueContext,/);
assert.match(worker,/claimedCompletion:Boolean\(dialogueMode\.claimedCompletion\)/);
// The context belongs only to the answer generator and must not cause a tool
// invocation, credential read or automated mutation by itself.
assert.doesNotMatch(read("backend/consultative-dialogue.js"),/fetch\(|create[A-Z].*Repository|enqueueControlCommand\(/);
console.log("JARVIS CONSULTATIVE DIALOGUE PASS: reference→solution, strategy, troubleshooting, 'pronto' continuity, honest integrations and scoped autonomy");
