import { ensureMemorySchema, hasMemoryDatabase } from "./memory.js";

let researchSchemaReady = false;

const RESEARCH_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS research_cache (
    id TEXT PRIMARY KEY,
    operator_id TEXT NOT NULL,
    query_key TEXT NOT NULL,
    query TEXT NOT NULL,
    answer TEXT NOT NULL,
    sources_json TEXT NOT NULL DEFAULT '[]',
    provider TEXT,
    fetched_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(operator_id, query_key)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_research_cache_operator_expiry
    ON research_cache(operator_id, expires_at DESC, updated_at DESC)`
];

function clip(value, max = 5000) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function normalizeQuery(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 700);
}

async function queryKey(query) {
  const normalized = normalizeQuery(query);
  if (!normalized) return null;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(normalized));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function ensureResearchSchema(env) {
  if (!hasMemoryDatabase(env)) return false;
  if (!(await ensureMemorySchema(env))) return false;
  if (researchSchemaReady) return true;

  try {
    for (const statement of RESEARCH_SCHEMA) {
      await env.ULTRON_DB.prepare(statement).run();
    }
    researchSchemaReady = true;
    return true;
  } catch (error) {
    console.error("[ULTRON RESEARCH MEMORY] schema:", error);
    return false;
  }
}

export async function loadResearchCache(env, { operatorId, query } = {}) {
  if (!operatorId || !query || !(await ensureResearchSchema(env))) {
    return { hit: false, active: false };
  }

  const key = await queryKey(query);
  if (!key) return { hit: false, active: true };

  try {
    const row = await env.ULTRON_DB
      .prepare(
        `SELECT query, answer, sources_json, provider, fetched_at, expires_at
         FROM research_cache
         WHERE operator_id = ?
           AND query_key = ?
           AND datetime(expires_at) > datetime('now')
         LIMIT 1`
      )
      .bind(operatorId, key)
      .first();

    if (!row) return { hit: false, active: true };

    let sources = [];
    try { sources = JSON.parse(row.sources_json || "[]"); } catch {}

    return {
      hit: true,
      active: true,
      query: row.query,
      answer: row.answer,
      sources: Array.isArray(sources) ? sources : [],
      provider: row.provider || "research-cache",
      fetchedAt: row.fetched_at,
      expiresAt: row.expires_at
    };
  } catch (error) {
    return { hit: false, active: true, error: String(error?.message || error).slice(0, 220) };
  }
}

export async function saveResearchMemory(
  env,
  {
    operatorId,
    query,
    answer,
    sources = [],
    provider = "web-research",
    ttlMinutes = 1440
  } = {}
) {
  if (!operatorId || !query || !answer || !(await ensureResearchSchema(env))) {
    return { saved: false };
  }

  const key = await queryKey(query);
  if (!key) return { saved: false };

  const safeSources = (Array.isArray(sources) ? sources : [])
    .slice(0, 10)
    .map((item) => ({
      title: clip(item?.title, 220),
      url: clip(item?.url, 900),
      source: clip(item?.source, 160),
      date: clip(item?.date || item?.publishedAt, 80) || null,
      score: Number.isFinite(Number(item?.score)) ? Number(item.score) : null
    }))
    .filter((item) => item.url);

  const ttl = Math.max(15, Math.min(525600, Number(ttlMinutes) || 1440));
  const expiresAt = new Date(Date.now() + ttl * 60 * 1000).toISOString();

  try {
    await env.ULTRON_DB
      .prepare(
        `INSERT INTO research_cache
          (id, operator_id, query_key, query, answer, sources_json, provider, fetched_at, expires_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
         ON CONFLICT(operator_id, query_key) DO UPDATE SET
           query = excluded.query,
           answer = excluded.answer,
           sources_json = excluded.sources_json,
           provider = excluded.provider,
           fetched_at = CURRENT_TIMESTAMP,
           expires_at = excluded.expires_at,
           updated_at = CURRENT_TIMESTAMP`
      )
      .bind(
        crypto.randomUUID(),
        operatorId,
        key,
        clip(query, 900),
        clip(answer, 7000),
        JSON.stringify(safeSources),
        provider,
        expiresAt
      )
      .run();

    return {
      saved: true,
      expiresAt,
      sourceCount: safeSources.length,
      storage: "research_cache"
    };
  } catch (error) {
    console.error("[ULTRON RESEARCH MEMORY] save:", error);
    return {
      saved: false,
      error: String(error?.message || error).slice(0, 220)
    };
  }
}
