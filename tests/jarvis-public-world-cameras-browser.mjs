import assert from "node:assert/strict";
import puppeteer from "puppeteer-core";
const browser=await puppeteer.launch({
 executablePath:process.env.CHROME_BIN||"/usr/bin/google-chrome",headless:true,
 args:["--no-sandbox","--disable-dev-shm-usage","--enable-webgl","--enable-unsafe-swiftshader"]
});
try{
 const page=await browser.newPage();
 await page.setViewport({width:390,height:844,isMobile:true,hasTouch:true,deviceScaleFactor:1});
 await page.setRequestInterception(true);
 page.on("request",req=>req.url().startsWith("http://127.0.0.1:8768/")?
  req.continue():req.abort("blockedbyclient"));
 await page.goto(process.env.JARVIS_TEST_URL||"http://127.0.0.1:8768/",{
  waitUntil:"domcontentloaded",timeout:35000
 });
 await page.waitForFunction(()=>Boolean(window.ULTRON_WORLD_CAMERAS&&window.ULTRON_ORCHESTRATOR),{timeout:20000});
 const run=cmd=>page.evaluate(input=>window.ULTRON_ORCHESTRATOR.execute(input,"terminal"),cmd);
 const opened=await run("Jarvis, câmeras do mundo");
 assert.equal(opened.ok,true,JSON.stringify(opened));
 assert.ok(opened.count>=10);
 const panel=await page.$(".jarvis-worldcam-panel:not([hidden])");
 assert.ok(panel,"Worldcam panel must open inside existing Neural Ring");
 assert.equal(await page.$(".jarvis-worldcam-view iframe[src]"),null,
  "No hidden or automatic camera feed should load on activation");
 const searched=await run("Jarvis, mostre a câmera de Recife");
 assert.equal(searched.ok,true,JSON.stringify(searched));
 assert.equal(searched.selected,"recife-airport");
 const buttons=await page.$$(".jarvis-worldcam-item");
 assert.equal(buttons.length,1);
 await page.click(".jarvis-worldcam-play");
 const stream=await page.$eval(".jarvis-worldcam-view iframe",iframe=>({
  src:iframe.getAttribute("src"),hidden:iframe.hidden
 }));
 assert.equal(stream.hidden,false);
 assert.equal(stream.src,"https://www.youtube-nocookie.com/embed/ojTrjv9QxM8?autoplay=1&mute=1&playsinline=1&rel=0");
 const flags=await page.evaluate(()=>window.ULTRON_WORLD_CAMERAS.state);
 assert.equal(flags.liveVerified,false,"Never assert playback verifies live availability");
 assert.equal(flags.playerRequested,true);
 const sourceOnly=await page.evaluate(()=>window.ULTRON_WORLD_CAMERAS.open({cameraId:"serra-rastro"}));
 assert.equal(sourceOnly.ok,true);
 assert.equal(await page.$(".jarvis-worldcam-view iframe[src]"),null,
  "Switching to source-only camera must clear previous video");
 assert.equal(await page.$(".jarvis-worldcam-play"),null,
  "Source-only camera must not invent a playable stream");
 const input=await page.$(".jarvis-worldcam-filters input");
 await input.click({clickCount:3});await input.type("não existe");
 const empty=await page.$eval(".jarvis-worldcam-empty",node=>node.textContent);
 assert.match(empty,/Nenhuma câmera/);
 await page.evaluate(()=>window.ULTRON_WORLD_CAMERAS.open({cameraId:"tokyo-rainbow"}));
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent("ultron:emergency-stop",{detail:{epoch:501}})));
 const after=await page.evaluate(()=>({
  state:window.ULTRON_WORLD_CAMERAS.state,
  hidden:document.querySelector(".jarvis-worldcam-panel").hidden,
  src:document.querySelector(".jarvis-worldcam-view iframe").getAttribute("src")
 }));
 assert.equal(after.hidden,true);
 assert.equal(after.src,null);
 assert.equal(after.state.playerRequested,false);
 const width=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
 assert.ok(width<=4,"No mobile horizontal overflow: "+width);
 const privateIntent=await page.evaluate(()=>window.ULTRON_WORLD_CAMERAS.parse("abrir câmera do celular"));
 assert.equal(privateIntent,null,"Worldcam module cannot intercept local optical sensor");
 console.log("WORLD WEBCAM BROWSER PASS: mobile, source-only, opt-in iframe, accurate live status and P0.");
}finally{await browser.close();}
