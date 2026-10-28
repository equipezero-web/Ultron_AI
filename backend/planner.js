const TOOL_POLICY = {
  "telemetry.read": { level: "auto", description: "Ler telemetria do próprio Ultron." },
  "memory.read": { level: "auto", description: "Consultar memória operacional autorizada." },
  "memory.write-explicit": { level: "auto", description: "Salvar memória quando o operador pede explicitamente." },
  "news.search": { level: "auto", description: "Consultar notícias e fontes públicas." },
  "research.search": { level: "auto", description: "Pesquisar contexto público para explicações." },
  "device.status": { level: "auto", description: "Consultar estado de dispositivo pareado." },
  "app.open": { level: "confirm", description: "Abrir aplicativo em dispositivo pareado." },
  "notification.push": { level: "confirm", description: "Enviar notificação ao dispositivo." },
  "tv.control": { level: "confirm", description: "Executar controle ativo na TV." },
  "message.send": { level: "blocked", description: "Envio de mensagens ainda não implementado com autorização adequada." },
  "file.delete": { level: "blocked", description: "Exclusão de arquivos não implementada." },
  "purchase.execute": { level: "blocked", description: "Compras/pagamentos não podem ser executados pelo núcleo atual." },
  "credentials.read": { level: "blocked", description: "Credenciais e segredos não são ferramentas disponíveis." }
};

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function step(id, title, tool = null, purpose = "") {
  const policy = tool ? TOOL_POLICY[tool] : null;
  return {
    id,
    title,
    purpose,
    tool,
    permission: policy?.level || "none",
    executable: Boolean(tool && policy && policy.level !== "blocked")
  };
}

function detectIntent(text) {
  if (/\b(erro|bug|corrija|conserte|nao funciona|travando|falha|diagnostique|investigue)\b/.test(text)) return "troubleshoot";
  if (/\b(noticia|pesquise|pesquisa|fontes|descubra|investigue na internet|atual)\b/.test(text)) return "research";
  if (/\b(tv|televisao|celular|telefone|dispositivo|aplicativo|volume|microfone)\b/.test(text)) return "device";
  if (/\b(planeje|plano|estrategia|projeto|arquitetura|implemente|crie sistema|construa)\b/.test(text)) return "project";
  return "general";
}

function sensitiveSignals(text) {
  const signals = [];
  if (/\b(apagar|excluir|deletar|remover arquivo)\b/.test(text)) signals.push("destructive-file-action");
  if (/\b(comprar|pagar|pagamento|pix|transferir dinheiro)\b/.test(text)) signals.push("financial-action");
  if (/\b(enviar mensagem|mandar mensagem|whatsapp|sms|email)\b/.test(text)) signals.push("external-communication");
  if (/\b(senha|password|token secreto|chave privada|credencial)\b/.test(text)) signals.push("credential-access");
  return signals;
}

export function buildOperationalPlan(message, telemetry = {}) {
  const text = normalize(message);
  const intent = detectIntent(text);
  const sensitive = sensitiveSignals(text);
  const steps = [];

  if (intent === "troubleshoot") {
    steps.push(
      step("inspect", "Inspecionar estado atual e evidências", "telemetry.read", "Entender o problema antes de agir."),
      step("context", "Consultar contexto e histórico relevante", "memory.read", "Evitar repetir tentativas e recuperar decisões anteriores."),
      step("diagnose", "Isolar a causa mais provável", null, "Comparar sintomas, estado e dependências."),
      step("act", "Executar somente correções autorizadas", null, "Selecionar ferramentas disponíveis de acordo com a causa."),
      step("verify", "Verificar o resultado após a alteração", "telemetry.read", "Confirmar que a correção realmente funcionou.")
    );
  } else if (intent === "research") {
    steps.push(
      step("search", "Buscar fontes atuais ou contexto público", "news.search", "Obter informação externa verificável."),
      step("compare", "Comparar fontes e remover contradições", null, "Priorizar dados coerentes e relevantes."),
      step("answer", "Sintetizar a resposta com limites claros", null, "Não inventar o que não foi confirmado.")
    );
  } else if (intent === "device") {
    steps.push(
      step("status", "Confirmar dispositivo e estado atual", "device.status", "Evitar enviar comando ao dispositivo errado ou offline."),
      step("select", "Selecionar a ação compatível", null, "Mapear a intenção para uma ferramenta autorizada."),
      step("control", "Executar controle somente com autorização adequada", "tv.control", "Ações ativas em dispositivos exigem permissão."),
      step("verify", "Confirmar resultado do comando", "device.status", "Verificar se a alteração ocorreu.")
    );
  } else if (intent === "project") {
    steps.push(
      step("context", "Recuperar objetivo, memória e estado atual", "memory.read", "Preservar continuidade do projeto."),
      step("decompose", "Dividir objetivo em etapas verificáveis", null, "Evitar executar mudanças grandes de uma vez."),
      step("execute", "Executar cada etapa apenas com ferramentas autorizadas", null, "Aplicar mudanças em sequência controlada."),
      step("verify", "Testar cada resultado antes de avançar", "telemetry.read", "Detectar regressões cedo."),
      step("report", "Consolidar o estado final e pendências", null, "Mostrar claramente o que foi concluído.")
    );
  } else {
    steps.push(
      step("context", "Usar memória e telemetria disponíveis", "memory.read", "Responder com continuidade e estado real."),
      step("reason", "Analisar a solicitação", null, "Escolher a resposta ou próxima ferramenta adequada."),
      step("respond", "Responder ou executar apenas o que estiver autorizado", null, "Manter controle do operador.")
    );
  }

  if (sensitive.includes("destructive-file-action")) {
    steps.push(step("blocked-file-delete", "Bloquear exclusão automática de arquivos", "file.delete", "Ação destrutiva não implementada."));
  }
  if (sensitive.includes("financial-action")) {
    steps.push(step("blocked-purchase", "Bloquear execução financeira automática", "purchase.execute", "Pagamentos exigem fluxo dedicado de alta segurança."));
  }
  if (sensitive.includes("external-communication")) {
    steps.push(step("blocked-message", "Não enviar comunicação externa automaticamente", "message.send", "Envio de mensagens ainda exige integração e autorização próprias."));
  }
  if (sensitive.includes("credential-access")) {
    steps.push(step("blocked-credentials", "Recusar leitura de credenciais", "credentials.read", "Segredos não devem ser expostos ao núcleo conversacional."));
  }

  return {
    version: "1.0",
    intent,
    complex: steps.length >= 4 || text.split(" ").length >= 35,
    sensitiveSignals: sensitive,
    steps,
    policy: {
      auto: "Observação, memória e pesquisa de baixo risco.",
      confirm: "Ações que alteram dispositivos ou enviam algo externamente.",
      blocked: "Ações destrutivas, financeiras ou acesso a segredos sem fluxo seguro dedicado."
    },
    telemetryAvailable: Boolean(telemetry && Object.keys(telemetry).length)
  };
}

export function toolPolicy() {
  return TOOL_POLICY;
}
