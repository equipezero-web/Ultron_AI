const WIKI_LANGS = ["pt", "en"];

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function isResearchIntent(message) {
  const text = normalizeText(message);
  if (!text) return false;

  const patterns = [
    /\b(me explique|explique|explica|como funciona|como funcionam)\b/,
    /\b(o que e|o que sao|quem e|quem foi|quem sao)\b/,
    /\b(fale sobre|me fale sobre|conte sobre|historia de|historia do|historia da)\b/,
    /\b(pesquise|pesquisa|pesquisar|research|investigue|investigar)\b/,
    /\b(significa|significado|definicao|conceito de)\b/
  ];

  const liveNews = /\b(noticia|noticias|news|manchete|manchetes|agora|hoje|circulando)\b/;
  return !liveNews.test(text) && patterns.some((pattern) => pattern.test(text));
}

function extractResearchQuery(message) {
  return String(message || "")
    .replace(/\b(ultron|por favor|me explique|explique|explica|o que é|o que e|o que são|o que sao|quem é|quem e|quem foi|quem são|quem sao|como funciona|como funcionam|fale sobre|me fale sobre|conte sobre|pesquise|pesquisa|pesquisar|investigue|investigar|qual é|qual e)\b/gi, " ")
    .replace(/[?!.:,;]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
}

function cleanExtract(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 1200);
}

function pageImage(page) {
  const original = String(page?.original?.source || "").trim();
  const thumb = String(page?.thumbnail?.source || "").trim();
  return /^https?:\/\//i.test(original)
    ? original
    : /^https?:\/\//i.test(thumb)
      ? thumb
      : null;
}

function normalizePage(page, lang, index) {
  const title = String(page?.title || "").trim();
  const extract = cleanExtract(page?.extract);
  const url = String(page?.fullurl || "").trim();
  if (!title || !url) return null;

  return {
    id: `research-${lang}-${index + 1}`,
    title,
    extract,
    url,
    image: pageImage(page),
    source: lang === "pt" ? "Wikipédia" : "Wikipedia",
    language: lang,
    publishedAt: null
  };
}

async function searchWikipedia(query, lang, limit = 4) {
  const params = new URLSearchParams({
    action: "query",
    generator: "search",
    gsrsearch: query,
    gsrlimit: String(Math.max(1, Math.min(6, limit))),
    prop: "extracts|pageimages|info",
    exintro: "1",
    explaintext: "1",
    inprop: "url",
    piprop: "thumbnail|original",
    pithumbsize: "1200",
    format: "json",
    origin: "*"
  });

  const response = await fetch(`https://${lang}.wikipedia.org/w/api.php?${params.toString()}`, {
    headers: {
      "Accept": "application/json",
      "User-Agent": "UltronAI/1.0 (visual research context)"
    }
  });

  if (!response.ok) {
    throw new Error(`Wikipedia ${lang} HTTP ${response.status}`);
  }

  const data = await response.json();
  const pages = Object.values(data?.query?.pages || {});

  return pages
    .sort((a, b) => Number(a?.index || 999) - Number(b?.index || 999))
    .map((page, index) => normalizePage(page, lang, index))
    .filter(Boolean)
    .slice(0, limit);
}

function buildContextText(items) {
  if (!items.length) return "";

  return [
    "REFERÊNCIAS ENCICLOPÉDICAS PARA APOIAR A EXPLICAÇÃO:",
    "Use estas referências como contexto factual. Não diga que consultou a Wikipédia a menos que seja relevante citar a fonte. Não invente fatos ausentes.",
    "",
    ...items.map((item, index) => [
      `${index + 1}. ${item.title}`,
      item.extract ? `Resumo: ${item.extract}` : "",
      `Fonte: ${item.source}`,
      `Link: ${item.url}`
    ].filter(Boolean).join("\n"))
  ].join("\n\n");
}

function buildVisualContext(items, query) {
  if (!items.length) return null;

  const images = items
    .filter((item) => item.image)
    .map((item) => ({
      src: item.image,
      alt: item.title,
      title: item.title
    }));

  const cards = items.slice(0, 4).map((item) => ({
    title: item.title,
    source: item.source,
    url: item.url,
    publishedAt: null,
    description: item.extract.slice(0, 180)
  }));

  return {
    mode: "research",
    label: "VISUAL RESEARCH",
    query,
    intervalMs: 7200,
    images,
    cards
  };
}

export async function loadResearchContext(message, { limit = 4 } = {}) {
  if (!isResearchIntent(message)) {
    return {
      active: false,
      query: "",
      items: [],
      contextText: "",
      visualContext: null,
      error: null
    };
  }

  const query = extractResearchQuery(message);
  if (!query) {
    return {
      active: true,
      query: "",
      items: [],
      contextText: "",
      visualContext: null,
      error: "Não foi possível identificar o tema da pesquisa visual."
    };
  }

  let lastError = null;

  for (const lang of WIKI_LANGS) {
    try {
      const items = await searchWikipedia(query, lang, limit);
      if (!items.length) continue;

      return {
        active: true,
        query,
        items,
        contextText: buildContextText(items),
        visualContext: buildVisualContext(items, query),
        error: null
      };
    } catch (error) {
      lastError = error;
    }
  }

  return {
    active: true,
    query,
    items: [],
    contextText: "",
    visualContext: null,
    error: lastError?.message || "Nenhuma referência visual encontrada."
  };
}
