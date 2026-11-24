import assert from "node:assert/strict";
import {classifyTask,chooseProviderOrder} from "../backend/smart-router.js";

const cases=[
  ["Corrija o bug do backend agora.", "coding"],
  ["Verifique o erro da API hoje.", "coding"],
  ["Desligue a TV agora.", "device"],
  ["Ajuste o volume do celular hoje.", "device"],
  ["Planeje a integração do celular com a TV.", "planning"],
  ["Pesquise notícias atuais sobre celulares.", "realtime"],
  ["Pesquise a documentação da API.", "realtime"],
  ["Qual a temperatura agora em Recife?", "realtime"],
  ["Qual a cotação atual do dólar?", "realtime"],
  ["Me conte uma história agora.", "fast"],
  ["Eita, Jarvis!", "fast"],
];
for(const [message,expected] of cases){
  const actual=classifyTask(message);
  assert.equal(actual.class,expected,message+" should route to "+expected);
}
// Preference ordering selects an appropriate configured primary without
// granting permission to execute a local action or claiming live sources.
const env={AI_PROVIDER_ORDER:"gemini,groq,cloudflare"};
assert.equal(chooseProviderOrder(env,"Corrija o bug agora.").order[0],"groq");
assert.equal(chooseProviderOrder(env,"Desligue a TV agora.").order[0],"groq");
assert.equal(chooseProviderOrder(env,"Pesquise notícias de hoje.").order[0],"gemini");
const routing=chooseProviderOrder(env,"Desligue a TV agora.");
assert.equal(routing.class,"device");
assert.equal(Object.hasOwn(routing,"authorized"),false);
console.log("STAGE B ROUTER PASS: actual research vs time adverbs, coding/device/planning preserved");
