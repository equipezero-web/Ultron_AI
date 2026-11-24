import {JARVIS_CAPABILITIES,JARVIS_AUTONOMY} from "./jarvis-capabilities.js";
import {providerCircuitBreaker} from "./provider-circuit-breaker.js";
import {providerDiagnostics} from "./provider-diagnostics.js";
import {persistProviderAttempts} from "./provider-diagnostics-db.js";
export const SYSTEM_INSTRUCTION = `
Você é J.A.R.V.I.S., o núcleo conversacional deste sistema.

Responda sempre em português do Brasil.
No modo de manutenção atual, voz, microfone, reconhecimento de voz e TTS estão DESATIVADOS. Não afirme que áudio está ativo ou que está ouvindo o operador.
Seja objetivo, técnico, claro e útil.
Fale de forma curta, natural e direta.
Em perguntas simples, responda em uma ou duas frases.
Quando o operador perguntar "o que achou do nosso projeto" dentro deste aplicativo, "nosso projeto" é o J.A.R.V.I.S./Ultron_AI salvo se a conversa atual indicar outro. Responda com uma avaliação real das funcionalidades, pontos positivos e problemas de integração conhecidos. Não alegue que desconhece o próprio projeto nem cite telemetria como introdução.
Se disser "não entendi isso que você falou", explique novamente a sua fala anterior em linguagem mais simples; não explique a pergunta do operador e não peça para ele repetir tudo se a resposta anterior foi fornecida.

Não inicie respostas com saudações, nome do operador ou apresentação pessoal, exceto quando a mensagem atual for uma saudação. Não diga "com base na telemetria disponível" nem repita o pedido antes de responder. Evite introduções desnecessárias e repetições.
Em projetos, estratégias, investigações, diagnósticos e decisões, forneça detalhes suficientes para uma solução utilizável mesmo que o operador não peça uma resposta longa. Para perguntas simples, mantenha concisão.

Você é um assistente de software integrado ao sistema J.A.R.V.I.S. Seu conhecimento persistente de produto é o catálogo abaixo; ele descreve funções implementadas, não garante conexão ativa.\n${JARVIS_CAPABILITIES.map(([name,description])=>name+': '+description).join('\n')}\n${JARVIS_AUTONOMY}\nAo responder sobre suas capacidades, inclua os módulos reais (não apenas pesquisa e notícias). Não ofereça localização privada de pessoas, telefones ou e-mails pessoais. Não apresente mídia irrelevante em perguntas simples.
A telemetria enviada junto com a mensagem pode incluir systemCapabilities. Use esse objeto como a fonte de verdade sobre as capacidades realmente ativas do sistema.
Se systemCapabilities.tts estiver true, o JARVIS possui saída de voz TTS ativa; se ttsProvider estiver presente, informe esse provedor corretamente quando perguntado.
Se systemCapabilities.visualContext estiver true, o JARVIS possui painel de contexto visual integrado.
Se systemCapabilities.deviceBridge estiver true, o JARVIS possui Device Bridge conectado ao backend.
Nunca diga que uma capacidade está ausente quando a telemetria indicar que ela está ativa.
Também não alegue controlar dispositivos, câmeras, sensores ou ações que a telemetria não confirme como conectados.
Telemetria emocional é apenas uma estimativa local de interface; nunca trate como diagnóstico médico, psicológico ou biométrico.
Não invente dados que não foram recebidos.
Se a pergunta exigir informação externa ou atual, use os resultados de pesquisa fornecidos pelo backend e responda diretamente com as fontes. Pesquise qualquer assunto público solicitado pelo operador, sem restringir por país, categoria ou assunto. Identifique a entidade e o que foi perguntado; responda à questão específica e mantenha o tema nas perguntas de continuidade. A prioridade Brasil se aplica apenas a boletins gerais de notícias. Não transforme perguntas específicas em boletins gerais.
Nunca pergunte "quer que eu pesquise?", "deseja que eu consulte?" ou solicite autorização para pesquisar fatos públicos: a busca deve acontecer automaticamente no servidor.
Em pedidos de criação ou de estratégia de negócios, atue como consultor técnico-operacional: descubra o objetivo, proponha solução independente, avalie viabilidade e custos, priorize MVP e conecte cada passo aos requisitos do operador. Quando já existir um projeto em andamento, continue de onde parou sem refazer o planejamento.
Uma resposta de "pronto", "consegui", "já criei" ou "pode seguir" retoma a etapa anterior, NÃO comprova que uma integração esteja conectada. Para dizer que achou ou alterou um repositório, executou uma ferramenta, fez deploy, validou dados ou acessou um serviço, exija confirmação da ferramenta correspondente. Se não houver acesso real, diga isso claramente e solicite só o identificador indispensável.
Empregue autonomia somente nas ferramentas e permissões reais. Separe planejamento, implementação e validação. Nunca invente sucesso, valores, fontes, permissões, eventos ou capacidades. Não execute operações sensíveis apenas por confirmação genérica.

Quando não houver fontes verificáveis disponíveis, informe objetivamente a limitação sem afirmar que pesquisou nem inventar dados.
Para perguntas gerais sobre notícias ou novidades de hoje, comece pelos acontecimentos relevantes do Brasil e depois mencione somente acontecimentos internacionais importantes. Respeite a data das fontes e não apresente uma manchete antiga como notícia de hoje. Para perguntas específicas sobre outro país, responda diretamente sobre aquele país; não desvie para o Brasil. Para notícias, use primeiro um parágrafo curto iniciado por 'Introdução:', resumindo os temas e o contexto. Depois, para cada notícia, em linhas separadas, use 'Título:' e 'Descrição:', na mesma ordem da introdução. Cada descrição deve explicar somente a notícia correspondente, com fatos, data e fonte confirmados. Quando houver detalhes recuperados, use dois a quatro períodos concretos sobre o que aconteceu, onde/quando, quem foi envolvido, consequências e próximos passos conhecidos; não repita apenas o título. Não invente detalhes se a fonte só trouxer a manchete. Em pedidos de mapas e simulações, não afirme ter calculado risco geográfico ou produzido previsão meteorológica numérica sem dados oficiais validados; diferencie quadros observados, previsões sazonais qualitativas e animações didáticas. As camadas regionais no globo são informativas, não alertas por município. Não exponha etapas internas de pesquisa na resposta final. Priorize resposta imediata e clara.
`;

const DEFAULT_PROVIDER_ORDER = [
  "gemini",
  "groq",
  "openrouter",
  "cloudflare",
  "cohere"
];

const PROVIDER_LABELS = {
  gemini: "Gemini",
  groq: "Groq",
  openrouter: "OpenRouter",
  cloudflare: "Cloudflare Workers AI",
  cohere: "Cohere"
};

export class ProviderGatewayError extends Error {
  constructor(message, attempts = []) {
    super(message);
    this.name = "ProviderGatewayError";
    this.status = 503;
    this.attempts = attempts;
  }
}

function providerOrder(env, status) {
  const preferred = String(env.AI_PROVIDER_ORDER || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter((item) => DEFAULT_PROVIDER_ORDER.includes(item));

  // AI_PROVIDER_ORDER specifies preference, not an allowlist. If all preferred
  // providers fail, try other *configured* providers instead of reporting total
  // outage while a healthy backup exists. Never attempt unconfigured backups.
  const ordered = [...new Set(preferred.length ? preferred : DEFAULT_PROVIDER_ORDER)];
  for (const provider of DEFAULT_PROVIDER_ORDER) {
    if (status[provider]?.configured && !ordered.includes(provider)) {
      ordered.push(provider);
    }
  }
  return ordered;
}

function compactError(error) {
  return String(error?.message || error || "erro desconhecido")
    .replace(/\s+/g, " ")
    .slice(0, 280);
}

function promptFrom(message, telemetry) {
  // Telemetry is operational metadata, NOT conversational history. Exposing
  // the whole snapshot to the model makes it repeat past questions and say
  // "com base na telemetria" for unrelated ordinary conversation.
  const currentTurn=String(message||"").split("MENSAGEM ATUAL DO OPERADOR:\n").pop();
  const needsDiagnostics=/(?:telemetria|estado do sistema|status (?:do|dos|da)|provedores? de ia|diagnostico|diagnóstico|modulos ativos|módulos ativos|capacidades ativas)/i.test(currentTurn);
  return needsDiagnostics
    ? ["Mensagem do operador:",message,"","Estado técnico solicitado:",JSON.stringify({
        systemCapabilities:telemetry?.systemCapabilities||{},
        centralCapturedAt:telemetry?.centralCapturedAt||null
      })].join("\n")
    : ["Mensagem do operador:",message].join("\n");
}

function chatMessages(message, telemetry) {
  return [
    { role: "system", content: SYSTEM_INSTRUCTION },
    { role: "user", content: promptFrom(message, telemetry) }
  ];
}

function buildGroundedTelemetry(env, telemetry = {}, aiBinding = null) {
  return {
    ...(telemetry || {}),
    systemCapabilities: {
      ...(telemetry?.systemCapabilities || {}),
      // Credentials mean "configured", not "actively speaking".
      // Operator-requested text-only maintenance has precedence over secrets.
      tts: false,
      ttsProvider: null,
      visualContext: true,
      liveNews: true,
      visualResearch: Boolean(env.SERPER_API_KEY),
      googleSearch: Boolean(env.SERPER_API_KEY),
      memory: Boolean(env.ULTRON_DB),
      deviceBridge: Boolean(env.ULTRON_DB),
      aiGateway: true,
      cloudflareAi: Boolean(
        (aiBinding && typeof aiBinding.run === "function") ||
          (env.CLOUDFLARE_AI_API_TOKEN && env.CLOUDFLARE_ACCOUNT_ID)
      )
    }
  };
}

async function fetchJson(url, options = {}, timeoutMs = 12000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });

    const raw = await response.text();
    let data = null;

    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {
      data = { raw };
    }

    if (!response.ok) {
      const message =
        data?.error?.message ||
        data?.message ||
        data?.raw ||
        `HTTP ${response.status}`;

      const error = new Error(String(message).slice(0, 500));
      error.status = response.status;
      // Safe structured metadata, without exposing upstream error bodies.
      const retryAfter = response.headers.get("retry-after");
      if (retryAfter) {
        const seconds = /^\d+$/.test(retryAfter.trim())
          ? Number(retryAfter.trim())
          : (Date.parse(retryAfter) - Date.now()) / 1000;
        if (Number.isFinite(seconds) && seconds > 0)
          error.retryAfterSeconds = Math.min(86400, Math.ceil(seconds));
      }
      throw error;
    }

    return data;
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeText(value) {
  if (typeof value === "string") {
    return value.trim();
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === "string") return item;
        return item?.text || item?.content || "";
      })
      .join("")
      .trim();
  }

  return "";
}

async function callGemini(env, message, telemetry) {
  const model = env.GEMINI_MODEL || "gemini-3.8-flash";
  const data = await fetchJson(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": env.GEMINI_API_KEY
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: SYSTEM_INSTRUCTION }]
        },
        contents: [
          {
            role: "user",
            parts: [{ text: promptFrom(message, telemetry) }]
          }
        ],
        generationConfig: {
          temperature: 0.45,
          maxOutputTokens: 220
        }
      })
    }
  );

  const text = normalizeText(
    data?.candidates?.[0]?.content?.parts?.map((part) => part?.text || "")
  );

  if (!text) throw new Error("Gemini não retornou texto.");
  return { text, model };
}

async function callGroq(env, message, telemetry) {
  const model = env.GROQ_MODEL || "openai/gpt-oss-20b";
  const data = await fetchJson(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.GROQ_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        messages: chatMessages(message, telemetry),
        temperature: 0.45,
        max_completion_tokens: 220
      })
    }
  );

  const text = normalizeText(data?.choices?.[0]?.message?.content);
  if (!text) throw new Error("Groq não retornou texto.");
  return { text, model };
}

async function callOpenRouter(env, message, telemetry) {
  const model = env.OPENROUTER_MODEL || "openrouter/free";
  const headers = {
    Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
    "Content-Type": "application/json",
    "X-Title": "JARVIS AI"
  };

  if (env.PUBLIC_APP_URL) {
    headers["HTTP-Referer"] = env.PUBLIC_APP_URL;
  }

  const data = await fetchJson(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        model,
        messages: chatMessages(message, telemetry),
        temperature: 0.45,
        max_tokens: 220
      })
    }
  );

  const text = normalizeText(data?.choices?.[0]?.message?.content);
  if (!text) throw new Error("OpenRouter não retornou texto.");
  return { text, model };
}

function cloudflareModelPath(model) {
  return String(model)
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
}

function extractCloudflareText(data) {
  return normalizeText(
    data?.response ??
      data?.result?.response ??
      data?.result?.text ??
      data?.text
  );
}

// Workers AI bindings do not expose a fetch AbortSignal. Bound their wait so
// a stalled binding cannot indefinitely prevent the configured AI fallback.
// This is a response deadline, not a claim that remote inference was cancelled.
async function withBindingDeadline(task, timeoutMs = 9000) {
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(task),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("Cloudflare Workers AI excedeu o prazo de resposta.")), timeoutMs);
      })
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function callCloudflare(env, message, telemetry, aiBinding, timeoutMs = 9000) {
  const model =
    env.CLOUDFLARE_AI_MODEL ||
    "@cf/meta/llama-3.1-8b-instruct-fp8-fast";

  const input = {
    messages: chatMessages(message, telemetry),
    temperature: 0.45,
    max_tokens: 220
  };

  if (aiBinding && typeof aiBinding.run === "function") {
    const data = await withBindingDeadline(() => aiBinding.run(model, input), timeoutMs);
    const text = extractCloudflareText(data);

    if (!text) {
      throw new Error("Cloudflare Workers AI não retornou texto.");
    }

    return { text, model };
  }

  const accountId = env.CLOUDFLARE_ACCOUNT_ID;
  const token = env.CLOUDFLARE_AI_API_TOKEN;

  const data = await fetchJson(
    `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ai/run/${cloudflareModelPath(model)}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(input)
    }
  );

  const text = extractCloudflareText(data);
  if (!text) throw new Error("Cloudflare Workers AI não retornou texto.");
  return { text, model };
}

async function callCohere(env, message, telemetry) {
  const model = env.COHERE_MODEL || "command-a-plus-05-2026";
  const data = await fetchJson(
    "https://api.cohere.com/v2/chat",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.COHERE_API_KEY}`,
        "Content-Type": "application/json",
        "X-Client-Name": "JARVIS AI"
      },
      body: JSON.stringify({
        model,
        messages: chatMessages(message, telemetry),
        temperature: 0.45
      })
    }
  );

  const text = normalizeText(data?.message?.content);
  if (!text) throw new Error("Cohere não retornou texto.");
  return { text, model };
}

// An isolated, low-volume probe; no fallback and no circuit-breaker side effects.
// The caller must enforce authentication and the shared D1 rate limit.
export async function probeSingleProvider(env, provider){
 const question="Responda apenas OK.";
 const telemetry={};
 let result;
 switch(provider){
  case "gemini": result=await callGemini(env,question,telemetry); break;
  case "groq": result=await callGroq(env,question,telemetry); break;
  case "openrouter": result=await callOpenRouter(env,question,telemetry); break;
  case "cloudflare": result=await callCloudflare(env,question,telemetry,env.AI,9000); break;
  case "cohere": result=await callCohere(env,question,telemetry); break;
  default: throw new Error("invalid-provider");
 }
 if(!result?.text)throw new Error("empty-response");
 return {ok:true};
}

export function getProviderStatus(env, aiBinding = null) {
  return {
    gemini: {
      label: PROVIDER_LABELS.gemini,
      configured: Boolean(env.GEMINI_API_KEY),
      model: env.GEMINI_MODEL || "gemini-3.8-flash"
    },
    groq: {
      label: PROVIDER_LABELS.groq,
      configured: Boolean(env.GROQ_API_KEY),
      model: env.GROQ_MODEL || "openai/gpt-oss-20b"
    },
    openrouter: {
      label: PROVIDER_LABELS.openrouter,
      configured: Boolean(env.OPENROUTER_API_KEY),
      model: env.OPENROUTER_MODEL || "openrouter/free"
    },
    cloudflare: {
      label: PROVIDER_LABELS.cloudflare,
      configured: Boolean(
        (aiBinding && typeof aiBinding.run === "function") ||
          (env.CLOUDFLARE_AI_API_TOKEN && env.CLOUDFLARE_ACCOUNT_ID)
      ),
      model:
        env.CLOUDFLARE_AI_MODEL ||
        "@cf/meta/llama-3.1-8b-instruct-fp8-fast"
    },
    cohere: {
      label: PROVIDER_LABELS.cohere,
      configured: Boolean(env.COHERE_API_KEY),
      model: env.COHERE_MODEL || "command-a-plus-05-2026"
    }
  };
}

export async function generateWithProviders(
  env,
  message,
  telemetry = {},
  options = {}
) {
  const aiBinding = options.aiBinding || null;
  const status = getProviderStatus(env, aiBinding);
  const groundedTelemetry = buildGroundedTelemetry(env, telemetry, aiBinding);
  const attempts = [];
  const recordAttempt = (attempt) => {
    attempts.push(attempt);
    providerDiagnostics.record(attempt);
  };
  const breaker = options.circuitBreaker || providerCircuitBreaker;
  const ordered = providerOrder(env, status);
  // Only skip cooled providers when at least one configured non-cooled
  // alternative exists. Never strand the final configured provider.
  const healthyAlternatives = ordered.some((name) =>
    status[name]?.configured && !breaker.isCooling(name));

  for (const provider of ordered) {
    if (!status[provider]?.configured) {
      recordAttempt({
        provider,
        status: "skipped",
        reason: "não configurado"
      });
      continue;
    }
    if (healthyAlternatives && breaker.isCooling(provider)) {
      recordAttempt({
        provider,
        status: "skipped",
        reason: "falhas transitórias recentes; aguardando recuperação"
      });
      continue;
    }

    const startedAt = Date.now();
    try {
      let result;

      switch (provider) {
        case "gemini":
          result = await callGemini(env, message, groundedTelemetry);
          break;
        case "groq":
          result = await callGroq(env, message, groundedTelemetry);
          break;
        case "openrouter":
          result = await callOpenRouter(env, message, groundedTelemetry);
          break;
        case "cloudflare":
          result = await callCloudflare(
            env,
            message,
            groundedTelemetry,
            aiBinding,
            Number.isFinite(options.bindingTimeoutMs)
              ? Math.max(50, Math.min(9000, options.bindingTimeoutMs))
              : 9000
          );
          break;
        case "cohere":
          result = await callCohere(env, message, groundedTelemetry);
          break;
        default:
          continue;
      }

      breaker.onSuccess(provider);
      recordAttempt({
        provider,
        status: "success",
        model: result.model,
        durationMs: Date.now() - startedAt
      });

      await persistProviderAttempts(env, attempts);
      return {
        text: result.text,
        provider,
        providerLabel: PROVIDER_LABELS[provider],
        model: result.model,
        attempts
      };
    } catch (error) {
      breaker.onFailure(provider, error);
      console.error(
        `[JARVIS AI] ${PROVIDER_LABELS[provider]} falhou:`,
        compactError(error)
      );

      recordAttempt({
        provider,
        status: "failed",
        durationMs: Date.now() - startedAt,
        error: compactError(error)
      });
    }
  }

  await persistProviderAttempts(env, attempts);
  throw new ProviderGatewayError(
    "Nenhum provedor de IA conseguiu responder.",
    attempts
  );
}
