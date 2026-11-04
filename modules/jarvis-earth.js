// Wheel recovery: legacy global listeners may consume wheel events even while arrow scrolling works.
// Handle only the dashboard background; leave maps, inputs and scrollable panels alone.
document.addEventListener('wheel', (event) => {
  if (event.defaultPrevented || event.ctrlKey || event.target.closest('iframe,textarea,input,select,.jarvis-earth-globe,#output-box,.screen-modal')) return;
  const doc = document.scrollingElement || document.documentElement;
  if (doc.scrollHeight <= doc.clientHeight + 2) return;
  const before = doc.scrollTop;
  requestAnimationFrame(() => {
    if (Math.abs(doc.scrollTop - before) < 1 && Math.abs(event.deltaY) > 0) {
      doc.scrollBy({top:event.deltaY,behavior:'instant'});
    }
  });
}, {passive:true,capture:true});

// Restore scrolling if a legacy subsystem leaves an inline overflow lock after a command.
// Do not interfere with the fullscreen camera modal.
const unlockPageScroll = () => {
  const modal = document.getElementById('screen-modal');
  if (modal?.getAttribute('aria-hidden') === 'false') return;
  for (const element of [document.documentElement, document.body]) {
    if (element.style.overflow === 'hidden') element.style.removeProperty('overflow');
    if (element.style.overflowY === 'hidden') element.style.removeProperty('overflow-y');
  }
};
const scrollObserver = new MutationObserver(unlockPageScroll);
scrollObserver.observe(document.documentElement,{attributes:true,attributeFilter:['style','class']});
scrollObserver.observe(document.body,{attributes:true,attributeFilter:['style','class']});
window.addEventListener('ultron:earth-location',unlockPageScroll);
unlockPageScroll();

// Interactive open-data globe. Not Google Earth; no Google API key required.
// Globe.gl / Three.js are loaded only when the geographic view is requested.
const host = document.querySelector('.jarvis-cc-visual');
const modeButton = document.querySelector('[data-visual="globe"]');
if (host && modeButton) {
  const shell = document.createElement('div');
  shell.className = 'jarvis-earth-shell';
  shell.hidden = true;
  shell.innerHTML = '<div class="jarvis-earth-globe" aria-label="Globo terrestre interativo"></div><div class="jarvis-earth-details" hidden><button type="button" class="jarvis-earth-close" aria-label="Fechar mapa">×</button><strong class="jarvis-earth-title">LOCALIZAÇÃO</strong><iframe title="Mapa detalhado" loading="lazy" referrerpolicy="no-referrer"></iframe><a target="_blank" rel="noopener noreferrer">Abrir mapa detalhado ↗</a></div><div class="jarvis-earth-hint">Arraste para girar · Role sobre o globo para aproximar · Clique para explorar</div>';
  host.append(shell);
  const globeHost = shell.querySelector('.jarvis-earth-globe');
  const details = shell.querySelector('.jarvis-earth-details');
  const title = shell.querySelector('.jarvis-earth-title');
  const frame = shell.querySelector('iframe');
  const link = shell.querySelector('a');
  let globe = null, loading = null, loadError = null;
  const normalize = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const script = src => new Promise((resolve,reject) => {
    const tag=document.createElement('script');tag.src=src;tag.onload=resolve;tag.onerror=reject;document.head.append(tag);
  });
  function openLocation(lat, lng, name = '') {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    const delta = 0.45;
    const bbox = [lng-delta,lat-delta,lng+delta,lat+delta].join(',');
    title.textContent = name || `LAT ${lat.toFixed(3)} · LON ${lng.toFixed(3)}`;
    frame.src = 'https://www.openstreetmap.org/export/embed.html?bbox=' + encodeURIComponent(bbox) + '&layer=mapnik&marker=' + encodeURIComponent(lat + ',' + lng);
    link.href = 'https://www.openstreetmap.org/?mlat=' + encodeURIComponent(lat) + '&mlon=' + encodeURIComponent(lng) + '#map=11/' + lat + '/' + lng;
    details.hidden = false;
    globe?.pointOfView({lat,lng,altitude:1.65},1100);
  }
  shell.querySelector('.jarvis-earth-close').addEventListener('click',()=>{details.hidden=true;frame.removeAttribute('src');});
  async function init() {
    if (globe) return true;
    if (loading) return loading;
    loading = (async () => {
      if (!window.Globe) await script('https://cdn.jsdelivr.net/npm/globe.gl@2.45.0/dist/globe.gl.min.js');
      if (typeof window.Globe !== 'function') throw new Error('Biblioteca de globo indisponível');
      globe = window.Globe()(globeHost)
        .globeImageUrl('https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg')
        .bumpImageUrl('https://unpkg.com/three-globe/example/img/earth-topology.png')
        .backgroundColor('rgba(0,0,0,0)')
        .showAtmosphere(true).atmosphereColor('#3b9bda').atmosphereAltitude(0.16)
        .onGlobeClick(({lat,lng}) => openLocation(lat,lng));
      globe.controls().enablePan = false;
      globe.controls().autoRotate = true;
      globe.controls().autoRotateSpeed = 0.35;
      globeHost.addEventListener('pointerdown',()=>{globe.controls().autoRotate=false;});
      const resize=()=>globe?.width(globeHost.clientWidth).height(globeHost.clientHeight);
      new ResizeObserver(resize).observe(globeHost);
      resize();
      loadError = null;
      return true;
    })();
    try { return await loading; } catch(e) {
      loadError = e;
      globeHost.textContent = 'Globo 3D indisponível. Mapa detalhado disponível abaixo.';
      console.warn('[JARVIS EARTH]',e);
      return false;
    } finally {loading=null;}
  }
  function showEarth() {
    shell.hidden=false;
    host.classList.add('jarvis-earth-active');
    modeButton.click();
    return init();
  }
  document.querySelector('[data-visual="ring"]')?.addEventListener('click',()=>{
    shell.hidden=true;host.classList.remove('jarvis-earth-active');details.hidden=true;frame.removeAttribute('src');
  });
  modeButton.addEventListener('click',()=>{shell.hidden=false;host.classList.add('jarvis-earth-active');init();});
  async function locate(query) {
    const ready = await showEarth();
    const place = String(query || '').trim();
    if (!place) {
      if (!ready) openLocation(0,0,'Mapa mundial (visualização alternativa)');
      return {ok: Boolean(ready), mode: ready ? 'globe' : 'map-fallback', error: loadError?.message || null};
    }
    const known = {china:[35.8617,104.1954],brasil:[-14.235,-51.9253],recife:[-8.0476,-34.877],japao:[36.2048,138.2529],estados_unidos:[39.8283,-98.5795],franca:[46.6034,1.8883],portugal:[39.3999,-8.2245]};
    const key=normalize(place).replace(/\s+/g,'_');
    if (known[key]) { openLocation(...known[key],place); return {ok:true, mode:ready?'globe':'map-fallback', place}; }
    try {
      // Geocoding is a public service; only query on explicit user command.
      const url='https://nominatim.openstreetmap.org/search?format=json&limit=1&q='+encodeURIComponent(place);
      const response=await fetch(url,{headers:{'Accept':'application/json'}});
      if(!response.ok) throw new Error('Busca geográfica indisponível');
      const results=await response.json();
      if(results[0]) { openLocation(Number(results[0].lat),Number(results[0].lon),results[0].display_name); return {ok:true,mode:ready?'globe':'map-fallback',place}; }
      else { title.textContent='Local não encontrado: '+place; details.hidden=false; return {ok:false,error:'local não encontrado'}; }
    } catch(error) { console.warn('[JARVIS EARTH] geocoding:',error); title.textContent='Busca indisponível: '+place; details.hidden=false; return {ok:false,error:error.message}; }
  }
  window.addEventListener('ultron:earth-location',e=>locate(e.detail?.place));
  window.ULTRON_EARTH={open:showEarth,locate};
}
