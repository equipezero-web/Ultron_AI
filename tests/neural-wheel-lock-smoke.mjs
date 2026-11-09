import assert from "node:assert/strict";
import puppeteer from "puppeteer-core";

const browser=await puppeteer.launch({
  executablePath:process.env.CHROME_BIN||"/usr/bin/google-chrome",headless:true,
  args:["--no-sandbox","--disable-dev-shm-usage","--enable-webgl","--enable-unsafe-swiftshader"]
});
let page;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function wheelOver(selector,deltaY){
  const rect=await page.$eval(selector,el=>{
    const r=el.getBoundingClientRect();
    return {x:r.x,y:r.y,width:r.width,height:r.height};
  });
  const x=Math.max(5,Math.min(1410,rect.x+rect.width*.5));
  const y=Math.max(6,Math.min(840,rect.y+rect.height*.5));
  await page.mouse.move(x,y);
  await page.mouse.wheel({deltaY});
  await sleep(280);
  return await page.evaluate(()=>window.scrollY);
}
try{
  page=await browser.newPage();
  await page.setViewport({width:1440,height:900,deviceScaleFactor:1});
  await page.goto(process.env.JARVIS_TEST_URL||"http://127.0.0.1:8766/",{
    waitUntil:"domcontentloaded",timeout:35000
  });
  await page.waitForFunction(()=>
    window.ULTRON_NEURAL_RING_3D?.active===true&&window.JARVIS_COMMAND_CENTER?.active===true,
    {timeout:19000}
  );
  await page.evaluate(()=>{
    const spacer=document.createElement("div");
    spacer.id="wheel-test-trailing-space";
    spacer.style.cssText="height:1100px;display:block;pointer-events:none";
    document.body.append(spacer);
  });
  await page.evaluate(()=>window.scrollTo(0,35));
  await sleep(120);
  const ringScroll=await page.evaluate(()=>window.scrollY);
  const ringBefore=await page.evaluate(()=>window.ULTRON_NEURAL_RING_3D.state.zoom);
  const ringAfterScroll=await wheelOver("#jarvis-cc-canvas",400);
  const ringAfter=await page.evaluate(()=>window.ULTRON_NEURAL_RING_3D.state.zoom);
  assert.ok(ringAfter<ringBefore-.08,"Wheel over Neural Ring must zoom the ring geometry");
  if(Math.abs(ringAfterScroll-ringScroll)>2){
    const debug=await page.evaluate(()=>{
      const el=document.querySelector('#jarvis-cc-canvas'),rect=el.getBoundingClientRect();
      const target=document.elementFromPoint(rect.left+rect.width/2,rect.top+rect.height/2);
      return {scrollY:scrollY,scrollHeight:document.documentElement.scrollHeight,
        viewport:innerHeight,canvas:rect.toJSON(),target:target?.outerHTML?.slice(0,250),
        centerHeight:document.querySelector('.jarvis-cc-center')?.getBoundingClientRect().height,
        panelHidden:document.querySelector('.ultron-neural-answer')?.hidden};
    });
    console.log('WHEEL LOCK DIAGNOSTICS',JSON.stringify({ringScroll,ringAfterScroll,ringBefore,ringAfter,debug}));
  }
  assert.ok(Math.abs(ringAfterScroll-ringScroll)<=2,
    "Wheel over Neural Ring must NOT scroll the document");
  const stage=await page.$eval(".jarvis-cc-center",el=>{
    const r=el.getBoundingClientRect();
    return {x:r.x,y:r.y,width:r.width,height:r.height};
  });
  await page.mouse.move(stage.x+18,Math.max(12,stage.y+90));
  const stageScroll=await page.evaluate(()=>window.scrollY);
  await page.mouse.wheel({deltaY:-180});
  await sleep(180);
  assert.ok(Math.abs((await page.evaluate(()=>window.scrollY))-stageScroll)<=2,
    "Wheel above the neural-stage background must not scroll the document");

  await page.evaluate(()=>document.querySelector('[data-visual="globe"]').click());
  await page.waitForFunction(()=>window.ULTRON_EARTH?.state?.ready&&window.ULTRON_EARTH?.state?.visible,{
    timeout:18000
  });
  await page.evaluate(()=>window.scrollTo(0,35));
  await sleep(90);
  const earthScroll=await page.evaluate(()=>window.scrollY);
  const earthBefore=await page.evaluate(()=>window.ULTRON_EARTH.state.view.altitude);
  const earthAfterScroll=await wheelOver(".jarvis-earth-renderer canvas",-360);
  await page.waitForFunction(alt=>window.ULTRON_EARTH.state.view.altitude<alt-.02,
    {timeout:3500},earthBefore);
  assert.ok(Math.abs(earthScroll-earthAfterScroll)<=2,
    "Wheel above the fallback 3D Earth must not move the page");

  await page.evaluate(()=>{
    localStorage.setItem("jarvis_mapbox_pk_v1","pk."+"a".repeat(50));
    class StubMap {
      constructor(options){
        this.options=options;this.zoom=options.zoom;
        this.handlers={};
        this.center={lat:options.center[1],lng:options.center[0]};
        const root=document.createElement("div");
        root.className="mapboxgl-map";
        root.style.cssText="width:100%;height:100%;position:absolute;inset:0";
        root.append(document.createElement("canvas"));
        options.container.append(root);
        root.addEventListener("wheel",ev=>{
          ev.preventDefault();
          this.zoom=Math.max(0,Math.min(20,this.zoom-ev.deltaY*.002));
        },{passive:false});
        window.__wheelMapbox=this;
      }
      on(name,fn){
        (this.handlers[name]??=[]).push(fn);
        if(name==="style.load")setTimeout(fn,0);
        return this;
      }
      once(name,fn){if(name==="load")setTimeout(fn,0);else this.on(name,fn);return this;}
      supported(){return true;}
      loaded(){return true;}
      setFog(){}
      setLight(){}
      resize(){}
      remove(){}
      stop(){}
      getZoom(){return this.zoom;}
      getCenter(){return this.center;}
      zoomTo(z){this.zoom=z;}
      flyTo(params){
        if(params.center)this.center={lng:params.center[0],lat:params.center[1]};
        if(params.zoom!==undefined)this.zoom=params.zoom;
      }
    }
    window.mapboxgl={Map:StubMap,supported:()=>true,accessToken:""};
    window.ULTRON_EARTH.close();
  });
  await page.evaluate(()=>window.ULTRON_EARTH.open());
  await page.waitForFunction(()=>window.ULTRON_EARTH?.state?.referenceMode===true,{timeout:10000});
  await page.evaluate(()=>window.scrollTo(0,35));
  await sleep(100);
  const beforeMapScroll=await page.evaluate(()=>window.scrollY);
  const beforeMapZoom=await page.evaluate(()=>window.__wheelMapbox.getZoom());
  const afterMapScroll=await wheelOver(".jarvis-earth-reference-map .mapboxgl-map canvas",-300);
  const afterMapZoom=await page.evaluate(()=>window.__wheelMapbox.getZoom());
  assert.ok(afterMapZoom>beforeMapZoom+.3,
    "Wheel over Mapbox canvas should reach the native Mapbox zoom handler");
  assert.ok(Math.abs(afterMapScroll-beforeMapScroll)<=2,
    "Wheel over Mapbox must not scroll the document");
  // Details sidebar scroll stays independent from page position.
  await page.evaluate(()=>{
    const aside=document.querySelector(".jarvis-earth-reference-side");
    aside.classList.add("is-open");
    aside.setAttribute("aria-hidden","false");
  });
  const beforeSide=await page.evaluate(()=>window.scrollY);
  await wheelOver(".jarvis-earth-reference-side",-150);
  const afterSide=await page.evaluate(()=>window.scrollY);
  assert.ok(Math.abs(beforeSide-afterSide)<=2,
    "Wheel over Mapbox's details sidebar must not move the outside page");

  // Outside of either 3D visualization the page should remain scrollable.
  await page.evaluate(()=>{
    window.ULTRON_EARTH.close();
    const spot=document.createElement("div");
    spot.id="wheel-test-normal-page";
    spot.style.cssText="height:220px;padding:15px;background:transparent";
    document.querySelector("#wheel-test-trailing-space").before(spot);
    spot.scrollIntoView({block:"start",behavior:"instant"});
  });
  await sleep(120);
  const pageBefore=await page.evaluate(()=>window.scrollY);
  await wheelOver("#wheel-test-normal-page",260);
  const pageAfter=await page.evaluate(()=>window.scrollY);
  assert.ok(pageAfter>pageBefore+50,"Wheel outside the 3D stage should scroll the page normally");

  console.log("NEURAL WHEEL LOCK PASS: Neural Ring wheel zoom, Mapbox wheel zoom, fallback globe wheel zoom, zero document scroll in stage, normal scroll outside");
}catch(error){
  console.error("NEURAL WHEEL LOCK FAILED",error);
  await page?.screenshot({path:"neural-wheel-lock-failure.png",fullPage:false}).catch(()=>{});
  throw error;
}finally{await browser.close();}
