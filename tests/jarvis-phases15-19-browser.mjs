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
  window.__verifiedMapCalls=[];
  window.ULTRON_CONTEXTUAL_MAP={async open(data){
   window.__verifiedMapCalls.push(data);
   return {ok:true,view:data.view,selectedPoint:data.focusKey,source:"USGS"};
  }};

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
 const rejected=await run("simulação 3D");
 assert.equal(rejected.ok,false);assert.equal(rejected.reason,"REAL_DATA_ONLY");
 const mapped=await run("mostrar dados reais em 3D");
 assert.equal(mapped.ok,true,JSON.stringify(mapped));
 assert.equal(mapped.mode,"3d");
 const calls=await page.evaluate(()=>window.__verifiedMapCalls);
 assert.deepEqual(calls,[{view:"3d",focusKey:"g:usgs1"}],
   "Must request only the actual selected verified point");
 assert.equal(await page.$(".jarvis-advanced-scenario"),null,
   "No synthetic scenario HUD may be rendered");
 const missing=await page.evaluate(async()=>{
  const original=window.ULTRON_CONTEXTUAL.preview;
  window.ULTRON_CONTEXTUAL.preview=()=>({ok:false});
  const result=await window.ULTRON_INTEGRATED_INTELLIGENCE.execute("mostrar dados reais em 2D");
  window.ULTRON_CONTEXTUAL.preview=original;return result;
 });
 assert.equal(missing.ok,false,"Unavailable source must not render fake maps");
 assert.equal((await page.evaluate(()=>window.__verifiedMapCalls)).length,1);
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent("ultron:emergency-stop",{
  detail:{epoch:12345}})));
 const after=await page.evaluate(()=>({
  enabled:window.ULTRON_INTEGRATED_INTELLIGENCE.state.routineEnabled,
  map:window.ULTRON_INTEGRATED_INTELLIGENCE.state.verifiedMap,
  stored:localStorage.getItem("jarvis_public_readonly_monitor_optin_v1")}));
 assert.deepEqual(after,{enabled:false,map:null,stored:null});
 const sideScroll=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
 assert.ok(sideScroll<=3,"Mobile horizontal overflow: "+sideScroll);
 const unauthorized=await page.evaluate(()=>window.ULTRON_INTEGRATED_INTELLIGENCE.parse("faça uma compra usando minha conta"));
 assert.equal(unauthorized,null,"The advanced subsystem must never intercept financial requests.");
 console.log("PHASES XV–XIX BROWSER PASS: mobile terminal, source agents, consented memory/routine, real-source 2D/3D map invocation, missing-source refusal and P0.");
}finally{await browser.close();}
