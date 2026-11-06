import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';

const browser=await puppeteer.launch({
  executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',headless:true,
  args:['--no-sandbox','--disable-dev-shm-usage','--enable-webgl','--enable-unsafe-swiftshader']
});
let page;
try {
  page=await browser.newPage();
  await page.setViewport({width:1440,height:900,deviceScaleFactor:1});
  await page.goto(process.env.JARVIS_TEST_URL||'http://127.0.0.1:8766/',{
    waitUntil:'domcontentloaded',timeout:35000
  });
  await page.waitForFunction(() => window.JARVIS_COMMAND_CENTER?.active===true,{timeout:20000});
  await page.waitForFunction(() => window.ULTRON_NEURAL_RING_3D?.engine==='webgl',{timeout:18000});
  const stage=await page.evaluate(() => {
    const rect=sel=>{
      const element=document.querySelector(sel);
      if(!element)return null;
      const r=element.getBoundingClientRect();
      return {x:r.x,y:r.y,width:r.width,height:r.height,display:getComputedStyle(element).display};
    };
    const slotNames=['#jarvis-cc-camera-slot','#jarvis-cc-gateway-slot',
      '#jarvis-cc-link-slot','#jarvis-cc-infra-slot'];
    const dock=document.querySelector('.jarvis-cc-system-dock');
    const gl=document.querySelector('#jarvis-cc-canvas')?.getContext('webgl');
    return {
      neural:rect('.jarvis-cc-center'),visual:rect('.jarvis-cc-visual'),
      terminal:rect('.jarvis-cc-console-terminal'),dock:rect('.jarvis-cc-system-dock'),
      slots:slotNames.map(sel=>({selector:sel,inside:dock?.contains(document.querySelector(sel)),rect:rect(sel)})),
      cameraButton:document.getElementById('btn-camera')!==null,
      cameraPreview:document.querySelector('#jarvis-cc-camera-slot .optical-preview')!==null,
      gatewayState:document.getElementById('gemini-module')!==null,
      linkState:document.getElementById('bridge-link-state')!==null,
      infraState:document.getElementById('infra-backend')!==null,
      ring:{active:window.ULTRON_NEURAL_RING_3D.active,rings:window.ULTRON_NEURAL_RING_3D.rings},
      glDrawing:[gl?.drawingBufferWidth,gl?.drawingBufferHeight],
      horizontalOverflow:document.documentElement.scrollWidth-innerWidth
    };
  });
  assert.equal(stage.ring.active,true,'The initial neural mode must be active');
  assert.ok(stage.ring.rings>=3,'Real 3D torus mesh layers must be visible');
  assert.ok(stage.glDrawing[0]>0 && stage.glDrawing[1]>0,'The ring must own a real WebGL context');
  assert.ok(stage.neural.height>=520,'The entire upper Neural Command space belongs to 3D ring');
  assert.ok(stage.visual.height>=410,'The 3D visual must not be a tiny orb');
  assert.ok(stage.terminal.width>300 && stage.dock.width>300,'Command terminal and real modules must share usable space');
  assert.ok(stage.dock.x>stage.terminal.x,'Desktop system modules must sit beside text commands');
  assert.ok(stage.slots.every(x=>x.inside && x.rect.width>80 && x.rect.display!=='none'),
    'Optical Sensor, AI Gateway, mobile bridge and infra must remain usable beside commands');
  assert.ok(stage.cameraButton && stage.cameraPreview && stage.gatewayState && stage.linkState && stage.infraState,
    'Real sensor and connectivity nodes must retain their IDs');
  assert.ok(stage.horizontalOverflow<=3,'No horizontal dashboard clipping is allowed');


  // A real 3D torus can be rotated and zoomed by the operator, not only animated.
  const ringCanvas=await page.$('#jarvis-cc-canvas');
  await ringCanvas.evaluate(el=>el.scrollIntoView({block:'center',behavior:'instant'}));
  const ringBox=await ringCanvas.boundingBox();
  const rx=ringBox.x+ringBox.width*.5,ry=ringBox.y+ringBox.height*.5;
  const before=await page.evaluate(()=>window.ULTRON_NEURAL_RING_3D.state);
  await page.mouse.move(rx,ry);
  await page.mouse.move(rx+20,ry+5,{steps:4});
  const afterHover=await page.evaluate(()=>window.ULTRON_NEURAL_RING_3D.state);
  assert.equal(afterHover.yaw,before.yaw,'Moving cursor without holding must not rotate Neural Ring');
  assert.equal(afterHover.pitch,before.pitch,'Hover must not tilt Neural Ring');
  await page.mouse.down();
  await page.mouse.move(rx+98,ry+55,{steps:7});
  const whileHolding=await page.evaluate(()=>window.ULTRON_NEURAL_RING_3D.state);
  assert.equal(whileHolding.dragging,true,'Neural Ring should be under direct user control during drag');
  assert.ok(Math.abs(whileHolding.yaw-before.yaw)>.12,'Drag must rotate actual ring geometry');
  assert.ok(Math.abs(whileHolding.pitch-before.pitch)>.08,'Drag must tilt actual ring geometry');
  await page.mouse.up();
  const afterRelease=await page.evaluate(()=>window.ULTRON_NEURAL_RING_3D.state);
  assert.equal(afterRelease.dragging,false,'Releasing button ends Neural Ring movement');
  await page.mouse.move(rx+120,ry+78);
  assert.equal((await page.evaluate(()=>window.ULTRON_NEURAL_RING_3D.state)).yaw,afterRelease.yaw,
    'Free mouse movement must not leave the Neural Ring stuck rotating');
  await page.mouse.wheel({deltaY:-260});
  const afterWheel=await page.evaluate(()=>window.ULTRON_NEURAL_RING_3D.state);
  assert.ok(afterWheel.zoom>1,'Wheel zoom must change the ring geometry scale');
  await page.evaluate(()=>window.ULTRON_NEURAL_RING_3D.reset());
  const reset=await page.evaluate(()=>window.ULTRON_NEURAL_RING_3D.state);
  assert.equal(reset.zoom,1);assert.equal(reset.yaw,0);assert.equal(reset.pitch,0);

  await page.click('[data-visual="globe"]');
  await page.waitForFunction(() => window.ULTRON_EARTH?.state?.ready===true,{timeout:20000});
  assert.equal(await page.evaluate(() => window.ULTRON_NEURAL_RING_3D.active),false,
    'WebGL neural renderer must pause while Earth is visible');
  assert.equal(await page.evaluate(() => window.ULTRON_EARTH.state.visible),true);
  assert.equal(await page.$eval('#jarvis-earth-globe',e=>e.closest('#jarvis-earth-reference-layout')!==null),true);
  assert.equal(await page.$eval('#jarvis-earth-reference-layout',e=>e.hidden),false);
  await page.click('[data-earth-reference="ring"]');
  await page.waitForFunction(()=>window.ULTRON_NEURAL_RING_3D?.active===true,{timeout:4000});
  assert.equal(await page.evaluate(() => window.ULTRON_EARTH.state.visible),false);
  assert.equal(await page.$eval('#jarvis-cc-panel',e=>getComputedStyle(e).display),'none',
    'The Command Center must not open any extra panel');

  // Mapbox reference is rendered over the same Neural Command stage, not in
  // another browser page. A token+Mapbox mock avoids leaking real credentials in CI.
  await page.evaluate(()=>{
    localStorage.setItem('jarvis_mapbox_pk_v1','pk.'+'a'.repeat(50));
    class MockMapbox {
      constructor(options){
        this.options=options;this.position={lng:options.center[0],lat:options.center[1]};
        this.zoom=options.zoom;this.handlers={};window.__referenceMap=this;
        options.container.append(document.createElement('canvas'));
      }
      on(name,fn){
        (this.handlers[name]??=[]).push(fn);
        if(name==='style.load')setTimeout(fn,0);
        return this;
      }
      once(name,fn){
        if(name==='load')setTimeout(fn,0);
        else this.on(name,fn);
        return this;
      }
      emit(name,event={}){
        for(const fn of this.handlers[name]||[])fn(event);
      }
      loaded(){return true}
      setFog(value){this.fog=value}
      setLight(value){this.light=value}
      resize(){}
      remove(){}
      stop(){}
      getZoom(){return this.zoom}
      getCenter(){return this.position}
      flyTo(dest){
        if(dest.center)this.position={lng:dest.center[0],lat:dest.center[1]};
        if(dest.zoom!=null)this.zoom=dest.zoom;
        this.emit('moveend');
      }
      zoomTo(zoom){this.zoom=zoom;this.emit('moveend')}
    }
    window.mapboxgl={Map:MockMapbox,accessToken:'',supported:()=>true};
  });
  await page.click('[data-visual="globe"]');
  await page.waitForFunction(()=>window.ULTRON_EARTH?.state?.referenceMode===true,{timeout:12000});
  const mapbox=await page.evaluate(()=>({
    mode:window.ULTRON_EARTH.state.mode,
    style:window.__referenceMap.options.style,
    projection:window.__referenceMap.options.projection,
    zoom:window.__referenceMap.options.zoom,
    fog:window.__referenceMap.fog,
    light:window.__referenceMap.light,
    overStage:document.querySelector('#jarvis-earth-reference-layout').parentElement.classList.contains('jarvis-cc-center'),
    sideOpen:document.querySelector('.jarvis-earth-reference-side').classList.contains('is-open')
  }));
  assert.equal(mapbox.mode,'mapbox-globe');
  assert.equal(mapbox.style,'mapbox://styles/mapbox/satellite-streets-v12');
  assert.equal(mapbox.projection,'globe');
  assert.equal(mapbox.zoom,2.2);
  assert.equal(mapbox.fog['star-intensity'],.8);
  assert.equal(mapbox.light.intensity,.4);
  assert.equal(mapbox.overStage,true,'Mapbox reference UI should overlay the neural stage');
  assert.equal(mapbox.sideOpen,false,'Details side panel should open only on map selection');
  await page.evaluate(()=>window.__referenceMap.emit('click',{lngLat:{lat:35.8617,lng:104.1954}}));
  assert.equal(await page.$eval('.jarvis-earth-reference-side',el=>el.classList.contains('is-open')),true);
  assert.equal(await page.$eval('[data-earth-reference-value="lat"]',el=>el.textContent),'35.8617');
  await page.click('[data-earth-reference="minimize"]');
  assert.equal(await page.evaluate(()=>window.__referenceMap.getZoom()),2.2);
  await page.click('[data-earth-reference="ring"]');
  assert.equal(await page.evaluate(()=>window.ULTRON_NEURAL_RING_3D.active),true);
  await page.evaluate(()=>localStorage.removeItem('jarvis_mapbox_pk_v1'));


  await page.evaluate(()=>document.getElementById('btn-camera').click());
  assert.notEqual(await page.$eval('#screen-modal',e=>e.classList.contains('open')),true,
    'Optical Sensor activates inline, not in a fullscreen camera modal');
  assert.equal(await page.$eval('#jarvis-cc-camera-slot',e=>e.closest('.jarvis-cc-system-dock')!==null),true);

  await page.setViewport({width:390,height:844,deviceScaleFactor:1});
  await new Promise(resolve=>setTimeout(resolve,400));
  const compact=await page.evaluate(()=>({
    overflow:document.documentElement.scrollWidth-innerWidth,
    center:document.querySelector('.jarvis-cc-center').getBoundingClientRect().height,
    modules:[...document.querySelectorAll('.jarvis-cc-dock-grid .jarvis-cc-dock-module')].map(e=>e.getBoundingClientRect().width),
    terminal:document.querySelector('.jarvis-cc-console-terminal').getBoundingClientRect().width
  }));
  assert.ok(compact.center>=380,'Mobile neural center must remain visible');
  assert.ok(compact.modules.length===4 && compact.modules.every(n=>n>=200),
    'Mobile modules must be accessible in the same command screen');
  assert.ok(compact.terminal>=320,'Mobile command composer must not be squeezed');
  assert.ok(compact.overflow<=3,'No horizontal scroll on mobile');
  console.log('NEURAL COMMAND 3D PASS: operator ring 3D rotation/zoom, Mapbox reference overlay/sidebar/reset, globe toggle, inline optical sensor, 4 dock modules and mobile');
} catch(error){
  console.error('NEURAL COMMAND 3D FAILED:',error);
  await page?.screenshot({path:'neural-command-failure.png',fullPage:false}).catch(()=>{});
  console.error('Neural state:',await page?.evaluate(()=>({
    ring:window.ULTRON_NEURAL_RING_3D?.active,mode:window.ULTRON_EARTH?.state?.mode,
    body:document.body.className
  })).catch(()=>null));
  throw error;
} finally{await browser.close();}
