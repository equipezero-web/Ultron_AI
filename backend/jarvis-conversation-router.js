/**
 * Unified, pure intent boundary. Deterministic only for high-confidence,
 * harmless speech acts; ambiguous requests stay with conversational AI.
 * This is not an action/command dictionary and NEVER grants tool authority.
 */
const normalized=value=>String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase()
 .replace(/[!?.,;:]+/g," ").replace(/\s+/g," ").trim();
const address=text=>normalized(text).replace(/^(?:ei |hey |ola |oi )?(?:jarvis|j a r v i s|ultron)(?: |$)/,"").trim();
const names=text=>normalized(text).replace(/\b(?:jarvis|j a r v i s|ultron)\b/g,"").replace(/\s+/g," ").trim();
const SOCIAL=/^(?:(?:e ?ai|eae|ea[eê]|opa|o[il]|ola|alo|fala|salve|bom dia|boa tarde|boa noite|tudo bem|tudo bom|como vai|como voce ta|como tu ta|ta tudo bem|qual e a boa|qual a boa|beleza|blz|suave|de boa|e as novidades|firmeza|oi tudo bem|e ai tudo bem|eae tudo bem)(?: (?:meu parceiro|meu chapa|meu rei|mano|cara|amigo|por ai|contigo|com voce|com tu|meu patrao))?)$/;
const ACK=/^(?:valeu|obrigado|obrigada|vlw|tmj|show|top|massa|arretado|brigado|brigada|agradecido|ate logo|tchau|falou|ate mais)$/;
const DONT=/^(?:nao |nunca |jamais |sem |pare |parar |cancele |cancelar |stop\b)/;
const EXPLICIT_RESEARCH=/\b(?:pesquise|pesquisar|procure na web|busque na internet|consulte fontes|noticias de hoje|ultimas noticias|ultimos acontecimentos)\b/;
const ACTION=/^(?:abra|abre|abrir|feche|fecha|fechar|ative|ativar|desative|desativar|ligue|desligue|localize|localizar|mostre|mostrar|aumente|diminua|afaste|aproxime|ajuste|configure|pare|pause|continue|controle|envie|apague|exclua|mude|troque|conecte|reinicie)\b/;
const INFORMATION=/^(?:quem|quando|onde|qual|quais|quanto|quantos|quantas|como|o que|por que|porque|pra que|sera que)\b/;
export function classifyJarvisTurn(message){
 const raw=normalized(message);
 const plain=names(raw);
 if(!raw)return {kind:"empty",reason:"empty",requiresResearch:false,mayExecute:false,isSocial:false};
 if(SOCIAL.test(plain))return {kind:"social",reason:"greeting",requiresResearch:false,mayExecute:false,isSocial:true};
 if(ACK.test(plain))return {kind:"social",reason:"acknowledgement",requiresResearch:false,mayExecute:false,isSocial:true};
 if(DONT.test(address(message)))return {kind:"caution",reason:"negation-or-stop",requiresResearch:false,mayExecute:false,isSocial:false};
 if(EXPLICIT_RESEARCH.test(raw))return {kind:"research",reason:"explicit",requiresResearch:true,mayExecute:false,isSocial:false};
 if(ACTION.test(address(message)))return {kind:"operation-candidate",reason:"explicit-action",requiresResearch:false,mayExecute:false,isSocial:false};
 if(INFORMATION.test(address(message)))return {kind:"question",reason:"information",requiresResearch:null,mayExecute:false,isSocial:false};
 return {kind:"conversation",reason:"contextual",requiresResearch:null,mayExecute:false,isSocial:false};
}
export function greetingResponse(message){
 const q=names(message);
 if(/^(?:valeu|obrigad[oa]|vlw|tmj|brigad[oa]|agradecido|show|top|massa|arretado)$/.test(q))
  return "Por nada! Pode contar comigo.";
 if(/^(?:tchau|ate mais|ate logo|falou)$/.test(q))return "Até mais! Quando precisar, estou por aqui.";
 if(/\b(?:tudo bem|tudo bom|como vai|como voce ta|como tu ta|ta tudo bem|beleza|blz|suave|de boa|firmeza)\b/.test(q))
  return "Opa! Estou por aqui, pronto para conversar. E por aí, tudo certo?";
 return "E aí! Tudo certo por aí? Como posso ajudar?";
}
