import API_CONFIG from "../config.js";

// J.A.R.V.I.S. // Remote Shared Storage v0.8.
// Never opens whole Android app-private data. All operations require a PIN
// created by a deliberate touch on the paired phone and a real Cloud heartbeat.
// No auto-scanning, no remote writes/deletes, no AI tool ingestion.
const API_BASE = String(API_CONFIG?.backendUrl || "").replace(/\/$/, "");
const TRANSFER_MAX = 16 * 1024 * 1024;
const PREVIEW_MAX = 256 * 1024;
const IMAGE_MAX = 4 * 1024 * 1024;
const CHUNK_MAX = 80 * 1024;
const forbidden = /^(?:internal|sd\d+):(?:Android\/(?:data|obb)(?:\/|$))/i;

function make(tag, text, className) {
  const el=document.createElement(tag);
  if(text!=null)el.textContent=text;
  if(className)el.className=className;
  return el;
}

function safePath(path) {
  const p=String(path??"");
  if(p.length>700||p.includes("\0")||p.includes("\\")||
     p.split("/").some(part=>part===".."||part===".")||forbidden.test(p))
    throw Error("Caminho protegido ou inválido.");
  if(p!==""&&!/^(?:internal|sd\d+):(?:[^:]*)$/.test(p))
    throw Error("Volume não autorizado.");
  return p;
}

function prettySize(size) {
  const n=Number(size)||0;
  return n>=1048576?(n/1048576).toFixed(1)+" MiB":
    n>=1024?(n/1024).toFixed(0)+" KiB":n+" B";
}

function decode64(data) {
  const value=atob(String(data||""));
  const bytes=new Uint8Array(value.length);
  for(let i=0;i<value.length;i++)bytes[i]=value.charCodeAt(i);
  return bytes;
}

function install() {
  const terminal=document.querySelector(".jarvis-cc-console-terminal")||
    document.getElementById("jarvis-cc-input-slot");
  if(!terminal||document.getElementById("jarvis-phone-files"))return;

  const panel=make("section",null,"jarvis-phone-files");
  panel.id="jarvis-phone-files";
  panel.hidden=true;
  panel.setAttribute("aria-label","Explorador remoto da memória compartilhada do celular");
  const header=make("header",null,"jarvis-phone-files-head");
  const label=make("strong","◈  J.A.R.V.I.S.  /  ARQUIVOS DO CELULAR");
  const close=make("button","FECHAR","jarvis-phone-files-ghost");
  close.type="button";
  close.addEventListener("click",()=>{panel.hidden=true;clearPreview();pin.value="";});
  header.append(label,close);
  panel.append(header);
  const note=make("p","Acesso a pastas compartilhadas do Android, mediante permissão especial e PIN de 8 dígitos gerado no aplicativo. Não abrange áreas privadas de outros apps. Arquivos não são enviados à IA.");
  panel.append(note);
  const auth=make("div",null,"jarvis-phone-files-auth");
  const pin=make("input");
  pin.id="jarvis-phone-files-pin";
  pin.type="password";pin.maxLength=32;pin.autocomplete="off";pin.autocapitalize="off";pin.spellcheck=false;
  pin.placeholder="PIN de 8 números ou chave permanente de 32 caracteres";
  pin.setAttribute("aria-label","PIN temporário ou chave permanente do celular");
  const browse=make("button","ABRIR MEMÓRIA DO CELULAR","jarvis-phone-files-primary");
  browse.type="button";
  auth.append(pin,browse);
  panel.append(auth);
  const status=make("p","No J.A.R.V.I.S. Bridge v0.8.0, autorize o armazenamento e escolha o modo temporário ou MANTER ACESSO ATÉ EU DESATIVAR. Depois insira a chave mostrada pelo telefone.","jarvis-phone-files-status");
  status.setAttribute("role","status");
  status.setAttribute("aria-live","polite");
  panel.append(status);
  const nav=make("div",null,"jarvis-phone-files-nav");
  const root=make("button","VOLUMES","jarvis-phone-files-ghost");
  const up=make("button","VOLTAR UMA PASTA","jarvis-phone-files-ghost");
  const crumb=make("span","—","jarvis-phone-files-crumb");
  const more=make("button","MAIS ARQUIVOS","jarvis-phone-files-ghost");
  for(const b of [root,up,more])b.type="button";
  more.hidden=true;
  nav.append(root,up,crumb,more);
  panel.append(nav);
  const listing=make("div",null,"jarvis-phone-files-list");
  panel.append(listing);
  const preview=make("div",null,"jarvis-phone-files-preview");
  preview.hidden=true;panel.append(preview);
  terminal.prepend(panel);

  let device=null;
  let path="";
  let nextOffset=0;
  let busy=false;
  let previewUrl=null;
  let startedAt=0;
  let requestedPath="";

  function setStatus(text,alert=false) {
    status.textContent=String(text||"");
    status.dataset.error=alert?"true":"false";
  }
  function clearPreview() {
    if(previewUrl){URL.revokeObjectURL(previewUrl);previewUrl=null;}
    preview.replaceChildren();preview.hidden=true;
  }
  function open() {
    panel.hidden=false;
    panel.scrollIntoView({behavior:"smooth",block:"start"});
    pin.focus({preventScroll:true});
  }
  function currentPin() {
    const value=String(pin.value||"").trim();
    if(!/^(?:\d{8}|[a-fA-F0-9]{32})$/.test(value))
      throw Error("Digite o PIN temporário de 8 números ou a chave permanente de 32 caracteres.");
    return value.length===32?value.toUpperCase():value;
  }
  async function post(path,body) {
    const resp=await fetch(API_BASE+path,{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      cache:"no-store",
      body:JSON.stringify(body)
    });
    const value=await resp.json().catch(()=>({}));
    if(!resp.ok||value.ok===false)throw Error(value.error||"HTTP "+resp.status);
    return value;
  }
  async function cloudCommand(command,payload) {
    const key=window.ULTRON_MEMORY?.getMemoryKey?.();
    if(!key)throw Error("Identidade do J.A.R.V.I.S. ainda indisponível.");
    if(!device?.online)throw Error("O celular precisa estar ONLINE no J.A.R.V.I.S.");
    if(currentPin().length===8 && Date.now()-startedAt>10*60_000)
      throw Error("Sessão temporária expirada. Ative uma nova sessão no celular.");
    const issued=await window.ULTRON_DEVICES.sendCommand(device.id,command,{
      accessCode:currentPin(),...payload
    });
    if(!issued?.commandId)throw Error("Gateway não gerou uma ordem autenticada.");
    for(let tries=0;tries<45;tries++){
      await new Promise(resolve=>setTimeout(resolve,1400));
      const state=await post("/api/control/status",{
        memoryKey:key,commandId:issued.commandId
      });
      const item=state.command||{};
      if(item.status==="completed") {
        if(!item.result||item.result.ok===false)
          throw Error(item.result?.error||"Resposta temporária não disponível; tente novamente.");
        return item.result;
      }
      if(["failed","expired","cancelled"].includes(item.status))
        throw Error(item.result?.error||"Comando "+item.status+".");
    }
    throw Error("Celular não respondeu em tempo hábil. Confira o Bridge no telefone.");
  }
  async function chooseDevice() {
    const api=window.ULTRON_DEVICES;
    if(!api?.listDevices||!api?.sendCommand)
      throw Error("Central de dispositivos não inicializada.");
    const devices=await api.listDevices();
    const online=(devices||[]).filter(d=>d.deviceType==="mobile"&&
      d.status==="active"&&d.online===true);
    if(!online.length)throw Error("Nenhum celular ONLINE. Inicie o Bridge e verifique o Cloud.");
    // Existing paired devices may retain their v0.6.0 capability snapshot
    // after an APK update. Let the v0.7 Android service itself accept/reject
    // the command instead of forcing yet another pairing.
    device=online[0];
    return device;
  }
  function getParent(p) {
    if(!p||p.endsWith(":"))return "";
    const pos=p.lastIndexOf("/");
    return pos<0?p.slice(0,p.indexOf(":")+1):p.slice(0,pos);
  }
  async function listFolder(next="",offset=0) {
    if(busy)return;
    busy=true;
    clearPreview();
    browse.disabled=true;
    more.disabled=true;
    try{
      const safe=safePath(next);
      if(!device)await chooseDevice();
      setStatus("Consultando "+(safe||"volumes")+" no celular...");
      const data=await cloudCommand("files.list",{path:safe,offset});
      if(offset===0)listing.replaceChildren();
      const entries=Array.isArray(data.entries)?data.entries:[];
      for(const item of entries) {
        if(!item||typeof item.name!=="string")continue;
        let itemPath;
        try{itemPath=safePath(item.path);}catch{continue;}
        const row=make("button",null,"jarvis-phone-files-entry");
        row.type="button";
        const name=make("strong",(item.directory?"📁  ":"📄  ")+item.name);
        const meta=make("span",item.directory?"PASTA":prettySize(item.size));
        row.append(name,meta);
        row.addEventListener("click",()=>{
          if(item.directory)void listFolder(itemPath);
          else void retrieve(itemPath,item);
        });
        listing.append(row);
      }
      path=safe;
      crumb.textContent=path||"VOLUMES DO CELULAR";
      nextOffset=Number(data.nextOffset)||0;
      more.hidden=!data.hasMore;
      setStatus(entries.length+" item(ns) carregado(s) • "+
        (device.deviceName||"Android")+" • Acesso autenticado");
      return {ok:true,opened:true,path:safe,items:entries.length};
    }catch(error){setStatus(error?.message||String(error),true);
      return {ok:false,error:String(error?.message||error)};}
    finally{busy=false;browse.disabled=false;more.disabled=false;}
  }
  async function retrieve(filename,entry) {
    if(busy)return;
    busy=true;clearPreview();browse.disabled=true;
    const size=Number(entry.size)||0;
    const label=entry.name||"arquivo";
    try {
      safePath(filename);
      if(size>TRANSFER_MAX)
        throw Error("Este arquivo excede 16 MiB. Pastas podem ser navegadas, mas a transferência remota de vídeos e arquivos maiores ainda não está disponível.");
      const parts=[];
      let offset=0;
      const filenameSafe=label.slice(0,200).replace(/[\\/\x00-\x1F]/g,"_");
      do {
        setStatus("Transferindo "+filenameSafe+" • "+prettySize(offset)+" / "+prettySize(size));
        const response=await cloudCommand("files.read",{path:filename,offset});
        if(Number(response.offset)!==offset||Number(response.size)!==size)
          throw Error("Arquivo mudou durante a transferência. Operação cancelada.");
        const chunk=decode64(response.base64);
        if(chunk.byteLength>CHUNK_MAX||Number(response.nextOffset)!==offset+chunk.byteLength)
          throw Error("Bloco de arquivo inválido.");
        parts.push(chunk);
        offset+=chunk.byteLength;
        if(!chunk.byteLength&&offset<size)
          throw Error("Transferência incompleta.");
        if(response.done&&offset!==size)
          throw Error("Arquivo mudou durante a transferência.");
      }while(offset<size);
      const mime=(/\.(txt|md|json|csv|html|css|js|mjs|xml|yaml|yml|log)$/i.test(filenameSafe))
        ?"text/plain;charset=utf-8":(String(entry.mime||"")||undefined);
      const blob=new Blob(parts,{type:mime||"application/octet-stream"});
      previewUrl=URL.createObjectURL(blob);
      preview.hidden=false;
      preview.append(make("strong",filenameSafe+" • "+prettySize(blob.size)));
      const download=make("a","BAIXAR ESTE ARQUIVO","jarvis-phone-files-download");
      download.href=previewUrl;download.download=filenameSafe;
      preview.append(download);
      if(size<=PREVIEW_MAX&&/\.(txt|md|json|csv|html|css|js|mjs|xml|yaml|yml|log)$/i.test(filenameSafe)){
        const text=await blob.text();
        preview.append(make("pre",text.slice(0,PREVIEW_MAX),"jarvis-phone-files-text"));
      }else if(size<=IMAGE_MAX&&/\.(png|jpg|jpeg|gif|webp)$/i.test(filenameSafe)){
        const img=make("img");img.src=previewUrl;img.alt="Pré-visualização de "+filenameSafe;
        preview.append(img);
      }
      setStatus("Arquivo disponível para pré-visualização ou download. Conteúdo não enviado à IA.");
    }catch(error){setStatus(error?.message||String(error),true);}
    finally{busy=false;browse.disabled=false;}
  }
  browse.addEventListener("click",async()=>{
    if(busy)return;
    try{device=null;startedAt=Date.now();await chooseDevice();await listFolder(requestedPath||"");}
    catch(e){setStatus(e?.message||String(e),true);}
  });
  root.addEventListener("click",()=>{void listFolder("");});
  up.addEventListener("click",()=>{void listFolder(getParent(path));});
  more.addEventListener("click",()=>{void listFolder(path,nextOffset);});

  // Preserve the existing ARQUIVOS / Local Core action.
  // Provide a separate, always visible Android remote-files control.
  const quick=document.querySelector(".jarvis-cc-tool-actions");
  if(quick&&!document.getElementById("btn-remote-phone-files")){
    const button=make("button","ARQUIVOS DO CELULAR");
    button.id="btn-remote-phone-files";
    button.type="button";
    button.setAttribute("aria-label","Explorar a memória compartilhada do celular");
    let lastPress=0;
    button.addEventListener("pointerdown",event=>{
      if(event.button!==0)return;
      lastPress=Date.now();open();
    });
    button.addEventListener("click",()=>{
      if(Date.now()-lastPress<850)return;
      open();
    });
    quick.append(button);
  }
  async function openFolder(target) {
    try {
      requestedPath=safePath(target);
      open();
      if(!pin.value.trim()) {
        setStatus("Comando entendido: abrir "+(requestedPath||"volumes")+
          ". Digite o PIN ou chave de autorização do celular e toque em ABRIR MEMÓRIA DO CELULAR.");
        return {ok:true,waitingAuthorization:true,path:requestedPath};
      }
      currentPin();
      startedAt=Date.now();
      device=null;
      await chooseDevice();
      return await listFolder(requestedPath);
    }catch(error) {
      setStatus(error?.message||String(error),true);
      return {ok:false,error:String(error?.message||error)};
    }
  }
  window.JARVIS_PHONE_FILES={open,openFolder,get state(){return{visible:!panel.hidden,device:device?.deviceName||null,
    path,readOnly:true,maxTransferBytes:TRANSFER_MAX,persistentSupported:true};}};
}

if(document.readyState==="loading"){
  document.addEventListener("DOMContentLoaded",install,{once:true});
}else install();
