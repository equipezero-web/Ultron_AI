// Deterministic contextual retrieval over existing operator-scoped D1 memories.
// This is lexical relevance, not an embedding or semantic search engine.
const STOP = new Set(["para","como","qual","quais","sobre","esse","essa","isso","com","por","que","uma","uns","das","dos","tem","ser","the","and","from","this","jarvis","ultron"]);
export function tokens(value) {
  return new Set(String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .toLowerCase().match(/[a-z0-9]{3,}/g)?.filter(x=>!STOP.has(x)) || []);
}
function ageDays(value, now) {
  const date=Date.parse(String(value||""));
  return Number.isFinite(date) ? Math.max(0,(now-date)/86400000) : 365;
}
export function scoreMemory(memory, query="", now=Date.now()) {
  const wanted=tokens(query), actual=tokens(memory?.content), shared=[...wanted].filter(x=>actual.has(x)).length;
  const overlap=wanted.size ? shared/wanted.size : 0;
  const importance=Math.max(0,Math.min(100,Number(memory?.importance)||0));
  const age=ageDays(memory?.updated_at,now);
  const uses=Math.max(0,Number(memory?.use_count)||0);
  const score=importance*.45+overlap*45+Math.max(0,10-Math.log2(1+age)*2)+Math.min(5,Math.log2(uses+1));
  return {score,overlap,tier:score>=70?"HOT":score>=40?"WARM":"COLD"};
}
export function rankMemories(memories, query="", {limit=10,now=Date.now()}={}) {
  const seen=new Set(), output=[];
  for(const row of Array.isArray(memories)?memories:[]) {
    if(!row||typeof row.content!=="string") continue;
    const normalized=row.content.normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/\s+/g," ").trim().toLowerCase();
    if(!normalized||seen.has(normalized)) continue;
    seen.add(normalized);
    output.push({...row,retrieval:scoreMemory(row,query,now)});
  }
  // When the operator asked about a topic, matching memories must outrank
  // unrelated high-importance memories. Keep prior importance/recency ranking
  // when no stored memory matches, so long-term preferences remain available.
  const anyMatch=output.some(item=>item.retrieval.overlap>0);
  return output.sort((a,b)=>
    (anyMatch?Number(b.retrieval.overlap>0)-Number(a.retrieval.overlap>0):0) ||
    b.retrieval.score-a.retrieval.score ||
    String(b.updated_at||"").localeCompare(String(a.updated_at||"")))
    .slice(0,Math.max(0,Math.min(40,Number(limit)||10)));
}
