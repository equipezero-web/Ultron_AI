import {isJarvisProjectOpinion,JARVIS_PROJECT_OPINION} from "../backend/jarvis-project-opinion.js";

/**
 * Preserve the verified core contract when a stale Worker or a legacy handler
 * returns model-generated narration for a narrow, unambiguous project question.
 * Does not modify unrelated questions. This is presentation only: no fake D1
 * success or claims that a remote action completed.
 */
let legacyOpinionRecentlyPresented=false;
const CLEAR_EXPLANATION="O J.A.R.V.I.S. já tem funções úteis, como o Neural Ring, a pesquisa e a memória. Mas os módulos ainda precisam trabalhar melhor juntos. O principal próximo passo é corrigir falhas de integração e confirmar cada capacidade em produção antes de considerá-la pronta.";
function isClarification(message){
 const q=String(message||"").normalize("NFD").replace(/[\\u0300-\\u036f]/g,"")
   .toLowerCase().replace(/[!?.,;:]+$/g,"").trim();
 return /^(?:nao entendi(?: isso que voce falou)?|pode explicar melhor|explique melhor|o que voce quis dizer)$/.test(q);
}
export function verifyProjectOpinionReply(message,data){
 if(!data||typeof data!=="object"||
    typeof data.text!=="string"||!data.text.trim()||data.error||data.ok===false)return data;
 if(isClarification(message) && legacyOpinionRecentlyPresented){
   legacyOpinionRecentlyPresented=false;
   return {...data,text:CLEAR_EXPLANATION,provider:"jarvis-local",
     providerLabel:"J.A.R.V.I.S.",model:"project-evaluation-explanation",
     correctedLegacyReply:true,visualContext:null,
     webResearch:{requested:false,used:false,sourceCount:0,sources:[]}};
 }
 if(!isJarvisProjectOpinion(message)){
   legacyOpinionRecentlyPresented=false;
   return data;
 }
 if(data.model==="project-evaluation"&&String(data.text||"").trim()===JARVIS_PROJECT_OPINION){
   legacyOpinionRecentlyPresented=false;
   return data;
 }
 legacyOpinionRecentlyPresented=true;
 return {...data,text:JARVIS_PROJECT_OPINION,provider:"jarvis-local",
  providerLabel:"J.A.R.V.I.S.",model:"project-evaluation-ui-verified",
  correctedLegacyReply:true,visualContext:null,
  webResearch:{requested:false,used:false,sourceCount:0,sources:[]}};
}
