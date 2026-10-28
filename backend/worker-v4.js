import baseWorker from "./worker-v3.js";
import { deriveOperatorId } from "./memory.js";
import {
  researchVisualContext,
  searchGoogle,
  shouldResearchBeforeAnswer
} from "./web-research.js";
import {
  loadResearchCache,
  saveResearchMemory
} from "./research-memory.js";

const BACKEND_VERSION = "4.10.0";

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json; charset=utf-8"
  };
}

function json(data, status = 200) {
  return Response.json(data, { status, headers: corsHeaders() });
}

function requestWithBody(request, body) {
  const headers = new Headers(request.headers);
  headers.set("Content-Type", "application/json");
  return new Request(request.url, {
    method: request.method,
    headers,
    body: JSON.stringify(body),
    redirect: request.redirect
  });
}

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function isNewsIntent(message) {
  const text = normalize(message);
  return /\b(noticia|noticias|news|manchete|manchetes|acontecendo|destaque|destaques)\b/.test(text) &&
    /\b(hoje|agora|atual|atuais|recente|recentes|ultima|ultimas|noticia|noticias)\b/.test(text);
}

function cacheContext(cache) {
  const sources = (Array.isArray(cache?.sources) ? cache.sources : [])
    .slice(0, 6)
    .map((item, index) => {
      const title = String(item?.title || item?.source || `Fonte ${index + 1}`).trim();
      const source = String(item?.source || "fonte").trim();
      const url = String(item?.url || "").trim();
      return `${index + 1}. ${title}\nFonte: ${source}\nLink: ${url}`;
    })
    .join("\n\n");

  return [
    "PESQUISA WEB RECENTE RECUPERADA DA MEMÓRIA DO ULTRON:",
    `Consulta original: ${cache?.query || ""}`,
    `Verificada em: ${cache?.fetchedAt || "data não informada"}`,
    "Use esta memória de pesquisa apenas enquanto ela estiver válida.",
    "Se houver conflito entre o resumo e a mensagem atual do operador, priorize a mensagem atual.",
    "",
    `Resumo verificado: ${cache?.answer || ""}`,
    sources ? `\nFontes:\n${sources}` : ""
  ].filter(Boolean).join("\n");
}

function appendResearchToMessage(originalMessage, contextText) {
  return [
    "MODO ULTRON WEB RESEARCH ATIVO.",
    "A resposta deve ser baseada no contexto de pesquisa abaixo e na memória válida.",
    "Não afirme que pesquisou se não houver fontes reais listadas.",
    "Quando a pergunta for sobre notícias atuais, trate estas fontes como LIVE NEWS verificadas.",
    "",
    contextText,
    "",
    "PERGUNTA ORIGINAL DO OPERADOR:",
    originalMessage
  ].join("\n");
}

function sourceSummary(research) {
  return (Array.isArray(research?.results) ? research.results : [])
    .slice(0, 8)
    .map((item) => ({
      title: item.title,
      url: item.url,
      source: item.source,
      date: item.date || null
    }));
}

function visualHasContent(visual) {
  return Boolean(
    visual &&
    ((Array.isArray(visual.images) && visual.images.length) ||
      (Array.isArray(visual.cards) && visual.cards.length))
  );
}

function researchVisualFromSources(sources, searchedAt, text, fromCache, research) {
  if (!sources.length) return null;

  if (!fromCache) {
    const visual = researchVisualContext(research);
    if (visual) return { ...visual, caption: text || "" };
  }

  return {
    mode: "web-research",
    label: fromCache ? "RESEARCH MEMORY" : "GOOGLE RESEARCH",
    images: [],
    cards: sources.slice(0, 4).map((item) => ({
      title: item.title,
      source: item.source,
      publishedAt: item.date || searchedAt || null,
      url: item.url,
      image: null
    })),
    caption: text || "",
    fetchedAt: searchedAt || null
  };
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    if (url.pathname === "/api/health" && request.method === "GET") {
      const response = await baseWorker.fetch(request, env, ctx);
      if (!response.ok) return response;
      const fallback = response.clone();

      try {
        const data = await response.json();
        return json({
          ...data,
          backendVersion: BACKEND_VERSION,
          liveNewsEngine: "gdelt+google-news+web-research",
          webResearch: {
            enabled: true,
            googleSearch: Boolean(env.SERPER_API_KEY),
            provider: env.SERPER_API_KEY ? "Google Search via Serper" : null,
            memoryCache: Boolean(env.ULTRON_DB),
            mode: "research-gate-v2"
          }
        });
      } catch {
        return fallback;
      }
    }

    if (url.pathname !== "/api/ai" || request.method !== "POST") {
      return baseWorker.fetch(request, env, ctx);
    }

    let originalBody = {};
    try {
      originalBody = await request.clone().json();
    } catch {
      return baseWorker.fetch(request, env, ctx);
    }

    const originalMessage = String(originalBody?.message || "").trim();
    if (!originalMessage) return baseWorker.fetch(request, env, ctx);

    const newsIntent = isNewsIntent(originalMessage);
    const policy = shouldResearchBeforeAnswer(originalMessage);
    if (!policy.needed) return baseWorker.fetch(request, env, ctx);

    const operatorId = await deriveOperatorId(originalBody?.memoryKey);
    let cache = null;
    let research = null;
    let researchContext = "";
    let fromCache = false;

    if (operatorId) {
      cache = await loadResearchCache(env, {
        operatorId,
        query: originalMessage
      });

      if (cache?.hit) {
        fromCache = true;
        researchContext = cacheContext(cache);
      }
    }

    if (!fromCache) {
      research = await searchGoogle(env, originalMessage, { limit: 6 });
      if (research?.results?.length) researchContext = research.contextText;
    }

    if (!researchContext) {
      const response = await baseWorker.fetch(request, env, ctx);
      if (!response.ok) return response;
      const fallback = response.clone();

      try {
        const data = await response.json();
        return json({
          ...data,
          backendVersion: BACKEND_VERSION,
          webResearch: {
            requested: true,
            used: false,
            reason: policy.reason,
            provider: research?.providerLabel || null,
            configured: research?.configured ?? Boolean(env.SERPER_API_KEY),
            error: research?.error || cache?.error || (env.SERPER_API_KEY ? "Nenhuma fonte foi retornada." : "SERPER_API_KEY não configurada."),
            sourceCount: 0,
            fromCache: false
          }
        });
      } catch {
        return fallback;
      }
    }

    const forwardedBody = {
      ...originalBody,
      message: appendResearchToMessage(originalMessage, researchContext),
      researchMeta: {
        active: true,
        reason: policy.reason,
        provider: fromCache ? "research-cache" : research?.provider,
        fromCache,
        newsIntent
      }
    };

    const response = await baseWorker.fetch(requestWithBody(request, forwardedBody), env, ctx);
    if (!response.ok) return response;
    const fallback = response.clone();

    try {
      const data = await response.json();
      const sources = fromCache ? (cache?.sources || []) : sourceSummary(research);
      const searchedAt = fromCache ? cache?.fetchedAt : research?.searchedAt;

      let memoryWrite = { saved: false };
      if (!fromCache && operatorId && data?.text && sources.length) {
        memoryWrite = await saveResearchMemory(env, {
          operatorId,
          query: originalMessage,
          answer: data.text,
          sources,
          provider: research?.provider || "serper-google",
          ttlMinutes: newsIntent ? Math.min(policy.ttlMinutes || 45, 45) : policy.ttlMinutes
        });
      }

      const researchVisual = researchVisualFromSources(
        sources,
        searchedAt,
        data?.text,
        fromCache,
        research
      );

      const baseVisual = data?.visualContext || null;
      const preferredVisual = visualHasContent(baseVisual)
        ? baseVisual
        : researchVisual;

      const liveData = newsIntent && sources.length
        ? {
            ...(data?.liveData || {}),
            news: true,
            resultCount: sources.length,
            error: null,
            source: fromCache ? "research-memory" : "google-search"
          }
        : data?.liveData;

      return json({
        ...data,
        backendVersion: BACKEND_VERSION,
        liveData,
        visualContext: preferredVisual
          ? { ...preferredVisual, caption: data?.text || preferredVisual.caption || "" }
          : null,
        webResearch: {
          requested: true,
          used: true,
          reason: policy.reason,
          provider: fromCache ? "Research Memory" : (research?.providerLabel || "Google Search via Serper"),
          configured: true,
          query: originalMessage,
          sourceCount: sources.length,
          sources,
          searchedAt: searchedAt || null,
          fromCache,
          savedToMemory: Boolean(memoryWrite?.saved),
          memoryExpiresAt: memoryWrite?.expiresAt || cache?.expiresAt || null,
          error: memoryWrite?.error || null
        }
      });
    } catch (error) {
      console.error("[ULTRON WEB RESEARCH] enrich:", error);
      return fallback;
    }
  }
};
