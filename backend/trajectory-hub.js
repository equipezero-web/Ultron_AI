// Privacy-minimized execution evidence: no prompts, raw tool outputs, credentials or file contents.
const STATUSES=new Set(["planned","started","completed","failed","cancelled","blocked"]);
const clean=(v,n=96)=>String(v??"").replace(/[\r\n<>]/g," ").slice(0,n);
export function sanitizeTrajectory(event) {
  if(!event||!STATUSES.has(event.status))return null;
  const duration=Math.max(0,Math.min(86400000,Math.floor(Number(event.durationMs)||0)));
  return {runId:clean(event.runId,80),stepId:clean(event.stepId,80),
    agent:clean(event.agent,64),status:event.status,
    durationMs:duration,errorCode:clean(event.errorCode,48)};
}
export async function ensureTrajectorySchema(env) {
  if(!env?.ULTRON_DB?.prepare)return false;
  await env.ULTRON_DB.prepare(`CREATE TABLE IF NOT EXISTS jarvis_trajectories (
    id TEXT PRIMARY KEY, operator_id TEXT NOT NULL, run_id TEXT NOT NULL,
    step_id TEXT NOT NULL, agent TEXT NOT NULL, status TEXT NOT NULL,
    duration_ms INTEGER NOT NULL, error_code TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`).run();
  await env.ULTRON_DB.prepare("CREATE INDEX IF NOT EXISTS idx_jarvis_trajectory_operator ON jarvis_trajectories(operator_id,created_at DESC)").run();
  return true;
}
export async function appendTrajectory(env,{operatorId,event}={}) {
  const item=sanitizeTrajectory(event);
  if(!operatorId||!item?.runId||!item.stepId||!(await ensureTrajectorySchema(env)))return {ok:false};
  await env.ULTRON_DB.prepare(`INSERT INTO jarvis_trajectories
    (id,operator_id,run_id,step_id,agent,status,duration_ms,error_code)
    VALUES(?,?,?,?,?,?,?,?)`)
    .bind(crypto.randomUUID(),operatorId,item.runId,item.stepId,item.agent,item.status,
      item.durationMs,item.errorCode).run();
  return {ok:true};
}
export async function listTrajectories(env,{operatorId,limit=25}={}) {
  if(!operatorId||!(await ensureTrajectorySchema(env)))return [];
  const result=await env.ULTRON_DB.prepare(`SELECT run_id AS runId,step_id AS stepId,
    agent,status,duration_ms AS durationMs,error_code AS errorCode,created_at AS createdAt
    FROM jarvis_trajectories WHERE operator_id=? ORDER BY created_at DESC LIMIT ?`)
    .bind(operatorId,Math.max(1,Math.min(100,Number(limit)||25))).all();
  return result?.results||[];
}
export async function pruneTrajectories(env,{operatorId,days=30}={}) {
  if(!operatorId||!(await ensureTrajectorySchema(env)))return {ok:false};
  const retention=Math.max(1,Math.min(365,Number(days)||30));
  const result=await env.ULTRON_DB.prepare(`DELETE FROM jarvis_trajectories
    WHERE operator_id=? AND created_at < datetime('now',?)`)
    .bind(operatorId,"-"+retention+" days").run();
  return {ok:true,deleted:Number(result?.meta?.changes||0)};
}
