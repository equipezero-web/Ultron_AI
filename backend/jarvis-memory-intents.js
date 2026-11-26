/** Operator-scoped preference requests. Intent recognition never grants tool authority. */
export function interfacePreferenceIntent(message){
  const q=String(message||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .toLowerCase().replace(/^(?:(?:ei|ola|oi|hey)\s+)?(?:j\.?a\.?r\.?v\.?i\.?s\.?|jarvis|ultron)[,!:;\s]+/i,"")
    .replace(/[?!.,;:]+$/g,"").replace(/\s+/g," ").trim();
  const isPreference=/\bpreferencia de interface\b/.test(q);
  if(isPreference && /^(?:lembre-se de que|lembre se de que|lembre-se que|lembre que|guarde|salve|registre)\b/.test(q))
    return "store";
  if(isPreference && /^(?:qual|quais|e qual|voce lembra|lembra|o que)\b/.test(q))
    return "recall";
  if(/^(?:e qual foi|qual foi|e qual era|qual era) a preferencia que (?:eu )?(?:acabei de )?(?:informar|disser|falar)\b/.test(q))
    return "recall";
  return null;
}

/**
 * Versioned, code-backed explanation of the local architecture.
 * This is a documented source-map, NOT a live D1 inspection or proof of
 * deployed version. Narrowly answers explicit self-audit requests.
 */
export function verifiedSelfArchitectureReply(message){
  const q=String(message||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
  const self=/\b(?:jarvis|j\.?a\.?r\.?v\.?i\.?s|sua arquitetura|seu codigo|seus modulos|seu repositorio)\b/.test(q);
  const audit=/\b(?:analise|audite|verifique|identifique|inspecione|explique)\b/.test(q);
  const specifics=/\b(?:memoria d1|colunas|esquema|fallback|provedores|diagnostico|arquivos|modulos)\b/.test(q);
  if(!(self&&audit&&specifics))return null;
  return [
    "ARQUITETURA DOCUMENTADA NO CÓDIGO DO J.A.R.V.I.S. (não é inspeção ao vivo do D1 ou do deploy):",
    "MEMÓRIA — backend/memory.js define as tabelas conversations, messages e memories. Em memories, as colunas são: id, operator_id, category, content, importance, source_message_id, created_at, updated_at, last_used_at e use_count. Não existem colunas key/value/timestamp/conversation_id nessa tabela definida pelo módulo.",
    "PREFERÊNCIAS — backend/jarvis-memory-intents.js classifica pedidos de salvar e recordar. backend/memory.js usa explicitMemoryCandidate, saveExchange e readExplicitInterfacePreference; persistência e consulta são restritas a operator_id. Uma resposta de sucesso depende do recibo de gravação.",
    "PROVEDORES — backend/providers.js integra roteamento, tentativas e fallback. backend/provider-circuit-breaker.js implementa bloqueio temporário por falhas transitórias, por instância isolada do Worker, com limite máximo de 30 segundos de cooldown no código atual; não são cinco minutos nem estado global garantido.",
    "DIAGNÓSTICO — backend/provider-diagnostics.js e backend/provider-diagnostics-db.js tratam diagnósticos de provedores. backend/worker.js contém as rotas do serviço. Não afirmo que /telemetry ou /health exibem campos específicos sem conferir o roteamento correspondente.",
    "EVIDÊNCIA — as referências acima são arquivos conhecidos desta versão do projeto. Não executei uma consulta SQL ao banco desta sessão nem verifiquei os provedores ou o deploy neste pedido. O resultado em produção requer checagem explícita.",
    "Não identifiquei evidência para os nomes MemoryCore, AIOrchestrator ou StarkCore neste mapeamento; não os apresento como módulos verificados."
  ].join("\n\n");
}
