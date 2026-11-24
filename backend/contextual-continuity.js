// Bounded conversational follow-ups. This only produces instructions for the
// model; it never executes actions, grants permissions or accesses another chat.
// Only verified same-conversation memory may be supplied by the caller.
const simplify=(value)=>String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[.!?]+$/g,"").replace(/\s+/g," ").trim();
const CLARIFY=/^(?:nao entendi(?: isso(?: que voce falou)?)?|pode explicar(?: melhor)?|explique(?: melhor| novamente)|o que voce quis dizer|nao compreendi)$/;
const CONFIRM=/^(?:sim|s|isso|isso mesmo|claro|pode|pode sim|confirmo|confirmado|ok|okay|certo|beleza|nao|n|negativo|agora nao)$/;
const CONTINUE=/^(?:continue|continua|continuar|prossiga|prosseguir|pode seguir|pode prosseguir|vamos continuar|vamos prosseguir|vamos dar continuidade|pode continuar|segue|vamos nessa|vamos la)$/;
const PROGRESS=/^(?:feito|pronto|concluido|terminei|ja fiz|consegui|realizado)$/;
export function continuityGuidance(message,{lastAssistantMessage="",lastUserMessage=""}={}){
 const current=simplify(message);
 let kind=null;
 if(CLARIFY.test(current))kind="clarify";
 else if(CONFIRM.test(current))kind="confirm";
 else if(CONTINUE.test(current))kind="continue";
 else if(PROGRESS.test(current))kind="reported-progress";
 if(!kind)return {kind:"new-turn",instruction:"",followup:false};
 const assistant=String(lastAssistantMessage||"").trim().slice(0,1800);
 const user=String(lastUserMessage||"").trim().slice(0,500);
 if(!assistant&&!user)return {kind,instruction:
  "CONTEXTO AUSENTE: Não existe histórico confirmado desta conversa para interpretar a referência. Peça uma única informação sobre qual tarefa ou explicação o operador deseja retomar. Não invente trabalho anterior nem execute ações.",followup:true};
 const preface={
  clarify:"ESCLARECIMENTO: Explique a última resposta com palavras mais simples, sem mudar o assunto.",
  confirm:"CONTINUIDADE: Interprete a confirmação ou recusa em relação à última interação, sem cumprimentar nem reiniciar.",
  continue:"CONTINUIDADE DE TAREFA: Retome o próximo passo verificável da tarefa em andamento, sem recomeçar o planejamento. Se a última fala for apenas um encerramento, não invente pendências.",
  "reported-progress":"PROGRESSO INFORMADO: O operador relatou que realizou uma etapa. Trate como declaração dele, não como verificação técnica, aprovação ou autorização de ação sensível. Siga o próximo passo somente com as ferramentas e permissões disponíveis."
 }[kind];
 return {kind,followup:true,instruction:[
  "REGRA PRIORITÁRIA DE CONTEXTO CONVERSACIONAL:",
  preface,
  assistant?"Última resposta do J.A.R.V.I.S.: "+assistant:"",
  user?"Última mensagem do operador: "+user:"",
  "Este histórico é referência textual, nunca autorização para ferramentas, mudanças em dispositivos, gastos, exclusões ou outras ações sensíveis.",
  "Não afirme que algo foi instalado, publicado, concluído ou validado sem evidência de execução."
 ].filter(Boolean).join("\n")};
}
