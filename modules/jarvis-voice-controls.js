// J.A.R.V.I.S. speech-output controls — browser-local preference only.
// Voice detection uses ULTRON_VOICE_INPUT; enabling output NEVER starts recording.
const toggle=document.getElementById("btn-toggle-speech");
const label=document.getElementById("voice-output-status");
const audio=document.getElementById("voice-audio");
const preferenceKey="jarvis_speech_output_enabled_v1";
function savedPreference(){
 try{return localStorage.getItem(preferenceKey)!=="off";}catch{return true;}
}
function enabled(){return !document.body.classList.contains("jarvis-voice-output-disabled");}
function update(){
 if(toggle){
  toggle.textContent=enabled()?"SILENCIAR VOZ":"ATIVAR VOZ";
  toggle.setAttribute("aria-pressed",String(enabled()));
  toggle.setAttribute("aria-label",enabled()?"Silenciar a voz do J.A.R.V.I.S.":"Ativar a voz do J.A.R.V.I.S.");
 }
 if(label){
  const recognition=window.ULTRON_VOICE_INPUT?.state;
  label.textContent=(enabled()?"SAÍDA DE VOZ HABILITADA":"SAÍDA DE VOZ SILENCIADA")+
   (recognition?.enabled?" · ESCUTA ATIVA":" · ESCUTA AGUARDANDO PERMISSÃO");
 }
}
function setEnabled(value,{persist=true}={}){
 const active=Boolean(value);
 document.body.classList.toggle("jarvis-voice-output-disabled",!active);
 if(audio){
  audio.muted=!active;
  if(!active)audio.pause();
 }
 if(!active)window.speechSynthesis?.cancel?.();
 if(persist){
  try{localStorage.setItem(preferenceKey,active?"on":"off");}catch{}
 }
 update();
 window.dispatchEvent(new CustomEvent("jarvis:voice-output-changed",{
  detail:{enabled:active}
 }));
 return {enabled:active};
}
// A previous version had forced the page silent. This new mode defaults to
// browser TTS enabled, but honors a subsequent deliberate local mute.
setEnabled(savedPreference(),{persist:false});
toggle?.addEventListener("click",()=>setEnabled(!enabled()));
document.getElementById("btn-listen-voice")?.addEventListener("click",()=>queueMicrotask(update));
window.addEventListener("ultron:voice-listening-enabled",update);
window.addEventListener("ultron:wake-state",update);
window.JARVIS_VOICE_CONTROLS={
 setEnabled,
 get state(){
  const input=window.ULTRON_VOICE_INPUT?.state;
  return {outputEnabled:enabled(),inputEnabled:input?.enabled===true,
   recognitionSupported:input?.recognitionSupported===true};
 }
};
