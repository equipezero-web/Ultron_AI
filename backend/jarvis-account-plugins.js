/**
 * Permanent account-scoped built-in Jarvis plugins. Install manifest IDs,
 * not executable scripts. Execute only audited commands on paired devices.
 */
import {listDevices,startPairing} from "./device-bridge.js";
import {enqueueControlCommand,getCommandStatus} from "./device-control-v2.js";
const BUILTINS=Object.freeze([
 {id:"youtube",name:"YouTube",description:"Abrir o YouTube na conta já existente do aparelho",
  actions:["youtube.open"],capability:"app.open"},
 {id:"agenda",name:"Agenda",description:"Abrir agenda e preparar eventos com confirmação no Android",
  actions:["calendar.open","calendar.create"],capability:"calendar.open"},
 {id:"armazenamento",name:"Armazenamento",description:"Medir espaço local, sem ler arquivos",
  actions:["storage.diagnostics"],capability:"storage.diagnostics"}
]);
const ACTIONS=new Map(BUILTINS.flatMap(p=>p.actions.map(a=>[a,p.id])));
const item=id=>BUILTINS.find(p=>p.id===id)||null;
let ready=false;
async function ensure(env){
 if(!env?.ULTRON_DB?.prepare)return false;
 if(ready)return true;
 try{
  await env.ULTRON_DB.prepare(
    "CREATE TABLE IF NOT EXISTS jarvis_account_plugins("+
    "account_id TEXT NOT NULL,plugin_id TEXT NOT NULL,"+
    "enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),"+
    "installed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,"+
    "updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,"+
    "PRIMARY KEY(account_id,plugin_id))").run();
  await env.ULTRON_DB.prepare("CREATE INDEX IF NOT EXISTS idx_jarvis_plugins_account ON jarvis_account_plugins(account_id,enabled)").run();
  ready=true;return true;
 }catch{return false;}
}
const error=(error,status=400)=>({ok:false,error,status});
export const supportedAccountPlugins=()=>BUILTINS.map(p=>({
 id:p.id,name:p.name,description:p.description,actions:[...p.actions],capability:p.capability
}));
export async function accountPluginList(env,accountId){
 if(!accountId||!(await ensure(env)))return error("plugin-database-unavailable",503);
 const rows=await env.ULTRON_DB.prepare("SELECT plugin_id AS pluginId,enabled,installed_at AS installedAt FROM jarvis_account_plugins WHERE account_id=?").bind(accountId).all();
 const active=new Map((rows?.results||[]).map(r=>[r.pluginId,r]));
 const devices=await listDevices(env,accountId);
 return {ok:true,accountScoped:true,
  plugins:supportedAccountPlugins().map(p=>({...p,installed:active.get(p.id)?.enabled===1,
    installedAt:active.get(p.id)?.installedAt||null})),
  devices:devices.map(d=>({id:d.id,name:d.deviceName,type:d.deviceType,
    online:Boolean(d.online),status:d.status,
    capabilities:Array.isArray(d.capabilities)?d.capabilities:[]}))
 };
}
export async function accountPluginInstall(env,accountId,{pluginId,action}={}){
 if(!accountId)return error("account-required",401);
 const plugin=item(String(pluginId||""));
 if(!plugin)return error("plugin-not-in-catalog");
 if(!["install","uninstall"].includes(action))return error("invalid-install-action");
 if(!(await ensure(env)))return error("plugin-database-unavailable",503);
 const enabled=action==="install"?1:0;
 await env.ULTRON_DB.prepare(
  "INSERT INTO jarvis_account_plugins(account_id,plugin_id,enabled) VALUES(?,?,?) "+
  "ON CONFLICT(account_id,plugin_id) DO UPDATE SET enabled=excluded.enabled,updated_at=CURRENT_TIMESTAMP"
 ).bind(accountId,plugin.id,enabled).run();
 return {ok:true,accountScoped:true,pluginId:plugin.id,installed:enabled===1};
}
function safeTime(input){
 const value=String(input||"");
 if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:\d{2})$/.test(value))return null;
 const t=Date.parse(value);return Number.isFinite(t)?t:null;
}
export function validateAccountPluginExecution(input={}){
 const pluginId=String(input.pluginId||""),actionId=String(input.actionId||"");
 if(ACTIONS.get(actionId)!==pluginId||!item(pluginId))return error("plugin-action-not-permitted",403);
 const deviceId=String(input.deviceId||"");
 if(!/^[0-9a-f-]{36}$/i.test(deviceId))return error("paired-device-id-required");
 if(actionId==="youtube.open")return {ok:true,deviceId,command:"app.open",
   payload:{packageName:"com.google.android.youtube"},requiredCapability:"app.open"};
 if(actionId==="calendar.open")return {ok:true,deviceId,command:"calendar.open",
   payload:{},requiredCapability:"calendar.open"};
 if(actionId==="storage.diagnostics")return {ok:true,deviceId,command:"storage.diagnostics",
   payload:{},requiredCapability:"storage.diagnostics"};
 if(actionId==="calendar.create"){
   const p=input.payload||{};
   if(p.confirm!==true)return error("calendar-event-confirmation-required",409);
   const title=String(p.title||"").trim(),start=safeTime(p.startsAt),end=safeTime(p.endsAt);
   if(!title||title.length>100||/[\x00-\x1f]/.test(title)||start===null||end===null||
      start<Date.now()-60000||end<=start||end-start>86400000)return error("invalid-calendar-event");
   return {ok:true,deviceId,command:"calendar.create",payload:{
     title,startsAt:new Date(start).toISOString(),endsAt:new Date(end).toISOString(),confirm:true
   },requiredCapability:"calendar.create"};
 }
 return error("plugin-action-not-permitted",403);
}
export async function executeAccountPlugin(env,accountId,input={}){
 if(!accountId||!(await ensure(env)))return error("plugin-database-unavailable",503);
 const safe=validateAccountPluginExecution(input);
 if(!safe.ok)return safe;
 const installed=await env.ULTRON_DB.prepare(
  "SELECT enabled FROM jarvis_account_plugins WHERE account_id=? AND plugin_id=? LIMIT 1"
 ).bind(accountId,input.pluginId).first();
 if(installed?.enabled!==1)return error("plugin-not-installed",403);
 const devices=await listDevices(env,accountId);
 const device=devices.find(d=>d.id===safe.deviceId&&d.deviceType==="mobile"&&
   d.status==="active"&&d.online);
 if(!device)return error("account-device-offline-or-not-paired",403);
 if(!device.capabilities?.includes(safe.requiredCapability))
   return error("device-capability-missing-repair-bridge",409);
 const queued=await enqueueControlCommand(env,{operatorId:accountId,deviceId:safe.deviceId,
   deviceType:"mobile",command:safe.command,payload:safe.payload});
 if(!queued.ok)return error("device-queue-rejected",409);
 return {ok:true,status:"queued",commandId:queued.commandId,deviceId:safe.deviceId,
   actionId:input.actionId,
   note:safe.command==="calendar.create"?
     "O Android exigirá confirmar e salvar o evento na agenda.":
     "O Android pode exigir toque na notificação para abrir o aplicativo."};
}
export async function accountPluginReceipt(env,accountId,commandId){
 if(!/^[0-9a-f-]{36}$/i.test(String(commandId||"")))return error("command-id-required");
 return getCommandStatus(env,accountId,commandId);
}
export async function accountPluginPairDevice(env,accountId,{deviceName}={}){
 if(!accountId)return error("account-required",401);
 const name=String(deviceName||"Android J.A.R.V.I.S.").trim().slice(0,70);
 return startPairing(env,{operatorId:accountId,deviceType:"mobile",deviceName:name});
}
