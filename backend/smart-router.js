import {classifyJarvisTurn} from "./jarvis-conversation-router.js";
import {isProviderDisabled} from "./provider-policy.js";
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
    .filter((item) => PROVIDERS.includes(item) && !isProviderDisabled(env,item));
  return configured.length ? [...new Set(configured)] : PROVIDERS.filter(name=>!isProviderDisabled(env,name));
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
  const unified=classifyJarvisTurn(message);
  if(unified.isSocial||unified.kind==="contextual-observation"||unified.kind==="caution")
    return {class:"fast",confidence:0.99,localConversation:unified.isSocial};

  if (/\b(imagem|foto|camera|tela|screenshot|print|visual|objeto|documento fotografado)\b/.test(text)) {
    return { class: "visual", confidence: 0.9 };
  }

  // An explicit request for public sources takes precedence over topics that
  // also happen to mention code or devices ("pesquise falhas do Android").
  if (/\b(noticia|noticias|pesquise|pesquisa|pesquisar|fontes|tempo real|ultimas noticias|acontecimentos recentes)\b/.test(text)) {
    return { class: "realtime", confidence: 0.9 };
  }

  // "agora", "hoje" and "atual" are NOT evidence of a research request:
  // "corrija o erro agora" and "desligue a TV agora" must stay on their
  // technical / permission-checked paths.
  if (/\b(codigo|javascript|java|python|html|css|sql|bug|erro|debug|github|repositorio|deploy|api|backend|frontend|worker)\b/.test(text)) {
    return { class: "coding", confidence: 0.9 };
  }

  if (/\b(planeje|planejar|plano|estrategia|arquitetura|analise|analisar|decisao|compare|projeto complexo|passo a passo)\b/.test(text) || words >= 70) {
    return { class: "planning", confidence: words >= 70 ? 0.82 : 0.86 };
  }

  if (/\b(celular|telefone|tv|televisao|dispositivo|microfone|volume|abrir aplicativo|ligar|desligar|parear)\b/.test(text)) {
    return { class: "device", confidence: 0.86 };
  }

  // Temporal adjectives alone do not justify live web searches. Pair them
  // with a public, time-varying subject before preferring realtime providers.
  if (/\b(hoje|agora|atual|recentes)\b/.test(text) &&
      /\b(previsao|temperatura|clima|cotacao|bolsa|indice|indicador|taxa|preco|valor|resultado|condicoes|aconteceu|acontecendo)\b/.test(text)) {
    return { class: "realtime", confidence: 0.82 };
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
