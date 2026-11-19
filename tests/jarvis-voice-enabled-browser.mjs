import assert from "node:assert/strict";
import puppeteer from "puppeteer-core";
const browser=await puppeteer.launch({executablePath:process.env.CHROME_BIN||"/usr/bin/google-chrome",
 headless:true,args:["--no-sandbox","--disable-dev-shm-usage","--enable-webgl","--enable-unsafe-swiftshader"]});
const port=process.env.JARVIS_TEST_PORT||"8772";
try{
 for(const [name,width,height,mobile] of [["phone",390,844,true],["notebook",1366,768,false],["tv",1920,1080,false]]){
  const page=await browser.newPage();
  try{
   await page.setViewport({width,height,isMobile:mobile,hasTouch:mobile,deviceScaleFactor:1});
   await page.evaluateOnNewDocument(()=>{
    window.__voiceCalls={mic:0,start:0,speak:0,video:0};
    class FakeRecognition {
     start(){window.__voiceCalls.start++}
     stop(){}
     abort(){}
    }
    window.SpeechRecognition=FakeRecognition;
    window.webkitSpeechRecognition=FakeRecognition;
    const orig=navigator.mediaDevices?.getUserMedia?.bind(navigator.mediaDevices);
    Object.defineProperty(navigator,"mediaDevices",{configurable:true,value:{
     getUserMedia:async c=>{
      if(c.audio)window.__voiceCalls.mic++;
      if(c.video)window.__voiceCalls.video++;
      throw Error("Mic/camera should never be requested in text-only mode");
     }
    }});
    window.SpeechSynthesisUtterance=class{constructor(text){this.text=text}};
    Object.defineProperty(window,"speechSynthesis",{configurable:true,value:{
     speaking:false,cancel(){},getVoices:()=>[{lang:"pt-BR",name:"pt"}],
     speak(){window.__voiceCalls.speak++}
    }});
    try{localStorage.setItem("jarvis_speech_output_enabled_v1","on");
     localStorage.setItem("ultron_world_briefing_auto_voice_v1","on");
     localStorage.setItem("ultron_ai_preferences_v3",JSON.stringify({microphoneAccepted:true,voiceWakeEnabled:true}));}catch{}
   });
   await page.goto("http://127.0.0.1:"+port+"/index.html",{waitUntil:"domcontentloaded",timeout:45000});
   await page.waitForFunction(()=>window.JARVIS_COMMAND_CENTER?.active&&
    window.ULTRON_VOICE_INPUT&&window.ULTRON_VOICE_OUTPUT&&window.JARVIS_VOICE_CONTROLS&&
    window.ULTRON_VOICE_MATCH,{timeout:35000});
   const initial=await page.evaluate(()=>({
    off:window.JARVIS_AUDIO_POLICY?.enabled===false,
    body:document.body.className,
    mic:window.ULTRON_VOICE_INPUT.state,
    match:window.ULTRON_VOICE_MATCH.state,
    sound:window.JARVIS_VOICE_CONTROLS.state,
    mobile:window.JARVIS_MOBILE_VOICE_TEXT?.active,
    controls:["btn-listen-voice","btn-test-mic","btn-voice","btn-toggle-speech",
     "btn-enroll-voice-match","btn-disable-voice-match"].map(id=>{
     const node=document.getElementById(id);
     return {id,width:node?.getBoundingClientRect().width||0};
    }),
    output:window.ULTRON_VOICE_OUTPUT.available,
    calls:window.__voiceCalls,
    audioMuted:document.getElementById("voice-audio").muted,
    inputWidth:document.getElementById("command-input").getBoundingClientRect().width,
    overflow:document.documentElement.scrollWidth-innerWidth
   }));
   assert.equal(initial.off,true,name);
   assert.equal(initial.mic.enabled,false,name);
   assert.equal(initial.mic.recognitionRunning,false,name);
   assert.equal(initial.match.monitorActive,false,name);
   assert.equal(initial.sound.outputEnabled,false,name);
   assert.equal(initial.output,false,name);
   assert.equal(initial.audioMuted,true,name);
   assert.ok(initial.controls.every(c=>c.width===0),name+": voice controls should be hidden");
   assert.ok(initial.inputWidth>175,name+": text terminal must remain usable");
   assert.ok(initial.overflow<=8,name+": no horizontal overflow");
   assert.equal(initial.calls.mic,0);assert.equal(initial.calls.start,0);
   assert.equal(initial.calls.speak,0);assert.equal(initial.calls.video,0);
   const blocked=await page.evaluate(async()=>({
    enable:await window.ULTRON_VOICE_INPUT.enable({userInitiated:true,persist:true}),
    wake:window.ULTRON_VOICE_INPUT.wake(),
    match:await window.ULTRON_VOICE_MATCH.enroll(),
    output:window.JARVIS_VOICE_CONTROLS.setEnabled(true),
    speak:window.ULTRON_VOICE_OUTPUT.speak("Should not speak"),
    remote:await window.ULTRON_MOBILE_MIC.request(),
    ringAudio:await window.ULTRON_NEURAL_JARVIS_UI.toggleAudio(),
    ringSpeech:window.ULTRON_NEURAL_JARVIS_UI.speak()
   }));
   assert.equal(blocked.enable,false);
   assert.equal(blocked.wake,false);
   assert.equal(blocked.match,false);
   assert.equal(blocked.output.enabled,false);
   assert.equal(blocked.speak,false);
   assert.equal(blocked.remote,false);
   assert.equal(blocked.ringAudio.ok,false);
   assert.equal(blocked.ringSpeech.ok,false);
   await page.focus("#command-input");
   await page.$eval("#command-input",node=>{node.value="Jarvis ativar escuta";});
   await page.keyboard.press("Enter");
   await page.waitForFunction(()=>document.getElementById("command-input").value==="",{timeout:6000});
   await page.waitForFunction(()=>document.getElementById("output-box").textContent.includes("Modo texto ativo"),{timeout:8000});
   const after=await page.evaluate(()=>({calls:window.__voiceCalls,
    listening:window.ULTRON_VOICE_INPUT.state.enabled,
    output:window.JARVIS_VOICE_CONTROLS.state.outputEnabled,
    persisted:localStorage.getItem("jarvis_speech_output_enabled_v1"),
    persistedWake:JSON.parse(localStorage.getItem("ultron_ai_preferences_v3")||"{}").voiceWakeEnabled,
    auto:window.ULTRON_INTELLIGENCE?.state?.autoVoice
   }));
   assert.equal(after.calls.mic,0);assert.equal(after.calls.start,0);
   assert.equal(after.calls.speak,0);assert.equal(after.calls.video,0);
   assert.equal(after.listening,false);assert.equal(after.output,false);
   assert.equal(after.persisted,"off");assert.equal(after.persistedWake,false);
   assert.equal(after.auto,false);
   console.log("VOICE OFF BROWSER PASS",name,{noAudio:true,noMic:true,terminal:true});
  }finally{await page.close().catch(()=>{})}
 }
}finally{await browser.close()}
