export function clock(){
  return new Date().toLocaleTimeString("pt-BR",{hour12:false});
}
export function addLog(box,message,type="normal"){
  const p=document.createElement("p");
  p.className=type==="alert"?"alert":"";
  p.textContent=`> [${clock()}] ${message}`;
  box.appendChild(p); box.scrollTop=box.scrollHeight;
}
