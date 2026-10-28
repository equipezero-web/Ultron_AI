const PROVIDERS = ["gemini", "groq", "openrouter", "cloudflare", "cohere"];

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function configuredOrder(env) {
  const configured = String(env?.AI_PROVIDER_ORDER || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter((item) => PROVIDERS.includes(item));
  return configured.length ? [...new Set(configured)] : PROVIDERS;
}

function mergeOrder(preferred, available) {
  return [
    ...preferred.filter((item) => available.includes(item)),
    ...available.filter((item) => !preferred.includes(item))
  ];
}

export function classifyTask(message, telemetry = {}) {
  const text = normalize(message);
  const words = text ? text.split(" ").length : 0;

  if (/\b(imagem|foto|camera|tela|screenshot|print|visual|objeto|documento fotografado)\b/.test(text)) {
    return { class: "visual", confidence: 0.9 };
  }

  if (/\b(noticia|noticias|hoje|agora|atual|recentes|tempo real|pesquise|pesquisa|fontes)\b/.test(text)) {
    return { class: "realtime", confidence: 0.88 };
  }

  if (/\b(codigo|javascript|java|python|html|css|sql|bug|erro|debug|github|repositorio|deploy|api|backend|frontend|worker)\b/.test(text)) {
    return { class: "coding", confidence: 0.9 };
  }

  if (/\b(planeje|planejar|plano|estrategia|arquitetura|analise|analisar|decisao|compare|projeto complexo|passo a passo)\b/.test(text) || words >= 70) {
    return { class: "planning", confidence: words >= 70 ? 0.82 : 0.86 };
  }

  if (/\b(celular|telefone|tv|televisao|dispositivo|microfone|volume|abrir aplicativo|ligar|desligar|parear)\b/.test(text)) {
    return { class: "device", confidence: 0.86 };
  }

  if (words <= 18 && !telemetry?.central?.event) {
    return { class: "fast", confidence: 0.78 };
  }

  return { class: "general", confidence: 0.65 };
}

export function chooseProviderOrder(env, message, telemetry = {}) {
  const available = configuredOrder(env);
  const task = classifyTask(message, telemetry);

  const preferred = {
    fast: ["groq", "cloudflare", "gemini", "openrouter", "cohere"],
    visual: ["gemini", "groq", "openrouter", "cohere", "cloudflare"],
    realtime: ["gemini", "openrouter", "groq", "cohere", "cloudflare"],
    coding: ["groq", "gemini", "openrouter", "cohere", "cloudflare"],
    planning: ["cohere", "groq", "gemini", "openrouter", "cloudflare"],
    device: ["groq", "cloudflare", "gemini", "cohere", "openrouter"],
    general: available
  }[task.class] || available;

  return {
    ...task,
    order: mergeOrder(preferred, available)
  };
}

export function withSmartProviderOrder(env, routing) {
  const order = Array.isArray(routing?.order) ? routing.order : configuredOrder(env);
  return new Proxy(env, {
    get(target, property, receiver) {
      if (property === "AI_PROVIDER_ORDER") return order.join(",");
      return Reflect.get(target, property, receiver);
    }
  });
}
