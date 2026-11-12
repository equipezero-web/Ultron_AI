/**
 * Reset the visible J.A.R.V.I.S. workspace only.
 * Never delete memories, chats in databases, telemetry, devices, browser
 * history, localStorage, user files, accounts or credentials.
 */
export function clearVisibleInterface({win=window,doc=document}={}){
  const errors=[];
  const attempt=(name,callback)=>{
    try{callback();}catch(error){errors.push(name+": "+String(error?.message||error));}
  };
  // Stop any active visual animation before closing Earth, then restore Ring.
  attempt("geo",()=>win.ULTRON_GEO_VISUAL?.close?.());
  attempt("earth",()=>win.ULTRON_EARTH?.close?.());
  attempt("neural-answer",()=>win.ULTRON_NEURAL_ANSWER?.clear?.());
  attempt("legacy-images",()=>win.ULTRON_VISUAL_PANEL?.clearImages?.());
  attempt("legacy-cards",()=>win.ULTRON_VISUAL_PANEL?.clearCards?.());
  attempt("legacy-caption",()=>win.ULTRON_VISUAL_PANEL?.setCaption?.(""));
  attempt("ring-mode",()=>win.JARVIS_COMMAND_CENTER?.setVisualMode?.("ring"));
  // Purely visual fields; the voice listener and camera are not deactivated.
  attempt("terminal",()=>doc.getElementById("output-box")?.replaceChildren());
  attempt("command-field",()=>{
    const field=doc.getElementById("command-input");
    if(field)field.value="";
  });
  attempt("voice-audio",()=>{
    const audio=doc.getElementById("voice-audio");
    audio?.pause?.();
    if(audio&&Number.isFinite(audio.duration))audio.currentTime=0;
  });
  const visibleGeo=win.ULTRON_GEO_VISUAL?.state?.visible===true;
  const visibleEarth=win.ULTRON_EARTH?.state?.visible===true;
  const visibleAnswer=win.ULTRON_NEURAL_ANSWER?.visible===true;
  const terminal=doc.getElementById("output-box");
  const field=doc.getElementById("command-input");
  const ok=!errors.length&&!visibleGeo&&!visibleEarth&&!visibleAnswer&&
    (!terminal||terminal.childNodes.length===0)&&(!field||field.value==="");
  return {ok,cleared:ok,scope:"visible-interface",errors};
}
