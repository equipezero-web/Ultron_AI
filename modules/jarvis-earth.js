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
  let globe = null, loading = null;
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
    if (globe) return;
    if (loading) return loading;
    loading = (async () => {
      await script('https://cdn.jsdelivr.net/npm/globe.gl@2.45.0/dist/globe.gl.min.js');
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
    })();
    try { await loading; } catch(e) {
      globeHost.textContent = 'Globo 3D indisponível. Verifique a conexão com a biblioteca externa.';
      console.warn('[JARVIS EARTH]',e);
    } finally {loading=null;}
  }
  function showEarth() {
    shell.hidden=false;
    host.classList.add('jarvis-earth-active');
    modeButton.click();
    init();
  }
  document.querySelector('[data-visual="ring"]')?.addEventListener('click',()=>{
    shell.hidden=true;host.classList.remove('jarvis-earth-active');details.hidden=true;frame.removeAttribute('src');
  });
  modeButton.addEventListener('click',()=>{shell.hidden=false;host.classList.add('jarvis-earth-active');init();});
  async function locate(query) {
    showEarth();
    const place = String(query || '').trim();
    if (!place) return;
    try {
      // Geocoding is a public service; only query on explicit user command.
      const url='https://nominatim.openstreetmap.org/search?format=json&limit=1&q='+encodeURIComponent(place);
      const response=await fetch(url,{headers:{'Accept':'application/json'}});
      if(!response.ok) throw new Error('Busca geográfica indisponível');
      const results=await response.json();
      if(results[0]) openLocation(Number(results[0].lat),Number(results[0].lon),results[0].display_name);
      else title.textContent='Local não encontrado: '+place;
    } catch(error) { console.warn('[JARVIS EARTH] geocoding:',error); }
  }
  window.addEventListener('ultron:earth-location',e=>locate(e.detail?.place));
  window.ULTRON_EARTH={open:showEarth,locate};
}
