// All file access is local to the browser running J.A.R.V.I.S.
// User-selected only. No implicit upload, remote deletion, arbitrary filesystem
// paths, cloud mirroring, recursive scans or privileged Android operations.
export const JARVIS_MAX_TEXT_FILE_BYTES=512*1024;
export const JARVIS_EDITABLE_EXTENSIONS=Object.freeze([
 ".txt",".md",".json",".csv",".html",".css",".js",".mjs",".xml",".yaml",".yml",".log"
]);
export function safeTextFileName(name){
 if(typeof name!=="string"||!name.trim()||name.length>160||/[\/\\\0-\x1f]/.test(name))return false;
 const key=name.toLowerCase();
 return !name.startsWith(".")&&JARVIS_EDITABLE_EXTENSIONS.some(ext=>key.endsWith(ext));
}
export function canEditSelectedFile(file){
 return !!file&&safeTextFileName(file.name)&&Number.isSafeInteger(file.size)&&
  file.size>=0&&file.size<=JARVIS_MAX_TEXT_FILE_BYTES;
}
export function changedFromOriginal(original,current){
 return String(original??"")!==String(current??"");
}
export function safeEditableText(buffer){
 if(!(buffer instanceof ArrayBuffer)||buffer.byteLength>JARVIS_MAX_TEXT_FILE_BYTES)return null;
 try{
  const content=new TextDecoder("utf-8",{fatal:true}).decode(buffer);
  // Never open binary/executable content masquerading as .txt.
  if(content.includes("\0"))return null;
  return content;
 }catch{return null;}
}
export function fileEditorSummary({fileName="",changed=false,writable=false}={}){
 return "ARQUIVO LOCAL "+String(fileName).slice(0,160)+
  (changed?" · alteração não salva":" · sem alterações")+
  (writable?" · gravação direta sob confirmação":" · exportação de cópia apenas");
}
