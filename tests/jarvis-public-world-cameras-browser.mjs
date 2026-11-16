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
 await page.waitForSelector(".jarvis-cc-center",{timeout:20000});
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
 const fallback=await page.$eval(".jarvis-worldcam-fallback",a=>({
   href:a.href,target:a.target,rel:a.rel,label:a.textContent,
   minHeight:getComputedStyle(a).minHeight
 }));
 assert.equal(fallback.href,
  "https://www.skylinewebcams.com/en/webcam/israel/jerusalem-district/jerusalem/western-wall.html");
 assert.equal(fallback.target,"_blank");
 assert.match(fallback.rel,/noopener/);
 assert.match(fallback.label,/JERUSALÉM/);
 assert.equal(parseFloat(fallback.minHeight)>=44,true);
 const failure=await page.$(".jarvis-worldcam-playback-failed");
 assert.ok(failure,"Users need an explicit failure/unavailable action without fake automatic status");
 await page.click(".jarvis-worldcam-playback-failed");
 const failed=await page.evaluate(()=>window.ULTRON_WORLD_CAMERAS.state);
 assert.equal(failed.userReportedFailure,"recife-airport");
 assert.equal(failed.playerRequested,false);
 assert.equal(await page.$(".jarvis-worldcam-view iframe[src]"),null,
  "Failed external stream must immediately stop loading");
 assert.equal(await page.$eval(".jarvis-worldcam-fallback",a=>a.href),
  fallback.href,"Jerusalem fallback remains accessible after user-confirmed failure");
 await page.evaluate(()=>window.ULTRON_WORLD_CAMERAS.open({
  cameraId:"jerusalem-western-wall"
 }));
 assert.equal(await page.$(".jarvis-worldcam-view iframe[src]"),null,
  "SkylineWebcams live feed cannot be embedded by a third-party website");
 assert.equal(await page.$(".jarvis-worldcam-play"),null,
  "Do not offer unsupported live player for Skyline source");
 assert.equal(await page.$eval(".jarvis-worldcam-info .jarvis-worldcam-source",a=>a.href),
  fallback.href);
 assert.match(await page.$eval(".jarvis-worldcam-info",n=>n.textContent),
  /não incorporar/i);
 assert.equal(await page.$(".jarvis-worldcam-fallback"),null,
  "The Jerusalem page cannot offer itself as the fallback");
 const jerusalem=await page.evaluate(()=>window.ULTRON_WORLD_CAMERAS.state);
 assert.equal(jerusalem.selected,"jerusalem-western-wall");
 assert.equal(jerusalem.playerRequested,false);
 assert.equal(jerusalem.liveVerified,false);
 const flags=await page.evaluate(()=>window.ULTRON_WORLD_CAMERAS.state);
 assert.equal(flags.liveVerified,false,"Never assert playback verifies live availability");
 assert.equal(flags.playerRequested,false,
  "Stream was stopped when user reported playback failure");
 const directories=await page.$eval(".jarvis-worldcam-catalogs .jarvis-worldcam-catalog-card",cards=>
  cards.map(card=>({title:card.querySelector("strong").textContent,
   urls:[...card.querySelectorAll("a")].map(a=>a.href)})));
 assert.equal(directories.length,2);
 assert.ok(directories.some(x=>x.title==="SkylineWebcams"&&
   x.urls.includes("https://www.skylinewebcams.com/en/webcam.html")));
 assert.ok(directories.some(x=>x.title==="Webcamera24"&&
   x.urls.includes("https://webcamera24.com/pt/all-webcams/")));
 const providerOptions=await page.$eval(".jarvis-worldcam-filters select[aria-label='Filtrar provedor de câmeras'] option",
  opts=>opts.map(o=>o.textContent));
 assert.ok(providerOptions.includes("Webcamera24"));
 assert.ok(providerOptions.includes("SkylineWebcams"));
 const w24selected=await page.evaluate(()=>window.ULTRON_WORLD_CAMERAS.open({
  cameraId:"webcamera24-patong-nanai"
 }));
 assert.equal(w24selected.ok,true);
 assert.equal(w24selected.selected,"webcamera24-patong-nanai");
 assert.equal(await page.$(".jarvis-worldcam-view iframe[src]"),null);
 assert.equal(await page.$(".jarvis-worldcam-audio:not([hidden])"),null);
 await page.click(".jarvis-worldcam-play");
 const w24stream=await page.$eval(".jarvis-worldcam-view iframe",el=>el.getAttribute("src"));
 assert.match(w24stream,/youtube-nocookie\.com\/embed\/uEkJjuAjWa0/);
 assert.match(w24stream,/mute=1/);
 assert.match(w24stream,/enablejsapi=1/);
 assert.equal(await page.$eval(".jarvis-worldcam-audio",el=>el.hidden),false);
 const defaultAudio=await page.evaluate(()=>window.ULTRON_WORLD_CAMERAS.state);
 assert.equal(defaultAudio.audioRequested,false);
 assert.equal(defaultAudio.audioVerified,false);
 assert.equal(defaultAudio.managedAudio,true);
 assert.equal(await page.$eval(".jarvis-worldcam-audio-toggle",el=>el.textContent),"ATIVAR ÁUDIO");
 await page.click(".jarvis-worldcam-audio-toggle");
 assert.equal((await page.evaluate(()=>window.ULTRON_WORLD_CAMERAS.state)).audioRequested,true);
 assert.equal(await page.$eval(".jarvis-worldcam-audio-toggle",el=>el.getAttribute("aria-pressed")),"true");
 await page.click(".jarvis-worldcam-audio-toggle");
 assert.equal((await page.evaluate(()=>window.ULTRON_WORLD_CAMERAS.state)).audioRequested,false);
 // Clicking a different webcam MUST always reset to muted, even after an unmute.
 await page.click(".jarvis-worldcam-audio-toggle");
 assert.equal((await page.evaluate(()=>window.ULTRON_WORLD_CAMERAS.state)).audioRequested,true);
 const switched=await page.evaluate(()=>window.ULTRON_WORLD_CAMERAS.open({
  cameraId:"webcamera24-osaka-ikuno"
 }));
 assert.equal(switched.selected,"webcamera24-osaka-ikuno");
 const afterSwitch=await page.evaluate(()=>window.ULTRON_WORLD_CAMERAS.state);
 assert.equal(afterSwitch.audioRequested,false,"No audio permission may carry between cams");
 assert.equal(afterSwitch.playerRequested,false);
 assert.equal(await page.$eval(".jarvis-worldcam-audio",el=>el.hidden),true);
 await page.click(".jarvis-worldcam-play");
 assert.equal((await page.evaluate(()=>window.ULTRON_WORLD_CAMERAS.state)).audioRequested,false);
 assert.match(await page.$eval(".jarvis-worldcam-view iframe",el=>el.getAttribute("src")),
  /mute=1/);
 const noEmbed=await page.evaluate(()=>window.ULTRON_WORLD_CAMERAS.open({
  cameraId:"skyline-shanghai"
 }));
 assert.equal(noEmbed.selected,"skyline-shanghai");
 assert.equal(await page.$(".jarvis-worldcam-play"),null);
 assert.equal(await page.$(".jarvis-worldcam-view iframe[src]"),null);
 assert.equal(await page.$eval(".jarvis-worldcam-audio",el=>el.hidden),true);
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
