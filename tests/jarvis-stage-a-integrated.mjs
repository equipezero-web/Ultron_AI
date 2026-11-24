import assert from "node:assert/strict";
import {shouldResearchBeforeAnswer} from "../backend/web-research.js";
import {isGeneralNewsIntent} from "../backend/news-context.js";
import {chooseProviderOrder,classifyTask} from "../backend/smart-router.js";
import {buildOperationalPlan,toolPolicy} from "../backend/planner.js";
import {classifyJarvisTurn} from "../backend/jarvis-conversation-router.js";
const testCases=[
 ["Eae Jarvis?",false],["Jarvis, tudo bem?",false],
 ["O que voce acha do meu projeto?",false],
 ["Qual sua opiniao sobre isso?",false],
 ["Esse negocio ta uma marmota",false],
 ["Jarvis, pare!",false],
 ["Abra o globo",false],
 ["Pesquise fontes sobre energia solar",true],
 ["Quais sao as noticias do Brasil hoje?",true],
 ["Quando ocorreu a erupcao do Vesuvio?",true]
];
for(const [message,research] of testCases)
 assert.equal(shouldResearchBeforeAnswer(message).needed,research,message);
assert.equal(isGeneralNewsIntent("noticias"),true);
assert.equal(isGeneralNewsIntent("noticias da Argentina"),false);
assert.equal(isGeneralNewsIntent("noticias de Recife"),false);
assert.equal(isGeneralNewsIntent("noticias do Japao"),false);
assert.equal(classifyTask("Opa, Jarvis").class,"fast");
assert.equal(classifyTask("Eita, Jarvis!").class,"fast");
assert.equal(chooseProviderOrder({AI_PROVIDER_ORDER:"groq,gemini"},"eae jarvis").order[0],"groq");
for(const message of ["Eae Jarvis?","Oi, tudo bem?"]){
 const plan=buildOperationalPlan(message,{});
 assert.equal(plan.intent,"conversation");
 assert.deepEqual(plan.steps.map(x=>x.tool),[null]);
}
const policy=toolPolicy();
for(const tool of ["app.open","tv.control","notification.push"])
 assert.equal(policy[tool].level,"confirm",tool+" must not mutate a paired device without confirmation");
const device=buildOperationalPlan("ligue a tv");
assert.equal(device.intent,"device");
assert.equal(device.steps.find(x=>x.tool==="tv.control").permission,"confirm");
for(const tool of ["file.delete","purchase.execute","credentials.read","message.send"])
 assert.equal(policy[tool].level,"blocked");
assert.equal(classifyJarvisTurn("Eae Jarvis?").mayExecute,false);
console.log("STAGE A INTEGRATION PASS: routing, sources, region, provider fallback routing, gated planning");
