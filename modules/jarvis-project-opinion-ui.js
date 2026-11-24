import {isJarvisProjectOpinion,JARVIS_PROJECT_OPINION} from "../backend/jarvis-project-opinion.js";

/**
 * Preserve the verified core contract when a stale Worker or a legacy handler
 * returns model-generated narration for a narrow, unambiguous project question.
 * Does not modify unrelated questions. This is presentation only: no fake D1
 * success or claims that a remote action completed.
 */
export function verifyProjectOpinionReply(message,data){
 if(!isJarvisProjectOpinion(message)||!data||typeof data!=="object")return data;
 if(data.model==="project-evaluation"&&String(data.text||"").trim()===JARVIS_PROJECT_OPINION)return data;
 return {...data,text:JARVIS_PROJECT_OPINION,provider:"jarvis-local",
  providerLabel:"J.A.R.V.I.S.",model:"project-evaluation-ui-verified",
  correctedLegacyReply:true,visualContext:null,
  webResearch:{requested:false,used:false,sourceCount:0,sources:[]}};
}
