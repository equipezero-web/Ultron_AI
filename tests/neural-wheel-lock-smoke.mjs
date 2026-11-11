import assert from "node:assert/strict";
import puppeteer from "puppeteer-core";

// Regression for page scrolling INSIDE the Neural Ring, 2D map and 3D globe.
// A normal mouse wheel must navigate the page; Ctrl+wheel deliberately zooms
// the active visualization and must not move the page.
const browser=await puppeteer.launch({
 executablePath:process.env.CHROME_BIN||"/usr/bin/google-chrome",headless:true,
 args:["--no-sandbox","--disable-dev-shm-usage","--enable-webgl","--enable-unsafe-swiftshader"]
});
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let page;
async function wheelOver(selector,deltaY,{ctrl=false}={}){
 const rect=await page.$eval(selector,el=>{
   const r=el.getBoundingClientRect();
   return {x:r.x,y:r.y,width:r.width,height:r.height};
 });
 const x=Math.max(6,Math.min(1420,rect.x+rect.width*.52));
 const y=Math.max(8,Math.min(855,rect.y+rect.height*.48));
 await page.mouse.move(x,y);
 if(ctrl)await page.keyboard.down("Control");
 try{await page.mouse.wheel({deltaY});}
 finally{if(ctrl)await page.keyboard.up("Control");}
 await sleep(280);
 return await page.evaluate(()=>window.scrollY);
}
async function resetScroll(){
 await page.evaluate(()=>window.scrollTo(0,35));await sleep(100);
 return page.evaluate(()=>window.scrollY);
}
try{
 page=await browser.newPage();
 await page.setViewport({width:1440,height:900,deviceScaleFactor:1});
 await page.goto(process.env.JARVIS_TEST_URL||"http://127.0.0.1:8766/",{
   waitUntil:"domcontentloaded",timeout:35000});
 await page.waitForFunction(()=>
   window.ULTRON_NEURAL_RING_3D?.active===true&&window.JARVIS_COMMAND_CENTER?.active===true,
   {timeout:19000});
 await page.evaluate(()=>{
   const spacer=document.createElement("div");
   spacer.id="scroll-test-spacer";spacer.style.cssText="height:1600px;pointer-events:none";
   document.body.append(spacer);
 });
 assert.ok(await page.evaluate(()=>document.scrollingElement.scrollHeight-innerHeight)>300);
 // 1. Ring: scroll works underneath the WebGL canvas, Ctrl+wheel still zooms.
 let before=await resetScroll();
 let zoom=await page.evaluate(()=>window.ULTRON_NEURAL_RING_3D.state.zoom);
 let after=await wheelOver("#jarvis-cc-canvas",280);
 assert.ok(after>before+30,"Normal wheel over Neural Ring must scroll document: "+JSON.stringify({before,after}));
 assert.equal(await page.evaluate(()=>window.ULTRON_NEURAL_RING_3D.state.zoom),zoom);
 before=await resetScroll();
 await wheelOver("#jarvis-cc-canvas",-280,{ctrl:true});
 assert.ok((await page.evaluate(()=>window.ULTRON_NEURAL_RING_3D.state.zoom))>zoom+.05,
   "Ctrl+wheel should still zoom Ring");
 assert.ok(Math.abs((await page.evaluate(()=>window.scrollY))-before)<3,
   "Ctrl+wheel must not scroll document");

 // 2. Blank stage and floating news no longer trap page scroll.
 before=await resetScroll();
 const stage=await page.$eval(".jarvis-cc-center",el=>el.getBoundingClientRect().toJSON());
 await page.mouse.move(stage.x+14,Math.max(12,stage.y+80));
 await page.mouse.wheel({deltaY:200});await sleep(180);
 after=await page.evaluate(()=>window.scrollY);
 assert.ok(after>before+30,"Wheel over Neural Ring stage background must scroll document");

 // 3. Fallback globe: normal wheel scrolls; Ctrl+wheel adjusts altitude.
 await page.evaluate(()=>document.querySelector('[data-visual="globe"]').click());
 await page.waitForFunction(()=>window.ULTRON_EARTH?.state?.ready&&window.ULTRON_EARTH?.state?.visible,
   {timeout:18000});
 before=await resetScroll();
 const earthBefore=await page.evaluate(()=>window.ULTRON_EARTH.state.view.altitude);
 after=await wheelOver(".jarvis-earth-renderer canvas",240);
 assert.ok(after>before+30,"Normal wheel over 3D globe must scroll document");
 const earthAfter=await page.evaluate(()=>window.ULTRON_EARTH.state.view.altitude);
 assert.ok(Math.abs(earthAfter-earthBefore)<.02,"Normal page scrolling must not zoom globe");
 before=await resetScroll();
 await wheelOver(".jarvis-earth-renderer canvas",-260,{ctrl:true});
 await page.waitForFunction(alt=>window.ULTRON_EARTH.state.view.altitude<alt-.02,{timeout:3500},earthBefore);
 assert.ok(Math.abs((await page.evaluate(()=>window.scrollY))-before)<3,"Ctrl+wheel globe must not scroll page");

 // 4. Mapbox cooperative gestures: Ctrl+wheel map zoom, regular wheel document scroll.
 await page.evaluate(()=>{
   localStorage.setItem("jarvis_mapbox_pk_v1","pk."+"a".repeat(50));
   class StubMap{
     constructor(options){
       this.options=options;this.zoom=options.zoom;
       this.center={lat:options.center[1],lng:options.center[0]};
       const root=document.createElement("div");
       root.className="mapboxgl-map";
       root.style.cssText="position:absolute;inset:0;width:100%;height:100%";
       root.append(document.createElement("canvas"));options.container.append(root);
       root.addEventListener("wheel",ev=>{
         if(!this.options.cooperativeGestures||ev.ctrlKey){
           ev.preventDefault();this.zoom=Math.max(0,Math.min(20,this.zoom-ev.deltaY*.002));
         }
       },{passive:false});
       window.__scrollTestMapbox=this;
     }
     on(name,fn){if(name==="style.load")setTimeout(fn,0);return this;}
     once(name,fn){if(name==="load")setTimeout(fn,0);return this;}
     supported(){return true;}loaded(){return true;}setFog(){}setLight(){}resize(){}remove(){}stop(){}
     getZoom(){return this.zoom;}getCenter(){return this.center;}
     zoomTo(z){this.zoom=z;}flyTo(opts){if(opts.zoom!=null)this.zoom=opts.zoom;}
   }
   window.mapboxgl={Map:StubMap,supported:()=>true,accessToken:""};
   window.ULTRON_EARTH.close();
 });
 await page.evaluate(()=>window.ULTRON_EARTH.open());
 await page.waitForFunction(()=>window.ULTRON_EARTH?.state?.referenceMode,{timeout:12000});
 assert.equal(await page.evaluate(()=>window.__scrollTestMapbox.options.cooperativeGestures),true);
 before=await resetScroll();
 const mapZoom=await page.evaluate(()=>window.__scrollTestMapbox.getZoom());
 after=await wheelOver(".jarvis-earth-reference-map .mapboxgl-map canvas",220);
 assert.ok(after>before+30,"Normal wheel over Mapbox must scroll document");
 assert.equal(await page.evaluate(()=>window.__scrollTestMapbox.getZoom()),mapZoom);
 before=await resetScroll();
 await wheelOver(".jarvis-earth-reference-map .mapboxgl-map canvas",-240,{ctrl:true});
 assert.ok((await page.evaluate(()=>window.__scrollTestMapbox.getZoom()))>mapZoom+.3);
 assert.ok(Math.abs((await page.evaluate(()=>window.scrollY))-before)<3);

 // 5. Map 2D's SVG: page scroll with regular wheel, visible zoom on Ctrl+wheel.
 const open=await page.evaluate(async()=>{
   window.ULTRON_EARTH.close();
   return window.ULTRON_GEO_VISUAL.open({scenario:"enso",view:"2d"});
 });
 assert.equal(open.ok,true,JSON.stringify(open));
 before=await resetScroll();
 const viewBefore=await page.$eval(".jarvis-geo-2d svg",svg=>svg.getAttribute("viewBox"));
 after=await wheelOver(".jarvis-geo-2d svg",210);
 assert.ok(after>before+30,"Normal wheel over weather/ENSO map must scroll page");
 assert.equal(await page.$eval(".jarvis-geo-2d svg",svg=>svg.getAttribute("viewBox")),viewBefore);
 before=await resetScroll();
 await wheelOver(".jarvis-geo-2d svg",-240,{ctrl:true});
 assert.notEqual(await page.$eval(".jarvis-geo-2d svg",svg=>svg.getAttribute("viewBox")),viewBefore);
 assert.ok(Math.abs((await page.evaluate(()=>window.scrollY))-before)<3);

 console.log("PAGE SCROLL PASS: Ring, globe, Mapbox and 2D map scroll normally; Ctrl+wheel zooms without moving document");
}catch(error){
 console.error("PAGE SCROLL REGRESSION FAILED",error);
 await page?.screenshot({path:"neural-wheel-lock-failure.png",fullPage:false}).catch(()=>{});
 throw error;
}finally{await browser.close();}
