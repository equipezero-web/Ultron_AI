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
 // A user must see which cameras exist before seeing an empty video player.
 const cameraChoices=await page.evaluate(()=>{
  const panel=document.querySelector(".jarvis-worldcam-panel");
  const picker=document.querySelector("#jarvis-worldcam-camera-select");
  const first=document.querySelector(".jarvis-worldcam-item");
  const pr=picker.getBoundingClientRect(),fr=first.getBoundingClientRect();
  const panelRect=panel.getBoundingClientRect();
  return {
   choices:picker.options.length,firstOption:picker.options[1]?.textContent,
   firstCard:first.textContent,
   top:pr.top,bottom:pr.bottom,cardTop:fr.top,panelBottom:panelRect.bottom,
   visible:getComputedStyle(picker).display!=="none"&&pr.width>100&&pr.height>=40,
   scroll:getComputedStyle(panel).overflowY,
   gallery:panel.querySelectorAll(".jarvis-worldcam-item").length,
   advancedClosed:!panel.querySelector(".jarvis-worldcam-advanced").open
  };
 });
 assert.ok(cameraChoices.choices>=11,JSON.stringify(cameraChoices));
 assert.match(cameraChoices.firstOption,/VÍDEO NO RING/);
 assert.ok(cameraChoices.visible, "Camera selector must be visible above preview: "+JSON.stringify(cameraChoices));
 assert.ok(cameraChoices.gallery>=10);
 assert.ok(cameraChoices.cardTop<cameraChoices.panelBottom,
  "Camera options must appear without scrolling below a blank video: "+JSON.stringify(cameraChoices));
 assert.equal(cameraChoices.advancedClosed,true,"Advanced filters must not hide the default options");
 assert.equal(cameraChoices.scroll,"auto","Camera panel must scroll instead of clipping the catalogue");
 const mobileLayout=await page.evaluate(()=>{
  const view=document.querySelector(".jarvis-worldcam-view").getBoundingClientRect();
  const picker=document.querySelector(".jarvis-worldcam-picker").getBoundingClientRect();
  return {width:view.width,height:view.height,pickerWidth:picker.width,
   horizontalOverflow:document.documentElement.scrollWidth-innerWidth};
 });
 assert.ok(mobileLayout.height>=275,
  "Mobile camera viewer must be large: "+JSON.stringify(mobileLayout));
 assert.ok(mobileLayout.width>=mobileLayout.pickerWidth-20,
  "Mobile camera viewer must use nearly the whole Ring width: "+JSON.stringify(mobileLayout));
 assert.ok(mobileLayout.horizontalOverflow<=4,
  "Wider camera viewer must not cause horizontal overflow: "+JSON.stringify(mobileLayout));

 // Regression reproduced from a real screenshot: a browser/password manager
 // inserts an account e-mail into the camera place-search and causes 0 options.
 // Do not log or echo it; restore public camera choices automatically.
 const autoFillBefore=await page.evaluate(()=>{
  const input=document.querySelector('.jarvis-worldcam-filters input');
  return {locked:input.readOnly,autocomplete:input.autocomplete};
 });
 assert.equal(autoFillBefore.locked,true,"Camera search should resist initial autofill");
 assert.equal(autoFillBefore.autocomplete,"off");
 await page.$eval('.jarvis-worldcam-filters input',input=>{
  input.value="autofill@example.invalid";
  input.dispatchEvent(new Event("input",{bubbles:true}));
 });
 const autofillRecovered=await page.evaluate(()=>({
  search:document.querySelector('.jarvis-worldcam-filters input').value,
  options:document.querySelector('#jarvis-worldcam-camera-select').options.length,
  cards:document.querySelectorAll('.jarvis-worldcam-item').length,
  reset:document.querySelector('.jarvis-worldcam-show-all')?.getBoundingClientRect()?.height||0,
  visible:getComputedStyle(document.querySelector('.jarvis-worldcam-show-all')).visibility
 }));
 assert.equal(autofillRecovered.search,"","Account data must never stay in camera-search field");
 assert.ok(autofillRecovered.options>=11&&autofillRecovered.cards>=10,
  "Account autofill must never cause zero visible cameras: "+JSON.stringify(autofillRecovered));
 assert.ok(autofillRecovered.reset>=40&&autofillRecovered.visible==="visible",
  "Show all cameras reset should be genuinely visible");
 // A delayed autofill with no input event must also be cleared on the next
 // catalogue render, e.g. when the user touches a different filter.
 await page.$eval('.jarvis-worldcam-filters input',el=>{el.value="late@example.invalid";});
 await page.$eval('.jarvis-worldcam-filters select[aria-label="Filtrar continente"]',
  el=>el.dispatchEvent(new Event("input",{bubbles:true})));
 assert.equal(await page.$eval('.jarvis-worldcam-filters input',el=>el.value),"");
 assert.ok((await page.$$('#jarvis-worldcam-camera-select option')).length>=11);
 // Real manual location searching must remain functional after unlocking.
 // The advanced filter is intentionally collapsed; reveal it before focusing.
 await page.click(".jarvis-worldcam-advanced>summary");
 await page.$eval('.jarvis-worldcam-filters input',el=>el.focus());
 assert.equal(await page.$eval('.jarvis-worldcam-filters input',el=>el.readOnly),false);
 await page.$eval('.jarvis-worldcam-filters input',el=>{
  el.value="Recife";
  el.dispatchEvent(new Event("input",{bubbles:true}));
 });
 assert.equal((await page.$$('#jarvis-worldcam-camera-select option')).length,2);
 await page.click('.jarvis-worldcam-show-all');
 assert.ok((await page.$$('#jarvis-worldcam-camera-select option')).length>=11);

 // Regression: generic or unmatched search terms must never leave the picker
 // showing 0 cameras while the curated source index contains real entries.
 const broad=await page.evaluate(()=>window.ULTRON_WORLD_CAMERAS.open({
  search:"câmeras do mundo"
 }));
 assert.ok(broad.count>=10,JSON.stringify(broad));
 assert.ok((await page.$$("#jarvis-worldcam-camera-select option")).length>=11);
 assert.equal(await page.$(".jarvis-worldcam-empty"),null);
 const unknown=await page.evaluate(()=>window.ULTRON_WORLD_CAMERAS.open({
  search:"local inexistente em lugar algum"
 }));
 assert.ok(unknown.count>=10,JSON.stringify(unknown));
 assert.equal(await page.$eval(".jarvis-worldcam-filters input",el=>el.value),"");
 assert.match(await page.$eval(".jarvis-worldcam-picker-notice",el=>el.textContent),/Exibindo todas as opções/);
 assert.ok((await page.$$("#jarvis-worldcam-camera-select option")).length>=11);
 assert.equal(await page.$(".jarvis-worldcam-empty"),null);
 // Explicit advanced searches may yield zero, but must show a working reset.
 await page.click(".jarvis-worldcam-advanced>summary");
 await page.$eval(".jarvis-worldcam-filters input",el=>{
  el.value="local inexistente";
  el.dispatchEvent(new Event("input",{bubbles:true}));
 });
 assert.ok(await page.$(".jarvis-worldcam-empty"));
 await page.click(".jarvis-worldcam-show-all");
 assert.equal(await page.$(".jarvis-worldcam-empty"),null);
 assert.ok((await page.$$("#jarvis-worldcam-camera-select option")).length>=11);
 assert.equal(await page.$eval(".jarvis-worldcam-filters input",el=>el.value),"");

 await page.select("#jarvis-worldcam-camera-select","copacabana");
 const picked=await page.evaluate(()=>window.ULTRON_WORLD_CAMERAS.state);
 assert.equal(picked.selected,"copacabana");
 assert.equal(picked.playerRequested,true,"Native picker should start authorized player in Ring");
 assert.match(await page.$eval(".jarvis-worldcam-view iframe",i=>i.getAttribute("src")),/\/embed\//);
 assert.match(await page.$eval(".jarvis-worldcam-view iframe",i=>i.getAttribute("src")),/mute=1/);
 const searched=await run("Jarvis, mostre a câmera de Recife");
 assert.equal(searched.ok,true,JSON.stringify(searched));
 assert.equal(searched.selected,"recife-airport");
 const buttons=await page.$$(".jarvis-worldcam-item");
 assert.equal(buttons.length,1);
 // Voice search starts supported public streams inside the Neural Ring.
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
 const jerusalemSearch=await run("Jarvis, mostre uma câmera pública de Jerusalém");
 assert.equal(jerusalemSearch.ok,true,JSON.stringify(jerusalemSearch));
 const selectedJerusalem=await page.evaluate(()=>window.ULTRON_WORLD_CAMERAS.state);
 assert.equal(selectedJerusalem.selected,"jerusalem-western-wall-earthcam",
  "Voice request should use a distinct embeddable same-landmark EarthCam feed");
 assert.equal(selectedJerusalem.playerRequested,true);
 assert.equal(selectedJerusalem.liveVerified,false);
 const embeddedJerusalem=await page.$eval(".jarvis-worldcam-view iframe",el=>el.getAttribute("src"));
 assert.ok(embeddedJerusalem.includes("youtube-nocookie.com/embed/77akujLn4k8"),"Expected EarthCam embedded player");
 assert.match(embeddedJerusalem,/mute=1/);
 const directories=await page.$$eval(".jarvis-worldcam-catalogs .jarvis-worldcam-catalog-card",cards=>
  cards.map(card=>({title:card.querySelector("strong").textContent,
   urls:[...card.querySelectorAll("a")].map(a=>a.href)})));
 assert.equal(directories.length,6);
 assert.ok(directories.some(x=>x.title==="SkylineWebcams"&&
   x.urls.includes("https://www.skylinewebcams.com/en/webcam.html")));
 assert.ok(directories.some(x=>x.title==="Câmeras do Mundo"&&
   x.urls.includes("https://camerasdomundo.com/live-cams/")));
 assert.ok(directories.some(x=>x.title==="Africam"&&
   x.urls.includes("https://africam.com/our-locations/")));
 assert.ok(directories.some(x=>x.title==="Webcamera24"&&
   x.urls.includes("https://webcamera24.com/pt/all-webcams/")));
 assert.ok(directories.some(x=>x.title==="Janelas TV"&&
   x.urls.includes("https://www.janelas.tv.br/camera-ao-vivo/")));
 assert.ok(directories.some(x=>x.title==="Tabi.cam"&&
   x.urls.includes("https://tabi.cam/pt/explore/")));
 const coverage=await page.$$eval(".jarvis-worldcam-coverage-list p",
  items=>items.map(x=>x.textContent));
 assert.ok(coverage.some(x=>x.includes("Câmeras do Mundo")&&x.includes("catalogadas 29")));
 assert.ok(coverage.some(x=>x.includes("Janelas TV")&&x.includes("catalogadas 7")));
 assert.ok(coverage.some(x=>x.includes("Tabi.cam")&&x.includes("catalogadas 0")));
 const janelasSelected=await page.evaluate(()=>window.ULTRON_WORLD_CAMERAS.open({
  cameraId:"janelas-ponta-praia"
 }));
 assert.equal(janelasSelected.selected,"janelas-ponta-praia");
 assert.equal(await page.$(".jarvis-worldcam-view iframe[src]"),null,
  "No unauthorized Janelas TV proprietary video may be embedded");
 const cdms=await page.evaluate(()=>window.ULTRON_WORLD_CAMERAS.open({
  cameraId:"cdm-afonso-pena"
 }));
 assert.equal(cdms.selected,"cdm-afonso-pena");
 assert.equal((await page.evaluate(()=>window.ULTRON_WORLD_CAMERAS.state)).playerRequested,true);
 assert.match(await page.$eval(".jarvis-worldcam-view iframe",i=>i.getAttribute("src")),
  /PtaHi82kFEc/);
 assert.match(await page.$eval(".jarvis-worldcam-view iframe",i=>i.getAttribute("src")),
  /mute=1/);

 const providerOptions=await page.$$eval(".jarvis-worldcam-filters select[aria-label='Filtrar provedor de câmeras'] option",
  opts=>opts.map(o=>o.textContent));
 assert.ok(providerOptions.includes("Webcamera24"));
 assert.ok(providerOptions.includes("SkylineWebcams"));
 const w24selected=await page.evaluate(()=>window.ULTRON_WORLD_CAMERAS.open({
  cameraId:"webcamera24-patong-nanai"
 }));
 assert.equal(w24selected.ok,true);
 assert.equal(w24selected.selected,"webcamera24-patong-nanai");
 assert.equal((await page.evaluate(()=>window.ULTRON_WORLD_CAMERAS.state)).playerRequested,true);
 assert.equal(await page.$eval(".jarvis-worldcam-audio",el=>el.hidden),false);
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
 assert.equal(afterSwitch.playerRequested,true);
 assert.equal(await page.$eval(".jarvis-worldcam-audio",el=>el.hidden),false);
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
 await page.click(".jarvis-worldcam-advanced>summary");
 const input=await page.$(".jarvis-worldcam-filters input");
 await input.click({clickCount:3});await input.type("não existe");
 const empty=await page.$eval(".jarvis-worldcam-empty",node=>node.textContent);
 assert.match(empty,/Nenhuma câmera/);
 // Reopening without a search must clear the old query so the user sees choices.
 const reopened=await page.evaluate(()=>window.ULTRON_WORLD_CAMERAS.open());
 assert.ok(reopened.count>=10,"Reopening world cams must recover public camera options");
 assert.ok((await page.$$("#jarvis-worldcam-camera-select option")).length>=11);
 assert.equal(await page.$eval(".jarvis-worldcam-advanced",el=>el.open),false);
 await page.evaluate(()=>window.ULTRON_WORLD_CAMERAS.open({cameraId:"tokyo-rainbow"}));
 const closedByVoice=await run("Jarvis, sair das câmeras mundiais");
 assert.equal(closedByVoice.ok,true);
 assert.equal(await page.$(".jarvis-worldcam-panel:not([hidden])"),null,
   "Spoken command must actually dismiss public camera panel");
 assert.equal(await page.$(".jarvis-worldcam-view iframe[src]"),null,
   "Close must release remote iframe playback");
 await run("Jarvis, abra câmeras do mundo");
 const closedByShort=await run("fechar câmeras");
 assert.equal(closedByShort.ok,true);
 assert.equal(await page.$(".jarvis-worldcam-panel:not([hidden])"),null);
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
 // The chooser must also be reachable on a notebook, not phone-only.
 await page.setViewport({width:1366,height:768,isMobile:false,hasTouch:false,deviceScaleFactor:1});
 await page.evaluate(()=>window.ULTRON_WORLD_CAMERAS.open());
 const notebook=await page.evaluate(()=>{
  const picker=document.querySelector("#jarvis-worldcam-camera-select");
  const panel=document.querySelector(".jarvis-worldcam-panel");
  const card=document.querySelector(".jarvis-worldcam-item");
  const r=picker.getBoundingClientRect();
  return {pickerVisible:r.height>=40&&r.top>=0&&r.bottom<=innerHeight,
   itemCount:panel.querySelectorAll(".jarvis-worldcam-item").length,
   cardVisible:card.getBoundingClientRect().top<panel.getBoundingClientRect().bottom};
 });
 assert.ok(notebook.pickerVisible&&notebook.cardVisible&&notebook.itemCount>=10,JSON.stringify(notebook));
 const wideLayout=await page.evaluate(()=>{
  const rect=sel=>document.querySelector(sel).getBoundingClientRect();
  const sidebar=rect(".jarvis-worldcam-sidebar"),viewer=rect(".jarvis-worldcam-view");
  const media=rect(".jarvis-worldcam-media");
  const panel=rect(".jarvis-worldcam-panel");
  return {sidebarX:sidebar.x,sidebarRight:sidebar.right,sidebarWidth:sidebar.width,
   viewerX:viewer.x,viewerWidth:viewer.width,viewerHeight:viewer.height,
   mediaX:media.x,panelWidth:panel.width,
   horizontalOverflow:document.documentElement.scrollWidth-innerWidth};
 });
 assert.ok(wideLayout.viewerX>=wideLayout.sidebarRight,
  "On notebook filters must appear left of video: "+JSON.stringify(wideLayout));
 assert.ok(wideLayout.viewerHeight>=390,
  "Notebook camera should be substantially enlarged: "+JSON.stringify(wideLayout));
 assert.ok(wideLayout.viewerWidth>wideLayout.sidebarWidth*1.35,
  "Live video should dominate wide Ring: "+JSON.stringify(wideLayout));
 assert.ok(wideLayout.horizontalOverflow<=4);
 await page.setViewport({width:1920,height:1080,isMobile:false,hasTouch:false,deviceScaleFactor:1});
 const tvLayout=await page.evaluate(()=>{
  const player=document.querySelector(".jarvis-worldcam-view").getBoundingClientRect();
  const sidebar=document.querySelector(".jarvis-worldcam-sidebar").getBoundingClientRect();
  return {width:player.width,height:player.height,toRight:player.x>=sidebar.right};
 });
 assert.ok(tvLayout.width>=700&&tvLayout.height>=540&&tvLayout.toRight,
  "TV camera should be prominent beside filters: "+JSON.stringify(tvLayout));

 console.log("WORLD WEBCAM BROWSER PASS: chooser + gallery visible, mobile/notebook, source-only, muted opt-in iframe and P0.");
}finally{await browser.close();}
