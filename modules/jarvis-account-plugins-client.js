import API_CONFIG from "../config.js";
import {parseAccountPluginCommand} from "../backend/jarvis-account-plugin-intents.js";
// Runs in all logged-in browser sessions, but actions require an authenticated
// Cloudflare Access account and a separately paired Android device.
const base=String(API_CONFIG?.backendUrl||"").replace(/\/+$/,"");
const oldFetch=window.fetch.bind(window);
let selectedDeviceId=null;
const io=async(path,body)=>{
 const response=await oldFetch(base+path,{method:body?"POST":"GET",
   credentials:"include",mode:"cors",cache:"no-store",redirect:"error",
   ...(body?{headers:{"Content-Type":"application/json"},body:JSON.stringify(body)}:{})});
 const data=await response.json().catch(()=>({ok:false,error:"invalid-api-response"}));
 if(!response.ok||!data.ok)throw Error(data?.error||"HTTP "+response.status);
 return data;
};
const label=e=>String(e||"").replace(/[\x00-\x1f<>]/g," ").slice(0,140);
const pretty=bytes=>(Number(bytes)/(1024**3)).toLocaleString("pt-BR",
 {maximumFractionDigits:2})+" GB";
function answer(text,operation){
 return new Response(JSON.stringify({text:String(text||"").slice(0,2300),
   provider:"JARVIS_ACCOUNT_PLUGINS",providerLabel:"J.A.R.V.I.S. Plugins",
   model:"account-bound-v1",audioBase64:null,audioMimeType:null,
   accountPluginOperation:{kind:operation?.kind||"unknown",executed:false}}),{
   status:200,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});
}
const isAi=(input,init)=>{
 try{const url=new URL(typeof input==="string"?input:input?.url,location.href);
   return new URL(base).origin===url.origin&&url.pathname==="/api/ai"&&
     String(init?.method||"").toUpperCase()==="POST";
 }catch{return false;}
};
const help=()=>[
 "Conta e plugins: o Cloudflare Access precisa estar configurado e a sessão autenticada.",
 "Para adicionar outra conta, o administrador autoriza o e-mail no Cloudflare Access e na lista CF_ACCESS_ACCOUNT_EMAILS.",
 "Cada conta recebe seu próprio catálogo, configurações e dispositivos; nenhum dado ou sessão de outra conta é copiado.",
 "O Bridge Android deve ser pareado em cada conta por código temporário."
].join(" ");
async function getStatus(){
 const data=await io("/api/account/plugins");
 return data;
}
async function process(intent){
 if(intent.kind==="account-help")return help();
 if(intent.kind==="pair"){
   const p=await io("/api/account/devices/pair",{deviceName:"Android J.A.R.V.I.S."});
   return "Código de pareamento desta conta: "+p.code+
     ". Válido por "+Math.round(p.expiresInSeconds/60)+
     " minutos. Abra J.A.R.V.I.S. Bridge no Android e vincule com este código. Não compartilhe o código.";
 }
 if(intent.kind==="list"){
   const data=await getStatus();
   const plugins=data.plugins.map(p=>p.name+": "+(p.installed?"INSTALADO":"não instalado")).join("; ");
   const devices=data.devices.map(d=>d.name+" ["+(d.online?"online":"offline")+"]").join("; ");
   return "Plugins permanentes desta conta: "+plugins+
     ". Dispositivos pareados: "+(devices||"nenhum")+
     ". Para habilitar: Jarvis instale plugin agenda/youtube/armazenamento.";
 }
 if(intent.kind==="select-device"){
   const data=await getStatus();
   const matches=data.devices.filter(d=>d.name.toLowerCase()===intent.name.toLowerCase()||
     d.id.startsWith(intent.name));
   if(matches.length!==1)return "Seleção ambígua ou dispositivo não encontrado. "+
     data.devices.map(d=>label(d.name)+" ("+d.id.slice(0,8)+")").join("; ");
   selectedDeviceId=matches[0].id;
   return "Dispositivo selecionado: "+label(matches[0].name)+
     ". Esta preferência vale nesta sessão; cada execução será validada pela conta.";
 }
 if(intent.kind==="install"||intent.kind==="uninstall"){
   const d=await io("/api/account/plugins",{action:intent.kind,pluginId:intent.pluginId});
   return "Plugin "+label(d.pluginId)+(d.installed?
     " instalado permanentemente nesta conta. Reaparece em todos os aparelhos após o login.":
     " desativado nesta conta.");
 }
 if(intent.kind==="execute"){
   const data=await getStatus();
   const plugin=data.plugins.find(p=>p.id===intent.pluginId);
   if(!plugin?.installed)return "Plugin "+intent.pluginId+
     " não está instalado nesta conta. Use: Jarvis instale plugin "+intent.pluginId+".";
   const compatible=data.devices.filter(d=>{
     if(!d.online||!["mobile","desktop"].includes(d.type))return false;
     if(intent.preferredType&&d.type!==intent.preferredType)return false;
     if(d.type==="desktop")
       return ["youtube.open","calendar.open"].includes(intent.actionId)&&
         d.capabilities.includes("desktop.open.url");
     return d.capabilities.includes(intent.actionId==="youtube.open"?
       "app.open":intent.actionId);
   });
   if(!compatible.length)return "Nenhum dispositivo autorizado e online possui a capacidade "+
     intent.actionId+". Atualize o Bridge e pareie o aparelho na conta.";
   const target=compatible.length===1?compatible[0]:
     compatible.find(d=>d.id===selectedDeviceId);
   if(!target)return "Há vários dispositivos disponíveis: "+
     compatible.map(d=>label(d.name)+" ("+d.id.slice(0,8)+")").join("; ")+
     ". Escolha um com: Jarvis selecione dispositivo NOME_EXATO.";
   const queued=await io("/api/account/plugins/execute",{
     pluginId:intent.pluginId,actionId:intent.actionId,
     deviceId:target.id,payload:intent.payload||{}
   });
   let status=null;
   for(let i=0;i<5;i++){
     await new Promise(resolve=>setTimeout(resolve,1000));
     try{
       status=await io("/api/account/plugins/receipt",{commandId:queued.commandId});
       if(["completed","failed","expired","cancelled"].includes(status?.command?.status))break;
     }catch{break;}
   }
   const state=status?.command?.status||"pending";
   const result=status?.command?.result||{};
   if(state==="completed"){
     if(intent.actionId==="storage.diagnostics"&&result.totalBytes)
       return "Armazenamento de "+label(target.name)+": total "+pretty(result.totalBytes)+
         ", usado "+pretty(result.usedBytes)+", livre "+pretty(result.freeBytes)+
         ". Diagnóstico LOCAL, sem ler seus arquivos nem serviços de nuvem.";
     return "Comando "+intent.actionId+" processado no dispositivo "+label(target.name)+
       ". "+label(result.message||"Confira o resultado na tela do aparelho.")+
       (intent.actionId==="calendar.create"?
         " O evento não foi salvo automaticamente; confirme no aplicativo de agenda.":"");
   }
   if(state==="failed"){
     return "O dispositivo não confirmou execução de "+intent.actionId+": "+
       label(result.error||result.message||"falha do aplicativo")+
       (result.requiresUserTap?" Toque na notificação do J.A.R.V.I.S. no celular.":"");
   }
   return "Plugin "+intent.actionId+" enviado ao dispositivo "+label(target.name)+
     " (solicitação "+queued.commandId.slice(0,8)+"). Estado: "+state+
     ". A execução ainda não foi confirmada; confira o Bridge ou a notificação.";
 }
 return "Comando de plugin não reconhecido.";
}
window.fetch=async function jarvisAccountPluginFetch(input,init={}){
 if(!base||!isAi(input,init))return oldFetch(input,init);
 let body=null;
 try{body=JSON.parse(init.body||"{}");}catch{}
 const intent=parseAccountPluginCommand(body?.message||"");
 if(!intent)return oldFetch(input,init);
 try{
   const text=await process(intent);
   return answer(text,intent);
 }catch(error){
   const code=String(error?.message||"erro");
   const text=/account-login-not-configured|account-login-required|account-token-invalid|account-not-allowed|Failed to fetch|NetworkError/i.test(code)?
     "Não foi possível autenticar a conta de plugins. Configure Cloudflare Access, autorize este e-mail e faça login na sessão. Nenhuma ação foi executada.":
     "Não foi possível executar o plugin: "+label(code)+". Nenhuma ação foi confirmada.";
   return answer(text,intent);
 }
};
window.JARVIS_ACCOUNT_PLUGINS={
 get connected(){return Boolean(base);},
 list:getStatus,
 selectDevice(id){selectedDeviceId=String(id||"");return {selected:!!selectedDeviceId};},
 install:id=>io("/api/account/plugins",{action:"install",pluginId:id}),
 uninstall:id=>io("/api/account/plugins",{action:"uninstall",pluginId:id}),
 execute:input=>io("/api/account/plugins/execute",input),
 receipt:commandId=>io("/api/account/plugins/receipt",{commandId}),
 revoke:(deviceId,confirm)=>io("/api/account/devices/revoke",{deviceId,confirm:confirm===true}),
 pair:()=>io("/api/account/devices/pair",{deviceName:"Android J.A.R.V.I.S."})
};
