import {CameraController} from "./modules/camera.js";
import {MotionSensor} from "./modules/motion.js";
import {loadPreferences} from "./modules/storage.js";
import {addLog,clock} from "./modules/system.js";

const $=id=>document.getElementById(id);
const video=$("webcam"), canvas=$("motion-canvas"), output=$("output-box");
const btnCamera=$("btn-camera"), btnStop=$("btn-stop-camera");
const sensitivity=$("sensitivity"), cooldown=$("cooldown");
const prefs=loadPreferences();
let motionEvents=0, startTime=Date.now(), fpsFrames=0, lastFps=Date.now();

const camera=new CameraController(video,(state)=>{
  if(state==="active"){
    $("camera-state").textContent="ONLINE"; $("camera-state").style.color="var(--green)";
    $("permission-state").textContent="GRANTED"; $("telemetry-camera").textContent="ON";
    $("vision-module").textContent="ACTIVE"; $("vision-module").className="green";
    $("system-mode").textContent="MONITORING"; btnCamera.textContent="VISÃO ATIVA"; btnStop.disabled=false;
    $("camera-resolution").textContent=`${video.videoWidth}×${video.videoHeight}`;
    sensor.start(); addLog(output,"Sensor óptico calibrado. Monitoramento iniciado.");
  } else {
    $("camera-state").textContent="OFFLINE"; $("camera-state").style.color="";
    $("telemetry-camera").textContent="OFF"; $("vision-module").textContent="STANDBY"; $("vision-module").className="";
    $("system-mode").textContent="STANDBY"; btnCamera.textContent="ATIVAR VISÃO"; btnStop.disabled=true;
    sensor.stop(); $("motion-tag").textContent="STANDBY";
  }
});

const sensor=new MotionSensor(video,canvas,(level)=>{
  motionEvents++; $("motion-events").textContent=motionEvents;
  $("motion-tag").textContent=`MOVIMENTO ${Math.round(level)}%`;
  $("motion-tag").style.color="var(--red)"; $("motion-tag").style.borderColor="#ef444466";
  addLog(output,`Evento de movimento detectado (${Math.round(level)}%).`,"alert");
  setTimeout(()=>{$("motion-tag").textContent="MONITORANDO";$("motion-tag").style.color="";$("motion-tag").style.borderColor=""},900);
},level=>{
  $("motion-value").textContent=`${Math.round(level)}%`;
  fpsFrames++;
  if(Date.now()-lastFps>1000){$("fps").textContent=`${fpsFrames} FPS`;fpsFrames=0;lastFps=Date.now();}
});
sensor.threshold=Number(sensitivity.value);
sensor.cooldown=Number(cooldown.value)*1000;

async function activateCamera(){
  try{
    if(!window.isSecureContext) addLog(output,"AVISO: câmera exige HTTPS ou localhost.","alert");
    await camera.start();
  }catch(e){
    $("permission-state").textContent="BLOCKED";
    addLog(output,`Falha de câmera: ${e.message}`,"alert");
  }
}
btnCamera.addEventListener("click",activateCamera);
btnStop.addEventListener("click",()=>{camera.stop();addLog(output,"Câmera desligada pelo operador.");});

sensitivity.addEventListener("input",()=>{sensor.threshold=Number(sensitivity.value);$("sensitivity-out").textContent=sensitivity.value;$("threshold-value").textContent=sensitivity.value;});
cooldown.addEventListener("input",()=>{sensor.cooldown=Number(cooldown.value)*1000;$("cooldown-out").textContent=`${cooldown.value}s`;});

$("btn-send").addEventListener("click",execute);
$("command-input").addEventListener("keydown",e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();execute();}});
document.querySelectorAll("[data-command]").forEach(b=>b.addEventListener("click",()=>handleQuick(b.dataset.command)));

async function execute(){
 const input=$("command-input"), cmd=input.value.trim(); if(!cmd)return;
 addLog(output,`OPERATOR: ${cmd}`); input.value="";
 const low=cmd.toLowerCase();
 if(low.includes("câmera")||low.includes("camera")) { await activateCamera(); return; }
 if(low.includes("status")) { handleQuick("status"); return; }
 if(low.includes("varredura")||low.includes("scan")) { handleQuick("scan"); return; }

 const thinking=document.createElement("p");
 thinking.textContent="> ULTRON CORE: processando com Gemini...";
 thinking.dataset.thinking="true"; output.appendChild(thinking); output.scrollTop=output.scrollHeight;

 try{
   const response=await fetch("/api/ai",{
     method:"POST",
     headers:{"Content-Type":"application/json"},
     body:JSON.stringify({message:cmd})
   });
   const data=await response.json();
   thinking.remove();
   if(!response.ok) throw new Error(data.error||"Erro no backend.");
   addLog(output,`GEMINI: ${data.text}`);
 }catch(e){
   thinking.remove();
   addLog(output,`GEMINI ERROR: ${e.message}`,"alert");
 }
}

function handleQuick(cmd){
 if(cmd==="clear"){output.innerHTML="";return;}
 if(cmd==="camera"){addLog(output,"Camera API: "+(navigator.mediaDevices?"DISPONÍVEL":"INDISPONÍVEL"));return;}
 if(cmd==="status"){addLog(output,`Sistema ONLINE | câmera ${camera.stream?"ATIVA":"inativa"} | eventos ${motionEvents} | Gemini ${navigator.onLine?"conectividade disponível":"offline"}`);return;}
 if(cmd==="scan"){
   addLog(output,"Iniciando varredura local...");
   setTimeout(()=>addLog(output,"Varredura concluída. Núcleo local operacional."),800);
 }
}
function updateBars(){
 const holder=$("activity-bars"); holder.innerHTML="";
 for(let i=0;i<70;i++){const b=document.createElement("i");b.className="bar";b.style.height=`${3+Math.random()*42}px`;b.style.animationDelay=`${Math.random()*1.2}s`;holder.appendChild(b);}
}
setInterval(()=>{
 $("clock").textContent=clock();
 const s=Math.floor((Date.now()-startTime)/1000),h=String(Math.floor(s/3600)).padStart(2,"0"),m=String(Math.floor(s%3600/60)).padStart(2,"0"),sec=String(s%60).padStart(2,"0");
 $("uptime").textContent=`${h}:${m}:${sec}`;
},1000);
updateBars();
$("storage-state").textContent="READY";
$("connection-state").textContent=navigator.onLine?"ONLINE":"OFFLINE";
window.addEventListener("online",()=>$("connection-state").textContent="ONLINE");
window.addEventListener("offline",()=>$("connection-state").textContent="OFFLINE");

if(prefs.cameraAccepted){
 addLog(output,"Preferência local: câmera já autorizada anteriormente. O navegador ainda pode solicitar permissão se ela tiver sido revogada.");
}
