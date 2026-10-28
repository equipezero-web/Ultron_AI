const SERPER_ENDPOINT = "https://google.serper.dev/search";

const CURRENT_TERMS = /\b(hoje|agora|atual|atuais|recente|recentes|ultimo|último|ultimos|últimos|latest|2026|preco|preço|cotacao|cotação|resultado|placar|eleicao|eleição|presidente|ceo|versao|versão|lancamento|lançamento)\b/i;
const SEARCH_TERMS = /\b(pesquise|pesquisar|procure|buscar|busque|google|internet|web|fontes?|confirme|verifique|investigue)\b/i;
const FACTUAL_START = /^(quem|quando|onde|qual|quais|quanto|quantos|como funciona|o que e|o que é|por que|porque)\b/i;
const UNCERTAINTY = /\b(n[aã]o sei|n[aã]o tenho (?:essa |essas )?informa[cç][aã]o|n[aã]o posso confirmar|n[aã]o consigo confirmar|talvez|pode ser|n[aã]o tenho certeza|meu conhecimento)\b/i;

function clean(value, max = 1200) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function safeUrl(value) {
  try {
    const url = new URL(String(value || ""));
    if (!["http:", "https:"].includes(url.protocol)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function hostLabel(url) {
  try {
    return new URL(url).hostname.replace(/^www\./i, "");
  } catch {
    return "fonte";
  }
}

function normalizeResult(item, index) {
  const url = safeUrl(item?.link);
  const title = clean(item?.title, 220);
  if (!url || !title) return null;
  return {
    id: `web-${index + 1}`,
    title,
    url,
    source: hostLabel(url),
    snippet: clean(item?.snippet || item?.description || "", 900),
    date: clean(item?.date || "", 80) || null,
    position: Number(item?.position || index + 1)
  };
}

export function shouldResearchBeforeAnswer(message) {
  const text = String(message || "").trim();
  if (!text) return { needed: false, reason: "empty", ttlMinutes: 0 };

  if (SEARCH_TERMS.test(text)) {
    return { needed: true, reason: "explicit-search", ttlMinutes: 180 };
  }

  if (CURRENT_TERMS.test(text)) {
    return { needed: true, reason: "freshness", ttlMinutes: 45 };
  }

  if (FACTUAL_START.test(text) && text.length >= 18) {
    return { needed: true, reason: "factual", ttlMinutes: 10080 };
  }

  return { needed: false, reason: "conversation", ttlMinutes: 0 };
}

export function answerLooksUncertain(text) {
  return UNCERTAINTY.test(String(text || ""));
}

function buildGoogleContext(query, results, extras = {}) {
  const lines = [
    "PESQUISA WEB REAL EXECUTADA PARA ESTA RESPOSTA:",
    `Consulta: ${query}`,
    "Use somente as informações recuperadas abaixo para afirmações externas que dependam desta pesquisa.",
    "Compare as fontes. Quando houver divergência, deixe isso claro.",
    "Não invente detalhes que não apareçam nas fontes.",
    "Ao final da resposta, cite de 2 a 5 fontes usando o nome/domínio.",
    ""
  ];

  if (extras.answerBox) {
    lines.push(`RESPOSTA DESTACADA DO GOOGLE: ${clean(extras.answerBox, 1500)}`, "");
  }

  if (extras.knowledgeGraph) {
    lines.push(`PAINEL DE CONHECIMENTO: ${clean(extras.knowledgeGraph, 1500)}`, "");
  }

  results.forEach((item, index) => {
    lines.push(
      `${index + 1}. ${item.title}`,
      `Fonte: ${item.source}`,
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
  return clean(
    box.answer || box.snippet || box.snippetHighlighted?.join(" ") || box.title || "",
    1800
  );
}

function knowledgeGraphText(data) {
  const graph = data?.knowledgeGraph;
  if (!graph) return "";
  const attributes = graph.attributes && typeof graph.attributes === "object"
    ? Object.entries(graph.attributes).slice(0, 8).map(([key, value]) => `${key}: ${value}`).join("; ")
    : "";
  return clean([graph.title, graph.type, graph.description, attributes].filter(Boolean).join(" — "), 1800);
}

export async function searchGoogle(env, query, { limit = 8 } = {}) {
  const apiKey = String(env?.SERPER_API_KEY || "").trim();
  if (!apiKey) {
    return {
      configured: false,
      provider: "serper-google",
      query: String(query || "").trim(),
      results: [],
      contextText: "",
      error: "SERPER_API_KEY não configurada."
    };
  }

  const q = clean(query, 600);
  if (!q) {
    return { configured: true, provider: "serper-google", query: "", results: [], contextText: "", error: "Consulta vazia." };
  }

  try {
    const response = await fetch(SERPER_ENDPOINT, {
      method: "POST",
      headers: {
        "X-API-KEY": apiKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        q,
        gl: "br",
        hl: "pt-br",
        num: Math.max(3, Math.min(10, Number(limit) || 8)),
        autocorrect: true
      })
    });

    const raw = await response.text();
    let data = {};
    try { data = raw ? JSON.parse(raw) : {}; } catch { data = {}; }

    if (!response.ok) {
      throw new Error(data?.message || data?.error || raw || `Serper HTTP ${response.status}`);
    }

    const organic = Array.isArray(data?.organic) ? data.organic : [];
    const results = organic.map(normalizeResult).filter(Boolean).slice(0, limit);
    const extras = {
      answerBox: answerBoxText(data),
      knowledgeGraph: knowledgeGraphText(data)
    };

    return {
      configured: true,
      provider: "serper-google",
      providerLabel: "Google Search via Serper",
      query: q,
      results,
      contextText: buildGoogleContext(q, results, extras),
      extras,
      error: null,
      searchedAt: new Date().toISOString()
    };
  } catch (error) {
    return {
      configured: true,
      provider: "serper-google",
      providerLabel: "Google Search via Serper",
      query: q,
      results: [],
      contextText: "",
      error: String(error?.message || error).slice(0, 400),
      searchedAt: new Date().toISOString()
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
