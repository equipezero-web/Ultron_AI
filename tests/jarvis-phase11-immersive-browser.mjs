import assert from "node:assert/strict";
import puppeteer from "puppeteer-core";

const browser=await puppeteer.launch({
 executablePath:process.env.CHROME_BIN||"/usr/bin/google-chrome",
 headless:true,
 args:["--no-sandbox","--disable-dev-shm-usage","--enable-webgl","--enable-unsafe-swiftshader"]
});
let page;
try{
 page=await browser.newPage();
 await page.setViewport({width:390,height:844,isMobile:true,hasTouch:true,deviceScaleFactor:1});
 await page.setRequestInterception(true);
 page.on("request",request=>{
  if(request.url().startsWith("http://127.0.0.1:8766/"))request.continue();
  else request.abort("blockedbyclient");
 });
 await page.goto(process.env.JARVIS_TEST_URL||"http://127.0.0.1:8766/",{
  waitUntil:"domcontentloaded",timeout:35000
 });
 await page.waitForFunction(()=>Boolean(window.ULTRON_IMMERSIVE&&window.ULTRON_CONTEXTUAL&&
  document.querySelector(".jarvis-immersive-context")),{timeout:18000});
 const initial=await page.evaluate(()=>{
  window.__immersiveCalls=[];
  const published=new Date(Date.now()-15*60000).toISOString();
  window.ULTRON_CONTEXTUAL.preview=()=>({
   ok:true,worldState:"healthy",generatedAt:new Date().toISOString(),
   items:[
    {key:"g:br-1",type:"cataloged",source:"USGS",title:"Sismo catalogado em ponto verificado",
     category:"earthquake",url:"https://earthquake.usgs.gov/earthquakes/eventpage/br-1",
     lat:-8.2,lng:-35.1,publishedAt:published,representative:false},
    {key:"g:na-1",type:"cataloged",source:"NASA",title:"Incêndio catalogado com coordenada representativa",
     category:"wildfires",url:"https://eonet.gsfc.nasa.gov/api/v3/events/na-1",
     lat:22.4,lng:126.3,publishedAt:published,representative:true},
    {key:"n:fake",type:"news",source:"Notícias",title:"Manchete sem geolocalização real",
     category:"brasil",url:"https://www.example.org/story",
     lat:-8.2,lng:-35.1,publishedAt:published}
   ]
  });
  window.ULTRON_CONTEXTUAL_MAP.open=async opts=>{
   window.__immersiveCalls.push({action:"open",...opts});
   return {ok:true,view:opts.view,selectedPoint:opts.focusKey,pointCount:2,
    eventName:"Mock sourced observation"};
  };
  window.ULTRON_CONTEXTUAL_MAP.focus=async opts=>{
   window.__immersiveCalls.push({action:"focus",...opts});
   return {ok:true,view:opts.view,selectedPoint:opts.focusKey,
    eventName:"Mock sourced observation"};
  };
  return window.ULTRON_IMMERSIVE.state;
 });
 assert.equal(initial.active,false);
 const started=await page.evaluate(()=>window.ULTRON_IMMERSIVE.start({view:"2d"}));
 assert.equal(started.ok,true);
 assert.equal(started.count,2,"News headline with injected coordinates must remain unmapped");
 const info=await page.evaluate(()=>{
  const hud=document.querySelector(".jarvis-immersive-context");
  const stage=document.querySelector(".jarvis-cc-center");
  const rect=hud.getBoundingClientRect();
  const host=stage.getBoundingClientRect();
  return {
   active:window.ULTRON_IMMERSIVE.state.active,
   parent:hud.parentElement===stage,hidden:hud.hidden,
   display:getComputedStyle(hud).display,title:hud.querySelector("h3")?.textContent,
   source:hud.querySelector(".jarvis-immersive-source")?.href,
   count:hud.querySelector(".jarvis-immersive-counter")?.textContent,
   width:rect.width,hostWidth:host.width,
   keyboard:hud.getAttribute("tabindex"),
   controls:[...hud.querySelectorAll("button")].map(x=>x.getAttribute("aria-label"))
  };
 });
 assert.equal(info.active,true);
 assert.equal(info.parent,true,"HUD remains in the existing Neural Ring");
 assert.equal(info.hidden,false);
 assert.notEqual(info.display,"none");
 assert.match(info.title,/Sismo catalogado/);
 assert.match(info.source,/earthquake.usgs.gov/);
 assert.equal(info.count,"1 / 2");
 assert.ok(info.width<=info.hostWidth+2,"Immersive HUD must fit narrow phone viewport");
 assert.equal(info.keyboard,"-1");
 assert.ok(info.controls.includes("Próximo evento"));
 await page.$eval('button[aria-label="Próximo evento"]',button=>button.click());
 await page.waitForFunction(()=>window.ULTRON_IMMERSIVE.state.index===1,{timeout:4000});
 const second=await page.evaluate(()=>({
  title:document.querySelector(".jarvis-immersive-title")?.textContent,
  explanatory:document.querySelector(".jarvis-immersive-explanation")?.textContent,
  note:document.querySelector(".jarvis-immersive-note")?.textContent,
  nextDisabled:document.querySelector('button[aria-label="Próximo evento"]')?.disabled,
  calls:window.__immersiveCalls
 }));
 assert.match(second.title,/Incêndio/);
 assert.match(second.explanatory,/área queimada/);
 assert.match(second.note,/representativa/);
 assert.equal(second.nextDisabled,true);
 assert.ok(second.calls.some(x=>x.action==="focus"&&x.focusKey==="g:na-1"));
 await page.$eval('button[aria-label="Exibir registro no globo 3D"]',button=>button.click());
 await page.waitForFunction(()=>window.ULTRON_IMMERSIVE.state.mode==="3d",{timeout:4000});
 assert.equal(await page.$eval(".jarvis-immersive-context",el=>el.dataset.mode),"3d");
 await page.$eval('button[aria-label="Evento anterior"]',button=>button.click());
 await page.waitForFunction(()=>window.ULTRON_IMMERSIVE.state.index===0,{timeout:4000});
 assert.equal(await page.$eval(".jarvis-immersive-counter",el=>el.textContent),"1 / 2");
 await page.$eval('button[aria-label="Fechar exploração contextual"]',button=>button.click());
 assert.equal(await page.evaluate(()=>window.ULTRON_IMMERSIVE.state.active),false);
 assert.equal(await page.$eval(".jarvis-immersive-context",el=>el.hidden),true);
 assert.ok((await page.evaluate(()=>window.__immersiveCalls)).length>=4);
 console.log("PHASE XI BROWSER PASS: narrow mobile Ring HUD, source link, evidence, interactive 2D/3D navigation, counter, close");
}catch(error){
 if(page)await page.screenshot({path:"phase11-immersive-browser-failure.png",fullPage:true}).catch(()=>{});
 throw error;
}finally{
 await page?.close().catch(()=>{});
 await browser.close();
}
