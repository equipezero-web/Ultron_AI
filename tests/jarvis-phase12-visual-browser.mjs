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
 page.on("request",req=>{
  if(req.url().startsWith("http://127.0.0.1:8766/"))req.continue();
  else req.abort("blockedbyclient");
 });
 await page.goto(process.env.JARVIS_TEST_URL||"http://127.0.0.1:8766/",{
  waitUntil:"domcontentloaded",timeout:35000
 });
 await page.waitForFunction(()=>Boolean(window.ULTRON_VISUAL_ORCHESTRATOR&&
  document.querySelector(".jarvis-visual-orchestration")),{timeout:18000});
 await page.evaluate(()=>{
  const time=new Date(Date.now()-6*60000).toISOString();
  window.__directorCalls=[];
  window.__directorDigest={
   ok:true,worldState:"healthy",generatedAt:new Date().toISOString(),
   items:[
    {key:"g:usgs-1",type:"cataloged",source:"USGS",category:"earthquake",
     title:"Sismo com coordenadas publicadas",url:"https://earthquake.usgs.gov/earthquakes/eventpage/usgs-1",
     lat:-8.1,lng:-35.1,publishedAt:time,nearBrazil:true},
    {key:"g:nasa-1",type:"cataloged",source:"NASA",category:"wildfires",
     title:"Incêndio catalogado",url:"https://eonet.gsfc.nasa.gov/api/v3/events/nasa-1",
     lat:35.1,lng:122.1,publishedAt:time,nearBrazil:false},
    {key:"n:news-1",type:"news",source:"Agência Brasil",category:"brasil",
     title:"Manchete do Brasil sem ponto de geolocalização",
     url:"https://agenciabrasil.ebc.com.br/brasil/noticia",
     publishedAt:time,lat:-8.1,lng:-35.1}
   ]
  };
  window.ULTRON_CONTEXTUAL={preview:()=>({...window.__directorDigest,
   generatedAt:new Date().toISOString()})};
  window.ULTRON_NEURAL_NEWS={
   get state(){return {count:3,lastUpdate:new Date().toISOString(),hasImage:true};},
   show(){window.__directorCalls.push("news-show");},
   hide(){window.__directorCalls.push("news-hide");}
  };
  window.ULTRON_CONTEXTUAL_MAP={
   async open(x){window.__directorCalls.push("map-"+x.view);return {ok:true,view:x.view};}
  };
  window.ULTRON_IMMERSIVE={
   async start(x){window.__directorCalls.push("tour-"+x.view);return {ok:true,view:x.view};},
   close(){window.__directorCalls.push("tour-close");return {ok:true};}
  };
  window.ULTRON_GEO_VISUAL={get state(){return {scenario:null};},
   close(){window.__directorCalls.push("geo-close");}};
  window.ULTRON_GLOBAL_INTELLIGENCE={close(){window.__directorCalls.push("global-close");}};
 });
 const api="window.ULTRON_VISUAL_ORCHESTRATOR";
 const initial=await page.evaluate(()=>window.ULTRON_VISUAL_ORCHESTRATOR.plan());
 assert.deepEqual(initial.available,["news","priorities","map","tour"]);
 assert.equal(initial.counts.geocoded,2,"A fake news coordinate is never a map scene");
 const first=await page.evaluate(()=>window.ULTRON_VISUAL_ORCHESTRATOR.start());
 assert.equal(first.ok,true);assert.equal(first.scene,"news");
 let info=await page.evaluate(()=>{
  const panel=document.querySelector(".jarvis-visual-orchestration");
  const rect=panel.getBoundingClientRect(),host=document.querySelector(".jarvis-cc-center").getBoundingClientRect();
  return {within:panel.parentElement.classList.contains("jarvis-cc-center"),
   visible:!panel.hidden,width:rect.width,hostWidth:host.width,
   scene:panel.dataset.scene,actual:getComputedStyle(panel).display,
   buttons:[...panel.querySelectorAll("button")].map(x=>x.getAttribute("aria-label")),
   calls:window.__directorCalls};
 });
 assert.equal(info.within,true);assert.equal(info.visible,true);
 assert.equal(info.scene,"news");assert.notEqual(info.actual,"none");
 assert.ok(info.width<=info.hostWidth+3,"HUD must fit phone Ring");
 assert.ok(info.calls.includes("news-show"));
 assert.ok(info.buttons.includes("Próxima cena"));
 const step1=await page.evaluate(()=>window.ULTRON_VISUAL_ORCHESTRATOR.next());
 assert.equal(step1.scene,"priorities");assert.equal(step1.ok,true);
 assert.ok(await page.$eval(".jarvis-visual-orch-entries",
  el=>el.querySelectorAll("a[href^='https://']").length>=2));
 const step2=await page.evaluate(()=>window.ULTRON_VISUAL_ORCHESTRATOR.next());
 assert.equal(step2.scene,"map");assert.equal(step2.mode,"2d");
 const step3=await page.evaluate(()=>window.ULTRON_VISUAL_ORCHESTRATOR.next());
 assert.equal(step3.scene,"tour");assert.equal(step3.mode,"3d");
 assert.equal((await page.evaluate(()=>window.__directorCalls)).includes("tour-3d"),true);
 const prev=await page.evaluate(()=>window.ULTRON_VISUAL_ORCHESTRATOR.previous());
 assert.equal(prev.ok,true);assert.equal(prev.scene,"map");
 const ended=await page.evaluate(()=>window.ULTRON_VISUAL_ORCHESTRATOR.stop());
 assert.equal(ended.stopped,true);
 assert.equal(await page.$eval(".jarvis-visual-orchestration",el=>el.hidden),true);
 await page.evaluate(()=>{
  window.ULTRON_IMMERSIVE.start=async()=>{
   window.__directorCalls.push("3d-unavailable");
   return {ok:true,view:"2d",fallback3d:true};
  };
 });
 const fallback=await page.evaluate(()=>window.ULTRON_VISUAL_ORCHESTRATOR.start({scene:"tour"}));
 assert.equal(fallback.ok,true);assert.equal(fallback.mode,"2d");
 assert.equal(fallback.fallback3d,true);
 await page.evaluate(()=>window.ULTRON_VISUAL_ORCHESTRATOR.stop());
 await page.evaluate(()=>{
  window.__pendingMap=new Promise(resolve=>{window.__resolveMap=resolve;});
  window.ULTRON_CONTEXTUAL_MAP.open=()=>window.__pendingMap;
 });
 const pending=page.evaluate(()=>window.ULTRON_VISUAL_ORCHESTRATOR.start({scene:"map"}));
 await page.waitForFunction(()=>window.ULTRON_VISUAL_ORCHESTRATOR.state.busy===true,{timeout:4000});
 await page.evaluate(()=>{window.ULTRON_VISUAL_ORCHESTRATOR.stop();
  window.__resolveMap({ok:true,view:"2d"});});
 const canceled=await pending;
 assert.equal(canceled.cancelled,true,"P0/stop must not claim a canceled map transition succeeded");
 assert.equal(await page.evaluate(()=>window.ULTRON_VISUAL_ORCHESTRATOR.state.active),false);
 console.log("PHASE XII BROWSER PASS: compact mobile Ring director, four verified scenes, sourced links, 2D/3D, fallback and canceled transition");
}catch(error){
 if(page)await page.screenshot({path:"phase12-visual-browser-failure.png",fullPage:true}).catch(()=>{});
 throw error;
}finally{
 await page?.close().catch(()=>{});
 await browser.close();
}
