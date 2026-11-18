import assert from "node:assert/strict";
import puppeteer from "puppeteer-core";
const chrome=process.env.CHROME_BIN||"/usr/bin/google-chrome";
const url="http://127.0.0.1:"+(process.env.JARVIS_TEST_PORT||"8772")+"/index.html";
const browser=await puppeteer.launch({executablePath:chrome,headless:true,
 args:["--no-sandbox","--disable-dev-shm-usage","--enable-webgl","--enable-unsafe-swiftshader"]});
try{
 for(const [name,width,height,mobile] of [
  ["tiny Android",280,640,true],
  ["small Android",320,568,true],
  ["Android",360,740,true],
  ["Android large",430,932,true],
  ["phone split screen",600,780,true],
  ["folded",699,840,true],
  ["landscape",844,390,true],
  ["notebook",1366,768,false],
  ["TV",1920,1080,false]
 ]){
  const page=await browser.newPage();
  try{
   await page.setViewport({width,height,isMobile:mobile,
    hasTouch:mobile,deviceScaleFactor:1});
   await page.goto(url,{waitUntil:"domcontentloaded",timeout:40000});
   await page.waitForFunction(()=>window.JARVIS_MOBILE_VOICE_TEXT?.textReady &&
    window.JARVIS_COMMAND_CENTER?.active&&window.ULTRON_VOICE_INPUT,
    {timeout:30000});
   const r=await page.evaluate(()=>{
    const rect=x=>{const b=x?.getBoundingClientRect();
     return b?{w:b.width,h:b.height,x:b.x,right:b.right}:null;};
    const targets=["#btn-send","#btn-listen-voice","#btn-toggle-speech",
     "#btn-test-mic","#btn-enroll-voice-match",".jarvis-cc-tool-actions",
     ".quick-actions",".jarvis-cc-orb-controls",".neural-jarvis-control"];
    const controls=targets.map(selector=>({
     selector,found:!!document.querySelector(selector),
     size:rect(document.querySelector(selector))
    }));
    const input=document.getElementById("command-input");
    const help=document.getElementById("jarvis-mobile-command-hint");
    return {
     mobile:window.JARVIS_MOBILE_VOICE_TEXT.active,
     docWidth:document.documentElement.scrollWidth,
     viewport:innerWidth,
     input:rect(input),
     help:rect(help),
     helpText:help?.textContent||"",
     ring:rect(document.querySelector('.jarvis-cc-visual[data-mode="ring"]')),
     bottom:rect(document.querySelector(".jarvis-cc-bottom")),
     controls,
     micEnabled:window.ULTRON_VOICE_INPUT.state.enabled,
     voice:window.JARVIS_VOICE_CONTROLS?.state,
     enter:input?.getAttribute("enterkeyhint"),
     textSize:parseFloat(getComputedStyle(input).fontSize)
    };
   });
   assert.ok(r.docWidth<=r.viewport+7,name+": viewport overflow "+JSON.stringify(r));
   assert.ok(r.input?.w>Math.min(180,r.viewport*.6),name+": command field not visible");
   assert.ok(r.textSize>=16,name+": text too small for a mobile keyboard");
   assert.equal(r.micEnabled,false,name+": microphone not auto-requested");
   if(mobile){
    assert.equal(r.mobile,true,name+": dedicated mobile state not recognized");
    assert.ok(r.help?.h>=12&&r.helpText.includes("ENTER ENVIA"),
      name+": clear text/voice help should be visible");
    assert.ok(r.ring?.w>Math.min(195,r.viewport*.65),
     name+": hologram too small for phone");
    assert.ok(r.controls.every(c=>c.found&&c.size?.w===0&&c.size?.h===0),
     name+": dashboard buttons still visible "+JSON.stringify(r.controls));
    assert.equal(r.enter,"send");
    // The mobile user actually presses the keyboard, not a hidden button.
    await page.focus("#command-input");
    await page.$eval("#command-input",e=>{e.value="Jarvis silenciar voz";});
    await page.keyboard.press("Enter");
    await page.waitForFunction(()=>document.getElementById("command-input").value==="");
    await page.waitForFunction(()=>window.JARVIS_VOICE_CONTROLS?.state.outputEnabled===false);
    await page.focus("#command-input");
    await page.$eval("#command-input",e=>{e.value="Jarvis ativar voz";});
    await page.keyboard.press("Enter");
    await page.waitForFunction(()=>document.getElementById("command-input").value==="");
    await page.waitForFunction(()=>window.JARVIS_VOICE_CONTROLS?.state.outputEnabled===true);
   }else{
    assert.equal(r.mobile,false,name+": notebook/TV should keep controls");
    assert.ok(r.controls.filter(c=>c.selector!=="#btn-test-mic").every(c=>c.size?.w>20),
     name+": desktop buttons unexpectedly removed "+JSON.stringify(r.controls));
   }
   console.log("JARVIS MOBILE VOICE/TEXT PASS",name,width+"x"+height);
  }finally{await page.close().catch(()=>{});}
 }
}finally{await browser.close();}
