// J.A.R.V.I.S. // Voice & Text Only
// The real controls stay in the DOM for legacy listeners, but have no
// visible/clickable area. All commands come from the terminal or microphone.
// Never request permission automatically; the user initiates voice by text.
function install(){
  const body=document.body;
  if(!body)return;
  body.classList.add("jarvis-voice-text-only");
  const hide=()=>{
    body.querySelectorAll('button,[role="button"],input[type="button"],input[type="submit"]')
      .forEach(el=>{
        // Inline important beats legacy ID-based !important display rules
        // and late dynamically imported component styles.
        if(el.style.getPropertyValue("display")!=="none"||
           el.style.getPropertyPriority("display")!=="important")
          el.style.setProperty("display","none","important");
        el.setAttribute("aria-hidden","true");
        el.setAttribute("tabindex","-1");
      });
    body.querySelectorAll(".quick-actions,.jarvis-cc-tool-actions,.jarvis-cc-actions,.jarvis-cc-orb-controls")
      .forEach(el=>el.style.setProperty("display","none","important"));
  };
  hide();
  const observer=new MutationObserver(records=>{
    if(records.some(r=>r.addedNodes.length))hide();
  });
  observer.observe(body,{subtree:true,childList:true});
  window.JARVIS_VOICE_TEXT_ONLY={
    get active(){return body.classList.contains("jarvis-voice-text-only");},
    get voice(){return window.ULTRON_VOICE_INPUT?.state||null;},
    get inputReady(){return !!document.getElementById("command-input");}
  };
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",install,{once:true});
else install();
