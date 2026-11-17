// Local Android storage telemetry in the existing Neural Ring. No file contents leave the device.
const fmt=n=>Number.isFinite(n)&&n>=0?(n/1073741824).toLocaleString("pt-BR",{maximumFractionDigits:2})+" GB":"—";
let panel;
function ensure(){
 if(panel?.isConnected)return panel;
 const stage=document.querySelector(".neural-stage .orb-stage");
 if(!stage)return null;
 if(!document.getElementById("jarvis-storage-neural-style")){
  const style=document.createElement("style");style.id="jarvis-storage-neural-style";
  style.textContent=`.orb-stage{position:relative}.jarvis-storage-neural{position:absolute;z-index:80;inset:8px;display:flex;align-items:center;justify-content:center;pointer-events:none}.jarvis-storage-neural[hidden]{display:none}.jarvis-storage-card{pointer-events:auto;box-sizing:border-box;width:min(94%,480px);max-height:96%;overflow:auto;padding:18px;border:1px solid rgba(218,177,88,.65);border-radius:18px;background:rgba(7,14,23,.97);color:#f6f2e7;box-shadow:0 15px 45px rgba(0,0,0,.65);font:14px/1.5 system-ui,sans-serif}.jarvis-storage-header{display:flex;align-items:start;justify-content:space-between;gap:10px}.jarvis-storage-header strong{font-size:17px;color:#efcf83}.jarvis-storage-header small{display:block;color:#c9bca0}.jarvis-storage-close{background:transparent;border:1px solid #a98a4c;border-radius:8px;color:white;padding:3px 10px;cursor:pointer}.jarvis-storage-metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:14px 0}.jarvis-storage-metrics div{padding:10px 6px;border-radius:9px;background:#172332;text-align:center;min-width:0}.jarvis-storage-metrics small{display:block;color:#b7c0ce}.jarvis-storage-metrics strong{font-size:clamp(12px,2.5vw,18px);overflow-wrap:anywhere}.jarvis-storage-track{height:10px;background:#34404a;border-radius:10px;overflow:hidden}.jarvis-storage-fill{height:100%;width:0;background:linear-gradient(90deg,#b18a42,#f6d68e);transition:width .35s}.jarvis-storage-status{margin:10px 0 0;color:#d3dbe3;overflow-wrap:anywhere}`;
  document.head.appendChild(style);
 }
 panel=document.createElement("section");panel.className="jarvis-storage-neural";panel.hidden=true;
 panel.setAttribute("aria-label","Diagnóstico de armazenamento do celular");
 const card=document.createElement("div");card.className="jarvis-storage-card";card.setAttribute("role","status");card.setAttribute("aria-live","polite");
 const header=document.createElement("div");header.className="jarvis-storage-header";
 const heading=document.createElement("div");const title=document.createElement("strong");title.textContent="DIAGNÓSTICO DO CELULAR";
 const device=document.createElement("small");device.dataset.field="device";heading.append(title,device);
 const close=document.createElement("button");close.type="button";close.className="jarvis-storage-close";close.textContent="✕";close.setAttribute("aria-label","Fechar diagnóstico");close.addEventListener("click",()=>{panel.hidden=true;});header.append(heading,close);
 const metrics=document.createElement("div");metrics.className="jarvis-storage-metrics";
 for(const field of ["total","used","free"]){const cell=document.createElement("div");const name=document.createElement("small");name.textContent=({total:"Total",used:"Utilizado",free:"Livre"})[field];const value=document.createElement("strong");value.dataset.field=field;value.textContent="—";cell.append(name,value);metrics.appendChild(cell);}
 const track=document.createElement("div");track.className="jarvis-storage-track";const fill=document.createElement("div");fill.className="jarvis-storage-fill";fill.dataset.field="fill";track.appendChild(fill);
 const message=document.createElement("p");message.className="jarvis-storage-status";message.dataset.field="status";
 card.append(header,metrics,track,message);panel.appendChild(card);stage.appendChild(panel);return panel;
}
export function showStorageDiagnostic({deviceName="Android",status="pending",result={},message=""}={}){
 const root=ensure();if(!root)return false;
 root.hidden=false;root.querySelector('[data-field="device"]').textContent=String(deviceName).slice(0,80);
 const total=Number(result.totalBytes),used=Number(result.usedBytes),free=Number(result.freeBytes);
 const valid=status==="completed"&&Number.isFinite(total)&&total>0&&
  Number.isFinite(used)&&used>=0&&used<=total&&Number.isFinite(free)&&free>=0&&free<=total&&
  Math.abs(total-used-free)<Math.max(total*.02,1048576);
 for(const [field,value] of Object.entries({total,used,free}))
  root.querySelector('[data-field="'+field+'"]').textContent=valid?fmt(value):"—";
 root.querySelector('[data-field="fill"]').style.width=valid?(used/total*100).toFixed(1)+"%":"0%";
 root.querySelector('[data-field="status"]').textContent=valid
  ?"Leitura local confirmada pelo Bridge · "+(used/total*100).toFixed(1)+"% utilizado · nenhum arquivo foi lido."
  :String(message||({pending:"Aguardando resposta do Bridge…",claimed:"Processando no Android…",failed:"O diagnóstico falhou.",expired:"A solicitação expirou."}[status]||"Diagnóstico não confirmado.")).slice(0,240);
 return valid;
}
