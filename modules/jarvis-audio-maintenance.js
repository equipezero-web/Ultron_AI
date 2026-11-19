/* Operator-requested maintenance: voice, voice recognition and microphones OFF.
 * Synchronous classic script executed before the application's ES modules.
 * Do not auto-reenable due to saved settings, tab reloads or Android pairing.
 * To restore the feature in the future, change policy explicitly and retest.
 */
(() => {
  const policy=Object.freeze({enabled:false,mode:"text-only",reason:"operator-maintenance"});
  Object.defineProperty(window,"JARVIS_AUDIO_POLICY",{
    configurable:false,enumerable:true,writable:false,value:policy
  });
  document.documentElement.classList.add("jarvis-voice-off");
  try {
    localStorage.setItem("jarvis_speech_output_enabled_v1","off");
    localStorage.setItem("ultron_world_briefing_auto_voice_v1","off");
    const key="ultron_ai_preferences_v3";
    const saved=JSON.parse(localStorage.getItem(key)||"null");
    if(saved&&typeof saved==="object"){
      saved.voiceWakeEnabled=false;
      localStorage.setItem(key,JSON.stringify(saved));
    }
  }catch{}
  try{window.speechSynthesis?.cancel?.();}catch{}
})();
