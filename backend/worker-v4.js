import baseWorker from "./worker-v3.js";
import { deriveOperatorId } from "./memory.js";
import { loadLiveNewsContext } from "./news-context.js";
import {
  researchVisualContext,
  searchGoogle,
  shouldResearchBeforeAnswer
} from "./web-research.js";
import {
  loadResearchCache,
  saveResearchMemory
} from "./research-memory.js";

const BACKEND_VERSION = "4.13.0";

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
    .slice(0, 8)
    .map((item, index) => {
      const title = String(item?.title || item?.source || `Fonte ${index + 1}`).trim();
      const source = String(item?.source || "fonte").trim();
      const url = String(item?.url || "").trim();
      const date = String(item?.date || "").trim();
      return `${index + 1}. ${title}\nFonte: ${source}${date ? `\nData: ${date}` : ""}\nLink: ${url}`;
    })
    .join("\n\n");

  return [
    "PESQUISA WEB RECENTE RECUPERADA DA MEMÓRIA TEMPORÁRIA DO ULTRON:",
    `Consulta original: ${cache?.query || ""}`,
    `Verificada em: ${cache?.fetchedAt || "data não informada"}`,
    `Válida até: ${cache?.expiresAt || "prazo não informado"}`,
    "Use esta pesquisa somente enquanto ela estiver válida.",
    "Se houver conflito com a mensagem atual do operador, priorize a mensagem atual.",
    "",
    `Resumo verificado: ${cache?.answer || ""}`,
    sources ? `\nFontes:\n${sources}` : ""
  ].filter(Boolean).join("\n");
}

function canonicalUrl(value) {
  try {
    const url = new URL(String(value || ""));
    url.hash = "";
    return url.toString().replace(/\/$/, "").toLowerCase();
  } catch {
    return String(value || "").toLowerCase();
  }
}

function dedupeSources(items, limit = 10) {
  const seenUrls = new Set();
  const seenTitles = new Set();
  const output = [];
  for (const item of Array.isArray(items) ? items : []) {
    const url = String(item?.url || "").trim();
    const title = String(item?.title || item?.source || "").replace(/\s+/g, " ").trim();
    if (!url || !title) continue;
    const urlKey = canonicalUrl(url);
    const titleKey = normalize(title);
    if (seenUrls.has(urlKey) || seenTitles.has(titleKey)) continue;
    seenUrls.add(urlKey);
    seenTitles.add(titleKey);
    output.push({
      title,
      url,
      source: String(item?.source || "fonte").trim(),
      date: item?.date || item?.publishedAt || null,
      score: Number.isFinite(Number(item?.score)) ? Number(item.score) : null
    });
    if (output.length >= limit) break;
  }
  return output;
}

function sourceSummary(research) {
  return (Array.isArray(research?.results) ? research.results : [])
    .slice(0, 8)
    .map((item) => ({
      title: item.title,
      url: item.url,
      source: item.source,
      date: item.date || null,
      score: Number.isFinite(Number(item.score)) ? Number(item.score) : null
    }));
}

function newsSourceSummary(newsState) {
  return (Array.isArray(newsState?.articles) ? newsState.articles : [])
    .slice(0, 8)
    .map((item) => ({
      title: item.title,
      url: item.url,
      source: item.source,
      date: item.publishedAt || null,
      score: null
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
    label: fromCache ? "RESEARCH MEMORY" : "WEB RESEARCH",
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
          liveNewsEngine: "google-search+google-news+gdelt-parallel",
          webResearch: {
            enabled: true,
            googleSearch: Boolean(env.SERPER_API_KEY),
            provider: env.SERPER_API_KEY ? "Google Search via Serper" : null,
            memoryCache: Boolean(env.ULTRON_DB),
            expiringResearchCache: Boolean(env.ULTRON_DB),
            sourceRanking: true,
            uncertaintyRetry: Boolean(env.SERPER_API_KEY),
            conversationMemorySafe: true,
            mode: "research-gate-v3"
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

    const researchStartedAt = Date.now();
    const operatorId = await deriveOperatorId(originalBody?.memoryKey);
    let cache = null;
    let research = null;
    let newsState = null;
    let researchContext = "";
    let sources = [];
    let fromCache = false;

    if (operatorId) {
      cache = await loadResearchCache(env, {
        operatorId,
        query: originalMessage
      });

      if (cache?.hit) {
        fromCache = true;
        researchContext = cacheContext(cache);
        sources = dedupeSources(cache?.sources || [], 10);
      }
    }

    if (!fromCache) {
      if (newsIntent) {
        const [googleResult, liveResult] = await Promise.allSettled([
          searchGoogle(env, originalMessage, { limit: 6 }),
          loadLiveNewsContext(originalMessage, { limit: 6 })
        ]);

        research = googleResult.status === "fulfilled" ? googleResult.value : null;
        newsState = liveResult.status === "fulfilled" ? liveResult.value : null;

        const contexts = [research?.contextText, newsState?.contextText].filter(Boolean);
        researchContext = contexts.join("\n\n--- FONTES DE NOTÍCIAS COMPLEMENTARES ---\n\n");
        sources = dedupeSources([
          ...sourceSummary(research),
          ...newsSourceSummary(newsState)
        ], 10);
      } else {
        research = await searchGoogle(env, originalMessage, { limit: 6 });
        if (research?.results?.length) {
          researchContext = research.contextText;
          sources = dedupeSources(sourceSummary(research), 8);
        }
      }
    }

    const researchMs = Date.now() - researchStartedAt;

    if (!researchContext || !sources.length) {
      const response = await baseWorker.fetch(requestWithBody(request, {
        ...originalBody,
        allowUncertaintyResearch: false
      }), env, ctx);
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
            provider: research?.providerLabel || (newsIntent ? "Google News + GDELT" : null),
            configured: research?.configured ?? Boolean(env.SERPER_API_KEY),
            error: research?.error || newsState?.error || cache?.error || (env.SERPER_API_KEY ? "Nenhuma fonte confiável foi retornada." : "SERPER_API_KEY não configurada."),
            sourceCount: 0,
            fromCache: false,
            searchMs: researchMs
          },
          performance: {
            ...(data?.performance || {}),
            researchMs
          }
        });
      } catch {
        return fallback;
      }
    }

    const forwardedBody = {
      ...originalBody,
      message: originalMessage,
      webResearchContext: researchContext,
      allowUncertaintyResearch: false,
      researchMeta: {
        active: true,
        reason: policy.reason,
        provider: fromCache ? "research-cache" : (newsIntent ? "multi-source-live-news" : research?.provider),
        fromCache,
        newsIntent,
        skipLegacyResearch: true
      }
    };

    const response = await baseWorker.fetch(requestWithBody(request, forwardedBody), env, ctx);
    if (!response.ok) return response;
    const fallback = response.clone();

    try {
      const data = await response.json();
      const searchedAt = fromCache
        ? cache?.fetchedAt
        : (research?.searchedAt || newsState?.visualContext?.fetchedAt || new Date().toISOString());

      let memoryWrite = { saved: false };
      if (!fromCache && operatorId && data?.text && sources.length) {
        memoryWrite = await saveResearchMemory(env, {
          operatorId,
          query: originalMessage,
          answer: data.text,
          sources,
          provider: newsIntent ? "multi-source-live-news" : (research?.provider || "serper-google"),
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

      const newsVisual = newsState?.visualContext || null;
      const baseVisual = data?.visualContext || null;
      const preferredVisual = visualHasContent(newsVisual)
        ? newsVisual
        : (visualHasContent(baseVisual) ? baseVisual : researchVisual);

      const liveData = newsIntent && sources.length
        ? {
            ...(data?.liveData || {}),
            news: true,
            resultCount: sources.length,
            error: null,
            source: fromCache ? "research-memory" : "google-search+google-news+gdelt",
            attempts: newsState?.attempts || [],
            fetchedAt: searchedAt || null
          }
        : data?.liveData;

      const providerLabel = fromCache
        ? "Research Memory"
        : (newsIntent ? "Google Search + Google News + GDELT" : (research?.providerLabel || "Google Search via Serper"));

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
          provider: providerLabel,
          configured: true,
          query: originalMessage,
          sourceCount: sources.length,
          sources,
          searchedAt: searchedAt || null,
          searchMs: researchMs,
          fromCache,
          savedToMemory: Boolean(memoryWrite?.saved),
          memoryStorage: memoryWrite?.storage || (fromCache ? "research_cache" : null),
          memoryExpiresAt: memoryWrite?.expiresAt || cache?.expiresAt || null,
          quality: newsIntent
            ? {
                diverseDomains: new Set(sources.map((item) => item.source)).size,
                engines: fromCache ? ["research-cache"] : ["google-search", "google-news", "gdelt"]
              }
            : (research?.quality || null),
          error: memoryWrite?.error || null
        },
        performance: {
          ...(data?.performance || {}),
          researchMs,
          totalMs: Math.max(Number(data?.performance?.totalMs || 0), researchMs + Number(data?.performance?.totalMs || 0))
        }
      });
    } catch (error) {
      console.error("[ULTRON WEB RESEARCH] enrich:", error);
      return fallback;
    }
  }
};
