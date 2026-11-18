import assert from "node:assert/strict";
import puppeteer from "puppeteer-core";

const browser=await puppeteer.launch({
 executablePath:process.env.CHROME_BIN||"/usr/bin/google-chrome",
 headless:true,args:["--no-sandbox","--disable-dev-shm-usage","--enable-webgl","--enable-unsafe-swiftshader"]
});
try {
 for(const [name,width,height] of [["phone",390,844],["notebook",1366,768],["tv",1920,1080]]){
  const page=await browser.newPage();
  try {
   await page.setViewport({width,height,isMobile:name==="phone",hasTouch:name==="phone",deviceScaleFactor:1});
   await page.evaluateOnNewDocument(()=>{
    window.__voiceTest={micRequests:[],recognitionStarts:0,speaks:0,cameraRequests:0};
    class MockRecognition{
     constructor(){this.lang="";window.__voiceTest.recognition=this;}
     start(){window.__voiceTest.recognitionStarts++;this.onstart?.();}
     stop(){this.onend?.();}
     abort(){this.onend?.();}
    }
    window.SpeechRecognition=MockRecognition;
    Object.defineProperty(navigator,"permissions",{configurable:true,value:{
     query:async()=>({state:"prompt"})
    }});
    Object.defineProperty(navigator,"mediaDevices",{configurable:true,value:{
     getUserMedia:async constraints=>{
      window.__voiceTest.micRequests.push(constraints);
      if(constraints.video!==false){window.__voiceTest.cameraRequests++;throw Error("Unexpected camera access");}
      return {getTracks:()=>[{stop(){}}]};
     }
    }});
    window.SpeechSynthesisUtterance=class {
     constructor(text){this.text=text;this.lang="";this.onstart=null;this.onend=null;}
    };
    Object.defineProperty(window,"speechSynthesis",{configurable:true,value:{
     speaking:false,
     getVoices:()=>[{lang:"pt-BR",name:"PT-BR Browser Test"}],
     cancel(){this.speaking=false;},
     speak(utt){
      this.speaking=true;window.__voiceTest.speaks++;
      Promise.resolve().then(()=>utt.onstart?.()).then(()=>{
       this.speaking=false;utt.onend?.();
      });
     }
    }});
   });
   await page.goto("http://127.0.0.1:"+(process.env.JARVIS_TEST_PORT||"8772")+"/index.html",{
    waitUntil:"domcontentloaded",timeout:40000
   });
   await page.waitForFunction(()=>Boolean(window.ULTRON_VOICE_INPUT&&window.ULTRON_VOICE_OUTPUT&&
    window.JARVIS_VOICE_CONTROLS&&window.JARVIS_COMMAND_CENTER),{timeout:32000});
   const initial=await page.evaluate(()=>{
    const b=document.body;
    const ids=["btn-listen-voice","btn-test-mic","btn-voice","btn-toggle-speech",
      "btn-enroll-voice-match","btn-disable-voice-match","btn-send"];
    return {hiddenLegacy:b.classList.contains("jarvis-voice-text-only"),
     muted:b.classList.contains("jarvis-voice-output-disabled"),
     audioMuted:document.getElementById("voice-audio").muted,
     voiceEnabled:window.JARVIS_VOICE_CONTROLS.state.outputEnabled,
     micEnabled:window.ULTRON_VOICE_INPUT.state.enabled,
     controls:ids.map(id=>{
      const node=document.getElementById(id);
      return {id,visible:!!node&&getComputedStyle(node).display!=="none"&&
       node.getBoundingClientRect().width>0};
     }),
     micRequests:window.__voiceTest.micRequests.length,
     overflow:document.documentElement.scrollWidth-innerWidth};
   });
   assert.equal(initial.hiddenLegacy,false,name+": old mode must not hide controls");
   assert.equal(initial.muted,false,name+": speech output should be enabled on boot");
   assert.equal(initial.audioMuted,false,name+": audio playback must not be forced muted");
   assert.equal(initial.micEnabled,false,name+": mic requires permission");
   assert.equal(initial.micRequests,0,name+": never request mic on page load");
   assert.equal(initial.voiceEnabled,true);
   if(name==="phone"){
    assert.ok(initial.controls.every(c=>!c.visible),
     name+": dashboard buttons must disappear, retaining original event listeners "+JSON.stringify(initial));
    assert.equal(await page.evaluate(()=>window.JARVIS_MOBILE_VOICE_TEXT?.active),true);
    assert.ok(await page.$eval("#jarvis-mobile-command-hint",e=>e.getBoundingClientRect().height>0));
   }else{
    assert.ok(initial.controls.every(c=>c.visible),name+": desktop/TV controls must remain visible");
   }
   assert.ok(initial.overflow<=8,name+": horizontal overflow "+JSON.stringify(initial));
   const submit=async text=>{
    await page.focus("#command-input");
    await page.$eval("#command-input",(el,value)=>{el.value=value;},text);
    await page.keyboard.press("Enter");
    await page.waitForFunction(()=>document.getElementById("command-input")?.value==="",{timeout:6000});
   };
   if(name==="phone")await submit("Jarvis teste sua voz");
   else await page.click("#btn-voice");
   await page.waitForFunction(()=>window.__voiceTest.speaks>=1,{timeout:6000});
   // Mute does not start microphone and prevents subsequent synthesis.
   if(name==="phone")await submit("Jarvis silenciar voz");
   else await page.click("#btn-toggle-speech");
   const muted=await page.evaluate(()=>({
    muted:document.body.classList.contains("jarvis-voice-output-disabled"),
    voice:window.ULTRON_VOICE_OUTPUT.speak("I should not be audible"),
    micRequests:window.__voiceTest.micRequests.length
   }));
   assert.equal(muted.muted,true);
   assert.equal(muted.voice,false);
   assert.equal(muted.micRequests,0);
   if(name==="phone")await submit("Jarvis ativar voz");
   else await page.click("#btn-toggle-speech");
   assert.equal(await page.evaluate(()=>window.JARVIS_VOICE_CONTROLS.state.outputEnabled),true);

   if(name==="phone")await submit("Jarvis ativar escuta");
   else await page.click("#btn-listen-voice");
   await page.waitForFunction(()=>window.ULTRON_VOICE_INPUT.state.enabled&&
    window.ULTRON_VOICE_INPUT.state.recognitionRunning,{timeout:6500});
   const active=await page.evaluate(()=>({
    state:window.ULTRON_VOICE_INPUT.state,
    requests:window.__voiceTest.micRequests,
    starts:window.__voiceTest.recognitionStarts,
    micBtn:document.getElementById("btn-listen-voice").textContent
   }));
   assert.ok(active.starts>=1,name+": speech recognizer must start");
   assert.equal(active.requests.length,1,name+": explicit mic permission once");
   assert.equal(active.requests[0].video,false,name+": camera must remain off");
   assert.match(active.micBtn,/ESCUTA|CONVERSA|VOICE/i);
   await page.evaluate(()=>window.__voiceTest.recognition.onspeechstart?.());
   assert.match(await page.$eval("#mic-module",el=>el.textContent),/VOZ DETECTADA/);
   if(name==="phone")await submit("Jarvis desativar escuta");
   else await page.click("#btn-listen-voice");
   await page.waitForFunction(()=>!window.ULTRON_VOICE_INPUT.state.enabled,{timeout:6500});
   assert.equal(await page.evaluate(()=>window.__voiceTest.cameraRequests),0);

   const files=await page.evaluate(async()=>{
    const api=window.JARVIS_PHONE_FILES;
    if(!api)return {loaded:false};
    const opening=await api.openFolder("internal:Download");
    const closed=api.close();
    return {loaded:true,pending:opening.waitingAuthorization===true,closed:closed.ok===true};
   });
   assert.ok(files.loaded&&files.pending&&files.closed,
    name+": Android storage permissions still require authorization");
   console.log("JARVIS VOICE ENABLED PASS",name,JSON.stringify({
    controls:initial.controls.length,voiceSynthesis:true,
    micConsent:true,cameraRequests:0,overflow:initial.overflow
   }));
  }finally{await page.close().catch(()=>{});}
 }
}finally{await browser.close();}
