import assert from "node:assert/strict";
import puppeteer from "puppeteer-core";

const browser=await puppeteer.launch({
 executablePath:process.env.CHROME_BIN||"/usr/bin/google-chrome",
 headless:true,args:["--no-sandbox","--disable-dev-shm-usage","--enable-webgl","--enable-unsafe-swiftshader"]
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
 await page.waitForFunction(()=>Boolean(window.ULTRON_MULTIMODAL&&
  window.ULTRON_VISUAL_ORCHESTRATOR&&window.ULTRON_ORCHESTRATOR),{
  timeout:20000
 });
 await page.evaluate(()=>{
  const stamp=new Date(Date.now()-10*60000).toISOString();
  window.__mmLog=[];
  window.__mmNewsIndex=0;window.__mmImmersiveActive=false;
  window.__mmDigest={
   ok:true,worldState:"healthy",generatedAt:new Date().toISOString(),
   items:[
    {key:"a:warning1",type:"official-alert",source:"INMET",
     title:"Aviso publicado para Pernambuco",category:"meteorologia",
     url:"https://avisos.inmet.gov.br/",publishedAt:stamp},
    {key:"g:usgs1",type:"cataloged",source:"USGS",category:"earthquake",
     title:"Sismo com coordenada publicada",url:"https://earthquake.usgs.gov/earthquakes/eventpage/usgs1",
     lat:-8.1,lng:-35.1,publishedAt:stamp},
    {key:"g:nasa1",type:"cataloged",source:"NASA",category:"wildfires",
     title:"Incêndio catalogado",url:"https://eonet.gsfc.nasa.gov/api/v3/events/nasa1",
     lat:35.2,lng:125.1,publishedAt:stamp},
    {key:"n:news1",type:"news",source:"Agência Brasil",category:"brasil",
     title:"Notícia brasileira sem localização própria",
     url:"https://agenciabrasil.ebc.com.br/noticia1",
     lat:-8.1,lng:-35.1,publishedAt:stamp}
   ]
  };
  window.ULTRON_CONTEXTUAL={preview:()=>({...window.__mmDigest,
   generatedAt:new Date().toISOString()})};
  window.ULTRON_NEURAL_NEWS={
   get state(){return {
    active:true,verified:true,requested:true,count:2,index:window.__mmNewsIndex,
    headline:window.__mmNewsIndex?"Segunda matéria":"Notícia com fotografia",
    lastUpdate:new Date().toISOString(),hasImage:true
   };},
   get selectedArticle(){return {id:"br1",title:"Notícia com fotografia",
    url:"https://agenciabrasil.ebc.com.br/materia",
    imageUrl:"https://agenciabrasil.ebc.com.br/imagem.jpg",
    source:"Agência Brasil",publishedAt:stamp};},
   show(){window.__mmLog.push("news-show");},
   hide(){window.__mmLog.push("news-hide");},
   select(n){window.__mmNewsIndex=n;window.__mmLog.push("news-select-"+n);}
  };
  window.ULTRON_CONTEXTUAL_MAP={
   async open(x){window.__mmLog.push("map-"+x.view+"-"+x.focusKey);
    return {ok:true,view:x.view,selectedPoint:x.focusKey};}
  };
  window.ULTRON_IMMERSIVE={
   get state(){return {active:window.__mmImmersiveActive,eventKey:"g:usgs1"};},
   get current(){return window.__mmImmersiveActive?{key:"g:usgs1"}:null;},
   async start(x){window.__mmImmersiveActive=true;
    window.__mmLog.push("tour-"+x.view+"-"+x.focusKey);
    return {ok:true,view:x.view,eventKey:x.focusKey};},
   close(){window.__mmImmersiveActive=false;window.__mmLog.push("tour-close");},
   stop(){window.__mmImmersiveActive=false;window.__mmLog.push("tour-stop");},
   next:async()=>({ok:true,view:"3d"}),
   previous:async()=>({ok:true,view:"3d"}),
   setMode:async mode=>({ok:true,view:mode}),
   presentContext(x){window.__mmLog.push("context-"+x.slice(0,20));}
  };
  window.ULTRON_GEO_VISUAL={get state(){return {scenario:null};},close(){}};
  window.ULTRON_GLOBAL_INTELLIGENCE={close(){}};
 });
 const first=await page.evaluate(()=>
  window.ULTRON_VISUAL_ORCHESTRATOR.start({scene:"priorities"}));
 assert.equal(first.ok,true);
 assert.equal(first.scene,"priorities");
 const selection=await page.evaluate(()=>window.ULTRON_VISUAL_ORCHESTRATOR.state);
 assert.equal(selection.selectedPriorityKey,"a:warning1");
 const noPoint=await page.evaluate(async()=>({
  parsed:window.ULTRON_MULTIMODAL.parse("Jarvis, mostre isso no globo 3D"),
  current:window.ULTRON_MULTIMODAL.current,
  selected:window.ULTRON_VISUAL_ORCHESTRATOR.context,
  result:await window.ULTRON_ORCHESTRATOR.execute("Jarvis, mostre isso no globo 3D","terminal")
 }));
 assert.equal(noPoint.result.ok,false,JSON.stringify(noPoint));
 assert.equal(noPoint.result.reason,"NO_VERIFIED_COORDINATES",JSON.stringify(noPoint));
 assert.equal((await page.evaluate(()=>window.__mmLog)).some(x=>x.startsWith("tour-3d-")),false,
  "The director may close an inactive tour, but must never open the globe for INMET");
 const official=await page.evaluate(()=>
  window.ULTRON_ORCHESTRATOR.execute("Jarvis, qual é a fonte deste evento?","terminal"));
 assert.equal(official.ok,true);assert.match(official.sourceUrl,/avisos.inmet.gov.br/);
 const source=await page.$eval(".jarvis-visual-orch-context-source",a=>({
  hidden:a.hidden,href:a.href
 }));
 assert.equal(source.hidden,false);
 assert.match(source.href,/avisos.inmet.gov.br/);
 const select=await page.evaluate(()=>
  window.ULTRON_VISUAL_ORCHESTRATOR.selectPriority("g:usgs1"));
 assert.equal(select.ok,true);
 const explanation=await page.evaluate(()=>
  window.ULTRON_ORCHESTRATOR.execute("Ultron, explique este evento","terminal"));
 assert.equal(explanation.ok,true);
 assert.match(explanation.message,/atividade sísmica/i);
 assert.match(explanation.sourceUrl,/earthquake.usgs.gov/);
 const view=await page.evaluate(()=>
  window.ULTRON_ORCHESTRATOR.execute("Jarvis, mostre isso no globo 3D","voice-event"));
 assert.equal(view.ok,true);assert.equal(view.mode,"3d");
 assert.equal(view.scene,"tour");
 assert.equal(await page.evaluate(()=>window.ULTRON_VISUAL_ORCHESTRATOR.state.scene),"tour");
 const map=await page.evaluate(()=>
  window.ULTRON_ORCHESTRATOR.execute("Jarvis, volte ao mapa","terminal"));
 assert.equal(map.ok,true);assert.equal(map.scene,"map");assert.equal(map.mode,"2d");
 assert.equal((await page.evaluate(()=>window.__mmLog)).some(x=>x==="map-2d-g:usgs1"),true);
 const news=await page.evaluate(()=>
  window.ULTRON_ORCHESTRATOR.execute("Jarvis, voltar para notícias","terminal"));
 assert.equal(news.ok,true);assert.equal(news.scene,"news");
 const image=await page.evaluate(()=>
  window.ULTRON_ORCHESTRATOR.execute("mostre a imagem desta notícia","terminal"));
 assert.equal(image.ok,true);
 assert.equal(image.scene,"news");
 const next=await page.evaluate(()=>
  window.ULTRON_ORCHESTRATOR.execute("próximo item","terminal"));
 assert.equal(next.ok,true);
 assert.equal((await page.evaluate(()=>window.__mmNewsIndex)),1);
 assert.ok(await page.$eval(".jarvis-visual-orchestration",el=>
  el.parentElement.classList.contains("jarvis-cc-center")&&
  !el.hidden&&el.getBoundingClientRect().width<=
   el.parentElement.getBoundingClientRect().width+2
 ),"Contextual HUD must stay in the current mobile Neural Ring");
 const unsupported=await page.evaluate(()=>window.ULTRON_MULTIMODAL.parse("abra câmera"));
 assert.equal(unsupported,null);
 // Cancel a pending visual transition before its module reports success.
 await page.evaluate(()=>{
  window.ULTRON_VISUAL_ORCHESTRATOR.selectPriority("g:usgs1");
  window.__pendingScene=new Promise(resolve=>{window.__resolveScene=resolve;});
  window.ULTRON_IMMERSIVE.start=()=>window.__pendingScene;
 });
 const pending=page.evaluate(()=>
  window.ULTRON_ORCHESTRATOR.execute("mostre isso no globo 3D","terminal"));
 await page.waitForFunction(()=>window.ULTRON_MULTIMODAL?.state?.busy===true,{
  timeout:4000
 });
 const competing=await page.evaluate(()=>
  window.ULTRON_ORCHESTRATOR.execute("explique isso","terminal"));
 assert.equal(competing.ok,false);assert.equal(competing.reason,"CONTEXT_BUSY");
 const stop=await page.evaluate(()=>
  window.ULTRON_ORCHESTRATOR.execute("PARE","operator"));
 assert.equal(stop.ok,true);assert.equal(stop.status,"cancelled");
 await page.evaluate(()=>window.__resolveScene({ok:true,view:"3d",eventKey:"g:usgs1"}));
 const canceled=await pending;
 assert.equal(canceled.ok,false);
 assert.equal(canceled.cancelled,true);
 assert.equal(await page.evaluate(()=>window.ULTRON_MULTIMODAL.state.busy),false);
 assert.equal(await page.evaluate(()=>window.ULTRON_VISUAL_ORCHESTRATOR.state.active),false);
 console.log("PHASE XIII BROWSER PASS: verified pronouns, official source link, INMET no-geocoding, voice 3D and 2D receipts, news image, mobile and P0 STOP");
}catch(error){
 if(page)await page.screenshot({path:"phase13-context-browser-failure.png",fullPage:true}).catch(()=>{});
 throw error;
}finally{
 await page?.close().catch(()=>{});
 await browser.close();
}
