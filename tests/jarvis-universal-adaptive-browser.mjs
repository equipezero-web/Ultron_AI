import assert from "node:assert/strict";
import puppeteer from "puppeteer-core";
const browser=await puppeteer.launch({
 executablePath:process.env.CHROME_BIN||"/usr/bin/google-chrome",
 headless:true,args:["--no-sandbox","--disable-dev-shm-usage",
  "--enable-webgl","--enable-unsafe-swiftshader"]
});
const base=process.env.JARVIS_TEST_URL||"http://127.0.0.1:8774/";
const viewports=[
 ["tiny",280,640,true],
 ["small Android",320,568,true],
 ["compact Android",360,740,true],
 ["iPhone-size",390,844,true],
 ["large phone",430,932,true],
 ["large Android",540,960,true],
 ["phone split screen",600,780,true],
 ["folded inner viewport",699,840,true],
 ["phone landscape",844,390,true],
 ["tablet/foldable",768,1024,true],
 ["unfolded tablet",1024,768,true],
 ["notebook",1366,768,false],
 ["desktop",1920,1080,false],
 ["4K TV",3840,2160,false]
];
const page=await browser.newPage();
try{
 await page.setRequestInterception(true);
 page.on("request",req=>{
  if(req.url().startsWith("http://127.0.0.1:8774/"))req.continue();
  else req.abort("blockedbyclient");
 });
 for(const [name,width,height,mobile] of viewports){
  await page.setViewport({width,height,isMobile:mobile,
   hasTouch:mobile,deviceScaleFactor:mobile?2:1});
  if(name==="tiny"){
   await page.goto(base,{waitUntil:"domcontentloaded",timeout:35000});
  }
  await page.waitForFunction(()=>Boolean(
   window.JARVIS_COMMAND_CENTER?.active&&window.ULTRON_NEURAL_JARVIS?.active&&
   window.ULTRON_UNIVERSAL_ADAPTIVE?.state),{timeout:25000});
  await page.evaluate(()=>window.ULTRON_UNIVERSAL_ADAPTIVE.refresh());
  const m=await page.evaluate(()=>{
   const el=s=>document.querySelector(s);
   const rect=s=>{const r=el(s)?.getBoundingClientRect();return r?
    {left:r.left,right:r.right,top:r.top,bottom:r.bottom,
     width:r.width,height:r.height}:null};
   const profile=window.ULTRON_UNIVERSAL_ADAPTIVE.state;
   const gpu=window.ULTRON_NEURAL_JARVIS.state;
   const doc=document.documentElement;
   const buttons=[...document.querySelectorAll(".jarvis-cc-tool-actions button")];
   const brect=buttons.map(b=>({
    w:b.getBoundingClientRect().width,h:b.getBoundingClientRect().height,
    hidden:getComputedStyle(b).display==="none"
   }));
   return {
    w:innerWidth,docWidth:doc.scrollWidth,center:rect(".jarvis-cc-center"),
    visual:rect('.jarvis-cc-visual[data-mode="ring"]'),
    bodyNetwork:document.body.dataset.jarvisNetwork,
    bodyLayout:document.body.dataset.jarvisLayout,
    device:profile.device,profile:profile.profile,
    gpu,screenInputFont:parseFloat(getComputedStyle(el("#command-input")).fontSize),
    dockColumns:getComputedStyle(el(".jarvis-cc-dock-grid")).gridTemplateColumns,
    buttons:brect,buttonCount:buttons.length,
    canvas:rect("#jarvis-cc-canvas"),
    connection:el("#connection-state")?.textContent
   };
  });
  const errors=[];
  if(m.docWidth>m.w+5)errors.push("horizontal overflow "+(m.docWidth-m.w));
  if(!m.center||m.center.width>m.w+6)errors.push("center too wide");
  if(!m.visual||m.visual.width>m.w+8)errors.push("hologram too wide");
  if(!m.buttons.length||m.buttons.some(b=>b.hidden||b.w<40||b.h<43))
   errors.push("tool buttons missing/too small");
  if(m.gpu.qualityTier!==m.profile.tier)errors.push("renderer not linked to profile");
  if(m.gpu.canvasPixels>m.profile.maxCanvasPixels*1.01)
   errors.push("GPU buffer exceeds pixel cap");
  if(m.gpu.fpsCap!==m.profile.fps)errors.push("GPU fpsCap not applied");
  if(width<=699&&m.screenInputFont<16)errors.push("mobile input auto zoom");
  if(width>=320&&width<700&&m.dockColumns.split(" ").length!==2)
   errors.push("2x2 system grid lost");
  if(width<300&&m.dockColumns.split(" ").length!==1)
   errors.push("tiny-phone fallback should stack system cards");
  assert.deepEqual(errors,[],name+" "+JSON.stringify(m));
  console.log("UNIVERSAL PHONE/DISPLAY PASS",name,width+"x"+height,
   m.bodyLayout,m.profile.tier,m.gpu.canvasPixels,
   m.gpu.fpsCap+"fps");
 }
 // Simulated browser network hints: never claim actual cellular or server health.
 // The runtime subscribes to the same connection object exposed at boot.
 const check=await browser.newPage();
 await check.setViewport({width:390,height:844,isMobile:true,hasTouch:true});
 await check.evaluateOnNewDocument(()=>{
  const net=new EventTarget();
  net.effectiveType="4g";net.downlink=12;net.rtt=60;net.saveData=false;
  Object.defineProperty(navigator,"connection",{configurable:true,get:()=>net});
  window.__testConnection=net;
 });
 await check.setRequestInterception(true);
 check.on("request",req=>req.url().startsWith("http://127.0.0.1:8774/")?
  req.continue():req.abort("blockedbyclient"));
 await check.goto(base,{waitUntil:"domcontentloaded",timeout:35000});
 await check.waitForFunction(()=>window.ULTRON_UNIVERSAL_ADAPTIVE?.state?.network?.tier==="standard",
  {timeout:18000});
 const transitions=await check.evaluate(()=>{
  const transitions=[];
  const collect=()=>transitions.push({
   network:document.body.dataset.jarvisNetwork,
   tier:window.ULTRON_UNIVERSAL_ADAPTIVE.state.profile.tier,
   browserLabel:document.getElementById("connection-state").textContent,
   fps:window.ULTRON_NEURAL_JARVIS?.state?.fpsCap
  });
  collect();
  window.__testConnection.effectiveType="2g";
  window.__testConnection.downlink=.25;
  window.__testConnection.dispatchEvent(new Event("change"));
  window.ULTRON_UNIVERSAL_ADAPTIVE.refresh();
  collect();
  window.__testConnection.effectiveType="4g";
  window.__testConnection.saveData=true;
  window.__testConnection.downlink=20;
  window.ULTRON_UNIVERSAL_ADAPTIVE.refresh();collect();
  Object.defineProperty(navigator,"onLine",{configurable:true,get:()=>false});
  window.dispatchEvent(new Event("offline"));
  window.ULTRON_UNIVERSAL_ADAPTIVE.refresh();collect();
  delete navigator.onLine;
  window.__testConnection.saveData=false;
  window.ULTRON_UNIVERSAL_ADAPTIVE.refresh();collect();
  return transitions;
 });
 assert.equal(transitions[0].network,"standard");
 assert.equal(transitions[1].network,"limited");
 assert.equal(transitions[1].tier,"economy");
 assert.equal(transitions[1].fps,15);
 assert.equal(transitions[2].network,"limited");
 assert.equal(transitions[3].network,"offline");
 assert.match(transitions[3].browserLabel,/TERMINAL LOCAL/);
 assert.equal(transitions[4].network,"standard");
 await check.waitForFunction(()=>window.ULTRON_NEURAL_JARVIS?.active,{timeout:18000});
 assert.equal(await check.evaluate(()=>window.ULTRON_NEURAL_JARVIS_UI.state.audioPermission),
  "off","Network transitions must not activate microphone");
 await check.evaluate(()=>window.dispatchEvent(new CustomEvent("ultron:emergency-stop")));
 const p0=await check.evaluate(()=>window.ULTRON_NEURAL_JARVIS_UI.state);
 assert.equal(p0.audioPermission,"off");
 assert.equal(p0.archiveOpen,false);
 console.log("UNIVERSAL NETWORK PASS",JSON.stringify(transitions));
}finally{await browser.close();}
