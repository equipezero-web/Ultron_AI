// Wheel recovery: legacy global listeners may consume wheel events even while arrow scrolling works.
// Handle only the dashboard background; leave maps, inputs and scrollable panels alone.
document.addEventListener('wheel', (event) => {
  if (event.defaultPrevented || event.ctrlKey || event.target.closest('iframe,textarea,input,select,.jarvis-earth-globe,.jarvis-earth-explorer,#output-box,.screen-modal')) return;
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

// J.A.R.V.I.S Earth Explorer. Mapbox public token is configured locally by the operator.
// The sample token is intentionally NOT committed: GitHub secret-scanning blocks it.
const earthToggle = document.querySelector('[data-visual="globe"]');
const ringToggle = document.querySelector('[data-visual="ring"]');
const EARTH_HOME = { center: [-34.877, -8.0476], zoom: 2.2, pitch: 0, bearing: 0 };
const EARTH_CITIES = [
  ['Recife', -34.877, -8.0476], ['São Paulo', -46.6333, -23.5505],
  ['Nova York', -74.006, 40.7128], ['Paris', 2.3522, 48.8566],
  ['Tóquio', 139.6917, 35.6895]
];
if (earthToggle) {
  const shell = document.createElement('section');
  shell.id = 'jarvis-earth-explorer';
  shell.className = 'jarvis-earth-explorer';
  shell.hidden = true;
  shell.setAttribute('role', 'region');
  shell.setAttribute('aria-label', 'Explorador geográfico do JARVIS');
  shell.innerHTML = [
    '<div class="jarvis-earth-map" aria-label="Globo satélite 3D"></div>',
    '<header class="jarvis-earth-hud">',
    '<div class="jarvis-earth-brand"><strong>J.A.R.V.I.S // EARTH</strong><small>GLOBO 3D • SATÉLITE • EXPLORAÇÃO</small></div>',
    '<form class="jarvis-earth-search" role="search"><input type="search" aria-label="Pesquisar local" placeholder="Cidade, país ou endereço" maxlength="150" required><button type="submit">Localizar</button></form>',
    '<div class="jarvis-earth-toolbar"><button type="button" data-earth="home">◎ Global</button><button type="button" data-earth="zoom-in">＋</button><button type="button" data-earth="zoom-out">－</button><button type="button" data-earth="rotate" aria-pressed="false">⟳ Girar</button><button type="button" data-earth="token">⚙ Token</button><button type="button" data-earth="close">✕ Sair</button></div>',
    '</header>',
    '<div class="jarvis-earth-notice" role="status" aria-live="polite"></div>',
    '<form class="jarvis-earth-token" hidden><h2>Ativar mapa por satélite</h2><p>Informe seu token público Mapbox (iniciado em pk.). Ele ficará somente no armazenamento deste navegador, não no GitHub.</p><input type="password" aria-label="Token público Mapbox" placeholder="pk...." autocomplete="off" required><button type="submit">Ativar satélite</button><button type="button" data-earth="basic">Usar o globo básico sem token</button></form>',
    '<aside class="jarvis-earth-side" aria-hidden="true"><div class="jarvis-earth-side-head"><div><small>LOCAL SELECIONADO</small><h2 class="jarvis-earth-place">Localização</h2></div><button type="button" data-earth="reset" aria-label="Fechar detalhes e retornar ao globo">✕</button></div>',
    '<div class="jarvis-earth-coordinates"><span class="jarvis-earth-lat">LAT —</span><span class="jarvis-earth-lng">LON —</span><span class="jarvis-earth-zoom">ZOOM —</span></div><h3>FOTOS PRÓXIMAS</h3><p class="jarvis-earth-photo-state" role="status"></p><div class="jarvis-earth-gallery"></div>',
    '<p class="jarvis-earth-credit">Fotos georreferenciadas: Wikimedia Commons (autor e licença disponíveis ao abrir cada imagem). Mapa: © Mapbox.</p>',
    '<button type="button" class="jarvis-earth-reset" data-earth="reset">MINIMIZAR E RETORNAR À VISÃO GLOBAL</button></aside>'
  ].join('');
  const visualHost = document.querySelector('.jarvis-cc-visual');
  (visualHost || document.body).append(shell);
  const mapHost = shell.querySelector('.jarvis-earth-map');
  const panel = shell.querySelector('.jarvis-earth-side');
  const notice = shell.querySelector('.jarvis-earth-notice');
  const tokenForm = shell.querySelector('.jarvis-earth-token');
  const searchForm = shell.querySelector('.jarvis-earth-search');
  const gallery = shell.querySelector('.jarvis-earth-gallery');
  const photoState = shell.querySelector('.jarvis-earth-photo-state');
  const rotateButton = shell.querySelector('[data-earth="rotate"]');
  const $ = selector => shell.querySelector(selector);
  let map = null, pendingInit = null, selectedMarker = null;
  let basicGlobe = null, basicHost = null, basicFrame = null, basicLoading = null, currentMode = 'not-opened', lastError = null;
  let requestId = 0, requestController = null, spinId = 0, spinning = false, lastSpinAt = 0;
  let pendingQuery = '', inMemoryToken = '', basicPreference = false;

  function publicToken() {
    try { return localStorage.getItem('jarvis_mapbox_pk_v1') || inMemoryToken; }
    catch { return inMemoryToken; }
  }
  function saveToken(token) {
    inMemoryToken = token;
    try { localStorage.setItem('jarvis_mapbox_pk_v1', token); } catch {}
  }
  function setStatus(message, failed = false) {
    notice.textContent = message;
    notice.dataset.failed = failed ? 'true' : 'false';
  }
  function loadLibrary() {
    if (window.mapboxgl?.Map) return Promise.resolve(window.mapboxgl);
    if (!document.querySelector('link[data-jarvis-mapbox]')) {
      const css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = 'https://api.mapbox.com/mapbox-gl-js/v3.0.1/mapbox-gl.css';
      css.dataset.jarvisMapbox = 'true';
      document.head.append(css);
    }
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://api.mapbox.com/mapbox-gl-js/v3.0.1/mapbox-gl.js';
      script.onload = () => window.mapboxgl?.Map ? resolve(window.mapboxgl) : reject(new Error('Mapbox inválido'));
      script.onerror = () => reject(new Error('Falha ao carregar Mapbox GL JS'));
      document.head.append(script);
    });
  }

  async function loadBasicGlobe() {
    if (basicGlobe || basicFrame) {
      if (basicHost) basicHost.hidden = false;
      basicGlobe?.resumeAnimation?.();
      currentMode = basicGlobe ? 'globe-basic' : 'map-2d';
      return { ok: true, mode: currentMode };
    }
    if (basicLoading) return basicLoading;
    basicLoading = (async () => {
      basicHost = document.createElement('div');
      basicHost.className = 'jarvis-earth-basic';
      mapHost.append(basicHost);
      try {
        if (!window.Globe) {
          await new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/globe.gl@2.45.0/dist/globe.gl.min.js';
            script.onload = resolve;
            script.onerror = () => reject(new Error('Falha ao carregar Globe.gl'));
            document.head.append(script);
          });
        }
        if (typeof window.Globe !== 'function') throw new Error('Globe.gl não disponível');
        basicGlobe = window.Globe()(basicHost)
          .globeImageUrl('https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg')
          .bumpImageUrl('https://unpkg.com/three-globe/example/img/earth-topology.png')
          .backgroundColor('rgba(0,0,0,0)')
          .showAtmosphere(true).atmosphereColor('#3b9bda').atmosphereAltitude(0.16)
          .onGlobeClick(({lat,lng}) => select(lat,lng,'',10));
        basicGlobe.controls().autoRotate = false;
        basicGlobe.controls().enablePan = false;
        basicGlobe.controls().enableZoom = true;
        basicGlobe.pointOfView({lat:-8.0476,lng:-34.877,altitude:2.5},700);
        const resize = () => basicGlobe?.width(basicHost.clientWidth).height(basicHost.clientHeight);
        if (typeof ResizeObserver !== 'undefined') new ResizeObserver(resize).observe(basicHost);
        resize();
        currentMode = 'globe-basic';
      } catch (error) {
        console.warn('[EARTH] Globo básico não disponível:', error);
        basicHost.replaceChildren();
        basicFrame = document.createElement('iframe');
        basicFrame.title = 'Mapa 2D alternativo do OpenStreetMap';
        basicFrame.referrerPolicy = 'no-referrer';
        basicFrame.src = 'https://www.openstreetmap.org/export/embed.html?bbox=-170%2C-70%2C170%2C70&layer=mapnik';
        basicHost.append(basicFrame);
        currentMode = 'map-2d';
      }
      return { ok: true, mode: currentMode };
    })();
    try { return await basicLoading; } finally { basicLoading = null; }
  }

  function stopSpin() {
    spinning = false;
    rotateButton.setAttribute('aria-pressed', 'false');
    if (spinId) cancelAnimationFrame(spinId);
    spinId = 0;
    lastSpinAt = 0;
  }
  function spin(time) {
    if (!spinning || !map || shell.hidden) return stopSpin();
    const dt = Math.min(80, time - (lastSpinAt || time));
    lastSpinAt = time;
    if (map.getZoom() < 5 && !map.isMoving()) {
      const c = map.getCenter();
      map.setCenter([c.lng + dt * 0.0028, c.lat]);
    }
    spinId = requestAnimationFrame(spin);
  }
  function reset() {
    ++requestId;
    requestController?.abort();
    panel.classList.remove('is-open');
    panel.setAttribute('aria-hidden', 'true');
    selectedMarker?.remove();
    selectedMarker = null;
    stopSpin();
    map?.flyTo({ ...EARTH_HOME, duration: 1700, essential: true });
    basicGlobe?.pointOfView({lat: -8.0476, lng: -34.877, altitude: 2.5}, 1700);
    if (basicFrame) basicFrame.src = 'https://www.openstreetmap.org/export/embed.html?bbox=-170%2C-70%2C170%2C70&layer=mapnik';
    setStatus('Visão global restaurada. Arraste, use o zoom ou busque um lugar.');
  }
  function close() {
    ++requestId;
    requestController?.abort();
    stopSpin();
    shell.hidden = true;
    visualHost?.classList.remove('jarvis-earth-active');
    panel.classList.remove('is-open');
    panel.setAttribute('aria-hidden', 'true');
    if (ringToggle && ringToggle.getAttribute('aria-pressed') !== 'true') ringToggle.click();
  }
  async function init() {
    if (pendingInit) return pendingInit;
    if (map) return { ok: true, mode: 'mapbox-satellite' };
    const token = publicToken();
    if (!token || !/^pk\.[A-Za-z0-9._-]{20,}$/.test(token)) {
      tokenForm.hidden = basicPreference;
      const basic = await loadBasicGlobe();
      if (!basicPreference) tokenForm.querySelector('input')?.focus();
      setStatus(basic.mode === 'globe-basic' ? 'Globo básico aberto. Configure o token para visualizar satélite e ruas.' : 'Mapa alternativo aberto. Configure o token Mapbox para a experiência de satélite.', false);
      return { ...basic, requiresToken: true };
    }
    tokenForm.hidden = true;
    if (basicHost) basicHost.hidden = true;
    basicGlobe?.pauseAnimation?.();
    pendingInit = (async () => {
      setStatus('Carregando o globo satélite…');
      const gl = await loadLibrary();
      if (!gl.supported()) throw new Error('WebGL não é suportado neste navegador');
      gl.accessToken = token;
      map = new gl.Map({
        container: mapHost, style: 'mapbox://styles/mapbox/satellite-streets-v12',
        ...EARTH_HOME, projection: 'globe', antialias: true, maxZoom: 19
      });
      map.on('style.load', () => {
        try {
          map.setFog({ color: 'rgba(255,255,255,0.5)', 'high-color': 'rgba(36,92,223,0.7)', 'space-color': 'rgb(11,15,25)', 'horizon-blend': 0.1, 'star-intensity': 0.8 });
          if (!map.getSource('jarvis-dem')) map.addSource('jarvis-dem', { type: 'raster-dem', url: 'mapbox://mapbox.mapbox-terrain-dem-v1', tileSize: 512, maxzoom: 14 });
          map.setTerrain({ source: 'jarvis-dem', exaggeration: 1.1 });
        } catch (error) { console.warn('[EARTH] Terreno:', error); }
      });
      map.on('click', e => select(e.lngLat.lat, e.lngLat.lng, '', Math.min(16, Math.max(map.getZoom() + 1.5, 8))));
      map.on('dragstart', stopSpin);
      map.on('zoomstart', stopSpin);
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Tempo limite ao carregar o mapa')), 20000);
        map.once('load', () => { clearTimeout(timer); resolve(); });
        map.once('error', e => { clearTimeout(timer); reject(e.error || new Error('Erro no mapa')); });
      });
      for (const [name, longitude, latitude] of EARTH_CITIES) {
        const marker = new gl.Marker({ color: '#38bdf8', scale: 0.65 }).setLngLat([longitude, latitude]).addTo(map);
        marker.getElement().title = 'Explorar ' + name;
        marker.getElement().addEventListener('click', e => {
          e.stopPropagation();
          select(latitude, longitude, name, 11);
        });
      }
      currentMode = 'mapbox-satellite';
      lastError = null;
      setStatus('Mapa pronto: arraste, aproxime, clique em uma cidade ou pesquise um local.');
      return { ok: true, mode: 'mapbox-satellite' };
    })();
    try { return await pendingInit; }
    catch (error) {
      console.warn('[EARTH] Inicialização:', error);
      lastError = error?.message || 'Falha desconhecida';
      map?.remove();
      map = null;
      const basic = await loadBasicGlobe();
      setStatus('Satélite Mapbox indisponível (' + lastError + '). Exibindo ' + (basic.mode === 'globe-basic' ? 'globo básico' : 'mapa alternativo') + '.', true);
      return { ...basic, satelliteError: lastError };
    } finally { pendingInit = null; }
  }
  function open() {
    shell.hidden = false;
    visualHost?.classList.add('jarvis-earth-active');
    window.JARVIS_COMMAND_CENTER?.setVisualMode?.('globe');
    requestAnimationFrame(() => {
      map?.resize();
      if (basicGlobe && basicHost) basicGlobe.width(basicHost.clientWidth).height(basicHost.clientHeight);
    });
    return init();
  }
  function textFromHtml(input) {
    return new DOMParser().parseFromString(String(input || ''), 'text/html').body.textContent?.trim() || '';
  }
  async function fetchPhotos(lat, lng, current, signal) {
    gallery.replaceChildren();
    photoState.textContent = 'Buscando fotos georreferenciadas próximas…';
    const url = new URL('https://commons.wikimedia.org/w/api.php');
    const parameters = {
      action: 'query', generator: 'geosearch', ggscoord: lat.toFixed(5) + '|' + lng.toFixed(5),
      ggsradius: '10000', ggslimit: '12', ggsnamespace: '6',
      prop: 'imageinfo', iiprop: 'url|extmetadata', iiurlwidth: '480', format: 'json', origin: '*'
    };
    for (const [key, value] of Object.entries(parameters)) url.searchParams.set(key, value);
    try {
      const response = await fetch(url.href, { signal });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const json = await response.json();
      if (current !== requestId) return;
      const photos = Object.values(json.query?.pages || {})
        .filter(page => /\.(jpe?g|png|webp)$/i.test(page.title || '') && page.imageinfo?.[0]?.thumburl)
        .slice(0, 8);
      photoState.textContent = photos.length ? 'Fotos encontradas perto deste ponto:' : 'Não há fotos georreferenciadas disponíveis nas proximidades.';
      for (const page of photos) {
        const info = page.imageinfo[0];
        const link = document.createElement('a');
        link.className = 'jarvis-earth-photo';
        link.href = info.descriptionurl || 'https://commons.wikimedia.org/wiki/' + encodeURIComponent(page.title.replace(/ /g, '_'));
        link.target = '_blank'; link.rel = 'noopener noreferrer';
        const img = document.createElement('img');
        img.src = info.thumburl; img.loading = 'lazy';
        img.alt = (page.title || 'Foto da região').replace(/^File:/i, '').replace(/_/g, ' ');
        const caption = document.createElement('span');
        const name = document.createElement('strong');
        name.textContent = img.alt.slice(0, 80);
        const credits = document.createElement('small');
        credits.textContent = [textFromHtml(info.extmetadata?.Artist?.value).slice(0, 65), textFromHtml(info.extmetadata?.LicenseShortName?.value).slice(0, 35)].filter(Boolean).join(' · ') || 'Wikimedia Commons · abrir créditos';
        caption.append(name, credits); link.append(img, caption); gallery.append(link);
      }
    } catch (error) {
      if (signal.aborted || current !== requestId) return;
      console.warn('[EARTH] Fotos:', error);
      photoState.textContent = 'Não foi possível carregar fotos dessa região.';
    }
  }
  async function reverseName(lat, lng, current, signal) {
    try {
      const url = new URL('https://api.mapbox.com/search/geocode/v6/reverse');
      for (const [k,v] of Object.entries({ longitude: lng, latitude: lat, language: 'pt', access_token: publicToken() })) url.searchParams.set(k, String(v));
      const response = await fetch(url.href, { signal });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const json = await response.json();
      if (current !== requestId) return;
      const place = json.features?.[0]?.properties;
      $('.jarvis-earth-place').textContent = place?.name_preferred || place?.name || 'Coordenadas selecionadas';
    } catch (error) { if (!signal.aborted) console.warn('[EARTH] Geocoding:', error); }
  }
  function select(lat, lng, name = '', zoom = 10) {
    if ((!map && !basicGlobe && !basicFrame) || !Number.isFinite(lat) || !Number.isFinite(lng)) return { ok: false, error: 'Visualização ou coordenadas indisponíveis' };
    stopSpin();
    ++requestId; requestController?.abort();
    requestController = new AbortController();
    const current = requestId;
    panel.classList.add('is-open'); panel.setAttribute('aria-hidden', 'false');
    $('.jarvis-earth-place').textContent = name || 'Identificando local…';
    $('.jarvis-earth-lat').textContent = 'LAT ' + lat.toFixed(5);
    $('.jarvis-earth-lng').textContent = 'LON ' + lng.toFixed(5);
    $('.jarvis-earth-zoom').textContent = 'ZOOM ' + Number(zoom).toFixed(1);
    selectedMarker?.remove();
    if (map) {
      selectedMarker = new window.mapboxgl.Marker({ color: '#facc15' }).setLngLat([lng, lat]).addTo(map);
      map.flyTo({ center: [lng, lat], zoom: Math.min(19, Math.max(2, zoom)), pitch: zoom >= 9 ? 50 : 0, duration: 1800, essential: true });
    } else if (basicGlobe) {
      basicGlobe.pointOfView({lat,lng,altitude:zoom>=9 ? 0.75 : 1.55},1600);
    } else if (basicFrame) {
      const d = Math.max(0.02, zoom>=9 ? 0.5 : 4);
      basicFrame.src = 'https://www.openstreetmap.org/export/embed.html?bbox=' + encodeURIComponent([lng-d,lat-d,lng+d,lat+d].join(',')) + '&layer=mapnik&marker=' + encodeURIComponent(lat + ',' + lng);
    }
    setStatus('Explorando ' + (name || 'as coordenadas selecionadas') + '.');
    if (!name) reverseName(lat, lng, current, requestController.signal);
    fetchPhotos(lat, lng, current, requestController.signal);
    return { ok: true, mode: currentMode, place: name || null, lat, lng };
  }
  async function locate(query) {
    pendingQuery = String(query || '').trim();
    const ready = await open();
    if (!ready.ok) return ready;
    const place = pendingQuery;
    pendingQuery = '';
    if (!place) return ready;
    const quick = {
      brasil: [-51.9253, -14.235, 4], china: [104.1954, 35.8617, 4],
      recife: [-34.877, -8.0476, 11], japao: [138.2529, 36.2048, 5],
      portugal: [-8.2245, 39.3999, 6], 'estados unidos': [-98.5795, 39.8283, 4]
    };
    const key = place.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    if (quick[key]) { const [lng, lat, zoom] = quick[key]; return select(lat, lng, place, zoom); }
    try {
      setStatus('Localizando ' + place + '…');
      const url = new URL('https://api.mapbox.com/search/geocode/v6/forward');
      for (const [k,v] of Object.entries({ q: place, language: 'pt', limit: 1, access_token: publicToken() })) url.searchParams.set(k, String(v));
      const response = await fetch(url.href);
      if (!response.ok) throw new Error('Busca HTTP ' + response.status);
      const json = await response.json();
      const feature = json.features?.[0];
      const coords = feature?.properties?.coordinates;
      const lng = Number(coords?.longitude ?? feature?.geometry?.coordinates?.[0]);
      const lat = Number(coords?.latitude ?? feature?.geometry?.coordinates?.[1]);
      if (!feature || !Number.isFinite(lat) || !Number.isFinite(lng)) throw new Error('Local não encontrado');
      const type = feature.properties?.feature_type;
      return select(lat, lng, feature.properties?.name || place, type === 'country' ? 4 : type === 'region' ? 7 : 11);
    } catch (error) {
      setStatus('Não foi possível localizar ' + place + ': ' + error.message, true);
      return { ok: false, error: error.message };
    }
  }
  function navigate(action) {
    if (action === 'close') return close();
    if (action === 'basic') { basicPreference = true; tokenForm.hidden = true; setStatus('Globo básico aberto. Use ⚙ Token para ativar imagens de satélite.'); return; }
    if (action === 'token') { basicPreference = false; tokenForm.hidden = false; tokenForm.querySelector('input').focus(); return; }
    if (action === 'home' || action === 'reset') return reset();
    if (!map && !basicGlobe) return;
    if (!map && basicGlobe) {
      if (action === 'rotate') {
        const controls = basicGlobe.controls();
        controls.autoRotate = !controls.autoRotate;
        rotateButton.setAttribute('aria-pressed', String(controls.autoRotate));
      }
      if (action === 'zoom-in' || action === 'zoom-out') {
        const current = basicGlobe.pointOfView();
        basicGlobe.pointOfView({ ...current, altitude: Math.max(0.15, Math.min(5, current.altitude * (action === 'zoom-in' ? 0.65 : 1.5))) }, 500);
      }
      return;
    }
    if (action === 'zoom-in' || action === 'zoom-out') {
      stopSpin();
      return map.easeTo({ zoom: Math.min(19, Math.max(0, map.getZoom() + (action === 'zoom-in' ? 1 : -1))), duration: 450 });
    }
    if (action === 'rotate') {
      if (spinning) return stopSpin();
      const start = () => { spinning = true; rotateButton.setAttribute('aria-pressed', 'true'); spinId = requestAnimationFrame(spin); };
      if (map.getZoom() >= 5) { reset(); map.once('moveend', start); }
      else start();
    }
  }
  // Bind Earth controls at the button itself so other HUD listeners cannot swallow clicks.
  shell.querySelectorAll('[data-earth]').forEach(button => {
    button.addEventListener('click', event => {
      event.stopPropagation();
      navigate(button.dataset.earth);
    });
  });
  searchForm.addEventListener('submit', event => {
    event.preventDefault();
    const q = searchForm.querySelector('input').value.trim();
    if (q) locate(q);
  });
  tokenForm.addEventListener('submit', event => {
    event.preventDefault();
    const token = tokenForm.querySelector('input').value.trim();
    if (!/^pk\.[A-Za-z0-9._-]{20,}$/.test(token)) return setStatus('Informe um token público válido, começando com pk.', true);
    saveToken(token);
    basicPreference = false;
    if (map) { map.remove(); map = null; }
    const search = pendingQuery;
    pendingQuery = '';
    if (search) locate(search); else open();
  });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && !shell.hidden) close(); });
  earthToggle.addEventListener('click', () => { open(); });
  ringToggle?.addEventListener('click', () => close());
  if (visualHost && typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(() => {
      if (shell.hidden) return;
      map?.resize();
      if (basicGlobe && basicHost) basicGlobe.width(basicHost.clientWidth).height(basicHost.clientHeight);
    }).observe(visualHost);
  }
  window.addEventListener('ultron:earth-location', event => { locate(event.detail?.place); });
  window.ULTRON_EARTH = {
    open, locate, navigate,
    get state() { return { available: true, ready: Boolean((map?.loaded?.() || false) || basicGlobe || basicFrame), visible: !shell.hidden, mode: currentMode, tokenConfigured: Boolean(publicToken()), needsToken: !publicToken(), lastError }; }
  };
}
