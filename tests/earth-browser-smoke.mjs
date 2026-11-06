import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';

const url = process.env.JARVIS_TEST_URL || 'http://127.0.0.1:8766/';
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_BIN || '/usr/bin/google-chrome',
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--enable-webgl', '--enable-unsafe-swiftshader']
});
let page;
const errors = [];
try {
  page = await browser.newPage();
  await page.setViewport({ width: 1365, height: 860, deviceScaleFactor: 1 });
  page.on('pageerror', error => errors.push(error.stack || error.message));
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 35000 });
  await page.waitForSelector('[data-visual="globe"]', { timeout: 30000 });
  assert.equal(await page.evaluate(() => window.ULTRON_EARTH?.state?.visible), false);

  await page.evaluate(() => {
    window.__earthEvents = [];
    for (const type of ['pointerdown', 'pointerup', 'click']) {
      document.addEventListener(type, event => { window.__earthEvents.push({
        type, tag:event.target?.tagName, html:event.target?.outerHTML?.slice(0,180),
        x:event.clientX, y:event.clientY, scrollY:window.scrollY
      }); }, true);
    }
  });
  console.log('Globe button pre-click hit:', await page.evaluate(() => { const b=document.querySelector('[data-visual="globe"]'); const r=b.getBoundingClientRect(); const hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2); return {x:r.x,y:r.y,w:r.width,h:r.height,hit:hit?.outerHTML?.slice(0,300),isButton:b===hit||b.contains(hit),display:getComputedStyle(b).display,pointerEvents:getComputedStyle(b).pointerEvents}; }));
  await page.click('[data-visual="globe"]');
  console.log('Globe after physical click:', await page.evaluate(() => ({state:window.ULTRON_EARTH?.state,mode:document.querySelector('[data-visual="globe"]')?.getAttribute('aria-pressed'),events:window.__earthEvents,scrollY:window.scrollY,buttonRect:(() => {const r=document.querySelector('[data-visual="globe"]').getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,hit:document.elementFromPoint(r.left+r.width/2,r.top+r.height/2)?.outerHTML?.slice(0,180)}})()})));
  await page.waitForFunction(() => window.ULTRON_EARTH?.state?.visible === true, { timeout: 4000 });
  await page.waitForFunction(() => window.ULTRON_EARTH?.state?.ready === true, { timeout: 15000 });
  const result = await page.evaluate(() => ({
    state: window.ULTRON_EARTH.state,
    parent: document.getElementById('jarvis-earth-globe')?.parentElement?.className,
    canvas: Boolean(document.querySelector('.jarvis-earth-renderer canvas')),
    secondaryInputs: document.querySelectorAll('#jarvis-earth-globe input, #jarvis-earth-globe form, #jarvis-earth-globe aside, #jarvis-earth-globe section').length,
    xHidden: document.querySelector('.jarvis-earth-selection-close')?.hidden
  }));
  assert.equal(result.state.mode, 'globe-3d', 'A real 3D globe must replace the neural graphic');
  assert.ok(result.parent.includes('jarvis-cc-visual'), 'Earth belongs to the original Neural Ring');
  assert.equal(result.canvas, true, 'WebGL globe canvas should exist');
  assert.equal(result.secondaryInputs, 0, 'No popup, search, side panel or separate section');
  assert.equal(result.xHidden, true, 'The only X must remain hidden until a location click');

  const china = await page.evaluate(() => window.ULTRON_EARTH.locate('China'));
  assert.equal(china.ok, true, 'Jarvis should locate China');
  await page.waitForFunction(() => {
    const view = window.ULTRON_EARTH?.state?.view;
    return view && Math.abs(view.lat - 35.8617) < 1 && Math.abs(view.lng - 104.1954) < 1;
  }, { timeout: 9000 });

  const recife = await page.evaluate(() => window.ULTRON_EARTH.locate('Recife'));
  assert.equal(recife.ok, true);
  assert.equal(await page.evaluate(() => window.ULTRON_EARTH.state.expanded), true, 'Close zoom should expand within Command Center');

  await page.evaluate(() => window.ULTRON_EARTH.focus(37.5, 118.4, 10, true));
  assert.equal(await page.$eval('.jarvis-earth-selection-close', el => el.hidden), false);
  await page.evaluate(() => document.querySelector('.jarvis-earth-selection-close').click());
  assert.equal(await page.$eval('.jarvis-earth-selection-close', el => el.hidden), true);

  console.log('Ring button hit-test:', await page.evaluate(() => {const b=document.querySelector('[data-visual="ring"]');const r=b.getBoundingClientRect();const h=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return {x:r.x,y:r.y,w:r.width,h:r.height,hit:h?.outerHTML?.slice(0,220),clickable:b===h||b.contains(h),scrollY:window.scrollY};}));
  await page.click('[data-visual="ring"]');
  console.log('Ring after physical click:', await page.evaluate(() => ({visible:window.ULTRON_EARTH.state.visible,events:window.__earthEvents?.slice(-5),scrollY:window.scrollY})));
  assert.equal(await page.evaluate(() => window.ULTRON_EARTH.state.visible), false, 'Ring button must restore neural orb');
  assert.equal(await page.evaluate(() => window.ULTRON_EARTH.state.expanded), false);
  await page.click('[data-visual="globe"]');
  assert.equal(await page.evaluate(() => window.ULTRON_EARTH.state.visible), true, 'Globe toggle should reopen same 3D sphere');
  await page.evaluate(() => window.ULTRON_EARTH.close());
  await page.click('[data-cc="earth"]');
  assert.equal(await page.evaluate(() => window.ULTRON_EARTH.state.visible), true, 'The Globe 3D quick button must activate the globe on physical press');

  // Hover must never rotate; only a held left mouse button can rotate Globe.gl.
  await page.evaluate(() => window.ULTRON_EARTH.navigate('home'));
  await page.waitForFunction(() => window.ULTRON_EARTH?.state?.view?.altitude > 1, { timeout: 7000 });
  const canvas = await page.$('.jarvis-earth-renderer canvas');
  const bounds = await canvas.boundingBox();
  const cx = bounds.x + bounds.width / 2, cy = bounds.y + bounds.height / 2;
  await page.mouse.move(cx,cy);
  await page.waitForFunction(() => window.ULTRON_EARTH?.state?.view?.altitude > 1.8, { timeout: 7000 });
  await new Promise(resolve => setTimeout(resolve, 1900)); // Let the previous Jarvis camera tween settle.
  const beforeHover = await page.evaluate(() => window.ULTRON_EARTH.state.view);
  await page.mouse.move(cx + 30,cy + 10,{steps:4});
  const afterHover = await page.evaluate(() => window.ULTRON_EARTH.state.view);
  assert.ok(Math.abs(afterHover.lat-beforeHover.lat)<0.01 && Math.abs(afterHover.lng-beforeHover.lng)<0.01,
    'Moving the mouse without holding must not rotate the globe');
  console.log('Globe canvas drag hit:', await page.evaluate(({x,y}) => ({
    hit:document.elementFromPoint(x,y)?.outerHTML?.slice(0,220),
    canvasRect:(()=>{const r=document.querySelector('.jarvis-earth-renderer canvas').getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}})(),
    view:window.ULTRON_EARTH.state.view
  }), {x:cx,y:cy}));
  await page.mouse.down();
  console.log('Globe pointer down:', await page.evaluate(() => ({dragging:window.ULTRON_EARTH.state.dragging, view:window.ULTRON_EARTH.state.view})));
  await page.mouse.move(cx + 90,cy + 35,{steps:8});
  console.log('Globe pointer move:', await page.evaluate(() => ({dragging:window.ULTRON_EARTH.state.dragging, view:window.ULTRON_EARTH.state.view})));
  await page.mouse.up();
  console.log('Globe pointer up:', await page.evaluate(() => ({dragging:window.ULTRON_EARTH.state.dragging, view:window.ULTRON_EARTH.state.view})));
  await page.waitForFunction(() => window.ULTRON_EARTH.state.dragRequiresHold === true, {timeout:2000});
  const afterDrag = await page.evaluate(() => window.ULTRON_EARTH.state.view);
  assert.ok(Math.abs(afterDrag.lat-afterHover.lat)>0.05 || Math.abs(afterDrag.lng-afterHover.lng)>0.05,
    'Holding and dragging must rotate the Earth');
  const afterRelease = await page.evaluate(() => window.ULTRON_EARTH.state.view);
  await page.mouse.move(cx + 95,cy + 40,{steps:3});
  const afterFreeMove = await page.evaluate(() => window.ULTRON_EARTH.state.view);
  assert.ok(Math.abs(afterFreeMove.lat-afterRelease.lat)<0.05 && Math.abs(afterFreeMove.lng-afterRelease.lng)<0.05,
    'After releasing mouse, free movement must not rotate');
  await page.mouse.wheel({deltaY:-280});
  await page.waitForFunction(() => window.ULTRON_EARTH?.state?.view?.altitude < 2.5, {timeout:2000});

  // Simulate the official Mapbox GL JS engine locally: verify real integrated
  // map options and zoom-mode transitions without exposing a production token to CI.
  const mapboxProof = await page.evaluate(async () => {
    localStorage.setItem('jarvis_mapbox_pk_v1','pk.'+'a'.repeat(50));
    let optionsSeen;
    class StubMap {
      constructor(options) {
        optionsSeen=options;
        this.zoom=options.zoom;
        this.center={lng:options.center[0],lat:options.center[1]};
        this.handlers={};
        const canvas=document.createElement('canvas');
        canvas.className='mapboxgl-canvas';
        options.container.append(canvas);
        window.__earthStubMap=this;
      }
      on(name,fn) { (this.handlers[name]??=[]).push(fn); return this; }
      once(name,fn) { if(name==='load') setTimeout(fn,0); else this.on(name,fn); return this; }
      fire(name) { for(const fn of this.handlers[name]||[]) fn({}); }
      loaded() {return true;}
      resize() {}
      remove() {}
      stop() {}
      getZoom() {return this.zoom;}
      getCenter() {return this.center;}
      flyTo(opts) {this.jumpTo(opts);}
      jumpTo(opts) {
        if(opts.center)this.center={lng:opts.center[0],lat:opts.center[1]};
        if(opts.zoom!==undefined)this.zoom=opts.zoom;
        this.fire('moveend');this.fire('zoomend');
      }
      zoomTo(zoom) {this.zoom=zoom;this.fire('zoomend');}
    }
    window.mapboxgl={Map:StubMap, supported:()=>true,accessToken:''};
    const success=await window.ULTRON_EARTH.enterStreetDetails(-8.0476,-34.877,14);
    const state=window.ULTRON_EARTH.state;
    const embedded=document.querySelector('.jarvis-earth-map-layer')?.parentElement?.id;
    const extraUi=document.querySelectorAll('#jarvis-earth-globe input,#jarvis-earth-globe form,#jarvis-earth-globe aside').length;
    return {success,style:optionsSeen?.style,projection:optionsSeen?.projection,
      dragPan:optionsSeen?.dragPan,dragRotate:optionsSeen?.dragRotate,
      scrollZoom:optionsSeen?.scrollZoom,mode:state.mode,embedded,extraUi};
  });
  assert.equal(mapboxProof.success,true);
  assert.equal(mapboxProof.style,'mapbox://styles/mapbox/satellite-streets-v12');
  assert.equal(mapboxProof.projection,'globe');
  assert.equal(mapboxProof.dragPan,true);
  assert.equal(mapboxProof.dragRotate,false);
  assert.equal(mapboxProof.scrollZoom,true);
  assert.equal(mapboxProof.mode,'mapbox-satellite');
  assert.equal(mapboxProof.embedded,'jarvis-earth-globe');
  assert.equal(mapboxProof.extraUi,0);
  await page.evaluate(() => window.__earthStubMap.zoomTo(3.5));
  assert.equal(await page.evaluate(() => window.ULTRON_EARTH.state.mode),'globe-3d');
  await page.evaluate(() => localStorage.removeItem('jarvis_mapbox_pk_v1'));

  console.log('BROWSER EARTH PASS: globe click-and-hold, wheel zoom, Mapbox satellite-streets mode, return to ring');
  if (errors.length) console.log('Other page script errors:', errors.slice(0, 4));
} catch (error) {
  console.error('Earth browser smoke failed:', error);
  if (page) {
    await page.screenshot({path:'earth-browser-failure.png', fullPage:false}).catch(() => {});
    console.error('Earth state:', await page.evaluate(() => window.ULTRON_EARTH?.state).catch(() => null));
    console.error('Browser errors:', errors.slice(0, 10));
  }
  throw error;
} finally {
  await browser.close();
}
