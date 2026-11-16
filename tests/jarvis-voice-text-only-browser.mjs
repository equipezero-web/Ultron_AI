import assert from "node:assert/strict";
import puppeteer from "puppeteer-core";

const chrome=process.env.CHROME_BIN||"/usr/bin/google-chrome";
const port=process.env.JARVIS_TEST_PORT||"8772";
const browser=await puppeteer.launch({
  executablePath:chrome,headless:true,args:["--no-sandbox","--disable-setuid-sandbox",
    "--use-gl=swiftshader","--enable-webgl","--disable-dev-shm-usage"]
});
let page;
try{
  for (const [name,width,height] of [["phone",390,844],["notebook",1366,768],["tv",1920,1080]]) {
    page=await browser.newPage();
    await page.setViewport({width,height,deviceScaleFactor:1});
    await page.goto("http://127.0.0.1:"+port+"/index.html?jarvisVoiceOnly=1",{waitUntil:"domcontentloaded",timeout:40000});
    await page.waitForFunction(()=>window.JARVIS_VOICE_TEXT_ONLY?.active&&
      window.JARVIS_COMMAND_CENTER?.active&&window.ULTRON_ORCHESTRATOR?.execute,
      {timeout:30000});
    // DOM functionality and event listeners remain installed, but controls
    // have no visible real estate: only the text composer is visible.
    await new Promise(resolve=>setTimeout(resolve,300));
    let state=await page.evaluate(()=>{
      const all=[...document.querySelectorAll("button,[role=button],input[type=submit]")];
      const input=document.querySelector("#command-input");
      const send=document.querySelector("#btn-send");
      return {
        ready:Boolean(window.ULTRON_VOICE_INPUT?.enable),
        textWidth:input?.getBoundingClientRect().width||0,
        textHeight:input?.getBoundingClientRect().height||0,
        allHidden:all.every(el=>getComputedStyle(el).display==="none"),
        totalControls:all.length,
        sendHidden:send&&getComputedStyle(send).display==="none",
        overflow:document.documentElement.scrollWidth-innerWidth,
        paused:document.body.classList.contains("jarvis-voice-paused")
      };
    });
    assert.ok(state.ready,name+": voice input API should be available");
    assert.ok(state.textWidth>200&&state.textHeight>=40,name+": visible text composer");
    assert.ok(state.totalControls>10&&state.allHidden,name+": no visible buttons, but listeners remain");
    assert.equal(state.sendHidden,true,name+": send works by Enter, not button");
    assert.equal(state.paused,false,name+": voice recognition is not unconditionally paused");
    assert.ok(state.overflow<=6,name+": no horizontal overflow "+JSON.stringify(state));
    // A genuine keyboard submission must reach the existing orchestrator.
    await page.$eval("#command-input",el=>{
      el.value="Jarvis, o que você pode fazer";
      el.dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",bubbles:true,cancelable:true}));
    });
    await page.waitForFunction(()=>document.getElementById("command-input")?.value==="",{timeout:8000});
    // New buttons must be hidden too, not just ones present during startup.
    await page.evaluate(()=>{const b=document.createElement("button");b.id="test-dynamic-button";document.body.appendChild(b);});
    await new Promise(resolve=>setTimeout(resolve,100));
    assert.equal(await page.$eval("#test-dynamic-button",el=>getComputedStyle(el).display),"none");
    // Remote storage consent is still requested only after spoken/text action.
    const files=await page.evaluate(async()=>{
      const api=window.JARVIS_PHONE_FILES;
      if(!api)return {loaded:false};
      const opening=await api.openFolder("internal:Download");
      const panel=document.querySelector("#jarvis-phone-files");
      const closed=api.close();
      return {loaded:true,pending:opening.waitingAuthorization===true,
        visibleBefore:panel&&!panel.hidden,closed:closed.ok===true};
    });
    assert.ok(files.loaded&&files.pending&&files.closed,name+": Filespace authorized only on command");
    console.log("VOICE-TEXT ONLY BROWSER PASS:",name,JSON.stringify(state));
    await page.close();page=null;
  }
}finally{
  if(page)await page.close().catch(()=>{});
  await browser.close();
}
