// Mobile-only J.A.R.V.I.S. voice/text interface. No microphone/camera is
// accessed here. Browser permissions are requested only after a text command.
const media=window.matchMedia(
 "(max-width:699px), (max-height:490px) and (orientation:landscape) and (pointer:coarse)"
);
const input=document.getElementById("command-input");
const slot=document.getElementById("jarvis-cc-input-slot");
const commandRow=slot?.querySelector(".command-row");
const hint=document.createElement("p");
hint.id="jarvis-mobile-command-hint";
hint.setAttribute("role","status");
hint.setAttribute("aria-live","polite");
hint.hidden=true;
commandRow?.after(hint);
const update=()=>{
 const mobile=media.matches;
 if(window.JARVIS_AUDIO_POLICY?.enabled===false){
  hint.hidden=!mobile;
  if(mobile)hint.textContent="MODO TEXTO · ENTER ENVIA · Escuta e voz desativadas para manutenção.";
  return;
 }
 const voice=window.ULTRON_VOICE_INPUT?.state;
 const speech=window.JARVIS_VOICE_CONTROLS?.state;
 hint.hidden=!mobile;
 if(!mobile)return;
 if(!voice?.recognitionSupported){
  hint.textContent='CELULAR · ENTER ENVIA · Voz não suportada neste navegador; use comandos digitados.';
 }else if(voice.enabled){
  hint.textContent='ESCUTA ATIVA · Diga "Jarvis" + comando · ENTER envia texto · "Jarvis desativar escuta" para parar.';
 }else{
  hint.textContent='ENTER ENVIA · Para conversar, digite "Jarvis ativar escuta" e permita o microfone.';
 }
 if(speech && !speech.outputEnabled){
  hint.textContent+=' · Som silenciado: digite "Jarvis ativar voz".';
 }
};
input?.setAttribute("enterkeyhint","send");
input?.setAttribute("aria-label","Comando para o Jarvis. Enter envia, Shift Enter nova linha.");
input?.setAttribute("autocomplete","off");
media.addEventListener?.("change",update);
window.addEventListener("ultron:voice-listening-state",update);
window.addEventListener("ultron:voice-listening-enabled",update);
window.addEventListener("jarvis:voice-output-changed",update);
window.addEventListener("ultron:wake-state",update);
update();
window.JARVIS_MOBILE_VOICE_TEXT={
 get active(){return media.matches;},
 get textReady(){return Boolean(input&&commandRow&&slot);},
 get voiceReady(){return window.ULTRON_VOICE_INPUT?.state?.enabled===true;},
 get help(){return hint.textContent;}
};
