import assert from "node:assert/strict";
import puppeteer from "puppeteer-core";
const browser=await puppeteer.launch({
 executablePath:process.env.CHROME_BIN||"/usr/bin/google-chrome",
 headless:true,args:["--no-sandbox","--disable-dev-shm-usage",
  "--enable-webgl","--enable-unsafe-swiftshader"]
});
let page;
try{
 page=await browser.newPage();
 await page.setViewport({width:390,height:844,isMobile:true,hasTouch:true,deviceScaleFactor:1});
 await page.setRequestInterception(true);
 page.on("request",req=>req.url().startsWith("http://127.0.0.1:8769/")?
  req.continue():req.abort("blockedbyclient"));
 await page.goto(process.env.JARVIS_TEST_URL||"http://127.0.0.1:8769/",{
  waitUntil:"domcontentloaded",timeout:35000});
 await page.waitForFunction(()=>Boolean(window.JARVIS_COMMAND_CENTER &&
   window.ULTRON_NEURAL_JARVIS&&window.ULTRON_NEURAL_JARVIS_UI),{timeout:26000});
 const intro=await page.evaluate(()=>({
  head:document.querySelector(".jarvis-cc-heading")?.textContent,
  label:document.querySelector(".jarvis-cc-orb-label")?.textContent,
  engine:window.ULTRON_NEURAL_JARVIS.engine,
  architecture:window.ULTRON_NEURAL_JARVIS.architecture,
  oldHandle:window.ULTRON_NEURAL_RING_3D===window.ULTRON_NEURAL_JARVIS,
  mounted:window.ULTRON_NEURAL_JARVIS_UI.state.mounted,
  microphone:window.ULTRON_NEURAL_JARVIS_UI.state.audioPermission,
  archiveWithin:!!document.querySelector(".jarvis-cc-center .neural-jarvis-archive"),
  controls:document.querySelectorAll(".jarvis-cc-actions .neural-jarvis-control").length,
  hud:document.querySelector(".jarvis-cc-center .neural-jarvis-hud")?.textContent,
  mode:document.querySelector(".jarvis-cc-visual")?.dataset.mode
 }));
 assert.equal(intro.engine,"webgl",JSON.stringify(intro));
 assert.equal(intro.architecture?.name,"Neural Jarvis",JSON.stringify(intro));
 assert.deepEqual(intro.architecture?.plates,[18,22,24]);
 assert.equal(intro.architecture?.nodes,180);
 assert.equal(intro.architecture?.particles,1400);
 assert.match(intro.head,/NEURAL JARVIS/);
 assert.match(intro.label,/NEURAL JARVIS/);
 assert.equal(intro.mode,"ring");
 assert.equal(intro.oldHandle,true);
 assert.equal(intro.mounted,true);
 assert.equal(intro.microphone,"off","Never activate mic on page load");
 assert.equal(intro.archiveWithin,true);
 assert.equal(intro.controls,4);
 assert.doesNotMatch(intro.hud,/84\.6\s*TFLOPS|CONEXÕES:\s*100%/);
 const opened=await page.evaluate(()=>window.ULTRON_NEURAL_JARVIS_UI.toggleArchive());
 assert.equal(opened.ok,true);
 const archive=await page.$eval(".neural-jarvis-archive",node=>({
  hidden:node.hidden,rows:node.querySelectorAll(".neural-jarvis-archive-item").length,
  title:node.querySelector(".neural-jarvis-archive-detail h4")?.textContent
 }));
 assert.equal(archive.hidden,false);
 assert.equal(archive.rows,4);
 assert.equal(archive.title,"Núcleo Energético Central");
 const overdrive=await page.evaluate(()=>window.ULTRON_NEURAL_JARVIS_UI.toggleOverdrive());
 assert.equal(overdrive.ok,true);
 assert.equal(overdrive.active,true);
 const state=await page.evaluate(()=>window.ULTRON_NEURAL_JARVIS.state);
 assert.equal(state.expanded,true);
 assert.equal(state.overdrive,true);
 assert.ok(state.renderedComponents>=11);
 const zoom=await page.evaluate(()=>{
  const e=window.ULTRON_NEURAL_JARVIS;
  const before=e.state.zoom;
  e.zoomBy(-120);
  return {before,after:e.state.zoom};
 });
 assert.ok(zoom.after>zoom.before,"WebGL zoom should enlarge matrix");
 await page.evaluate(()=>window.JARVIS_COMMAND_CENTER.setVisualMode("globe"));
 const globe=await page.evaluate(()=>({
  mode:document.querySelector(".jarvis-cc-visual").dataset.mode,
  hudHidden:document.querySelector(".neural-jarvis-hud").hidden,
  archiveHidden:document.querySelector(".neural-jarvis-archive").hidden,
  ringActive:window.ULTRON_NEURAL_JARVIS.active
 }));
 assert.deepEqual(globe,{mode:"globe",hudHidden:true,archiveHidden:true,ringActive:false});
 await page.evaluate(()=>window.JARVIS_COMMAND_CENTER.setVisualMode("ring"));
 const returned=await page.evaluate(()=>({
  label:document.querySelector(".jarvis-cc-orb-label").textContent,
  ringActive:window.ULTRON_NEURAL_JARVIS.active
 }));
 assert.equal(returned.ringActive,true);
 assert.match(returned.label,/NEURAL JARVIS/);
 const noMic=await page.evaluate(()=>window.ULTRON_NEURAL_JARVIS_UI.state.audioPermission);
 assert.equal(noMic,"off");
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent("ultron:emergency-stop")));
 const stopped=await page.evaluate(()=>({
  expanded:window.ULTRON_NEURAL_JARVIS.state.expanded,
  overdrive:window.ULTRON_NEURAL_JARVIS.state.overdrive,
  archive:window.ULTRON_NEURAL_JARVIS_UI.state.archiveOpen,
  audio:window.ULTRON_NEURAL_JARVIS_UI.state.audioPermission
 }));
 assert.deepEqual(stopped,{expanded:false,overdrive:false,archive:false,audio:"off"});
 const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
 assert.ok(overflow<=4,"Mobile horizontal overflow: "+overflow);
 console.log("NEURAL JARVIS BROWSER PASS: 3D matrix, responsive controls, archive, zoom, globe, P0, mic opt-in.");
}finally{await browser.close();}
