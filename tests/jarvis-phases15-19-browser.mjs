import assert from "node:assert/strict";
import puppeteer from "puppeteer-core";
const browser=await puppeteer.launch({executablePath:process.env.CHROME_BIN||"/usr/bin/google-chrome",
 headless:true,args:["--no-sandbox","--disable-dev-shm-usage","--enable-webgl","--enable-unsafe-swiftshader"]});
try{
 const page=await browser.newPage();
 await page.setViewport({width:390,height:844,isMobile:true,hasTouch:true,deviceScaleFactor:1});
 await page.setRequestInterception(true);
 page.on("request",req=>req.url().startsWith("http://127.0.0.1:8767/")?
   req.continue():req.abort("blockedbyclient"));
 await page.goto(process.env.JARVIS_TEST_URL||"http://127.0.0.1:8767/",{
  waitUntil:"domcontentloaded",timeout:35000});
 await page.waitForFunction(()=>Boolean(window.ULTRON_INTEGRATED_INTELLIGENCE&&
  window.ULTRON_ORCHESTRATOR&&window.ULTRON_MULTIMODAL),{timeout:20000});
 await page.evaluate(()=>{
  const stamp=new Date(Date.now()-7*60000).toISOString();
  const sourceUrl="https://earthquake.usgs.gov/earthquakes/eventpage/usgs1";
  window.__phaseFixture={ok:true,generatedAt:new Date().toISOString(),
   worldState:"healthy",archiveState:"verified",items:[
    {key:"g:usgs1",type:"cataloged",source:"USGS",title:"Sismo registrado",
     url:sourceUrl,publishedAt:stamp,lat:-8.08,lng:-34.90,isNew:true},
    {key:"n:article1",type:"news",source:"Agência Brasil",title:"Notícia publicada",
     url:"https://agenciabrasil.ebc.com.br/materia",publishedAt:stamp,isNew:true},
    {key:"a:warning1",type:"official-alert",source:"INMET",title:"Aviso publicado",
     url:"https://avisos.inmet.gov.br/",publishedAt:stamp,isNew:false}
   ]};
  window.ULTRON_CONTEXTUAL={preview:()=>window.__phaseFixture};
  window.ULTRON_CONTINUITY={refresh:async()=>({ok:true})};
  window.ULTRON_INTELLIGENCE={loadHistory:async()=>({ok:true})};
  Object.defineProperty(window.ULTRON_MULTIMODAL,"current",{
   configurable:true,get:()=>({ok:true,eventKey:"g:usgs1",url:sourceUrl,
    title:"Sismo registrado",type:"cataloged"})});
 });
 const run=command=>page.evaluate(input=>window.ULTRON_ORCHESTRATOR.execute(input,"terminal"),command);
 const agents=await run("consultar agentes");
 assert.equal(agents.ok,true,JSON.stringify(agents));
 assert.deepEqual(agents.agents.map(x=>x.count),[1,1,1]);
 const memory=await run("memorizar preferência notícias primeiro");
 assert.equal(memory.ok,true);
 const saved=await page.evaluate(()=>localStorage.getItem("jarvis_operational_preferences_v1"));
 assert.match(saved,/"preference":"news"/);
 const proactive=await run("sugestões proativas");
 assert.equal(proactive.ok,true,JSON.stringify(proactive));
 assert.equal(proactive.type,"news");
 const routine=await run("ativar rotina de monitoramento");
 assert.equal(routine.ok,true,JSON.stringify(routine));
 const checked=await run("verificar rotina agora");
 assert.equal(checked.ok,true,JSON.stringify(checked));
 const simulation=await run("simulação 3D");
 assert.equal(simulation.ok,true,JSON.stringify(simulation));
 const before=await page.$eval(".jarvis-advanced-scenario",node=>({
  hidden:node.hidden,canvasWidth:node.querySelector("canvas")?.width,
  mode:node.querySelector('button[data-mode="3d"]')?.getAttribute("aria-pressed")}));
 assert.deepEqual(before,{hidden:false,canvasWidth:560,mode:"true"});
 await page.click('.jarvis-advanced-scenario button[data-mode="2d"]');
 const mode2d=await page.$eval('.jarvis-advanced-scenario button[data-mode="2d"]',
  node=>node.getAttribute("aria-pressed"));
 assert.equal(mode2d,"true");
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent("ultron:emergency-stop",{
  detail:{epoch:12345}})));
 const after=await page.evaluate(()=>({
  enabled:window.ULTRON_INTEGRATED_INTELLIGENCE.state.routineEnabled,
  scenarioHidden:document.querySelector(".jarvis-advanced-scenario").hidden,
  stored:localStorage.getItem("jarvis_public_readonly_monitor_optin_v1")}));
 assert.deepEqual(after,{enabled:false,scenarioHidden:true,stored:null});
 const sideScroll=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
 assert.ok(sideScroll<=3,"Mobile horizontal overflow: "+sideScroll);
 const unauthorized=await run("faça uma compra usando minha conta");
 assert.equal(unauthorized?.handled===true&&unauthorized?.type==="simulation",false);
 console.log("PHASES XV–XIX BROWSER PASS: mobile terminal, source agents, consented memory/routine, 2D/3D drawing and P0.");
}finally{await browser.close();}
