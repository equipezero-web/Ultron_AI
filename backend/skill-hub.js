// Versioned, operator-scoped skill specifications. No executable code stored or evaluated.
const NAME=/^[a-z][a-z0-9_-]{2,63}$/;
const TOOLS=new Set(["research.search","weather.read","news.read","devices.status","memory.recall","visual.render","code.inspect","tests.read"]);
const MAX_STEPS=8;
export function validateSkill(value) {
  if(!value||typeof value!=="object"||Array.isArray(value))return {ok:false,error:"SKILL_INVALID"};
  const id=String(value.id||""),version=Number(value.version);
  if(!NAME.test(id)||!Number.isSafeInteger(version)||version<1||version>10000)return {ok:false,error:"SKILL_ID_VERSION"};
  const steps=value.steps;
  if(!Array.isArray(steps)||steps.length<1||steps.length>MAX_STEPS)return {ok:false,error:"SKILL_STEPS"};
  if(steps.some(x=>!x||!TOOLS.has(x.tool)||typeof x.label!=="string"||!x.label.trim()||x.label.length>120))return {ok:false,error:"SKILL_TOOL"};
  return {ok:true,skill:{id,version,description:String(value.description||"").slice(0,240),
    steps:steps.map(x=>({tool:x.tool,label:x.label.trim()})),status:"draft"}};
}
export function selectSkill(skills,id,{activeOnly=true}={}) {
  return (Array.isArray(skills)?skills:[]).filter(x=>x.id===id&&(!activeOnly||x.status==="active"))
    .sort((a,b)=>Number(b.version)-Number(a.version))[0]||null;
}
export async function ensureSkillSchema(env) {
  if(!env?.ULTRON_DB?.prepare)return false;
  await env.ULTRON_DB.prepare(`CREATE TABLE IF NOT EXISTS jarvis_skills (
    operator_id TEXT NOT NULL, skill_id TEXT NOT NULL, version INTEGER NOT NULL,
    description TEXT NOT NULL, steps_json TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft'
      CHECK(status IN ('draft','validated','active','retired')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(operator_id,skill_id,version)
  )`).run();
  return true;
}
export async function registerSkill(env,{operatorId,spec}={}) {
  const check=validateSkill(spec);
  if(!check.ok)return check;
  if(!operatorId||!(await ensureSkillSchema(env)))return {ok:false,error:"SKILL_STORAGE"};
  const s=check.skill;
  await env.ULTRON_DB.prepare(`INSERT INTO jarvis_skills
    (operator_id,skill_id,version,description,steps_json,status) VALUES(?,?,?,?,?,'draft')`)
    .bind(operatorId,s.id,s.version,s.description,JSON.stringify(s.steps)).run();
  return {ok:true,id:s.id,version:s.version,status:"draft"};
}
export async function updateSkillStatus(env,{operatorId,id,version,status,validated=false,approved=false}={}) {
  if(!operatorId||!NAME.test(String(id||""))||!Number.isSafeInteger(version)||
    !["validated","active","retired"].includes(status))return {ok:false,error:"SKILL_TRANSITION"};
  if(status==="active"&&(!approved||!validated))return {ok:false,error:"APPROVAL_REQUIRED"};
  if(!(await ensureSkillSchema(env)))return {ok:false,error:"SKILL_STORAGE"};
  const current=await env.ULTRON_DB.prepare("SELECT status FROM jarvis_skills WHERE operator_id=? AND skill_id=? AND version=?")
    .bind(operatorId,id,version).first();
  if(!current)return {ok:false,error:"SKILL_NOT_FOUND"};
  const permitted={draft:["validated","retired"],validated:["active","retired"],active:["retired"],retired:[]};
  if(!permitted[current.status]?.includes(status))return {ok:false,error:"SKILL_TRANSITION"};
  const result=await env.ULTRON_DB.prepare("UPDATE jarvis_skills SET status=? WHERE operator_id=? AND skill_id=? AND version=? AND status=?")
    .bind(status,operatorId,id,version,current.status).run();
  return {ok:Number(result?.meta?.changes||0)===1,status};
}
export async function listSkills(env,{operatorId,limit=30}={}) {
  if(!operatorId||!(await ensureSkillSchema(env)))return [];
  const result=await env.ULTRON_DB.prepare("SELECT skill_id,version,description,steps_json,status FROM jarvis_skills WHERE operator_id=? ORDER BY skill_id,version DESC LIMIT ?")
    .bind(operatorId,Math.max(1,Math.min(100,Number(limit)||30))).all();
  return (result?.results||[]).map(x=>({id:x.skill_id,version:x.version,description:x.description,
    status:x.status,steps:JSON.parse(x.steps_json||"[]")}));
}
