// Phase 1 (1/3): a deterministic, testable front door for voice and typed requests.
// Semantic planning is allowed only after this classifier, never for text retrieved from the web.
export function normalizeIntent(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/\s+/g, " ").trim()
    .replace(/^(?:(?:ei|ola|hey)\s+)?(?:jarvis|j\.a\.r\.v\.i\.s\.?|ultron)[,!:;\s]+/, "")
    .replace(/^(?:por favor[,;\s]+|eu quero que voce\s+|quero que voce\s+)+/, "")
    .trim();
}
const EXPLICIT_SEQUENCE = /\s*,?\s+(?:e depois|depois|e em seguida|em seguida|e entao|e na sequencia|na sequencia)\s+|\s*;\s*/i;
const ACTION_START = /^(?:(?:pode|consegue)\s+)?(?:abra|abrir|ative|ativar|desative|desativar|mostre|mostrar|feche|fechar|oculte|esconda|centralize|centralizar|resete|aproxime|afaste|aumente|diminua|atualize|verifique|consulte|liste|localize|encontre|ache|procure|pesquise|explore|analise|investigue|compare|foque|focar|foca|ajuste|configure|mude|execute|reinicie|suspenda|ligue|desligue|crie|gere|construa|simule|desenhe|retorne|volte)\b/;
const QUESTION_START = /^(?:o que|quem|quando|onde|qual|quais|quanto|quantos|quantas|por que|porque|como|o que significa|o que aconteceu|tem alguma|ha alguma|existe|sera que)\b/;
const DENIAL_START = /^(?:nao|nunca|jamais|se |e se |caso |imagine |suponha |hipoteticamente |por que |porque )/;
const SENSITIVE = /\b(?:senha|senhas|password|token|cpf|chave secreta|api[_ -]?key|credenciais|meu saldo|minha conta|meus pedidos|meus clientes|dados privados|dados pessoais)\b/i;
export function isPrivateTurn(value) { return SENSITIVE.test(normalizeIntent(value)); }
export function splitOperatorSteps(value, maximum = 6) {
 const input = String(value || "").trim();
 const pieces = input.split(EXPLICIT_SEQUENCE).map(x=>x.trim().replace(/^[,;]+|[,;]+$/g,"").trim()).filter(Boolean);
 // "O que aconteceu depois da chuva?" is one question, not a sequence.
 // Only split when the following clause begins with a real instruction.
 const actionable=pieces.length>1 && pieces.slice(1).every(part=>
   ACTION_START.test(normalizeIntent(part).replace(/^(?:(?:e|agora|entao|me)\s+)+/,"")));
 return actionable?pieces.slice(0,maximum):[input];
}
export function classifyOperatorTurn(value){
 const normalized=normalizeIntent(value).replace(/[.!?]+$/,"").trim();
 const pieces=splitOperatorSteps(value);
 const denied=DENIAL_START.test(normalized);
 const question=QUESTION_START.test(normalized);
 const referential=/^(?:agora\b|e\s+(?:no|na|em|la|ali|isso|ele|ela|quanto|como|sobre)\b|compare\s+com\b|foque\b|foca\b)/.test(normalized);
 const action=!denied&&!question&&ACTION_START.test(normalized);
 const unsupportedVisual=action&&/\b(?:simulacao|simular|simule|visualizacao 2d|visualizacao 3d|mapa de calor|crie .*\b(?:2d|3d))\b/.test(normalized);
 return {
   kind:denied?"negated":question?"question":action?"command":referential?"follow-up":"conversation",
   action,question,referential,compound:pieces.length>1,parts:pieces,
   unsupportedVisual,private:isPrivateTurn(value)
 };
}
