const KEY = "ultron_ai_preferences_v3";

export function loadPreferences(){
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; }
  catch { return {}; }
}
export function savePreferences(prefs){
  try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch {}
}
export function cameraWasAccepted(){ return loadPreferences().cameraAccepted === true; }
export function rememberCameraAccepted(){
  const p=loadPreferences(); p.cameraAccepted=true; savePreferences(p);
}
