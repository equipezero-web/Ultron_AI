export const SYSTEM_INSTRUCTION = `
Você é o núcleo conversacional do sistema ULTRON AI.

Responda sempre em português do Brasil.
Seja objetivo, técnico, claro e útil.
Fale de forma curta, natural e direta.
Em perguntas simples, responda em uma ou duas frases.
Evite cumprimentos longos, introduções, listas desnecessárias e repetições.
Só dê respostas detalhadas quando o operador pedir detalhes.

Você é um assistente de software integrado ao sistema ULTRON.
A telemetria enviada junto com a mensagem pode incluir systemCapabilities. Use esse objeto como a fonte de verdade sobre as capacidades realmente ativas do sistema.
Se systemCapabilities.tts estiver true, o Ultron possui saída de voz TTS ativa; se ttsProvider estiver presente, informe esse provedor corretamente quando perguntado.
Se systemCapabilities.visualContext estiver true, o Ultron possui painel de contexto visual integrado.
Se systemCapabilities.deviceBridge estiver true, o Ultron possui Device Bridge conectado ao backend.
Nunca diga que uma capacidade está ausente quando a telemetria indicar que ela está ativa.
Também não alegue controlar dispositivos, câmeras, sensores ou ações que a telemetria não confirme como conectados.
Telemetria emocional é apenas uma estimativa local de interface; nunca trate como diagnóstico médico, psicológico ou biométrico.
Não invente dados que não foram recebidos.
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

function providerOrder(env) {
  const configured = String(env.AI_PROVIDER_ORDER || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter((item) => DEFAULT_PROVIDER_ORDER.includes(item));

  return configured.length
    ? [...new Set(configured)]
    : DEFAULT_PROVIDER_ORDER;
}

function compactError(error) {
  return String(error?.message || error || "erro desconhecido")
    .replace(/\s+/g, " ")
    .slice(0, 280);
}

function promptFrom(message, telemetry) {
  return [
    "Mensagem do operador:",
    message,
    "",
    "Telemetria local disponível:",
    JSON.stringify(telemetry || {})
  ].join("\n");
}

function chatMessages(message, telemetry) {
  return [
    { role: "system", content: SYSTEM_INSTRUCTION },
    { role: "user", content: promptFrom(message, telemetry) }
  ];
}

async function fetchJson(url, options = {}, timeoutMs = 30000) {
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
    "X-Title": "ULTRON AI"
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

async function callCloudflare(env, message, telemetry, aiBinding) {
  const model =
    env.CLOUDFLARE_AI_MODEL ||
    "@cf/meta/llama-3.1-8b-instruct-fp8-fast";

  const input = {
    messages: chatMessages(message, telemetry),
    temperature: 0.45,
    max_tokens: 220
  };

  if (aiBinding && typeof aiBinding.run === "function") {
    const data = await aiBinding.run(model, input);
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
        "X-Client-Name": "ULTRON AI"
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
  const attempts = [];

  for (const provider of providerOrder(env)) {
    if (!status[provider]?.configured) {
      attempts.push({
        provider,
        status: "skipped",
        reason: "não configurado"
      });
      continue;
    }

    try {
      let result;

      switch (provider) {
        case "gemini":
          result = await callGemini(env, message, telemetry);
          break;
        case "groq":
          result = await callGroq(env, message, telemetry);
          break;
        case "openrouter":
          result = await callOpenRouter(env, message, telemetry);
          break;
        case "cloudflare":
          result = await callCloudflare(
            env,
            message,
            telemetry,
            aiBinding
          );
          break;
        case "cohere":
          result = await callCohere(env, message, telemetry);
          break;
        default:
          continue;
      }

      attempts.push({
        provider,
        status: "success",
        model: result.model
      });

      return {
        text: result.text,
        provider,
        providerLabel: PROVIDER_LABELS[provider],
        model: result.model,
        attempts
      };
    } catch (error) {
      console.error(
        `[ULTRON AI] ${PROVIDER_LABELS[provider]} falhou:`,
        compactError(error)
      );

      attempts.push({
        provider,
        status: "failed",
        error: compactError(error)
      });
    }
  }

  throw new ProviderGatewayError(
    "Nenhum provedor de IA conseguiu responder.",
    attempts
  );
}
