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
  await page.waitForSelector('[data-cc="earth"]', { timeout: 30000 });
  assert.equal(await page.$eval('#jarvis-earth-explorer', el => el.hidden), true, 'Explorer should start closed');

  console.log('Earth before click:', await page.evaluate(() => ({ registered: Boolean(window.ULTRON_EARTH), state: window.ULTRON_EARTH?.state, buttonVisible: getComputedStyle(document.querySelector('[data-cc="earth"]')).display, globeToggle: Boolean(document.querySelector('[data-visual="globe"]')), explorer: Boolean(document.querySelector('#jarvis-earth-explorer')) })));
  await page.evaluate(() => document.querySelector('[data-cc="earth"]').click());
  console.log('Earth after click:', await page.evaluate(() => ({ registered: Boolean(window.ULTRON_EARTH), state: window.ULTRON_EARTH?.state, explorerHidden: document.querySelector('#jarvis-earth-explorer')?.hidden, text: document.querySelector('.jarvis-earth-notice')?.textContent })));
  console.log('Browser script errors after click:', errors.slice(0, 12));
  await page.waitForFunction(() => window.ULTRON_EARTH?.state?.visible === true, { timeout: 12000 });
  await page.waitForFunction(() => window.ULTRON_EARTH?.state?.ready === true, { timeout: 40000 });
  const mode = await page.evaluate(() => window.ULTRON_EARTH.state.mode);
  assert.equal(await page.$eval('#jarvis-earth-explorer', el => el.parentElement?.classList.contains('jarvis-cc-visual')), true, 'Globe must remain inside the Neural Ring');
  assert.equal(await page.$eval('#jarvis-earth-explorer', el => getComputedStyle(el).position), 'absolute', 'Globe must not cover the full screen');
  assert.ok(['globe-basic', 'map-2d'].includes(mode), 'Expected globe fallback without Mapbox token; got: ' + mode);
  const hasRenderer = await page.evaluate(() => Boolean(document.querySelector('.jarvis-earth-basic canvas, .jarvis-earth-basic iframe')));
  assert.equal(hasRenderer, true, 'A globe canvas or alternative map iframe must be present');

  await page.evaluate(() => document.querySelector('[data-earth="basic"]')?.click());
  const selected = await page.evaluate(() => window.ULTRON_EARTH.locate('China'));
  assert.equal(selected.ok, true, 'China command should select location');
  assert.equal(await page.$eval('.jarvis-earth-side', el => el.classList.contains('is-open')), true);
  console.log('Earth home click hit-test:', await page.$eval('[data-earth="home"]', el => { const r=el.getBoundingClientRect(); const target=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2); return {button:el.outerHTML,rect:{x:r.x,y:r.y,width:r.width,height:r.height},hit:target?.outerHTML?.slice(0,260),contains:el===target||el.contains(target)}; }));
  await page.evaluate(() => document.querySelector('[data-earth="home"]').click());
  assert.equal(await page.$eval('.jarvis-earth-side', el => el.classList.contains('is-open')), false);
  await page.evaluate(() => document.querySelector('[data-earth="close"]').click());
  assert.equal(await page.evaluate(() => window.ULTRON_EARTH.state.visible), false);
  console.log('BROWSER SMOKE PASS: open, renderer, globe mode =', mode, 'location, global reset, close');
  if (errors.length) console.log('Non-fatal browser errors:', errors.slice(0, 6));
} catch (error) {
  console.error('Earth browser smoke failure:', error);
  if (page) {
    await page.screenshot({path:'earth-browser-failure.png', fullPage:false}).catch(() => {});
    console.error('Browser page errors captured:', errors.slice(0, 12));
    console.error('Earth current state:', await page.evaluate(() => ({ registered: Boolean(window.ULTRON_EARTH), state: window.ULTRON_EARTH?.state, explorer: Boolean(document.querySelector('#jarvis-earth-explorer')), notice: document.querySelector('.jarvis-earth-notice')?.textContent })).catch(() => null));
  }
  throw error;
} finally {
  await browser.close();
}
