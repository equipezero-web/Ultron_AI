import { loadResearchContext } from "./research-context.js";

const GDELT_ENDPOINT = "https://api.gdeltproject.org/api/v2/doc/doc";

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function isLiveNewsIntent(message) {
  const text = normalizeText(message);
  if (!text) return false;

  const newsWords = /\b(noticia|noticias|news|manchete|manchetes|acontecendo|circulando|destaque|destaques|ultimas|agora|hoje)\b/;
  const freshnessWords = /\b(agora|hoje|momento|atual|atuais|recentes|ultima|ultimas|circulando|acontecendo)\b/;

  return newsWords.test(text) && (freshnessWords.test(text) || /\b(noticia|noticias|manchete|manchetes)\b/.test(text));
}

function stripNewsBoilerplate(message) {
  const raw = String(message || "").trim();
  const cleaned = raw
    .replace(/\b(ultron|por favor|me diga|me fale|mostre|mostrar|quais|qual|que)\b/gi, " ")
    .replace(/\b(noticias?|manchetes?|news|circulando|acontecendo|agora|hoje|atuais?|recentes?|momento|destaques?)\b/gi, " ")
    .replace(/[?!.:,;]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned.length >= 3 ? cleaned : "";
}

function toIsoDate(value) {
  const text = String(value || "").trim();
  if (!text) return null;

  const compact = text.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
  if (compact) {
    const [, y, m, d, hh, mm, ss] = compact;
    const date = new Date(`${y}-${m}-${d}T${hh}:${mm}:${ss}Z`);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function domainLabel(url, fallback = "Fonte") {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return fallback;
  }
}

function normalizeArticle(article, index) {
  const url = String(article?.url || "").trim();
  const title = String(article?.title || "").replace(/\s+/g, " ").trim();
  if (!url || !title) return null;

  const image = String(article?.socialimage || article?.image || "").trim();
  const publishedAt = toIsoDate(article?.seendate || article?.date || article?.publishedAt);
  const source = String(article?.domain || article?.source || domainLabel(url)).trim();

  return {
    id: `news-${index + 1}`,
    title,
    url,
    image: /^https?:\/\//i.test(image) ? image : null,
    source: source || domainLabel(url),
    publishedAt,
    language: article?.language || null,
    country: article?.sourcecountry || null
  };
}

async function fetchGdeltArticles(message, limit = 6) {
  const subject = stripNewsBoilerplate(message);
  const query = subject
    ? `${subject} sourcecountry:Brazil`
    : `sourcecountry:Brazil`;

  const params = new URLSearchParams({
    query,
    mode: "ArtList",
    maxrecords: String(Math.max(3, Math.min(10, limit))),
    format: "json",
    sort: "HybridRel",
    timespan: "24h"
  });

  const response = await fetch(`${GDELT_ENDPOINT}?${params.toString()}`, {
    headers: {
      "User-Agent": "UltronAI/1.0",
      "Accept": "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(`GDELT HTTP ${response.status}`);
  }

  const data = await response.json();
  const articles = Array.isArray(data?.articles) ? data.articles : [];

  return articles
    .map(normalizeArticle)
    .filter(Boolean)
    .slice(0, limit);
}

function buildContextText(articles) {
  if (!articles.length) return "";

  const rows = articles.map((item, index) => {
    const when = item.publishedAt || "horário não informado";
    return `${index + 1}. ${item.title}\nFonte: ${item.source}\nData/hora: ${when}\nLink: ${item.url}`;
  });

  return [
    "NOTÍCIAS REAIS RECENTES RECUPERADAS PARA ESTA RESPOSTA:",
    "Use SOMENTE os itens abaixo para afirmar o que está circulando agora.",
    "Não invente fatos, números, fontes ou acontecimentos que não estejam nesses itens.",
    "Se os resultados forem insuficientes, diga isso explicitamente.",
    "Responda em português do Brasil, de forma natural e adequada para ser falada em voz alta.",
    "Mencione as fontes pelo nome/domínio quando resumir as principais notícias.",
    "",
    ...rows
  ].join("\n");
}

async function loadNonNewsVisualContext(message, limit) {
  const research = await loadResearchContext(message, {
    limit: Math.max(1, Math.min(4, limit))
  });

  return {
    active: false,
    articles: [],
    contextText: research.contextText || "",
    visualContext: research.visualContext || null,
    error: research.error || null,
    research: {
      active: Boolean(research.active),
      query: research.query || "",
      resultCount: research.items?.length || 0
    }
  };
}

export async function loadLiveNewsContext(message, { limit = 6 } = {}) {
  if (!isLiveNewsIntent(message)) {
    return loadNonNewsVisualContext(message, limit);
  }

  try {
    const articles = await fetchGdeltArticles(message, limit);

    if (!articles.length) {
      return {
        active: true,
        articles: [],
        contextText:
          "A busca de notícias em tempo real foi executada, mas não retornou resultados confiáveis. Informe isso ao operador e evite inventar notícias.",
        visualContext: {
          mode: "news",
          images: [],
          cards: [],
          caption: ""
        },
        error: null,
        research: {
          active: false,
          query: "",
          resultCount: 0
        }
      };
    }

    const images = articles
      .filter((article) => article.image)
      .map((article) => ({
        src: article.image,
        alt: article.title,
        title: article.title
      }));

    const cards = articles.slice(0, 4).map((article) => ({
      title: article.title,
      source: article.source,
      publishedAt: article.publishedAt,
      url: article.url,
      image: article.image
    }));

    return {
      active: true,
      articles,
      contextText: buildContextText(articles),
      visualContext: {
        mode: "news",
        label: "LIVE NEWS",
        images,
        cards,
        caption: "",
        intervalMs: 6000,
        fetchedAt: new Date().toISOString()
      },
      error: null,
      research: {
        active: false,
        query: "",
        resultCount: 0
      }
    };
  } catch (error) {
    return {
      active: true,
      articles: [],
      contextText:
        "A busca de notícias em tempo real falhou nesta tentativa. Diga ao operador que não foi possível confirmar notícias atuais agora e não invente informações.",
      visualContext: {
        mode: "news",
        label: "LIVE NEWS",
        images: [],
        cards: [],
        caption: ""
      },
      error: error?.message || String(error),
      research: {
        active: false,
        query: "",
        resultCount: 0
      }
    };
  }
}
