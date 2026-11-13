import assert from "node:assert/strict";
import puppeteer from "puppeteer-core";
const browser=await puppeteer.launch({
 executablePath:process.env.CHROME_BIN||"/usr/bin/google-chrome",
 headless:true,
 args:["--no-sandbox","--disable-dev-shm-usage","--enable-webgl",
 "--enable-unsafe-swiftshader"]
});
const base=process.env.JARVIS_TEST_URL||"http://127.0.0.1:8775/";
const mobileSizes=[
 ["small Android",320,568],["Android",360,740],["iPhone",390,844],
 ["large phone",430,932],["large Android",540,960],
 ["foldable compact",699,840],["landscape",844,390]
];
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function domScroll(){
 return document.scrollingElement||document.documentElement;
}
async function gesture(page,x,y,{distance=190,steps=13}={}){
 const cdp=await page.createCDPSession();
 const point=(xx,yy)=>[{x:xx,y:yy,radiusX:7,radiusY:7,force:.8,id:1}];
 await cdp.send("Input.dispatchTouchEvent",{
  type:"touchStart",touchPoints:point(x,y)
 });
 for(let i=1;i<=steps;i++){
  const yy=Math.max(5,y-distance*i/steps);
  await cdp.send("Input.dispatchTouchEvent",{
   type:"touchMove",touchPoints:point(x,yy)
  });
  await delay(20);
 }
 await cdp.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});
 await delay(200);
 await cdp.detach();
}
async function setup(page,width,height,{mobile=true}={}){
 await page.setViewport({width,height,isMobile:mobile,hasTouch:mobile,
  deviceScaleFactor:mobile?2:1});
 await page.goto(base,{waitUntil:"domcontentloaded",timeout:40000});
 await page.waitForFunction(()=>Boolean(
  window.ULTRON_NEURAL_JARVIS?.active&&
  window.JARVIS_COMMAND_CENTER?.active&&
  document.querySelector("#jarvis-cc-canvas")?.width>0
 ),{timeout:30000});
 return page.evaluate(()=>{
  const s=document.scrollingElement||document.documentElement;
  const el=document.querySelector("#jarvis-cc-canvas");
  return {
   scrollNode:s.tagName,scrollHeight:s.scrollHeight,clientHeight:s.clientHeight,
   bodyOverflow:getComputedStyle(document.body).overflowY,
   htmlOverflow:getComputedStyle(document.documentElement).overflowY,
   canvasAction:getComputedStyle(el).touchAction,
   canvasRect:el.getBoundingClientRect().toJSON(),
   stageAction:getComputedStyle(document.querySelector(".jarvis-cc-visual")).touchAction,
   railDisplay:getComputedStyle(document.getElementById("jarvis-page-scroll-rail")).display,
   mapTouchAction:getComputedStyle(document.querySelector(".jarvis-earth-reference-map")).touchAction
  };
 });
}
try{
 for(const [name,width,height] of mobileSizes){
  const page=await browser.newPage();
  await page.setRequestInterception(true);
  page.on("request",req=>req.url().startsWith("http://127.0.0.1:8775/")?
   req.continue():req.abort("blockedbyclient"));
  const meta=await setup(page,width,height);
  assert.equal(meta.scrollNode,"HTML",name+": one scrolling root HTML");
  assert.equal(meta.bodyOverflow,"visible",name+": body must not be second scroller");
  assert.equal(meta.canvasAction,"pan-y",name+": one-finger native pan-y");
  assert.equal(meta.mapTouchAction,"pan-y",name+": Mapbox should not trap swipes");
  assert.equal(meta.railDisplay,"none",name+": no rail blocking right-edge swipes");
  assert.ok(meta.scrollHeight>meta.clientHeight+500,name+": scrollable page exists");
  const r=meta.canvasRect;
  let touchY=Math.min(height-125,Math.max(170,r.top+r.height*.53));
  let touchX=Math.min(width-28,Math.max(28,r.left+r.width*.48));
  const under=await page.evaluate(([x,y])=>{
   const n=document.elementFromPoint(x,y);
   return {id:n?.id||"",className:String(n?.className||"").slice(0,120)};
  },[touchX,touchY]);
  // Scroll the canvas into an unobstructed viewport if a phone's short
  // viewport put HUD text/controls over the center on first paint.
  await page.$eval("#jarvis-cc-canvas",el=>el.scrollIntoView({behavior:"instant",block:"center"}));
  const rect=await page.$eval("#jarvis-cc-canvas",el=>el.getBoundingClientRect().toJSON());
  touchX=Math.max(24,Math.min(width-24,rect.left+rect.width*.5));
  touchY=Math.max(95,Math.min(height-95,rect.top+rect.height*.5));
  await page.evaluate(()=>{(document.scrollingElement||document.documentElement).scrollTop=0;});
  // Re-read position because scrolling to top can relocate the canvas.
  const adjusted=await page.$eval("#jarvis-cc-canvas",el=>el.getBoundingClientRect().toJSON());
  touchY=Math.max(90,Math.min(height-80,adjusted.top+adjusted.height*.54));
  const initial=await page.evaluate(()=>document.scrollingElement.scrollTop);
  await gesture(page,touchX,touchY,{distance:Math.min(190,touchY-20)});
  const end=await page.evaluate(()=>({
   top:document.scrollingElement.scrollTop,
   bodyTop:document.body.scrollTop,
   max:document.scrollingElement.scrollHeight-document.scrollingElement.clientHeight,
   zoom:window.ULTRON_NEURAL_JARVIS.state.zoom
  }));
  assert.ok(end.top-initial>20,
   name+": vertical finger swipe above hologram should scroll document: "+
    JSON.stringify({meta,under,touchX,touchY,initial,end}));
  assert.ok(end.top<=end.max+1,name+": no over-scroll invalid position");
  // Ensure scroll down still works when starting over non-WebGL content.
  await page.evaluate(()=>{
   const root=document.scrollingElement||document.documentElement;
   root.scrollTop=0;
  });
  const nonCanvasY=height-65;
  const nonCanvasHit=await page.evaluate(([x,y])=>{
   const el=document.elementFromPoint(x,y),chain=[];
   for(let n=el;n&&chain.length<8;n=n.parentElement){
    const cs=getComputedStyle(n),r=n.getBoundingClientRect();
    chain.push({tag:n.tagName,id:n.id,cls:String(n.className).slice(0,110),
     touch:cs.touchAction,overflow:cs.overflowY,rect:{
      left:Math.round(r.left),top:Math.round(r.top),
      width:Math.round(r.width),height:Math.round(r.height)}});
   }
   return chain;
  },[Math.min(width-15,24),nonCanvasY]);
  await gesture(page,Math.min(width-15,24),nonCanvasY,
   {distance:Math.min(160,nonCanvasY-30)});
  const other=await page.evaluate(()=>document.scrollingElement.scrollTop);
  assert.ok(other>10,
   name+": normal scroll must work away from hologram: "+nonCanvasHit+" "+other);
  const p0=await page.evaluate(()=>window.ULTRON_NEURAL_JARVIS_UI?.state);
  assert.equal(p0.audioPermission,"off");
  console.log("NATIVE MOBILE SCROLL PASS",name,width+"x"+height,
   "canvas",Math.round(end.top),"normal",Math.round(other),
   "surface",meta.canvasAction);
  await page.close();
 }
 const page=await browser.newPage();
 await page.setRequestInterception(true);
 page.on("request",req=>req.url().startsWith("http://127.0.0.1:8775/")?
  req.continue():req.abort("blockedbyclient"));
 await setup(page,1366,768,{mobile:false});
 await page.evaluate(()=>{document.scrollingElement.scrollTop=0;});
 const heading=await page.$eval(".jarvis-cc-heading",el=>el.getBoundingClientRect().toJSON());
 await page.mouse.move(heading.left+heading.width*.5,heading.top+heading.height*.5);
 await page.mouse.wheel({deltaY:440});
 await delay(200);
 const wheelScroll=await page.evaluate(()=>document.scrollingElement.scrollTop);
 assert.ok(wheelScroll>20,"wheel above stage heading must scroll page");
 await page.evaluate(()=>{document.scrollingElement.scrollTop=0;});
 const canvas=await page.$eval("#jarvis-cc-canvas",el=>el.getBoundingClientRect().toJSON());
 const beforeZoom=await page.evaluate(()=>window.ULTRON_NEURAL_JARVIS.state.zoom);
 await page.mouse.move(canvas.left+canvas.width*.5,canvas.top+canvas.height*.5);
 await page.mouse.wheel({deltaY:-220});
 const after=await page.evaluate(()=>({
  zoom:window.ULTRON_NEURAL_JARVIS.state.zoom,
  top:document.scrollingElement.scrollTop
 }));
 assert.ok(after.zoom>beforeZoom,"wheel over canvas should still zoom hologram");
 assert.ok(after.top<10,"canvas wheel should not accidentally scroll document");
 console.log("DESKTOP SCROLL/ZOOM PASS",wheelScroll,JSON.stringify(after));
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent("ultron:emergency-stop")));
 assert.equal(await page.evaluate(()=>window.ULTRON_NEURAL_JARVIS_UI.state.audioPermission),"off");
}finally{await browser.close();}
