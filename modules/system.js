export function clock(){
  return new Date().toLocaleTimeString("pt-BR",{hour12:false});
}
export function addLog(box,message,type="normal",preserveTechnical=false){
  const p=document.createElement("p");
  p.className=type==="alert"?"alert":"";
  if(preserveTechnical)p.setAttribute("data-preserve-legacy-name","");
  p.textContent=`> [${clock()}] ${message}`;
  box.appendChild(p); box.scrollTop=box.scrollHeight;
}
