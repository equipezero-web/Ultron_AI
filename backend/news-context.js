import { loadResearchContext } from "./research-context.js";

const GDELT_ENDPOINT = "https://api.gdeltproject.org/api/v2/doc/doc";
const GOOGLE_NEWS_RSS = "https://news.google.com/rss/search";
const FETCH_TIMEOUT_MS = 2800;

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

function decodeXml(value) {
  return String(value || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function xmlTag(block, tag) {
  const match = String(block || "").match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match ? decodeXml(match[1]) : "";
}

async function fetchWithTimeout(url, options = {}, timeoutMs = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("timeout"), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function runGdeltQuery(query, { limit = 6, timespan = "24h", sort = "HybridRel" } = {}) {
  const params = new URLSearchParams({
    query,
    mode: "ArtList",
    maxrecords: String(Math.max(3, Math.min(20, limit))),
    format: "json",
    sort,
    timespan
  });

  const response = await fetchWithTimeout(`${GDELT_ENDPOINT}?${params.toString()}`, {
    headers: {
      "User-Agent": "UltronAI/1.2",
      "Accept": "application/json"
    }
  });

  if (!response.ok) throw new Error(`GDELT HTTP ${response.status}`);

  const data = await response.json();
  const articles = Array.isArray(data?.articles) ? data.articles : [];
  return articles.map(normalizeArticle).filter(Boolean);
}

async function fetchGoogleNewsArticles(message, limit = 6) {
  const subject = stripNewsBoilerplate(message);
  const query = subject || "Brasil";
  const params = new URLSearchParams({
    q: query,
    hl: "pt-BR",
    gl: "BR",
    ceid: "BR:pt-419"
  });

  const response = await fetchWithTimeout(`${GOOGLE_NEWS_RSS}?${params.toString()}`, {
    headers: {
      "User-Agent": "UltronAI/1.2",
      "Accept": "application/rss+xml, application/xml, text/xml"
    }
  }, 2600);

  if (!response.ok) throw new Error(`Google News HTTP ${response.status}`);
  const xml = await response.text();
  const blocks = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].map((match) => match[1]);

  return blocks.slice(0, Math.max(limit * 2, 8)).map((block, index) => {
    const titleRaw = xmlTag(block, "title");
    const link = xmlTag(block, "link");
    const source = xmlTag(block, "source") || "Google News";
    const publishedAt = toIsoDate(xmlTag(block, "pubDate"));
    const title = titleRaw.replace(/\s+-\s+[^-]+$/, "").trim() || titleRaw;
    if (!title || !link) return null;
    return {
      id: `gnews-${index + 1}`,
      title,
      url: link,
      image: null,
      source,
      publishedAt,
      language: "Portuguese",
      country: "Brazil"
    };
  }).filter(Boolean);
}

function dedupeArticles(items, limit) {
  const seenUrls = new Set();
  const seenTitles = new Set();
  const output = [];

  for (const article of items) {
    const urlKey = String(article?.url || "").replace(/[#?].*$/, "").toLowerCase();
    const titleKey = normalizeText(article?.title || "");
    if (!urlKey || !titleKey) continue;
    if (seenUrls.has(urlKey) || seenTitles.has(titleKey)) continue;

    seenUrls.add(urlKey);
    seenTitles.add(titleKey);
    output.push({ ...article, id: `news-${output.length + 1}` });
    if (output.length >= limit) break;
  }

  return output;
}

async function fetchGdeltArticlesParallel(message, limit = 6) {
  const subject = stripNewsBoilerplate(message);
  const queryPlan = subject
    ? [
        { query: `${subject} sourcecountry:Brazil`, timespan: "24h", label: "brasil-24h" },
        { query: subject, timespan: "48h", label: "tema-global-48h" },
        { query: `${subject} (Brazil OR Brasil)`, timespan: "72h", label: "tema-brasil-72h" }
      ]
    : [
        { query: `sourcecountry:Brazil`, timespan: "24h", label: "brasil-24h" },
        { query: `(Brazil OR Brasil)`, timespan: "48h", label: "brasil-global-48h" },
        { query: `(Brazil OR Brasil)`, timespan: "72h", label: "brasil-global-72h" }
      ];

  const settled = await Promise.allSettled(queryPlan.map(async (step) => {
    const articles = await runGdeltQuery(step.query, {
      limit: Math.max(limit * 2, 8),
      timespan: step.timespan,
      sort: "HybridRel"
    });
    return { step, articles };
  }));

  const collected = [];
  const attempts = [];
  settled.forEach((result, index) => {
    const step = queryPlan[index];
    if (result.status === "fulfilled") {
      attempts.push({ label: step.label, ok: true, count: result.value.articles.length });
      collected.push(...result.value.articles);
    } else {
      attempts.push({
        label: step.label,
        ok: false,
        count: 0,
        error: String(result.reason?.message || result.reason || "erro").slice(0, 180)
      });
    }
  });

  return { articles: dedupeArticles(collected, limit), attempts };
}

async function fetchLiveArticles(message, limit = 6) {
  const [gdelt, google] = await Promise.allSettled([
    fetchGdeltArticlesParallel(message, limit),
    fetchGoogleNewsArticles(message, limit)
  ]);

  const collected = [];
  const attempts = [];

  if (gdelt.status === "fulfilled") {
    collected.push(...gdelt.value.articles);
    attempts.push(...gdelt.value.attempts);
  } else {
    attempts.push({ label: "gdelt-parallel", ok: false, count: 0, error: String(gdelt.reason?.message || gdelt.reason) });
  }

  if (google.status === "fulfilled") {
    collected.push(...google.value);
    attempts.push({ label: "google-news-rss", ok: true, count: google.value.length });
  } else {
    attempts.push({ label: "google-news-rss", ok: false, count: 0, error: String(google.reason?.message || google.reason) });
  }

  return { articles: dedupeArticles(collected, limit), attempts };
}

function buildContextText(articles) {
  if (!articles.length) return "";
  const rows = articles.map((item, index) => {
    const when = item.publishedAt || "horário não informado";
    return `${index + 1}. ${item.title}\nFonte: ${item.source}\nData/hora: ${when}\nLink: ${item.url}`;
  });

  return [
    "NOTÍCIAS REAIS RECENTES RECUPERADAS PARA ESTA RESPOSTA:",
    "Compare as fontes abaixo. Não invente fatos, números ou acontecimentos ausentes.",
    "Se os resultados forem insuficientes ou divergirem, diga isso explicitamente.",
    "Responda em português do Brasil e mencione as fontes principais.",
    "",
    ...rows
  ].join("\n");
}

async function loadNonNewsVisualContext(message, limit) {
  // Quando o Web Research Gate já pesquisou no Google, não duplica a mesma pergunta na Wikipédia.
  if (/MODO ULTRON WEB RESEARCH ATIVO/i.test(String(message || ""))) {
    return {
      active: false,
      articles: [],
      contextText: "",
      visualContext: null,
      error: null,
      research: { active: false, query: "", resultCount: 0, skipped: "web-research-active" }
    };
  }

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
  if (!isLiveNewsIntent(message)) return loadNonNewsVisualContext(message, limit);

  try {
    const result = await fetchLiveArticles(message, limit);
    const articles = result.articles;

    if (!articles.length) {
      return {
        active: true,
        articles: [],
        contextText: "A busca de notícias em tempo real consultou múltiplas fontes, mas não encontrou resultados confiáveis. Informe isso ao operador sem inventar notícias.",
        visualContext: { mode: "news", images: [], cards: [], caption: "" },
        error: null,
        attempts: result.attempts,
        research: { active: false, query: "", resultCount: 0 }
      };
    }

    const images = articles.filter((article) => article.image).map((article) => ({
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
      attempts: result.attempts,
      research: { active: false, query: "", resultCount: 0 }
    };
  } catch (error) {
    return {
      active: true,
      articles: [],
      contextText: "A busca de notícias em tempo real falhou nesta tentativa. Diga ao operador que não foi possível confirmar notícias atuais agora e não invente informações.",
      visualContext: { mode: "news", label: "LIVE NEWS", images: [], cards: [], caption: "" },
      error: error?.message || String(error),
      attempts: [],
      research: { active: false, query: "", resultCount: 0 }
    };
  }
}
