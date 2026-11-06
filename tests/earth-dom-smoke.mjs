import assert from 'node:assert/strict';
import fs from 'node:fs';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body><main class="orb-stage"><button type="button" data-visual="ring" aria-pressed="true">Anel</button><button type="button" data-visual="globe" aria-pressed="false">Globo</button></main></body></html>', {
  url: 'https://example.test/',
  runScripts: 'outside-only',
  pretendToBeVisual: true
});
const { window } = dom;
const { document } = window;
const control = { autoRotate: false, enablePan: true, enableZoom: false };
let point = {lat:0,lng:0,altitude:2.5};
let clickHandler = null;
let globeInstalls = 0;
const globe = {
  globeImageUrl() { return this; },
  bumpImageUrl() { return this; },
  backgroundColor() { return this; },
  showAtmosphere() { return this; },
  atmosphereColor() { return this; },
  atmosphereAltitude() { return this; },
  onGlobeClick(handler) { clickHandler = handler; return this; },
  controls() { return control; },
  pointOfView(value) { if (value) { point = { ...value }; return this; } return point; },
  width() { return this; },
  height() { return this; },
  pauseAnimation() { return this; },
  resumeAnimation() { return this; }
};
window.Globe = () => host => {
  assert.ok(host instanceof window.HTMLElement);
  globeInstalls += 1;
  return globe;
};
const router = fs.readFileSync('modules/ultron-orchestrator-v4270.js','utf8');
const start = router.indexOf('function isEarthStatusIntent(');
const end = router.indexOf('function lastAssistantEarthOffer()', start);
assert.ok(start >= 0 && end > start, 'Live Earth status intent missing');
const normalize = text => String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
const isEarthStatusIntent = new Function('normalize', router.slice(start,end)+'\nreturn isEarthStatusIntent;')(normalize);
assert.equal(isEarthStatusIntent('Você está com integração do globo?'), true);
assert.equal(isEarthStatusIntent('Por que o globo não ativa?'), true);
assert.equal(isEarthStatusIntent('Ativar mapa por satélite'), false);
assert.equal(isEarthStatusIntent('Como está a câmera?'), false);
const source = fs.readFileSync('modules/jarvis-earth.js','utf8');
window.eval(source);
assert.equal(typeof window.ULTRON_EARTH?.open, 'function', 'Earth API should register on dashboard load');

document.querySelector('[data-visual="globe"]').click();
await new Promise(resolve => setTimeout(resolve, 75));
assert.equal(window.ULTRON_EARTH.state.visible, true, 'Globe button must show explorer');
assert.equal(window.ULTRON_EARTH.state.ready, true, 'Basic globe must initialize without a Mapbox token');
assert.equal(window.ULTRON_EARTH.state.mode, 'globe-basic');
assert.equal(window.ULTRON_EARTH.state.needsToken, true);
assert.equal(globeInstalls, 1, 'Only one fallback globe should be created');
const tokenForm = document.querySelector('.jarvis-earth-token');
assert.equal(tokenForm.hidden, false, 'Optional satellite token form should be visible');
document.querySelector('[data-earth="basic"]').click();
assert.equal(tokenForm.hidden, true, 'Basic-mode button should dismiss optional setup');

const result = await window.ULTRON_EARTH.locate('China');
assert.equal(result.ok, true, 'Geographic commands should execute with basic globe');
assert.equal(result.mode, 'globe-basic');
assert.equal(document.querySelector('.jarvis-earth-side').classList.contains('is-open'), true);
assert.equal(document.querySelector('.jarvis-earth-place').textContent.toLowerCase(), 'china');

document.querySelector('[data-earth="home"]').click();
assert.equal(document.querySelector('.jarvis-earth-side').classList.contains('is-open'), false);
document.querySelector('[data-earth="close"]').click();
assert.equal(window.ULTRON_EARTH.state.visible, false);
assert.equal(window.ULTRON_EARTH.state.ready, true, 'Module should remain ready for reopening');
console.log('Earth DOM smoke test passed: open, fallback, select, reset, close');
window.close();
