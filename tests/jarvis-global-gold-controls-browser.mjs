import assert from "node:assert/strict";
import puppeteer from "puppeteer-core";
const browser=await puppeteer.launch({
 executablePath:process.env.CHROME_BIN||"/usr/bin/google-chrome",headless:true,
 args:["--no-sandbox","--disable-dev-shm-usage","--enable-webgl","--enable-unsafe-swiftshader"]
});
try{
 const page=await browser.newPage();
 await page.setRequestInterception(true);
 page.on("request",req=>req.url().startsWith("http://127.0.0.1:8772/")?
  req.continue():req.abort("blockedbyclient"));
 const widths=[
  {name:"phone",width:390,height:844,mobile:true},
  {name:"notebook",width:1366,height:768,mobile:false},
  {name:"4K TV",width:3840,height:2160,mobile:false}
 ];
 for(const {name,width,height,mobile} of widths){
  await page.setViewport({width,height,isMobile:mobile,hasTouch:mobile,deviceScaleFactor:1});
  if(name==="phone"){
   await page.goto(process.env.JARVIS_TEST_URL||"http://127.0.0.1:8772/",{
    waitUntil:"domcontentloaded",timeout:35000});
   await page.waitForFunction(()=>Boolean(
    window.ULTRON_NEURAL_JARVIS?.active&&window.JARVIS_COMMAND_CENTER?.active&&
    window.ULTRON_WORLD_CAMERAS&&window.ULTRON_NEURAL_JARVIS_UI?.state?.mounted
   ),{timeout:28000});
  }
  // Switching device emulation can trigger a navigation/reset in Chrome.
  // Wait for all dynamically mounted modules on EVERY viewport, not only phone.
  await page.waitForFunction(()=>Boolean(
    window.ULTRON_NEURAL_JARVIS?.active&&window.JARVIS_COMMAND_CENTER?.active&&
    window.ULTRON_WORLD_CAMERAS&&window.ULTRON_NEURAL_JARVIS_UI?.state?.mounted
  ),{timeout:20000});
  const display=await page.evaluate(()=>{
   const css=s=>getComputedStyle(document.querySelector(s));
   const r=s=>document.querySelector(s)?.getBoundingClientRect();
   const buttons=[...document.querySelectorAll("#jarvis-cc-input-slot [data-cc]")];
   const visible=el=>{const rc=el.getBoundingClientRect();
    return rc.width>=40&&rc.height>=40&&getComputedStyle(el).display!=="none";};
   const stage=r(".jarvis-command-center-ui");
   const cards=[...document.querySelectorAll(".jarvis-cc-dock-module")];
   return {
    bodyWidth:document.documentElement.scrollWidth,screen:innerWidth,
    stageWidth:stage?.width,
    buttons:buttons.map(x=>({action:x.dataset.cc,visible:visible(x),
     background:getComputedStyle(x).backgroundImage,
     text:x.textContent.trim()})),
    cameraPanel:cards.length,
    title:css(".jarvis-cc-heading").color,
    topBackground:css(".jarvis-cc-top").backgroundImage,
    terminalBackground:css(".jarvis-cc-console-terminal").backgroundImage,
    terminalBorder:css(".jarvis-cc-console-terminal").borderColor,
    quickButtonBackground:css(".quick-actions button").backgroundImage,
    commandInputBorder:css("#command-input").borderColor,
    infrared:document.getElementById("infra-state")?.textContent,
    matchingColor:css(".jarvis-cc-orb-label").color,
    globe:!!document.querySelector('[data-visual="globe"]'),
    worldCameras:!!document.getElementById("btn-world-public-cameras"),
    coreActive:window.ULTRON_NEURAL_JARVIS.active,
    actionTools:document.querySelectorAll(".jarvis-cc-tool-actions [data-cc]").length
   };
  });
  assert.ok(display.bodyWidth<=display.screen+5, name+": no horizontal overflow "+JSON.stringify(display));
  assert.ok(display.stageWidth>=display.screen*.92,name+": stage must occupy viewport");
  assert.equal(display.buttons.length,7,name+": all command-center buttons mounted");
  assert.ok(display.buttons.every(b=>b.visible),name+": command buttons tappable");
  assert.ok(display.buttons.every(b=>/gradient/.test(b.background)),
   name+": metallic controls "+JSON.stringify(display.buttons));
  assert.match(display.topBackground,/gradient/);
  assert.match(display.terminalBackground,/gradient/);
  assert.match(display.quickButtonBackground,/gradient/);
  assert.match(display.title,/rgb\(249, 217, 142\)/);
  assert.match(display.commandInputBorder,/rgba?\(222, 169, 61/);
  assert.equal(display.coreActive,true);
  assert.equal(display.globe,true);
  assert.equal(display.worldCameras,true);
  assert.ok(display.actionTools>=6);
  assert.ok(display.cameraPanel>=3);
  assert.ok(["VERIFICANDO","ONLINE","OFFLINE"].includes(display.infrared));
  console.log("GLOBAL GOLD UI PASS",name,JSON.stringify({
   width:display.screen,actions:display.buttons.length,
   panels:display.cameraPanel,gold:display.title
  }));
 }
 await page.setViewport({width:390,height:844,isMobile:true,hasTouch:true,deviceScaleFactor:1});
 await page.waitForFunction(()=>Boolean(
  window.JARVIS_COMMAND_CENTER?.active&&window.ULTRON_NEURAL_JARVIS?.active&&
  window.ULTRON_WORLD_CAMERAS&&window.ULTRON_NEURAL_JARVIS_UI?.state?.mounted
 ),{timeout:20000});
 // External services and permissions are replaced with explicit test doubles.
 // This validates the handlers and their source-attributed failure responses,
 // never a fabricated successful live connection.
 await page.evaluate(()=>{
  window.ULTRON_LOCAL_FILES={
   health:async()=>({ok:true}),
   files:async()=>[{name:"Relatorio.txt"}]
  };
  window.ULTRON_MEMORY={...window.ULTRON_MEMORY,getMemoryKey:()=>"test-j-a-r-v-i-s"};
  window.ULTRON_DEVICES={listDevices:async()=>[]};
  window.ULTRON_MOBILE_CAMERA={smartConnect:async()=>false};
  window.ULTRON_EARTH={
   open:async()=>({ok:true}),
   close:()=>({ok:true}),
   state:{visible:false}
  };
 });
 const click=async(selector,match)=>{
  await page.click(selector,{delay:30});
  await page.waitForFunction(text=>document.getElementById("output-box")?.textContent?.includes(text),
   {timeout:7000},match);
 };
 await click('[data-cc="status"]',"STATUS DO SISTEMA");
 await click('[data-cc="agenda"]',"AGENDA / VISÃO LOCAL");
 await page.waitForSelector(".jarvis-cc-inline-action");
 const saved=await page.evaluate(()=>document.getElementById("output-box").textContent.includes("Adicionar compromisso"));
 assert.equal(saved,true,"Agenda must expose actual local appointment action");
 await click('[data-cc="files"]',"ARQUIVOS LOCAIS");
 await click('[data-cc="devices"]',"Nenhum dispositivo pareado");
 await click('[data-cc="camera"]',"SENSOR ÓPTICO / SEM CONEXÃO");
 await click('[data-cc="earth"]',"GLOBO 3D");
 await page.click('[data-cc="ring"]');
 const neuralButtons=await page.evaluate(()=>[...document.querySelectorAll(".neural-jarvis-control")]
  .map(b=>({text:b.textContent,disabled:b.disabled,width:b.getBoundingClientRect().width})));
 assert.equal(neuralButtons.length,4);
 assert.ok(neuralButtons.every(b=>b.width>40&&!b.disabled),JSON.stringify(neuralButtons));
 await page.click('.neural-jarvis-control[aria-controls="neural-jarvis-archive"]');
 assert.equal(await page.$eval(".neural-jarvis-archive",e=>e.hidden),false);
 await page.click(".neural-jarvis-archive-head button");
 assert.equal(await page.$eval(".neural-jarvis-archive",e=>e.hidden),true);
 const tactical=await page.evaluate(()=>window.ULTRON_NEURAL_JARVIS_UI.toggleOverdrive());
 assert.equal(tactical.ok,true);
 assert.equal(tactical.active,true);
 const reset=await page.evaluate(()=>window.ULTRON_NEURAL_JARVIS_UI.toggleOverdrive());
 assert.equal(reset.ok,true);
 await page.click("#btn-world-public-cameras");
 assert.equal(await page.$eval(".jarvis-worldcam-panel",e=>e.hidden),false);
 await page.click(".jarvis-worldcam-head button");
 assert.equal(await page.$eval(".jarvis-worldcam-panel",e=>e.hidden),true);
 const status=await page.evaluate(()=>window.ULTRON_NEURAL_JARVIS_UI.state);
 assert.equal(status.audioPermission,"off","Mic remains opt-in");
 await page.click('[data-command="clear"]');
 assert.equal(await page.$eval("#output-box",el=>el.children.length),0,
  "Terminal clear must act, not just relabel the button");
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent("ultron:emergency-stop")));
 const stopped=await page.evaluate(()=>window.ULTRON_NEURAL_JARVIS_UI.state);
 assert.equal(stopped.audioPermission,"off");
 assert.equal(stopped.archiveOpen,false);
 console.log("JARVIS BUTTONS PASS: 7 Command Center actions, camera failure, local files, devices, agenda, holographic controls, world cameras, P0.");
}finally{await browser.close();}
