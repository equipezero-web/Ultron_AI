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

  await page.click('[data-visual="globe"]');
  await page.waitForFunction(() => window.ULTRON_EARTH?.state?.ready===true,{timeout:20000});
  assert.equal(await page.evaluate(() => window.ULTRON_NEURAL_RING_3D.active),false,
    'WebGL neural renderer must pause while Earth is visible');
  assert.equal(await page.evaluate(() => window.ULTRON_EARTH.state.visible),true);
  assert.equal(await page.$eval('#jarvis-earth-globe',e=>e.parentElement.classList.contains('jarvis-cc-visual')),true);
  await page.click('[data-visual="ring"]');
  await page.waitForFunction(()=>window.ULTRON_NEURAL_RING_3D?.active===true,{timeout:4000});
  assert.equal(await page.evaluate(() => window.ULTRON_EARTH.state.visible),false);
  assert.equal(await page.$eval('#jarvis-cc-panel',e=>getComputedStyle(e).display),'none',
    'The Command Center must not open any extra panel');

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
  console.log('NEURAL COMMAND 3D PASS: WebGL ring, globe toggle, inline optical sensor, four live modules beside terminal, mobile layout');
} catch(error){
  console.error('NEURAL COMMAND 3D FAILED:',error);
  await page?.screenshot({path:'neural-command-failure.png',fullPage:false}).catch(()=>{});
  console.error('Neural state:',await page?.evaluate(()=>({
    ring:window.ULTRON_NEURAL_RING_3D?.active,mode:window.ULTRON_EARTH?.state?.mode,
    body:document.body.className
  })).catch(()=>null));
  throw error;
} finally{await browser.close();}
