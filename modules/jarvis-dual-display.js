// Operator-controlled two-monitor layout for one browser window spanning extended Windows displays.
// No display enumeration, screen capture, monitor permission, telemetry or device pairing.
const KEY="jarvis-dual-display-settings-v1";
const PARAM=new URLSearchParams(typeof location==="undefined"?"":location.search);
function clampSplit(v){return Math.max(30,Math.min(70,Math.round(Number(v)||50)));}
export function dualDisplaySettings({split=50,ringSide="left"}={}){
 return {split:clampSplit(split),ringSide:ringSide==="right"?"right":"left"};
}
function read(){
 try{return dualDisplaySettings(JSON.parse(localStorage.getItem(KEY)||"{}"));}
 catch{return dualDisplaySettings();}
}
function install(){
 const body=document.body;
 if(!body||!PARAM.get("display")?.toLowerCase().includes("dual"))return;
 const ui=document.querySelector(".jarvis-command-center-ui");
 const top=ui?.querySelector(".jarvis-cc-top");
 if(!top||top.querySelector(".jarvis-dual-toolbar"))return;
 let cfg=read();
 const wrap=document.createElement("section");wrap.className="jarvis-dual-toolbar";
 wrap.setAttribute("aria-label","Configuração de duas telas");
 const label=document.createElement("label");label.textContent="DIVISÃO ";
 const slider=document.createElement("input");slider.type="range";slider.min="30";slider.max="70";
 slider.step="1";slider.value=String(cfg.split);slider.id="jarvis-dual-split";
 const value=document.createElement("output");value.htmlFor=slider.id;value.textContent=cfg.split+"%";
 label.append(slider,value);
 const swap=document.createElement("button");swap.type="button";swap.textContent="Inverter Ring";
 swap.setAttribute("aria-label","Alternar em qual monitor fica o Neural Ring");
 const disable=document.createElement("button");disable.type="button";disable.textContent="Modo normal";
 const save=()=>{
  body.classList.toggle("dual-ring-right",cfg.ringSide==="right");
  ui.style.setProperty("--dual-split",cfg.split+"%");
  value.textContent=cfg.split+"%";
  try{localStorage.setItem(KEY,JSON.stringify(cfg));}catch{}
  window.dispatchEvent(new Event("resize"));
 };
 slider.addEventListener("input",()=>{cfg=dualDisplaySettings({...cfg,split:slider.value});save();});
 swap.addEventListener("click",()=>{cfg=dualDisplaySettings({...cfg,ringSide:cfg.ringSide==="left"?"right":"left"});save();});
 disable.addEventListener("click",()=>{
  const next=new URL(location.href);next.searchParams.delete("display");
  location.assign(next.href);
 });
 wrap.append(label,swap,disable);
 top.append(wrap);
 body.classList.add("ultron-dual-display");
 save();
}
if(typeof document!=="undefined"){
 if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",install,{once:true});
 else install();
}
