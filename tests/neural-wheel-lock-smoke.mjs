import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';

// Actual contract: wheel over the hologram/map ZOOMS, and wheel elsewhere
// scrolls the document. The desktop rail remains draggable and accessible.
const browser=await puppeteer.launch({
 executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',headless:true,
 args:['--no-sandbox','--disable-dev-shm-usage','--enable-webgl','--enable-unsafe-swiftshader']
});
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let page;
async function wheelOver(selector,deltaY){
 const r=await page.$eval(selector,el=>{
   const rect=el.getBoundingClientRect();
   return {x:rect.x+rect.width*.5,y:rect.y+rect.height*.45};
 });
 await page.mouse.move(Math.max(6,Math.min(1432,r.x)),Math.max(8,Math.min(870,r.y)));
 await page.mouse.wheel({deltaY});
 await sleep(230);
 return page.evaluate(()=>window.scrollY);
}
async function reset(){
 await page.evaluate(()=>window.scrollTo(0,35));await sleep(100);
 return page.evaluate(()=>window.scrollY);
}
try{
 page=await browser.newPage();
 await page.setViewport({width:1440,height:900,deviceScaleFactor:1});
 await page.goto(process.env.JARVIS_TEST_URL||'http://127.0.0.1:8766/',{
   waitUntil:'domcontentloaded',timeout:35000
 });
 await page.waitForFunction(()=>window.ULTRON_NEURAL_RING_3D?.active&&
   window.JARVIS_COMMAND_CENTER?.active,{timeout:19000});
 await page.evaluate(()=>{
   const spacer=document.createElement('div');spacer.id='rail-test-spacer';
   spacer.style.height='1300px';spacer.style.pointerEvents='none';document.body.append(spacer);
   window.dispatchEvent(new Event('resize'));
 });
 try{
  await page.waitForFunction(()=>{
    const rail=document.querySelector('#jarvis-page-scroll-rail');
    return rail&&!rail.hidden&&getComputedStyle(rail).display!=="none"&&
      rail.getBoundingClientRect().height>250;
  },{timeout:6000});
 }catch(error){
  const detail=await page.evaluate(()=>{
   const rail=document.getElementById("jarvis-page-scroll-rail");
   const html=document.documentElement,body=document.body;
   const scroller=document.scrollingElement;
   return {
    railExists:!!rail,railHidden:rail?.hidden,
    railDisplay:rail?getComputedStyle(rail).display:null,
    railHeight:rail?.getBoundingClientRect().height,
    scrollNode:scroller?.tagName,scrollHeight:scroller?.scrollHeight,
    clientHeight:scroller?.clientHeight,
    bodyHeight:body.scrollHeight,htmlHeight:html.scrollHeight,
    bodyOverflow:getComputedStyle(body).overflow,
    htmlOverflow:getComputedStyle(html).overflow,
    earthAvailable:!!window.ULTRON_EARTH?.state?.available,
    coarse:matchMedia("(pointer:coarse)").matches,
    maxWidth820:matchMedia("(max-width:820px)").matches,
    width:innerWidth,height:innerHeight
   };
  });
  throw Error("Desktop rail did not become usable: "+JSON.stringify(detail)+
    " / "+String(error));
 }
 const rail=await page.$eval('#jarvis-page-scroll-rail',el=>({
   pos:getComputedStyle(el).position,width:el.getBoundingClientRect().width,
   right:innerWidth-el.getBoundingClientRect().right,
   role:el.getAttribute('role'),name:el.getAttribute('aria-label')
 }));
 assert.equal(rail.pos,'fixed');assert.ok(rail.width>=20);
 assert.ok(rail.right<=55);assert.equal(rail.role,'scrollbar');
 assert.match(rail.name,/página/i);

 // 1: Ring default wheel is direct ZOOM, and does not move the document.
 let before=await reset();
 const zoomBefore=await page.evaluate(()=>window.ULTRON_NEURAL_RING_3D.state.zoom);
 let after=await wheelOver('#jarvis-cc-canvas',-270);
 const zoomAfter=await page.evaluate(()=>window.ULTRON_NEURAL_RING_3D.state.zoom);
 assert.ok(zoomAfter>zoomBefore+.1,'Wheel ABOVE ring must zoom without Ctrl');
 assert.ok(Math.abs(after-before)<=3,'Ring wheel must not scroll PAGE');

 // 2: Wheel and click-drag on the fixed right rail do scroll the document.
 before=await reset();
 const beforeZoom=await page.evaluate(()=>window.ULTRON_NEURAL_RING_3D.state.zoom);
 after=await wheelOver('#jarvis-page-scroll-rail',310);
 assert.ok(after>before+80,'Right rail must scroll entire page with wheel: '+JSON.stringify({before,after}));
 assert.equal(await page.evaluate(()=>window.ULTRON_NEURAL_RING_3D.state.zoom),beforeZoom,
   'Right rail must not zoom the Ring');
 assert.ok(Number(await page.$eval('#jarvis-page-scroll-rail',el=>el.getAttribute('aria-valuenow')))>0);
 await page.evaluate(()=>window.scrollTo(0,40));await sleep(150);
 const dragAt=await page.$eval('#jarvis-page-scroll-rail .jarvis-page-scroll-thumb',el=>{
   const r=el.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height*.5};
 });
 await page.mouse.move(dragAt.x,dragAt.y);await page.mouse.down();
 await page.mouse.move(dragAt.x,Math.min(845,dragAt.y+145),{steps:9});
 await page.mouse.up();await sleep(150);
 assert.ok((await page.evaluate(()=>window.scrollY))>100,'Dragging scroll thumb must scroll the document');

 // 3: Wheel over dashboard chrome (outside the hologram) must now scroll
 // the page naturally, without changing the Neural Jarvis zoom.
 before=await reset();
 const stage=await page.$eval('.jarvis-cc-top',el=>{
   const r=el.getBoundingClientRect();return {x:r.x+r.width*.5,y:r.y+r.height*.5};
 });
 await page.mouse.move(stage.x,stage.y);
 const gapZoom=await page.evaluate(()=>window.ULTRON_NEURAL_RING_3D.state.zoom);
 const hitBefore=await page.evaluate(([x,y])=>{
   const target=document.elementFromPoint(x,y);
   const ancestors=[];for(let el=target;el&&ancestors.length<5;el=el.parentElement)
    ancestors.push({tag:el.tagName,id:el.id,cls:String(el.className).slice(0,80)});
   return ancestors;
 },[stage.x,stage.y]);
 await page.mouse.wheel({deltaY:180});await sleep(300);
 after=await page.evaluate(()=>window.scrollY);
 console.log('WHEEL CHROME DEBUG',JSON.stringify({
  before,after,hitBefore,viewport:await page.evaluate(()=>({x:innerWidth,y:innerHeight})),
  zoomBefore:gapZoom,zoomAfter:await page.evaluate(()=>window.ULTRON_NEURAL_RING_3D.state.zoom)
 }));
 assert.ok(after>before+50,'Wheel over system chrome must scroll page');
 assert.equal((await page.evaluate(()=>window.ULTRON_NEURAL_RING_3D.state.zoom)),gapZoom,
   'Wheel outside the Ring must not zoom the visualization');

 // 4: Globe.gl fallback zoom on the wheel and page navigation only on rail.
 await page.evaluate(()=>document.querySelector('[data-visual="globe"]').click());
 await page.waitForFunction(()=>window.ULTRON_EARTH?.state?.ready&&
   window.ULTRON_EARTH?.state?.visible,{timeout:18000});
 before=await reset();
 const earthBefore=await page.evaluate(()=>window.ULTRON_EARTH.state.view.altitude);
 after=await wheelOver('.jarvis-earth-renderer canvas',-300);
 await page.waitForFunction(alt=>window.ULTRON_EARTH.state.view.altitude<alt-.02,
   {timeout:3500},earthBefore);
 assert.ok(Math.abs(after-before)<=3,'Globe wheel zoom must not scroll the page');
 before=await reset();
 const altitude=await page.evaluate(()=>window.ULTRON_EARTH.state.view.altitude);
 after=await wheelOver('#jarvis-page-scroll-rail',280);
 assert.ok(after>before+80,'Rail wheel must scroll page while 3D globe is visible');
 assert.ok(Math.abs((await page.evaluate(()=>window.ULTRON_EARTH.state.view.altitude))-altitude)<.04,
   'Rail page scrolling must not zoom globe');

 // 5: Mapbox native wheel zoom is enabled (no cooperative modifier).
 await page.evaluate(()=>{
   localStorage.setItem('jarvis_mapbox_pk_v1','pk.'+'a'.repeat(50));
   class StubMap{
     constructor(options){
       this.options=options;this.zoom=options.zoom;this.center={lat:options.center[1],lng:options.center[0]};
       const root=document.createElement('div');root.className='mapboxgl-map';
       root.style.cssText='position:absolute;inset:0;width:100%;height:100%';
       root.append(document.createElement('canvas'));options.container.append(root);
       root.addEventListener('wheel',ev=>{
         if(!this.options.cooperativeGestures||ev.ctrlKey){
           ev.preventDefault();
           this.zoom=Math.max(0,Math.min(20,this.zoom-ev.deltaY*.002));
         }
       },{passive:false});
       window.__railMapbox=this;
     }
     on(name,fn){if(name==='style.load')setTimeout(fn,0);return this;}
     once(name,fn){if(name==='load')setTimeout(fn,0);return this;}
     supported(){return true;}loaded(){return true;}setFog(){}setLight(){}resize(){}remove(){}stop(){}
     getZoom(){return this.zoom;}getCenter(){return this.center;}
     zoomTo(z){this.zoom=z;}flyTo(opts){if(opts.zoom!=null)this.zoom=opts.zoom;}
   }
   window.mapboxgl={Map:StubMap,supported:()=>true,accessToken:''};
   window.ULTRON_EARTH.close();
 });
 await page.evaluate(()=>window.ULTRON_EARTH.open());
 await page.waitForFunction(()=>window.ULTRON_EARTH?.state?.referenceMode,{timeout:12000});
 assert.equal(await page.evaluate(()=>window.__railMapbox.options.cooperativeGestures),false);
 before=await reset();
 const mbBefore=await page.evaluate(()=>window.__railMapbox.getZoom());
 after=await wheelOver('.jarvis-earth-reference-map .mapboxgl-map canvas',-270);
 assert.ok((await page.evaluate(()=>window.__railMapbox.getZoom()))>mbBefore+.3,
   'Mapbox must directly zoom with wheel without Ctrl');
 assert.ok(Math.abs(after-before)<=3,'Mapbox wheel must not scroll page');
 before=await reset();
 const mbZoom=await page.evaluate(()=>window.__railMapbox.getZoom());
 after=await wheelOver('#jarvis-page-scroll-rail',260);
 assert.ok(after>before+70,'Page rail must work over Mapbox');
 assert.equal(await page.evaluate(()=>window.__railMapbox.getZoom()),mbZoom);

 // 6: SVG weather map wheel zoom, while side rail scrolls the whole page.
 const opened=await page.evaluate(async()=>{
   window.ULTRON_EARTH.close();
   return window.ULTRON_GEO_VISUAL.open({scenario:'enso',view:'2d'});
 });
 assert.equal(opened.ok,true,JSON.stringify(opened));
 before=await reset();
 const viewBefore=await page.$eval('.jarvis-geo-2d svg',el=>el.getAttribute('viewBox'));
 after=await wheelOver('.jarvis-geo-2d svg',-220);
 assert.notEqual(await page.$eval('.jarvis-geo-2d svg',el=>el.getAttribute('viewBox')),viewBefore,
   'Wheel over the 2D weather map must change map viewBox');
 assert.ok(Math.abs(after-before)<=3,'2D map zoom must not scroll page');
 before=await reset();
 after=await wheelOver('#jarvis-page-scroll-rail',260);
 assert.ok(after>before+60,'Right rail must scroll page even when weather overlay fills the stage');

 // 7: Native page content outside the visual surface is unaffected.
 await page.evaluate(()=>{
   window.ULTRON_GEO_VISUAL.close();
   const target=document.createElement('div');target.id='scroll-test-regular-page';
   target.style.cssText='height:160px;padding:10px';
   document.getElementById('rail-test-spacer').before(target);
   target.scrollIntoView({block:'start',behavior:'instant'});
 });
 await sleep(140);
 before=await page.evaluate(()=>window.scrollY);
 after=await wheelOver('#scroll-test-regular-page',250);
 assert.ok(after>before+30,'Ordinary page regions must still scroll naturally');

 console.log('RIGHT SCROLL RAIL PASS: Ring, globe, Mapbox, 2D wheel zoom; right-hand wheel/drag scrolls PAGE; ordinary page scroll preserved');
}catch(error){
 console.error('RIGHT SCROLL RAIL FAILED',error);
 await page?.screenshot({path:'neural-wheel-lock-failure.png',fullPage:false}).catch(()=>{});
 throw error;
}finally{await browser.close();}
