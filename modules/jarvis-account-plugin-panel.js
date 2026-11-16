/**
 * Account plugins in the EXISTING Neural terminal; no popup or second page.
 * The server verifies every account/device/action, and each destructive action
 * requires a separate operator click plus server-side confirmation.
 */
const short=value=>String(value??"").replace(/[\u0000-\u001f<>]/g," ").slice(0,160);
const accountApi=()=>window.JARVIS_ACCOUNT_PLUGINS;
const buffer=[];
function display(title,message,actions=[]){
  const output=document.getElementById("output-box");
  if(!output)return false;
  output.querySelector("#jarvis-account-plugin-panel")?.remove();
  const panel=document.createElement("div");
  panel.id="jarvis-account-plugin-panel";
  panel.className="jarvis-cc-inline-result jarvis-account-plugin-result";
  panel.setAttribute("role","region");
  panel.setAttribute("aria-label","Plugins permanentes da conta J.A.R.V.I.S.");
  const h=document.createElement("strong");
  h.textContent=short(title);
  const p=document.createElement("p");
  p.textContent=String(message??"").slice(0,2300);
  p.setAttribute("aria-live","polite");
  panel.append(h,p);
  const buttons=document.createElement("div");
  buttons.className="jarvis-account-plugin-actions";
  for(const item of actions.slice(0,16)){
    const b=document.createElement("button");
    b.type="button";
    b.textContent=short(item.label);
    b.addEventListener("click",async()=>{
      if(b.disabled)return;
      b.disabled=true;
      b.setAttribute("aria-busy","true");
      try{await item.run();}
      catch(error){
        display("PLUGIN / FALHA","O servidor não confirmou a ação: "+
          short(error?.message||"Erro desconhecido"),[
          {label:"Recarregar plugins",run:open}
        ]);
      }finally{
        b.disabled=false;
        b.removeAttribute("aria-busy");
      }
    });
    buttons.append(b);
  }
  if(buttons.children.length)panel.append(buttons);
  output.append(panel);
  while(output.children.length>90)output.firstElementChild?.remove();
  output.scrollTop=output.scrollHeight;
  return true;
}
function authError(error){
 const code=short(error?.message||error);
 const auth=/account-login|account-not-allowed|origin-not-allowed|Failed to fetch|NetworkError/i.test(code);
 return auth?
  "A conta ainda não está autenticada para os plugins. Configure a política Cloudflare Access "+
  "e entre com o e-mail autorizado. Nenhuma ação foi executada. Diagnóstico: "+code:
  "Não foi possível validar os plugins desta conta: "+code;
}
async function open(){
 const api=accountApi();
 if(!api?.list){display("PLUGINS / MÓDULO INDISPONÍVEL",
   "O módulo de plugins não foi carregado. Atualize o J.A.R.V.I.S.");return;}
 display("PLUGINS DA CONTA","Consultando instalações persistentes e aparelhos autorizados...");
 try{
   const data=await api.list();
   const plugins=Array.isArray(data.plugins)?data.plugins:[];
   const devices=Array.isArray(data.devices)?data.devices.filter(d=>d.status==="active"):[];
   const online=devices.filter(d=>d.online);
   const summary=plugins.map(p=>short(p.name||p.id)+
     (p.installed?" instalado":" desativado")).join(" · ");
   const controls=[
     {label:"Atualizar plugins",run:open},
     ...plugins.slice(0,4).map(p=>({
       label:(p.installed?"Desativar ":"Instalar ")+short(p.name||p.id),
       run:async()=>{
         if(p.installed)await api.uninstall(p.id);
         else await api.install(p.id);
         await open();
       }
     })),
     {label:"Vincular Android nesta conta",run:async()=>{
       const pairing=await api.pair();
       if(!/^\d{6}$/.test(String(pairing?.code||"")))
         throw Error("Nenhum código válido foi retornado.");
       display("PAREAR DISPOSITIVO DA CONTA",
         "Código temporário "+pairing.code+". Digite-o no J.A.R.V.I.S. Bridge. "+
         "Este código expira em "+Math.ceil((pairing.expiresInSeconds||600)/60)+
         " minutos e não deve ser compartilhado.",[
           {label:"Voltar aos plugins",run:open}
         ]);
     }},
     ...online.slice(0,7).map(d=>({
       label:"Dispositivo: "+short(d.name||d.type),
       run:()=>deviceMenu(d.id)
     }))
   ];
   display("PLUGINS PERMANENTES / CONTA VALIDADA",
     (summary||"Nenhum plugin no catálogo.")+". "+
     devices.length+" dispositivo(s) vinculado(s), "+online.length+" online. "+
     "Cada ação exige um dispositivo pareado e permissões válidas. "+
     "Contas diferentes não compartilham acesso a aparelhos.",controls);
 }catch(error){display("PLUGINS / ACESSO NÃO CONFIRMADO",authError(error),[
   {label:"Tentar novamente",run:open}
 ]);}
}
async function deviceMenu(id){
 const api=accountApi();
 const data=await api.list();
 const device=data.devices?.find(d=>d.id===id&&d.status==="active"&&d.online);
 if(!device){
   display("DISPOSITIVO NÃO DISPONÍVEL",
     "O aparelho está offline, foi revogado ou não pertence a esta conta.",[
       {label:"Voltar",run:open}
     ]);return;
 }
 const installed=new Set(data.plugins?.filter(p=>p.installed).map(p=>p.id)||[]);
 const allows=name=>device.capabilities?.includes(name)===true;
 const mobile=device.type==="mobile",desktop=device.type==="desktop";
 const controls=[{label:"Voltar aos plugins",run:open}];
 if(installed.has("youtube")&&(mobile&&allows("app.open")||desktop&&allows("desktop.open.url")))
   controls.push({label:"Abrir YouTube",run:()=>execute(id,"youtube","youtube.open")});
 if(installed.has("agenda")&&(mobile&&allows("calendar.open")||desktop&&allows("desktop.open.url")))
   controls.push({label:"Abrir Agenda",run:()=>execute(id,"agenda","calendar.open")});
 if(installed.has("armazenamento")&&mobile&&allows("storage.diagnostics"))
   controls.push({label:"Diagnóstico de armazenamento",
     run:()=>execute(id,"armazenamento","storage.diagnostics")});
 controls.push({label:"Revogar acesso ao dispositivo",run:()=>confirmRevocation(id)});
 display("DISPOSITIVO / "+short(device.name||device.type),
   "Identidade validada nesta conta. Tipo: "+short(device.type)+
   ". As ações dependem dos plugins instalados e do sistema operacional. "+
   "Ao revogar, será necessário parear novamente.",controls);
}
async function execute(deviceId,pluginId,actionId){
 const api=accountApi();
 const queued=await api.execute({pluginId,actionId,deviceId,payload:{}});
 if(!queued?.commandId)throw Error("O servidor não retornou ID da solicitação.");
 const readReceipt=async()=>{
   const result=await api.receipt(queued.commandId);
   const state=String(result?.command?.status||"pending");
   const details=result?.command?.result||{};
   let message=state==="completed"?
     "O Android/PC informou que processou a ação. Confirme o resultado na tela. "+
       short(details.message||""):
     state==="failed"?
       "O dispositivo informou falha: "+short(details.error||details.message||"sem detalhes"):
       "A execução ainda não foi confirmada pelo dispositivo.";
   if(state==="completed"&&actionId==="storage.diagnostics"&&
     Number.isFinite(details.totalBytes)&&Number.isFinite(details.freeBytes)){
     const gb=n=>(n/1073741824).toFixed(2)+" GB";
     message="Armazenamento local: total "+gb(details.totalBytes)+
       ", livre "+gb(details.freeBytes)+
       ". Nenhum arquivo pessoal nem dado da nuvem foi lido.";
   }
   display("RECIBO / "+short(state),message,[
     {label:"Atualizar recibo",run:readReceipt},
     {label:"Voltar aos plugins",run:open}
   ]);
 };
 display("PLUGIN / COMANDO ENFILEIRADO",
   "Solicitação "+queued.commandId.slice(0,8)+" enviada para "+short(actionId)+
   ". A ação ainda NÃO foi confirmada. Alguns aplicativos exigem toque no aparelho.",[
     {label:"Verificar execução",run:readReceipt},
     {label:"Voltar",run:open}
   ]);
}
async function confirmRevocation(id){
 const api=accountApi(),data=await api.list();
 const device=data.devices?.find(d=>d.id===id&&d.status==="active");
 if(!device){
   display("REVOGAÇÃO NÃO DISPONÍVEL","O aparelho não está mais autorizado.",[
     {label:"Voltar",run:open}
   ]);return;
 }
 display("CONFIRMAR REVOGAÇÃO",
   "Revogar "+short(device.name||device.type)+
   "? A credencial do Bridge deixará de funcionar. Comandos pendentes serão cancelados.",[
     {label:"Cancelar",run:open},
     {label:"CONFIRMAR REVOGAÇÃO",run:async()=>{
       const result=await api.revoke(id,true);
       if(result?.status!=="revoked")throw Error("A revogação não foi confirmada.");
       display("ACESSO REVOGADO",
         "Este aparelho foi revogado da conta. Para reativá-lo, faça novo pareamento.",[
           {label:"Atualizar plugins",run:open}
         ]);
     }}
   ]);
}
window.JARVIS_ACCOUNT_PLUGIN_PANEL={open};
