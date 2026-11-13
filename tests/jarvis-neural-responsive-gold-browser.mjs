import assert from "node:assert/strict";
import puppeteer from "puppeteer-core";
const browser=await puppeteer.launch({
 executablePath:process.env.CHROME_BIN||"/usr/bin/google-chrome",
 headless:true,args:["--no-sandbox","--disable-dev-shm-usage","--enable-webgl","--enable-unsafe-swiftshader"]
});
const origin=process.env.JARVIS_TEST_URL||"http://127.0.0.1:8770/";
const testSizes=[
 {name:"small phone",width:320,height:568,mobile:true},
 {name:"phone",width:390,height:844,mobile:true},
 {name:"phone landscape",width:844,height:390,mobile:true},
 {name:"tablet",width:768,height:1024,mobile:true},
 {name:"notebook",width:1366,height:768,mobile:false},
 {name:"full HD TV",width:1920,height:1080,mobile:false},
 {name:"4K TV",width:3840,height:2160,mobile:false}
];
const issues=[];
try{
 const page=await browser.newPage();
 await page.setRequestInterception(true);
 page.on("request",req=>req.url().startsWith("http://127.0.0.1:8770/")?
  req.continue():req.abort("blockedbyclient"));
 for(const config of testSizes){
  await page.setViewport({
   width:config.width,height:config.height,isMobile:config.mobile,
   hasTouch:config.mobile,deviceScaleFactor:1
  });
  if(config===testSizes[0]){
   await page.goto(origin,{waitUntil:"domcontentloaded",timeout:40000});
   await page.waitForFunction(()=>Boolean(
    window.ULTRON_NEURAL_JARVIS?.active&&window.ULTRON_NEURAL_JARVIS_UI?.state?.mounted),
    {timeout:28000});
  }else await page.evaluate(()=>window.scrollTo(0,0));
  await page.waitForFunction(()=>document.querySelector("#jarvis-cc-canvas")?.width>0,
   {timeout:5000});
  await new Promise(ok=>setTimeout(ok,120));
  const result=await page.evaluate(()=>{
   const node=s=>document.querySelector(s);
   const rect=s=>{const r=node(s)?.getBoundingClientRect();return r?
    {x:r.left,y:r.top,width:r.width,height:r.height,right:r.right,bottom:r.bottom}:null;};
   const style=s=>node(s)?getComputedStyle(node(s)):null;
   const actionButtons=[...document.querySelectorAll(".jarvis-cc-actions button")];
   const neuralButtons=[...document.querySelectorAll(".jarvis-cc-actions .neural-jarvis-control")];
   return {
    viewport:{width:innerWidth,height:innerHeight},
    documentWidth:document.documentElement.scrollWidth,
    center:rect(".jarvis-cc-center"),
    visual:rect(".jarvis-cc-visual"),
    actions:rect(".jarvis-cc-actions"),
    archive:rect(".neural-jarvis-archive"),
    canvas:rect("#jarvis-cc-canvas"),
    canvasBuffer:{width:node("#jarvis-cc-canvas")?.width,
      height:node("#jarvis-cc-canvas")?.height},
    titleColor:style(".jarvis-cc-heading")?.color,
    ringColor:style(".jarvis-cc-orb-label")?.color,
    ringVisible:!node("#jarvis-cc-canvas")?.hidden,
    engine:window.ULTRON_NEURAL_JARVIS?.active,
    controlsVisible:style(".jarvis-cc-actions")?.display!=="none",
    actionsCount:actionButtons.length,
    neuralCount:neuralButtons.length,
    minHeight:Math.min(...neuralButtons.map(b=>b.getBoundingClientRect().height)),
    minWidth:Math.min(...neuralButtons.map(b=>b.getBoundingClientRect().width)),
    collapsed:neuralButtons.some(b=>getComputedStyle(b).display==="none"),
    gridColumns:style(".jarvis-cc-actions")?.gridTemplateColumns,
    stageWidth:rect(".jarvis-command-center-ui")?.width
   };
  });
  const bad=[];
  if(result.documentWidth>result.viewport.width+5)bad.push("document horizontal overflow "+(result.documentWidth-result.viewport.width));
  if(!result.center||result.center.width>result.viewport.width+5)bad.push("center exceeds viewport");
  if(!result.visual||result.visual.width>result.center.width+6)bad.push("visual exceeds center");
  if(!result.engine||!result.ringVisible)bad.push("3D engine unavailable");
  if(result.canvasBuffer.width===0||result.canvasBuffer.height===0)bad.push("WebGL canvas not resized");
  if(!result.controlsVisible||result.neuralCount!==4||result.collapsed)
   bad.push("neural buttons missing/hidden");
  if(result.minHeight<43||result.minWidth<43)bad.push("touch target too small");
  if(result.actions.width>result.viewport.width+5)bad.push("action toolbar too wide");
  if(!/rgb\(255, 227, 155\)/.test(result.titleColor||""))
   bad.push("Stark gold title missing "+result.titleColor);
  if(bad.length)issues.push({screen:config.name,bad,metrics:result});
  else console.log("RESPONSIVE SCREEN PASS",config.name,
   config.width+"x"+config.height,JSON.stringify({
    stage:Math.round(result.center.width),canvas:Math.round(result.canvas.width),
    controls:result.actionsCount,gold:result.titleColor}));
  if(config.name==="phone"){
   const open=await page.evaluate(()=>window.ULTRON_NEURAL_JARVIS_UI.toggleArchive());
   assert.equal(open.ok,true);
   const overlay=await page.evaluate(()=>{
    const box=document.querySelector(".neural-jarvis-archive").getBoundingClientRect();
    const stage=document.querySelector(".jarvis-cc-center").getBoundingClientRect();
    const close=document.querySelector(".neural-jarvis-archive-head button").getBoundingClientRect();
    return {box:{left:box.left,right:box.right,top:box.top,bottom:box.bottom},
      stage:{left:stage.left,right:stage.right,top:stage.top,bottom:stage.bottom},
      closeHeight:close.height};
   });
   assert.ok(overlay.box.left>=overlay.stage.left-3&&overlay.box.right<=overlay.stage.right+3,
    "Archive must fit phone stage: "+JSON.stringify(overlay));
   assert.ok(overlay.closeHeight>=42,"Archive close touch target");
   await page.evaluate(()=>window.ULTRON_NEURAL_JARVIS_UI.toggleArchive());
   const modes=await page.evaluate(()=>{
    window.JARVIS_COMMAND_CENTER.setVisualMode("globe");
    const globe=window.ULTRON_NEURAL_JARVIS.active;
    window.JARVIS_COMMAND_CENTER.setVisualMode("ring");
    return {globe,restored:window.ULTRON_NEURAL_JARVIS.active};
   });
   assert.deepEqual(modes,{globe:false,restored:true});
  }
 }
 assert.deepEqual(issues,[],"Responsive regressions: "+JSON.stringify(issues));
 const page=await browser.newPage();
 await page.setViewport({width:390,height:844,isMobile:true,hasTouch:true});
 await page.setRequestInterception(true);
 page.on("request",req=>req.url().startsWith("http://127.0.0.1:8770/")?
  req.continue():req.abort("blockedbyclient"));
 await page.goto(origin,{waitUntil:"domcontentloaded",timeout:35000});
 await page.waitForFunction(()=>window.ULTRON_NEURAL_JARVIS?.active,{timeout:25000});
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent("ultron:emergency-stop")));
 const stopped=await page.evaluate(()=>window.ULTRON_NEURAL_JARVIS_UI.state);
 assert.equal(stopped.audioPermission,"off");
 console.log("NEURAL JARVIS RESPONSIVE GOLD PASS: phone, landscape, tablet, notebook, Full HD and 4K TV.");
}finally{await browser.close();}
