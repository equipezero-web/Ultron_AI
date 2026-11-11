import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';

const browser=await puppeteer.launch({
  executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',
  headless:true,
  args:['--no-sandbox','--disable-dev-shm-usage','--enable-webgl','--enable-unsafe-swiftshader']
});
let page;
try {
  page=await browser.newPage();
  await page.setViewport({width:390,height:844,isMobile:true,hasTouch:true,deviceScaleFactor:1});
  await page.goto(process.env.JARVIS_TEST_URL||'http://127.0.0.1:8766/',{
    waitUntil:'domcontentloaded',timeout:35000
  });
  await page.waitForFunction(()=>window.ULTRON_EARTH?.state?.available,{timeout:20000});

  await page.waitForFunction(()=>window.ULTRON_NEURAL_RING_3D?.active===true,{timeout:15000});
  const initialRing=await page.evaluate(()=>window.ULTRON_NEURAL_RING_3D.state);
  const ringArea=await page.$eval('#jarvis-cc-canvas',el=>{
    const r=el.getBoundingClientRect();
    return {x:r.x,y:r.y,w:r.width,h:r.height,touch:getComputedStyle(el).touchAction};
  });
  assert.equal(ringArea.touch,'none','Mobile neural ring must own touch gestures');
  const ringClient=await page.target().createCDPSession();
  const rx=ringArea.x+ringArea.w*.5,ry=ringArea.y+ringArea.h*.45;
  const ringTouches=(gap)=>[
    {x:Math.round(rx-gap),y:Math.round(ry),id:11},
    {x:Math.round(rx+gap),y:Math.round(ry),id:12}
  ];
  await ringClient.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:ringTouches(18)});
  for(const gap of [25,36,52,70]){
    await ringClient.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:ringTouches(gap)});
  }
  await ringClient.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  const pinchedRing=await page.evaluate(()=>window.ULTRON_NEURAL_RING_3D.state);
  assert.ok(pinchedRing.zoom>initialRing.zoom+.15,'Pinch must zoom true WebGL Neural Ring on Android');
  await page.evaluate(()=>window.ULTRON_NEURAL_RING_3D.reset());
  assert.equal(await page.evaluate(()=>window.ULTRON_NEURAL_RING_3D.state.zoom),1);

  // One-finger VERTICAL swipe over WebGL must advance the page even while
  // the canvases retain touch-action:none to preserve two-finger pinch.
  await page.evaluate(()=>{
    const spacer=document.createElement('div');spacer.style.height='1300px';
    spacer.id='touch-page-scroll-spacer';document.body.append(spacer);
    window.scrollTo(0,0);
  });
  const scrollTouch=async (selector,session,id)=>{
    const r=await page.$eval(selector,el=>{
      const x=el.getBoundingClientRect();return {x:x.x,y:x.y,w:x.width,h:x.height};
    });
    const x=Math.round(Math.max(25,Math.min(365,r.x+r.w*.5)));
    const y=Math.round(Math.max(160,Math.min(770,r.y+r.h*.60)));
    await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id}]});
    for(const d of [12,26,43,65,95,130])
      await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y-d,id}]});
    await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await new Promise(resolve=>setTimeout(resolve,220));
    return page.evaluate(()=>window.scrollY);
  };
  const ringScroll=await scrollTouch('#jarvis-cc-canvas',ringClient,70);
  assert.ok(ringScroll>30,'Vertical one-finger swipe over Neural Ring must scroll the document: '+ringScroll);
  await page.evaluate(()=>window.scrollTo(0,0));
  await page.evaluate(()=>document.querySelector('[data-visual="globe"]').click());
  await page.waitForFunction(()=>window.ULTRON_EARTH?.state?.ready===true,{timeout:20000});
  assert.equal(await page.evaluate(()=>window.ULTRON_EARTH.state.mode),'globe-3d');
  const overlay=await page.evaluate(()=>{
    const layer=document.querySelector('.jarvis-earth-reference-map');
    const zoomIn=document.querySelector('[data-earth-reference="zoom-in"]');
    const zoomOut=document.querySelector('[data-earth-reference="zoom-out"]');
    const canvas=document.querySelector('.jarvis-earth-renderer canvas');
    return {
      action:getComputedStyle(layer).touchAction,
      canvasTouch:getComputedStyle(canvas).touchAction,
      plus:zoomIn?.getBoundingClientRect().height,
      minus:zoomOut?.getBoundingClientRect().height,
      viewport:document.documentElement.scrollWidth-innerWidth
    };
  });
  assert.equal(overlay.action,'none','The globe layer must intercept two-finger pinch instead of scrolling the page');
  assert.equal(overlay.canvasTouch,'none');
  assert.ok(overlay.plus>=40 && overlay.minus>=40,'Touch zoom buttons need a usable size');
  assert.ok(overlay.viewport<=3,'Globe must not overflow the phone viewport');

  const globeScroll=await scrollTouch('.jarvis-earth-renderer canvas',ringClient,71);
  assert.ok(globeScroll>30,'Vertical one-finger swipe over globe must scroll page: '+globeScroll);
  await page.evaluate(()=>window.scrollTo(0,0));
  const startingAltitude=await page.evaluate(()=>window.ULTRON_EARTH.state.view.altitude);
  await page.tap('[data-earth-reference="zoom-in"]');
  await page.waitForFunction(prev=>window.ULTRON_EARTH.state.view.altitude < prev-.01,{timeout:3000},startingAltitude);
  const afterPlus=await page.evaluate(()=>window.ULTRON_EARTH.state.view.altitude);
  await page.tap('[data-earth-reference="zoom-out"]');
  await page.waitForFunction(prev=>window.ULTRON_EARTH.state.view.altitude > prev+.01,{timeout:3000},afterPlus);

  // Real two-touch Chromium input, with independently tracked touch pointers.
  const rect=await page.$eval('.jarvis-earth-renderer canvas',el=>{
    const r=el.getBoundingClientRect();
    return {x:r.x,y:r.y,w:r.width,h:r.height};
  });
  const x=rect.x+rect.w*.5,y=rect.y+rect.h*.62;
  const original=await page.evaluate(()=>window.ULTRON_EARTH.state.view.altitude);
  const client=await page.target().createCDPSession();
  const points=(spread)=>[
    {x:Math.round(x-spread),y:Math.round(y),id:1},
    {x:Math.round(x+spread),y:Math.round(y),id:2}
  ];
  await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:points(22)});
  for(const gap of [28,38,49,65]){
    await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:points(gap)});
  }
  await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  const pinched=await page.evaluate(()=>window.ULTRON_EARTH.state.view.altitude);
  assert.ok(pinched < original-.08,'Two-finger outward pinch must zoom Globe.gl on the phone');

  // Validate Mapbox's native touch handler and the same + / - buttons.
  await page.evaluate(()=>{
    window.ULTRON_EARTH.close();
    localStorage.setItem('jarvis_mapbox_pk_v1','pk.'+'a'.repeat(50));
    class MobileMap {
      constructor(opts){
        this.options=opts;this.zoom=opts.zoom;this.center={lng:opts.center[0],lat:opts.center[1]};
        this.handlers={};
        this.touchEnabled=false;this.rotationDisabled=false;
        this.touchZoomRotate={
          enable:()=>{this.touchEnabled=true;},
          disableRotation:()=>{this.rotationDisabled=true;}
        };
        this.touchPitch={disable:()=>{this.touchPitchDisabled=true;}};
        this.dragPan={enable:()=>{this.panEnabled=true;}};
        this.canvas=document.createElement('canvas');
        this.canvas.className='mapboxgl-canvas';
        opts.container.append(this.canvas);
        window.__mobileMap=this;
      }
      on(name,handler){
        (this.handlers[name]??=[]).push(handler);
        if(name==='style.load')setTimeout(handler,0);
        return this;
      }
      once(name,handler){if(name==='load')setTimeout(handler,0);else this.on(name,handler);return this;}
      emit(name){for(const fn of this.handlers[name]||[])fn({});}
      loaded(){return true;}
      setFog(){}
      setLight(){}
      getZoom(){return this.zoom;}
      getCenter(){return this.center;}
      zoomTo(n){this.zoom=n;this.emit('moveend');}
      flyTo(opts){
        if(opts.zoom!==undefined)this.zoom=opts.zoom;
        if(opts.center)this.center={lng:opts.center[0],lat:opts.center[1]};
        this.emit('moveend');
      }
      resize(){}
      stop(){}
      remove(){}
    }
    window.mapboxgl={Map:MobileMap,supported:()=>true,accessToken:''};
  });
  await page.evaluate(()=>document.querySelector('[data-visual="globe"]').click());
  await page.waitForFunction(()=>window.ULTRON_EARTH?.state?.referenceMode,{timeout:8000});
  const proof=await page.evaluate(()=>({
    mode:window.ULTRON_EARTH.state.mode,
    touch:window.__mobileMap.touchEnabled,
    rotation:window.__mobileMap.rotationDisabled,
    pitch:window.__mobileMap.touchPitchDisabled,
    pan:window.__mobileMap.panEnabled,
    mapboxTouch:getComputedStyle(window.__mobileMap.canvas).touchAction,
    option:window.__mobileMap.options.touchZoomRotate
  }));
  assert.equal(proof.mode,'mapbox-globe');
  assert.equal(proof.touch,true,'Mapbox pinch-to-zoom handler must be enabled');
  assert.equal(proof.rotation,true,'Mapbox pinch should zoom without unwanted rotation');
  assert.equal(proof.pitch,true);
  assert.equal(proof.pan,true);
  assert.equal(proof.mapboxTouch,'none');
  assert.equal(proof.option,true);
  const beforeMap=await page.evaluate(()=>window.__mobileMap.getZoom());
  await page.tap('[data-earth-reference="zoom-in"]');
  assert.ok((await page.evaluate(()=>window.__mobileMap.getZoom()))>beforeMap,'+ should zoom the Mapbox satellite map');
  await page.tap('[data-earth-reference="zoom-out"]');
  assert.equal(await page.evaluate(()=>window.__mobileMap.getZoom()),beforeMap,'- should zoom out again');

  for(const width of [320,360,390,430]){
    await page.setViewport({width,height:844,isMobile:true,hasTouch:true,deviceScaleFactor:1});
    const layout=await page.evaluate(()=>({
      overflow:document.documentElement.scrollWidth-innerWidth,
      input:document.querySelector('#command-input').getBoundingClientRect().height,
      font:parseFloat(getComputedStyle(document.querySelector('#command-input')).fontSize),
      send:document.querySelector('#btn-send').getBoundingClientRect().height,
      sendWidth:document.querySelector('#btn-send').getBoundingClientRect().width,
      dockColumns:getComputedStyle(document.querySelector('.jarvis-cc-dock-grid')).gridTemplateColumns.split(' ').length,
      cards:[...document.querySelectorAll('.jarvis-cc-dock-module')].map(e=>e.getBoundingClientRect().width),
      responses:document.querySelector('#output-box').getBoundingClientRect().height,
      globe:document.querySelector('.jarvis-cc-center').getBoundingClientRect().height,
      quickRail:getComputedStyle(document.querySelector('#jarvis-cc-input-slot .quick-actions')).overflowX,
      quickHeight:document.querySelector('#jarvis-cc-input-slot .quick-actions button').getBoundingClientRect().height,
      inputHint:document.querySelector('#command-input').getAttribute('enterkeyhint'),
      statusOverflow:document.querySelector('.jarvis-cc-top').scrollWidth-document.querySelector('.jarvis-cc-top').clientWidth
    }));
    assert.ok(layout.overflow<=3,'Mobile '+width+': prevent horizontal overflow');
    assert.ok(layout.input<=50 && layout.font>=16,'Mobile '+width+': compact, readable command editor');
    assert.ok(layout.send<=55 && layout.sendWidth<=95,'Mobile '+width+': compact send action');
    assert.equal(layout.dockColumns,2,'Mobile '+width+': four system cards form two columns');
    assert.equal(layout.cards.length,4);
    assert.ok(layout.cards.every(w=>w>=120),'Mobile '+width+': system card text space');
    assert.ok(layout.responses<=120,'Mobile '+width+': output log scrolls internally');
    assert.ok(layout.globe>=380,'Mobile '+width+': keep the original 3D stage large');
    assert.equal(layout.quickRail,'auto','Mobile '+width+': shortcuts must scroll sideways inside their own row');
    assert.ok(layout.quickHeight>=40,'Mobile '+width+': shortcut touch targets remain usable');
    assert.equal(layout.inputHint,'send','Mobile '+width+': keyboard should show the Send action');
    assert.ok(layout.statusOverflow<=3,'Mobile '+width+': status bar text must not clip');
  }
  await page.setViewport({width:667,height:375,isMobile:true,hasTouch:true,deviceScaleFactor:1});
  const landscape=await page.evaluate(()=>({
    overflow:document.documentElement.scrollWidth-innerWidth,
    globe:document.querySelector('.jarvis-cc-center').getBoundingClientRect().height,
    mapControls:document.querySelector('.jarvis-earth-reference-zoom').getBoundingClientRect().width
  }));
  assert.ok(landscape.overflow<=3,'Landscape phone must avoid horizontal overflow');
  assert.ok(landscape.globe>=300,'Landscape globe must remain usable');
  assert.ok(landscape.mapControls>=40,'Landscape zoom controls must stay visible');
  await page.setViewport({width:390,height:844,isMobile:true,hasTouch:true,deviceScaleFactor:2});
  await page.evaluate(()=>window.ULTRON_EARTH.close());
  await page.waitForFunction(()=>window.ULTRON_NEURAL_RING_3D?.active===true,{timeout:4000});
  const gpu=await page.evaluate(()=>{
    const canvas=document.querySelector('#jarvis-cc-canvas');
    return canvas.width/Math.max(1,canvas.getBoundingClientRect().width);
  });
  assert.ok(gpu<=1.4,'High-DPI mobile ring must limit WebGL buffer resolution to save GPU');
  console.log('MOBILE FULL PASS: Ring + globe two-touch pinch, Mapbox, command bar, quick actions, modules, 320-430px/landscape, GPU limits');
} catch(error){
  console.error('MOBILE GLOBE & CONSOLE FAILED:',error);
  await page?.screenshot({path:'mobile-globe-console-failure.png',fullPage:false}).catch(()=>{});
  console.error('Mobile state:',await page?.evaluate(()=>({
    earth:window.ULTRON_EARTH?.state,
    overflow:document.documentElement.scrollWidth-innerWidth,
    width:innerWidth
  })).catch(()=>null));
  throw error;
} finally{
  await browser.close();
}
