import {NEURAL_JARVIS_FILES,neuralJarvisGeometryCount}
 from "./jarvis-neural-jarvis-model.js";

// Overlay components for the EXISTING command center.
// Mic: explicit opt-in; TTS: actual browser synthesis; no fake TFLOPS/online claims.
const center=document.querySelector(".jarvis-cc-center");
const actions=document.querySelector(".jarvis-cc-actions");
const output=document.getElementById("output-box");
const el=(tag,cls,text)=>{
 const node=document.createElement(tag);
 if(cls)node.className=cls;
 if(text!==undefined)node.textContent=text;
 return node;
};
const engine=()=>window.ULTRON_NEURAL_JARVIS;
let panel=null,telemetry=null,detail=null,archiveList=null,archiveOpen=false;
let visualAudio=false,audioContext=null,analyser=null,source=null,stream=null,bytes=null;
let audioFrame=0,overdrive=false,speaking=false,liveBars=[],buttons={};
function report(message){
 const line=el("p","","> [NEURAL JARVIS] "+String(message).slice(0,300));
 output?.append(line);if(output)output.scrollTop=output.scrollHeight;
}
function state(){
 const e=engine();
 return {name:"Neural Jarvis",engine:e?.engine||"unavailable",
  running:!!e?.active,geometry:e?.state?.renderedComponents??null,
  audioPermission:visualAudio?"granted-for-visualizer":"off",
  overdrive,archiveOpen,structure:neuralJarvisGeometryCount()};
}
function updateTelemetry(){
 if(!telemetry)return;
 const s=state();
 telemetry.textContent=s.running?
  "MATRIZ WEBGL OPERACIONAL · ÁUDIO "+(visualAudio?"AUTORIZADO":"DESATIVADO"):
  "MATRIZ WEBGL INDISPONÍVEL / EM INICIALIZAÇÃO";
 const active=!!engine()?.active;
 for(const b of Object.values(buttons)){
  if(b.dataset.requiresEngine==="true")b.disabled=!active;
 }
}
function selectFile(file){
 if(!detail)return;
 detail.replaceChildren(
  el("span","jarvis-neural-code",file.code),
  el("h4","",file.title),
  el("p","",file.detail),
  el("small","",file.technical)
 );
}
function closeArchive(){
 archiveOpen=false;if(panel)panel.hidden=true;
 engine()?.setExpanded?.(false);
 if(buttons.expand)buttons.expand.setAttribute("aria-expanded","false");
 return {ok:true,open:false};
}
function toggleArchive(){
 if(archiveOpen)return closeArchive();
 if(!panel)return {ok:false,reason:"ARCHIVE_UNAVAILABLE"};
 if(!engine()?.active){
  report("Arquivo neural indisponível enquanto o núcleo 3D estiver oculto.");
  return {ok:false,reason:"ENGINE_INACTIVE"};
 }
 archiveOpen=true;engine()?.setExpanded?.(true);
 panel.hidden=false;
 buttons.expand?.setAttribute("aria-expanded","true");
 selectFile(NEURAL_JARVIS_FILES[0]);
 return {ok:true,open:true};
}
async function stopAudio(){
 visualAudio=false;
 if(audioFrame)cancelAnimationFrame(audioFrame);
 audioFrame=0;
 try{stream?.getTracks().forEach(t=>t.stop());}catch{}
 try{source?.disconnect();}catch{}
 try{analyser?.disconnect();}catch{}
 try{await audioContext?.close();}catch{}
 stream=null;source=null;analyser=null;audioContext=null;bytes=null;
 engine()?.setAudioBands?.({bass:0,mid:0,high:0});
 for(const bar of liveBars)bar.style.width="0%";
 buttons.microphone?.setAttribute("aria-pressed","false");
 if(buttons.microphone)buttons.microphone.textContent="ÁUDIO VISUAL";
 updateTelemetry();
 return {ok:true,active:false};
}
function audioLoop(){
 audioFrame=0;
 if(!visualAudio||!analyser||!bytes||document.hidden){
  if(visualAudio&&!document.hidden)audioFrame=requestAnimationFrame(audioLoop);
  return;
 }
 analyser.getByteFrequencyData(bytes);
 let bass=0,mid=0,high=0;
 for(let i=0;i<12;i++)bass+=bytes[i];
 for(let i=12;i<48;i++)mid+=bytes[i];
 for(let i=48;i<110;i++)high+=bytes[i];
 const raw={bass:bass/(12*255),mid:mid/(36*255),high:high/(62*255)};
 const norm=analyser?raw:{bass:0,mid:0,high:0};
 engine()?.setAudioBands?.(norm);
 const factors=[norm.bass,norm.mid,norm.high];
 liveBars.forEach((bar,i)=>{bar.style.width=Math.round(Math.min(100,factors[i]*125))+"%";});
 audioFrame=requestAnimationFrame(audioLoop);
}
async function toggleAudio(){
 if(visualAudio)return stopAudio();
 if(!engine()?.active)return {ok:false,reason:"ENGINE_INACTIVE"};
 if(!navigator.mediaDevices?.getUserMedia){
  report("Microfone indisponível neste navegador.");
  return {ok:false,reason:"MICROPHONE_UNAVAILABLE"};
 }
 try{
  const selected=await navigator.mediaDevices.getUserMedia({audio:true,video:false});
  // If a STOP occurred while permission dialog was open, never keep tracks.
  if(!engine()?.active){selected.getTracks().forEach(t=>t.stop());return {ok:false,reason:"ENGINE_INACTIVE"};}
  stream=selected;
  const AudioContext=window.AudioContext||window.webkitAudioContext;
  if(!AudioContext)throw Error("Web Audio API indisponível");
  audioContext=new AudioContext();
  analyser=audioContext.createAnalyser();
  analyser.fftSize=256;
  analyser.smoothingTimeConstant=.82;
  source=audioContext.createMediaStreamSource(stream);
  source.connect(analyser); // No connection to speakers; no echo/recording.
  bytes=new Uint8Array(analyser.frequencyBinCount);
  await audioContext.resume();
  visualAudio=true;
  buttons.microphone?.setAttribute("aria-pressed","true");
  if(buttons.microphone)buttons.microphone.textContent="DESLIGAR ÁUDIO";
  report("Permissão de áudio concedida para graves/médios/agudos. Nenhum áudio é gravado ou enviado.");
  updateTelemetry();audioFrame=requestAnimationFrame(audioLoop);
  return {ok:true,active:true};
 }catch(error){
  await stopAudio();
  report("Áudio visual não autorizado/indisponível: "+(error?.name||"ERROR"));
  return {ok:false,reason:"AUDIO_DENIED_OR_UNAVAILABLE"};
 }
}
function toggleOverdrive(){
 if(!engine()?.active||!engine()?.setOverdrive)
  return {ok:false,reason:"ADVANCED_RENDERER_UNAVAILABLE"};
 overdrive=!overdrive;
 engine().setOverdrive(overdrive);
 buttons.overdrive?.setAttribute("aria-pressed",String(overdrive));
 report("Sobrecarga tática VISUAL "+(overdrive?"ativada":"desativada")+
  ". Não modifica a capacidade real do computador.");
 return {ok:true,active:overdrive};
}
function speak(){
 if(!engine()?.active)return {ok:false,reason:"ENGINE_INACTIVE"};
 if(!("speechSynthesis"in window))return {ok:false,reason:"SPEECH_UNAVAILABLE"};
 const msg="Neural Jarvis pronto. Matriz holográfica disponível para visualização.";
 const utterance=new SpeechSynthesisUtterance(msg);
 utterance.lang="pt-BR";utterance.rate=1.02;utterance.pitch=.94;
 window.speechSynthesis.cancel();
 speaking=true;
 utterance.onend=()=>{speaking=false;};
 utterance.onerror=()=>{speaking=false;};
 try{window.speechSynthesis.speak(utterance);return {ok:true,requested:true};}
 catch{speaking=false;return {ok:false,reason:"SPEECH_FAILED"};}
}
function stop(){
 closeArchive();
 if(speaking)window.speechSynthesis?.cancel?.();
 speaking=false;overdrive=false;engine()?.setOverdrive?.(false);
 buttons.overdrive?.setAttribute("aria-pressed","false");
 void stopAudio();
 return {ok:true,stopped:true};
}
function makeButton(label,key,fn,requiresEngine=true){
 const b=el("button","neural-jarvis-control",label);
 b.type="button";
 b.dataset.requiresEngine=String(requiresEngine);
 b.addEventListener("click",()=>void fn());
 actions?.append(b);buttons[key]=b;return b;
}
function init(){
 if(!center||!actions)return false;
 const hud=el("section","neural-jarvis-hud");
 hud.setAttribute("aria-label","Estrutura holográfica Neural Jarvis");
 telemetry=el("div","neural-jarvis-telemetry","MATRIZ WEBGL / INICIALIZANDO");
 telemetry.setAttribute("role","status");
 const summary=el("div","neural-jarvis-specs");
 const counts=neuralJarvisGeometryCount();
 summary.textContent="NÚCLEO REATIVO · "+counts.plates+
  " PLACAS ORBITAIS · "+counts.arcs+" ARCOS · "+
  counts.nodes+" NÓS · "+counts.particles+" PARTÍCULAS";
 const bands=el("div","neural-jarvis-bands");
 for(const label of ["GRAVES","MÉDIOS","AGUDOS"]){
  const segment=el("div","neural-jarvis-band");
  const name=el("small","",label);
  const outer=el("div","neural-jarvis-band-track");
  const bar=el("span","");bar.style.width="0%";
  outer.append(bar);segment.append(name,outer);
  bands.append(segment);liveBars.push(bar);
 }
 hud.append(telemetry,summary,bands);
 center.append(hud);
 panel=el("section","neural-jarvis-archive");
 panel.hidden=true;panel.setAttribute("role","region");
 panel.setAttribute("aria-label","Arquivos estruturais do Neural Jarvis");
 const header=el("header","neural-jarvis-archive-head");
 header.append(el("strong","","ARQUIVOS // MATRIZ HOLOGRÁFICA"));
 const close=el("button","","×");close.type="button";
 close.setAttribute("aria-label","Fechar arquivos neurais");
 close.addEventListener("click",closeArchive);
 header.append(close);
 archiveList=el("div","neural-jarvis-archive-list");
 detail=el("div","neural-jarvis-archive-detail");
 for(const file of NEURAL_JARVIS_FILES){
  const item=el("button","neural-jarvis-archive-item",
   file.code+" · "+file.title);
  item.type="button";item.addEventListener("click",()=>selectFile(file));
  archiveList.append(item);
 }
 panel.append(header,archiveList,detail);
 center.append(panel);
 makeButton("FALAR","speak",speak);
 makeButton("ÁUDIO VISUAL","microphone",toggleAudio);
 makeButton("SOBRECARGA TÁTICA","overdrive",toggleOverdrive);
 const expand=makeButton("REDOMA & ARQUIVOS","expand",toggleArchive);
 expand.setAttribute("aria-expanded","false");
 expand.setAttribute("aria-controls","neural-jarvis-archive");
 panel.id="neural-jarvis-archive";
 updateTelemetry();
 return true;
}
const mounted=init();
if(mounted){
 window.addEventListener("ultron:neural-jarvis-ready",updateTelemetry);
 window.addEventListener("ultron:neural-ring-3d-ready",updateTelemetry);
 window.addEventListener("ultron:visual-mode",event=>{
  const ring=event?.detail?.mode==="ring";
  if(!ring){
   closeArchive();overdrive=false;engine()?.setOverdrive?.(false);
   void stopAudio();
  }
  updateTelemetry();
 });
 window.addEventListener("ultron:emergency-stop",stop);
 document.addEventListener("visibilitychange",()=>{
  if(document.hidden){
   engine()?.setAudioBands?.({bass:0,mid:0,high:0});
   for(const bar of liveBars)bar.style.width="0%";
  }else if(visualAudio&&!audioFrame){audioFrame=requestAnimationFrame(audioLoop);}
 });
}
window.ULTRON_NEURAL_JARVIS_UI={stop,speak,toggleAudio,toggleOverdrive,toggleArchive,
 get state(){return {...state(),mounted};}};
