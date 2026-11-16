import {canEditSelectedFile,safeEditableText,changedFromOriginal,fileEditorSummary}
 from "./jarvis-scoped-files-model.js?v=5.39.0";
// Local file editor: contents never sent to backend, AI, telemetry or storage.
// Only selected files, explicit save by operator and export fallback.
const el=(tag,text,cls)=>{const n=document.createElement(tag);
 if(text!==undefined)n.textContent=text;
 if(cls)n.className=cls;
 return n;
};
let panel=null,editor=null,status=null,fileInput=null;
let chosen=null,original="",handle=null,token=0;
let lastResult={ok:false,error:"Nenhum arquivo autorizado."};
function reset(){
 ++token;chosen=null;handle=null;original="";
 if(editor){editor.value="";editor.disabled=true;}
 if(status)status.textContent="Nenhum arquivo selecionado.";
}
function close(){if(panel)panel.hidden=true;reset();return {ok:true,closed:true};}
function present(){
 if(!panel)return;
 status.textContent=chosen?fileEditorSummary({
  fileName:chosen.name,changed:changedFromOriginal(original,editor.value),writable:!!handle
 }):"Nenhum arquivo selecionado.";
}
async function useSelected(file,selectedHandle=null){
 const id=++token;chosen=null;handle=null;
 if(!canEditSelectedFile(file)){
  lastResult={ok:false,error:"Somente arquivos de texto suportados até 512 KiB. "+
   "Não acesse executáveis, dados secretos ou arquivos binários."};
  if(status)status.textContent=lastResult.error;
  return lastResult;
 }
 try{
  const value=safeEditableText(await file.arrayBuffer());
  if(id!==token)return {ok:false,error:"Seleção substituída."};
  if(value===null)throw Error("Conteúdo inválido para texto UTF-8.");
  chosen=file;handle=selectedHandle;original=value;editor.value=value;
  editor.disabled=false;present();
  lastResult={ok:true,fileName:file.name,size:file.size,
   writable:!!selectedHandle,localOnly:true};
  return lastResult;
 }catch(error){
  lastResult={ok:false,error:String(error?.message||"Leitura local indisponível.")};
  if(status)status.textContent=lastResult.error;
  return lastResult;
 }
}
async function pickFile(){
 if(typeof window.showOpenFilePicker==="function"){
  try{
   const handles=await window.showOpenFilePicker({multiple:false,
    types:[{description:"Arquivos de texto",accept:{"text/plain":[
     ".txt",".md",".json",".csv",".html",".css",".js",".mjs",".xml",".yaml",".yml",".log"
    ]}}]});
   if(handles?.[0]){
    const file=await handles[0].getFile();
    return useSelected(file,handles[0]);
   }
   return {ok:false,error:"Nenhum arquivo selecionado."};
  }catch(error){
   if(error?.name==="AbortError")return {ok:false,error:"Seleção cancelada."};
   // Some browsers expose API but don't support it on mobile: fallback to input.
   if(status)status.textContent="Seletor avançado não disponível; escolha arquivo pelo navegador.";
  }
 }
 fileInput.value="";
 fileInput.click();
 return {ok:true,pendingUserSelection:true};
}
function exportCopy(){
 if(!chosen||!editor)return {ok:false,error:"Nenhum arquivo selecionado."};
 // Export a copy under a different name; NEVER overwrite without permission.
 const name=chosen.name.replace(/(\.[^.]+)$/, "-jarvis-revisado$1");
 const blob=new Blob([editor.value],{type:"text/plain;charset=utf-8"});
 const url=URL.createObjectURL(blob);
 const link=el("a");link.href=url;link.download=name;document.body.append(link);
 link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),3000);
 lastResult={ok:true,download:name,originalIntact:true};
 status.textContent="Cópia revisada solicitada para download. Original não modificado.";
 return lastResult;
}
async function saveDirect(){
 if(!chosen||!editor||!handle||typeof handle.createWritable!=="function"){
  lastResult={ok:false,error:"Gravação direta indisponível neste navegador. "+
   "Use EXPORTAR CÓPIA REVISADA; o original permanece intacto."};
  status.textContent=lastResult.error;return lastResult;
 }
 if(!changedFromOriginal(original,editor.value)){
  status.textContent="Sem alterações para salvar.";
  return {ok:true,unchanged:true};
 }
 // Explicit user decision for every replacement, including repeated saves.
 if(!window.confirm("Substituir o conteúdo de "+chosen.name+
   " no dispositivo atual? Salve uma cópia de segurança antes de continuar.")){
  lastResult={ok:false,error:"Substituição cancelada."};
  status.textContent=lastResult.error;return lastResult;
 }
 const currentId=token,currentText=editor.value;
 try{
  // Refuse overwrite if another app edited this file since the snapshot.
  const latest=await handle.getFile();
  if(currentId!==token)throw Error("Arquivo selecionado foi alterado.");
  if(!canEditSelectedFile(latest))throw Error("Arquivo ultrapassou o limite de tamanho.");
  const latestText=safeEditableText(await latest.arrayBuffer());
  if(latestText!==original)throw Error("O arquivo mudou no armazenamento desde a abertura. "+
   "Reabra-o antes de gravar para evitar perda de dados.");
  if(currentId!==token)throw Error("Arquivo selecionado foi alterado.");
  const writer=await handle.createWritable({keepExistingData:false});
  try{await writer.write(currentText);await writer.close();}
  catch(error){await writer.abort?.().catch(()=>{});throw error;}
  if(currentId!==token)throw Error("Arquivo selecionado foi alterado durante a gravação.");
  chosen=await handle.getFile();
  original=currentText;present();
  lastResult={ok:true,saved:true,fileName:chosen.name,localOnly:true};
  status.textContent="Gravação concluída no arquivo autorizado do dispositivo atual.";
  return lastResult;
 }catch(error){
  lastResult={ok:false,error:"Não gravado: "+String(error?.message||error).slice(0,210)};
  status.textContent=lastResult.error;
  return lastResult;
 }
}
function build(){
 if(panel?.isConnected)return true;
 const stage=document.querySelector(".jarvis-cc-center");
 if(!stage)return false;
 panel=el("section",undefined,"jarvis-scoped-files");
 panel.hidden=true;panel.setAttribute("aria-label","Editor local de arquivos autorizados");
 const head=el("header",undefined,"jarvis-scoped-files-head");
 head.append(el("strong","J.A.R.V.I.S. // ARQUIVOS AUTORIZADOS"));
 const x=el("button","×");x.type="button";
 x.setAttribute("aria-label","Fechar edição de arquivos");x.addEventListener("click",close);
 head.append(x);
 const note=el("p","ACESSO LOCAL: escolha um arquivo no dispositivo em que o J.A.R.V.I.S. "+
  "está aberto. Arquivos de um celular pareado não são acessados remotamente. "+
  "Nenhum conteúdo é enviado automaticamente para IA ou servidor.");
 const actions=el("div",undefined,"jarvis-scoped-file-actions");
 const select=el("button","ESCOLHER ARQUIVO");select.type="button";
 select.addEventListener("click",()=>{void pickFile();});
 const save=el("button","SALVAR NESTE DISPOSITIVO");save.type="button";
 save.addEventListener("click",()=>{void saveDirect();});
 const download=el("button","EXPORTAR CÓPIA REVISADA");download.type="button";
 download.addEventListener("click",exportCopy);
 const pair=el("button","PAREAR CELULAR");pair.type="button";
 pair.addEventListener("click",()=>{
  const existing=document.getElementById("btn-pair-mobile");
  if(existing)existing.click();
  else status.textContent="O módulo de pareamento não está disponível nesta página.";
 });
 actions.append(select,save,download,pair);
 fileInput=el("input");fileInput.type="file";fileInput.multiple=false;
 fileInput.hidden=true;fileInput.accept=".txt,.md,.json,.csv,.html,.css,.js,.mjs,.xml,.yaml,.yml,.log";
 fileInput.setAttribute("aria-label","Selecionar arquivo de texto no dispositivo");
 fileInput.addEventListener("change",()=>{
  const file=fileInput.files?.[0];if(file)void useSelected(file);
 });
 editor=el("textarea");editor.rows=9;editor.disabled=true;
 editor.maxLength=1024*1024;editor.setAttribute("aria-label","Editar texto do arquivo autorizado");
 editor.spellcheck=false;editor.addEventListener("input",present);
 status=el("p","Nenhum arquivo selecionado.","jarvis-scoped-file-status");
 status.setAttribute("aria-live","polite");
 panel.append(head,note,actions,fileInput,editor,status);stage.append(panel);
 return true;
}
function open(){
 if(!build())return {ok:false,error:"Neural Jarvis indisponível."};
 panel.hidden=false;present();return {ok:true,localOnly:true};
}
const quick=document.querySelector(".quick-actions");
if(quick&&!document.getElementById("btn-jarvis-scoped-files")){
 const b=el("button","EDITAR ARQUIVOS");b.id="btn-jarvis-scoped-files";b.type="button";
 b.addEventListener("click",open);quick.append(b);
}
window.ULTRON_SCOPED_FILES={open,close,selectFile:useSelected,
 get state(){return {open:!!panel&&!panel.hidden,selected:chosen?.name||null,
  edited:!!chosen&&changedFromOriginal(original,editor?.value),directWrite:!!handle,
  remoteMobileFiles:false,localOnly:true,lastResult};}};
window.addEventListener("ultron:emergency-stop",close);
window.addEventListener("ultron:new-conversation",close);
