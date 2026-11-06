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

  await page.click('[data-visual="ring"]');
  assert.equal(await page.evaluate(() => window.ULTRON_EARTH.state.visible), false, 'Ring button must restore neural orb');
  assert.equal(await page.evaluate(() => window.ULTRON_EARTH.state.expanded), false);
  await page.click('[data-visual="globe"]');
  assert.equal(await page.evaluate(() => window.ULTRON_EARTH.state.visible), true, 'Globe toggle should reopen same 3D sphere');

  console.log('BROWSER EARTH PASS: actual buttons, transparent globe, China in center, expanded zoom, click-only X, return to ring');
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
