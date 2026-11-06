import assert from 'node:assert/strict';
import fs from 'node:fs';
import { JSDOM } from 'jsdom';

const html = '<!doctype html><html><body><div class="jarvis-command-center-ui"><div class="jarvis-cc-visual"><canvas id="jarvis-cc-canvas"></canvas></div><button data-visual="ring" aria-pressed="true">Anel</button><button data-visual="globe" aria-pressed="false">Globo</button><div id="output-box"></div></div></body></html>';
const dom = new JSDOM(html, {
  url: 'https://example.test/', runScripts: 'outside-only', pretendToBeVisual: true
});
const { window } = dom;
const { document } = window;
const globeControls = { autoRotate: false, enablePan: false, enableZoom: true, addEventListener() {} };
let view = { lat: -8.0476, lng: -34.877, altitude: 2.5 };
let pins = [];
let clickHandler;
let instantiations = 0;
const globe = {
  globeImageUrl() { return this; }, bumpImageUrl() { return this; },
  backgroundColor() { return this; }, showAtmosphere(value) { assert.equal(value, false); return this; },
  pointsData(value) { if (value) { pins = value; return this; } return pins; },
  pointColor() { return this; }, pointRadius() { return this; }, pointAltitude() { return this; },
  onGlobeClick(handler) { clickHandler = handler; return this; },
  controls() { return globeControls; },
  pointOfView(value) { if (value) { view = { ...value }; return this; } return view; },
  width() { return this; }, height() { return this; },
  pauseAnimation() { return this; }, resumeAnimation() { return this; }
};
window.Globe = () => host => {
  assert.ok(host instanceof window.HTMLElement);
  ++instantiations;
  return globe;
};
const changedModes = [];
window.JARVIS_COMMAND_CENTER = { setVisualMode(mode) { changedModes.push(mode); } };

const source = fs.readFileSync('modules/jarvis-earth.js', 'utf8');
assert.ok(!source.includes('jarvis-earth-explorer'), 'Legacy explorer must be removed');
assert.ok(!source.includes('jarvis-earth-token'), 'Token dialog must be removed');
assert.ok(!source.includes('jarvis-earth-search'), 'Secondary search field must be removed');
window.eval(source);
const earth = window.ULTRON_EARTH;
assert.equal(typeof earth?.open, 'function');

document.querySelector('[data-visual="globe"]').click();
await new Promise(resolve => setTimeout(resolve, 30));
assert.equal(earth.state.visible, true);
assert.equal(earth.state.ready, true);
assert.equal(earth.state.mode, 'globe-3d');
assert.equal(document.querySelector('#jarvis-earth-globe').parentElement, document.querySelector('.jarvis-cc-visual'));
assert.equal(document.querySelectorAll('#jarvis-earth-globe form, #jarvis-earth-globe section, #jarvis-earth-globe aside').length, 0);
assert.equal(document.querySelector('.jarvis-earth-selection-close').hidden, true, 'No X before selecting location');
assert.equal(instantiations, 1);

const china = await earth.locate('China');
assert.equal(china.ok, true);
assert.ok(Math.abs(globe.pointOfView().lat - 35.8617) < 0.0001);
assert.ok(Math.abs(globe.pointOfView().lng - 104.1954) < 0.0001);
assert.equal(globeControls.autoRotate, false, 'Rotation must stop centered on China');
assert.equal(document.querySelector('.jarvis-earth-selection-close').hidden, true, 'Voice command must not create popup');
const recife = await earth.locate('Recife');
assert.equal(recife.ok, true);
assert.equal(earth.state.expanded, true, 'Close zoom should expand neural visual area');
assert.equal(earth.state.view.altitude, 0.36);
assert.equal(earth.navigate('home').ok, true);
assert.equal(earth.state.expanded, false, 'Returning global must restore neural visual size');

assert.equal(typeof clickHandler, 'function');
clickHandler({ lat: 37.5, lng: 118.4 });
assert.equal(earth.state.selectedPlace.lat, 37.5);
assert.equal(pins.length, 1);
const dismiss = document.querySelector('.jarvis-earth-selection-close');
assert.equal(dismiss.hidden, false, 'Only a location click exposes X');
dismiss.click();
assert.equal(dismiss.hidden, true);
assert.equal(pins.length, 0);
document.querySelector('[data-visual="ring"]').click();
assert.equal(earth.state.visible, false);
assert.equal(earth.state.expanded, false);
assert.ok(changedModes.includes('ring'));
document.querySelector('[data-visual="globe"]').click();
await new Promise(resolve => setTimeout(resolve, 20));
assert.equal(earth.state.visible, true);
assert.equal(instantiations, 1, 'Reopening must reuse the same Globe instance');

const router = fs.readFileSync('modules/ultron-orchestrator-v4270.js','utf8');
const start = router.indexOf('const geoAliases =');
const end = router.indexOf('function isEarthStatusIntent(', start);
assert.ok(start >= 0 && end > start);
const normalize = value => String(value || '').normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const parseEarthIntent = new Function('normalize', router.slice(start,end) + '\nreturn parseEarthIntent;')(normalize);
assert.deepEqual(parseEarthIntent('Jarvis no globo ache a China'), {place:'china'});
assert.deepEqual(parseEarthIntent('Jarvis, no globo encontre Recife'), {place:'recife'});
assert.deepEqual(parseEarthIntent('Jarvis mostre a China no globo'), {place:'china'});
assert.equal(parseEarthIntent('Mostre a câmera'), null);
assert.equal(parseEarthIntent('Jarvis volte ao neural ring').action, 'ring');

console.log('EARTH DOM PASS: same neural sphere, commands, country centering, zoom expansion, location X, return to ring');
window.close();
