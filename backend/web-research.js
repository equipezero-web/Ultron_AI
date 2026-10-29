const SERPER_ENDPOINT = "https://google.serper.dev/search";
const SEARCH_TIMEOUT_MS = 3200;

const CURRENT_TERMS = /\b(hoje|agora|atual|atuais|recente|recentes|ultimo|último|ultimos|últimos|latest|2026|preco|preço|cotacao|cotação|resultado|placar|eleicao|eleição|presidente|ceo|versao|versão|lancamento|lançamento)\b/i;
const SEARCH_TERMS = /\b(pesquise|pesquisar|procure|buscar|busque|google|internet|web|fontes?|confirme|verifique|investigue)\b/i;
const FACTUAL_START = /^(quem|quando|onde|qual|quais|quanto|quantos|como funciona|o que e|o que é|por que|porque)\b/i;
const UNCERTAINTY = /\b(n[aã]o sei|n[aã]o tenho (?:essa |essas )?informa[cç][aã]o|n[aã]o posso confirmar|n[aã]o consigo confirmar|talvez|pode ser|n[aã]o tenho certeza|meu conhecimento|sem acesso (?:a|à) internet|n[aã]o tenho dados atuais)\b/i;

function clean(value, max = 1200) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function safeUrl(value) {
  try {
    const url = new URL(String(value || ""));
    if (!["http:", "https:"].includes(url.protocol)) return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function canonicalUrl(value) {
  try {
    const url = new URL(String(value || ""));
    url.hash = "";
    ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "gclid", "fbclid"].forEach((key) => url.searchParams.delete(key));
    return url.toString().replace(/\/$/, "").toLowerCase();
  } catch {
    return String(value || "").toLowerCase();
  }
}

function hostLabel(url) {
  try {
    return new URL(url).hostname.replace(/^www\./i, "");
  } catch {
    return "fonte";
  }
}

function sourceScore({ url, date, snippet, position }) {
  let score = Math.max(25, 100 - Math.max(0, Number(position || 1) - 1) * 7);
  const host = hostLabel(url);
  if (/\.(gov|gov\.br|edu|edu\.br)$/i.test(host) || /(^|\.)gov\.br$/i.test(host)) score += 20;
  if (/\.(org)$/i.test(host)) score += 4;
  if (date) score += 8;
  if (String(snippet || "").length >= 120) score += 6;
  if (/reddit\.com|pinterest\.|facebook\.com|instagram\.com|tiktok\.com/i.test(host)) score -= 18;
  return Math.max(1, Math.min(150, Math.round(score)));
}

function normalizeResult(item, index) {
  const url = safeUrl(item?.link);
  const title = clean(item?.title, 220);
  if (!url || !title) return null;
  const snippet = clean(item?.snippet || item?.description || "", 650);
  const date = clean(item?.date || "", 80) || null;
  const position = Number(item?.position || index + 1);
  return {
    id: `web-${index + 1}`,
    title,
    url,
    source: hostLabel(url),
    snippet,
    date,
    position,
    score: sourceScore({ url, date, snippet, position })
  };
}

function dedupeAndRank(results, limit = 6) {
  const seenUrls = new Set();
  const seenTitles = new Set();
  const perHost = new Map();
  const output = [];

  const ranked = [...results].sort((a, b) => Number(b?.score || 0) - Number(a?.score || 0));
  for (const item of ranked) {
    const urlKey = canonicalUrl(item?.url);
    const titleKey = clean(item?.title, 220).toLowerCase();
    const host = String(item?.source || hostLabel(item?.url)).toLowerCase();
    if (!urlKey || !titleKey || seenUrls.has(urlKey) || seenTitles.has(titleKey)) continue;
    if ((perHost.get(host) || 0) >= 2) continue;
    seenUrls.add(urlKey);
    seenTitles.add(titleKey);
    perHost.set(host, (perHost.get(host) || 0) + 1);
    output.push({ ...item, id: `web-${output.length + 1}` });
    if (output.length >= limit) break;
  }
  return output;
}

export function shouldResearchBeforeAnswer(message) {
  const text = String(message || "").trim();
  if (!text) return { needed: false, reason: "empty", ttlMinutes: 0 };

  if (SEARCH_TERMS.test(text)) return { needed: true, reason: "explicit-search", ttlMinutes: 180 };
  if (CURRENT_TERMS.test(text)) return { needed: true, reason: "freshness", ttlMinutes: 45 };
  if (FACTUAL_START.test(text) && text.length >= 18) return { needed: true, reason: "factual", ttlMinutes: 10080 };
  return { needed: false, reason: "conversation", ttlMinutes: 0 };
}

export function answerLooksUncertain(text) {
  return UNCERTAINTY.test(String(text || ""));
}

export function isCurrentIntent(message) {
  return CURRENT_TERMS.test(String(message || ""));
}

function buildGoogleContext(query, results, extras = {}) {
  const lines = [
    "PESQUISA WEB REAL EXECUTADA PARA ESTA RESPOSTA:",
    `Consulta: ${query}`,
    "Use somente as informações recuperadas abaixo para afirmações externas que dependam desta pesquisa.",
    "Compare as fontes e priorize as mais diretas, recentes e confiáveis.",
    "Quando houver divergência, deixe isso claro.",
    "Não invente detalhes que não apareçam nas fontes.",
    "Ao final da resposta, mencione as fontes mais relevantes pelo nome/domínio.",
    ""
  ];

  if (extras.answerBox) lines.push(`RESPOSTA DESTACADA DO GOOGLE: ${clean(extras.answerBox, 1100)}`, "");
  if (extras.knowledgeGraph) lines.push(`PAINEL DE CONHECIMENTO: ${clean(extras.knowledgeGraph, 1100)}`, "");

  results.forEach((item, index) => {
    lines.push(
      `${index + 1}. ${item.title}`,
      `Fonte: ${item.source}`,
      `Qualidade relativa: ${item.score}/150`,
      item.date ? `Data: ${item.date}` : "",
      item.snippet ? `Trecho: ${item.snippet}` : "",
      `Link: ${item.url}`,
      ""
    );
  });

  return lines.filter(Boolean).join("\n");
}

function answerBoxText(data) {
  const box = data?.answerBox;
  if (!box) return "";
  return clean(box.answer || box.snippet || box.snippetHighlighted?.join(" ") || box.title || "", 1300);
}

function knowledgeGraphText(data) {
  const graph = data?.knowledgeGraph;
  if (!graph) return "";
  const attributes = graph.attributes && typeof graph.attributes === "object"
    ? Object.entries(graph.attributes).slice(0, 6).map(([key, value]) => `${key}: ${value}`).join("; ")
    : "";
  return clean([graph.title, graph.type, graph.description, attributes].filter(Boolean).join(" — "), 1300);
}

async function fetchWithTimeout(url, options = {}, timeoutMs = SEARCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("timeout"), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function searchGoogle(env, query, { limit = 6 } = {}) {
  const startedAt = Date.now();
  const apiKey = String(env?.SERPER_API_KEY || "").trim();
  if (!apiKey) {
    return {
      configured: false,
      provider: "serper-google",
      query: String(query || "").trim(),
      results: [],
      contextText: "",
      error: "SERPER_API_KEY não configurada.",
      elapsedMs: Date.now() - startedAt
    };
  }

  const q = clean(query, 500);
  if (!q) {
    return { configured: true, provider: "serper-google", query: "", results: [], contextText: "", error: "Consulta vazia.", elapsedMs: Date.now() - startedAt };
  }

  try {
    const response = await fetchWithTimeout(SERPER_ENDPOINT, {
      method: "POST",
      headers: {
        "X-API-KEY": apiKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        q,
        gl: "br",
        hl: "pt-br",
        num: Math.max(4, Math.min(10, Number(limit) + 2 || 8)),
        autocorrect: true
      })
    });

    const raw = await response.text();
    let data = {};
    try { data = raw ? JSON.parse(raw) : {}; } catch { data = {}; }

    if (!response.ok) throw new Error(data?.message || data?.error || raw || `Serper HTTP ${response.status}`);

    const organic = Array.isArray(data?.organic) ? data.organic : [];
    const normalized = organic.map(normalizeResult).filter(Boolean);
    const results = dedupeAndRank(normalized, Math.max(3, Math.min(8, Number(limit) || 6)));
    const extras = {
      answerBox: answerBoxText(data),
      knowledgeGraph: knowledgeGraphText(data)
    };
    const averageScore = results.length
      ? Math.round(results.reduce((sum, item) => sum + Number(item.score || 0), 0) / results.length)
      : 0;

    return {
      configured: true,
      provider: "serper-google",
      providerLabel: "Google Search via Serper",
      query: q,
      results,
      contextText: buildGoogleContext(q, results, extras),
      extras,
      quality: {
        sourceCount: results.length,
        averageScore,
        diverseDomains: new Set(results.map((item) => item.source)).size
      },
      error: null,
      searchedAt: new Date().toISOString(),
      elapsedMs: Date.now() - startedAt
    };
  } catch (error) {
    const message = error?.name === "AbortError" ? "Pesquisa Google excedeu 3,2 segundos." : String(error?.message || error);
    return {
      configured: true,
      provider: "serper-google",
      providerLabel: "Google Search via Serper",
      query: q,
      results: [],
      contextText: "",
      error: message.slice(0, 400),
      searchedAt: new Date().toISOString(),
      elapsedMs: Date.now() - startedAt
    };
  }
}

export function researchVisualContext(research) {
  const results = Array.isArray(research?.results) ? research.results : [];
  if (!results.length) return null;
  return {
    mode: "web-research",
    label: "GOOGLE RESEARCH",
    images: [],
    cards: results.slice(0, 4).map((item) => ({
      title: item.title,
      source: item.source,
      publishedAt: item.date || research.searchedAt || null,
      url: item.url,
      image: null
    })),
    caption: "",
    fetchedAt: research.searchedAt || new Date().toISOString()
  };
}
