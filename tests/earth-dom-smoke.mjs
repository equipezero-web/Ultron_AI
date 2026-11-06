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
  host.append(document.createElement('canvas'));
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
assert.equal(globeControls.enableRotate, false, 'Mouse hovering must never rotate the globe');
const globeCanvas = document.querySelector('.jarvis-earth-renderer canvas');
const preDrag = {...globe.pointOfView()};
globeCanvas.dispatchEvent(new window.MouseEvent('pointerdown', {bubbles:true,button:0,buttons:1,clientX:10,clientY:10}));
assert.equal(earth.state.dragging, true, 'Holding mouse down must arm manual rotation');
window.dispatchEvent(new window.MouseEvent('pointermove', {bubbles:true,buttons:1,clientX:80,clientY:35}));
assert.notEqual(globe.pointOfView().lng, preDrag.lng, 'Dragging with button held must rotate');
window.dispatchEvent(new window.MouseEvent('pointerup', {bubbles:true,button:0,buttons:0}));
assert.equal(earth.state.dragging, false, 'Mouse release must stop rotation');
const positionAfterDrag = {...globe.pointOfView()};
globeCanvas.dispatchEvent(new window.MouseEvent('pointermove', {bubbles:true,buttons:0,clientX:140,clientY:70}));
assert.equal(globe.pointOfView().lng, positionAfterDrag.lng, 'Mouse hovering must not rotate');
assert.equal(globeControls.enableRotate, false, 'OrbitControls must never rotate without the manual button gate');

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
await new Promise(resolve => setTimeout(resolve, 280)); // A drag must not count as a globe click.
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


const fakeToken = 'pk.' + 'a'.repeat(50);
window.localStorage.setItem('jarvis_mapbox_pk_v1', fakeToken);
let createdMap = null;
class FakeMap {
  constructor(options) {
    this.options = options;
    this.position = {lng:options.center[0],lat:options.center[1]};
    this.zoomValue = options.zoom;
    this.events = new Map();
    createdMap = this;
    const canvas = document.createElement('canvas');
    canvas.className = 'mapboxgl-canvas';
    options.container.append(canvas);
  }
  on(name,handler) { (this.events.get(name) || this.events.set(name,[]).get(name)).push(handler); return this; }
  once(name,handler) {
    if (name==='load') window.setTimeout(handler,0);
    else this.on(name,handler);
    return this;
  }
  emit(name,event={}) { for(const handler of this.events.get(name)||[]) handler(event); }
  resize() {}
  loaded() { return true; }
  flyTo(destination) { this.jumpTo(destination); }
  jumpTo(destination) {
    if (destination.center) this.position = {lng:destination.center[0],lat:destination.center[1]};
    if (destination.zoom !== undefined) this.zoomValue=destination.zoom;
    this.emit('moveend'); this.emit('zoomend');
  }
  stop() {}
  remove() {}
  getCenter() { return this.position; }
  getZoom() { return this.zoomValue; }
  zoomTo(zoom) { this.zoomValue=zoom; this.emit('zoomend'); }
}
class FakeMarker {
  setLngLat() { return this; }
  addTo() { return this; }
  remove() {}
}
window.mapboxgl = {Map:FakeMap,Marker:FakeMarker,supported:()=>true,accessToken:''};
const detailed = await earth.enterStreetDetails(-8.0476,-34.877,13);
assert.equal(detailed, true, 'Mapbox streets must be shown inside the original sphere');
assert.ok(createdMap);
assert.equal(createdMap.options.style, 'mapbox://styles/mapbox/satellite-streets-v12');
assert.equal(createdMap.options.projection, 'globe');
assert.equal(createdMap.options.dragPan, true, 'Hold and drag to pan');
assert.equal(createdMap.options.dragRotate, false, 'Hover/right drag must not rotate by default');
assert.equal(createdMap.options.scrollZoom, true, 'Mouse wheel zoom must be active');
assert.equal(earth.state.mode, 'mapbox-satellite');
assert.equal(earth.state.streetZoomAvailable, true);
assert.equal(document.querySelector('.jarvis-earth-map-layer').parentElement, document.querySelector('#jarvis-earth-globe'));
assert.equal(document.querySelector('#jarvis-earth-globe form, #jarvis-earth-globe input, #jarvis-earth-globe aside'), null);
createdMap.zoomTo(4);
assert.equal(earth.state.mode, 'globe-3d', 'Zooming far out returns to the same 3D globe');
window.localStorage.removeItem('jarvis_mapbox_pk_v1');

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

console.log('EARTH DOM PASS: hold-to-rotate, mouse release, globe view, zoom, Mapbox satellite-streets, country/city and back to ring');
window.close();
