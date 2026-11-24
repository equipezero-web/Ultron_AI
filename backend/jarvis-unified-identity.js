// The public identity is one J.A.R.V.I.S. assistant. Providers are replaceable
// compute backends, not separate personalities or independently authorized agents.
const normalize=(value)=>String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/\s+/g," ").trim();
export const JARVIS_UNIFIED_IDENTITY="O J.A.R.V.I.S. é uma única inteligência artificial para o operador. Groq, Cloudflare Workers AI e Cohere são três provedores internos de processamento de linguagem: o roteador escolhe um deles por solicitação e pode recorrer aos outros em caso de falha. Eles não são três assistentes, três personalidades ou três memórias separadas. A conversa mantém a identidade J.A.R.V.I.S. e a memória de contexto autorizada no banco Cloudflare D1. O Neural Ring é a interface visual do J.A.R.V.I.S., não outra IA. Mistral, DeepSeek, Cerebras, Gemini e OpenRouter estão desativados nesta configuração. O uso de vários provedores não significa que seus modelos sejam fundidos em um único modelo; significa uma experiência unificada coordenada pelo backend.";
export function isUnifiedIdentityQuestion(message){
 const q=normalize(message).replace(/^(?:agora\s+)?(?:(?:jarvis|j\.a\.r\.v\.i\.s)[,]?\s+)?/,"");
 if(!/\b(?:ias?|inteligencias? artificiais?|provedores?|modelos? de ia|arquitetura de ia)\b/.test(q))return false;
 return /^(?:(?:explique|me explique|como funciona|fale sobre|descreva|quais sao|qual e|quantas?|voce tem|voce usa|como voce usa|por que voce usa|o que sao|o que e|me diga|agora explique|me fale)\b)/.test(q) &&
  /\b(?:suas?|seus?|voce|jarvis|j\.a\.r\.v\.i\.s)\b/.test(q);
}
export function unifiedIdentityAnswer(message){return isUnifiedIdentityQuestion(message)?JARVIS_UNIFIED_IDENTITY:null;}
