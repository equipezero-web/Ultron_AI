// Shared D1 diagnostics, strictly aggregate and content-free.
// Unlike the circuit breaker, these records are shared between Worker isolates.
// No prompts, responses, secrets, IPs, identity, error bodies or device IDs.
const VALID_PROVIDERS=new Set(["gemini","groq","openrouter","cloudflare","cohere","mistral","deepseek","cerebras"]);
const WINDOW_MS=15*60*1000;
const MAX_DURATION=60000;
const SCHEMA=`CREATE TABLE IF NOT EXISTS jarvis_provider_attempts (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 provider TEXT NOT NULL,
 outcome TEXT NOT NULL,
 duration_ms INTEGER,
 observed_at_ms INTEGER NOT NULL
)`;
const INDEX=`CREATE INDEX IF NOT EXISTS idx_jarvis_provider_attempts_at
 ON jarvis_provider_attempts(observed_at_ms)`;

function store(env){return env?.ULTRON_DB?.prepare ? env.ULTRON_DB : null;}

async function ensureSchema(db){
 await db.prepare(SCHEMA).run();
 await db.prepare(INDEX).run();
}

// No untrusted strings or provider error messages are written into D1.
// DB failures must not affect live conversations.
export async function persistProviderAttempts(env, attempts, {now=Date.now}={}){
 const db=store(env);
 if(!db)return {ok:false,reason:"d1-unavailable"};
 const valid=(Array.isArray(attempts)?attempts:[]).filter(a=>
   VALID_PROVIDERS.has(a?.provider) &&
   (a?.status==="success" || a?.status==="failed")
 ).slice(0,5);
 if(!valid.length)return {ok:true,recorded:0};
 try{
  await ensureSchema(db);
  const stamp=now();
  for(const attempt of valid){
   const duration=Number(attempt.durationMs);
   await db.prepare(`INSERT INTO jarvis_provider_attempts
    (provider,outcome,duration_ms,observed_at_ms) VALUES (?,?,?,?)`)
    .bind(attempt.provider,attempt.status,
      Number.isFinite(duration)&&duration>=0?Math.round(Math.min(duration,MAX_DURATION)):null,
      stamp).run();
  }
  await db.prepare("DELETE FROM jarvis_provider_attempts WHERE observed_at_ms < ?")
   .bind(stamp-WINDOW_MS).run();
  return {ok:true,recorded:valid.length};
 }catch{return {ok:false,reason:"d1-write-unavailable"};}
}

export async function loadPersistentProviderDiagnostics(env, {now=Date.now}={}){
 const db=store(env);
 if(!db)return {ok:false,reason:"d1-unavailable"};
 try{
  await ensureSchema(db);
  const cutoff=now()-WINDOW_MS;
  const result=await db.prepare(`SELECT provider,
   SUM(CASE WHEN outcome='success' THEN 1 ELSE 0 END) AS successes,
   SUM(CASE WHEN outcome='failed' THEN 1 ELSE 0 END) AS failures,
   ROUND(AVG(CASE WHEN outcome='success' THEN duration_ms ELSE NULL END)) AS averageSuccessMs,
   MAX(observed_at_ms) AS lastObservedMs,
   (SELECT outcome FROM jarvis_provider_attempts recent
      WHERE recent.provider = t.provider AND recent.observed_at_ms >= ?
      ORDER BY recent.observed_at_ms DESC, recent.id DESC LIMIT 1) AS lastOutcome
   FROM jarvis_provider_attempts t
   WHERE observed_at_ms >= ?
   GROUP BY provider`)
   .bind(cutoff,cutoff).all();
  const rows=(Array.isArray(result?.results)?result.results:[])
   .filter(x=>VALID_PROVIDERS.has(x.provider));
  return {ok:true,rows};
 }catch{return {ok:false,reason:"d1-read-unavailable"};}
}
