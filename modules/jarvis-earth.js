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

// Real Earth sphere replaces the Command Center's Neural Ring in the SAME visual slot.
// No explorer, satellite popup, background disc, secondary search or extra layout.
const earthVisual = document.querySelector('.jarvis-cc-visual');
const earthCommandPanel = document.querySelector('.jarvis-command-center-ui');
const earthButton = document.querySelector('[data-visual="globe"]');
const ringButton = document.querySelector('[data-visual="ring"]');

if (earthVisual) {
  const host = document.createElement('div');
  host.id = 'jarvis-earth-globe';
  host.className = 'jarvis-earth-globe';
  host.setAttribute('aria-label', 'Globo terrestre tridimensional integrado ao Neural Ring');
  host.hidden = true;
  const dismiss = document.createElement('button');
  dismiss.type = 'button';
  dismiss.className = 'jarvis-earth-selection-close';
  dismiss.setAttribute('aria-label', 'Desmarcar ponto selecionado no globo');
  dismiss.textContent = '×';
  dismiss.hidden = true;
  host.append(dismiss);
  const mapLayer = document.createElement('div');
  mapLayer.className = 'jarvis-earth-map-layer';
  mapLayer.setAttribute('aria-label', 'Mapa detalhado de países, estados, cidades e ruas');
  host.prepend(mapLayer);
  earthVisual.append(host);

  const home = { lat: -8.0476, lng: -34.877, altitude: 2.5 };
  const known = {
    china: [104.1954, 35.8617, 4], brasil: [-51.9253, -14.235, 4],
    recife: [-34.877, -8.0476, 11], japao: [138.2529, 36.2048, 5],
    portugal: [-8.2245, 39.3999, 6], 'estados unidos': [-98.5795, 39.8283, 4],
    franca: [2.2137, 46.2276, 6], londres: [-0.1276, 51.5072, 11],
    'sao paulo': [-46.6333, -23.5505, 11]
  };
  let globe = null;
  let streetMap = null;
  let streetLoading = null;
  let mapboxLibraryLoading = null;
  let streetMode = false;
  let mapboxFailureAt = 0;
  let selectedMapMarker = null;
  let detailToken = '';
  let globeLoading = null;
  let libraryLoading = null;
  let visible = false;
  let lastError = null;
  let selectedPlace = null;
  let dragState = null;
  let lastDragEndedAt = 0;
  let plannedAltitude = null;
  let requestSequence = 0;
  const DETAIL_ENTRY_ALTITUDE = 0.6;
  const DETAIL_EXIT_ZOOM = 4.4;
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  const normalizePlace = value => String(value || '').normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  const altitudeForZoom = zoom => zoom >= 10 ? 0.36 : zoom >= 8 ? 0.65 : zoom >= 6 ? 1.0 : zoom >= 4 ? 1.7 : 2.35;
  const terminal = message => {
    const output = document.getElementById('output-box');
    if (!output) return;
    const line = document.createElement('p');
    line.textContent = '> EARTH // ' + message;
    output.append(line);
    output.scrollTop = output.scrollHeight;
  };
  function setExpanded(altitude) {
    earthCommandPanel?.classList.toggle('jarvis-earth-expanded', visible && altitude < 0.95);
  }
  function syncSize() {
    if (visible && streetMode) streetMap?.resize?.();
    if (!globe || !visible) return;
    const width = Math.round(host.clientWidth || earthVisual.clientWidth);
    const height = Math.round(host.clientHeight || earthVisual.clientHeight);
    if (width > 0 && height > 0) globe.width(width).height(height);
  }
  function clearSelection() {
    dismiss.hidden = true;
    selectedPlace = null;
    globe?.pointsData([]);
    selectedMapMarker?.remove?.();
    selectedMapMarker = null;
  }
  dismiss.addEventListener('click', event => {
    event.stopPropagation();
    clearSelection();
  });

  function ensureLibrary() {
    if (typeof window.Globe === 'function') return Promise.resolve();
    if (libraryLoading) return libraryLoading;
    libraryLoading = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/globe.gl@2.45.0/dist/globe.gl.min.js';
      script.onload = () => typeof window.Globe === 'function'
        ? resolve()
        : reject(new Error('Globe.gl não carregou corretamente'));
      script.onerror = () => reject(new Error('Falha ao carregar a biblioteca do globo'));
      document.head.append(script);
    }).catch(error => { libraryLoading = null; throw error; });
    return libraryLoading;
  }
  // Public Mapbox pk tokens belong to the browser, never in version-controlled source.
  // A #mapbox_pk= fragment provisions this browser once without sending it to the server.
  function publicMapboxToken() {
    try { return localStorage.getItem('jarvis_mapbox_pk_v1') || ''; }
    catch { return ''; }
  }
  function installPublicMapboxToken() {
    try {
      const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
      const token = params.get('mapbox_pk');
      if (!token || !/^pk\.[A-Za-z0-9._-]{20,}$/.test(token)) return false;
      localStorage.setItem('jarvis_mapbox_pk_v1', token);
      params.delete('mapbox_pk');
      const rest = params.toString();
      window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search + (rest ? '#' + rest : ''));
      return true;
    } catch (error) {
      console.warn('[EARTH] Mapbox token import unavailable:', error);
      return false;
    }
  }
  const tokenInstalledFromLink = installPublicMapboxToken();
  const hasMapboxToken = () => /^pk\.[A-Za-z0-9._-]{20,}$/.test(publicMapboxToken());
  const mapZoomFromAltitude = altitude =>
    clamp(5.2 + Math.log2(DETAIL_ENTRY_ALTITUDE / Math.max(0.01, altitude)) * 1.55, 5.2, 19);
  const altitudeFromMapZoom = zoom =>
    clamp(DETAIL_ENTRY_ALTITUDE * Math.pow(2, (5.2 - zoom) / 1.55), 0.04, 5);

  function ensureMapboxLibrary() {
    if (window.mapboxgl?.Map) return Promise.resolve(window.mapboxgl);
    if (mapboxLibraryLoading) return mapboxLibraryLoading;
    const version = '3.30.0';
    mapboxLibraryLoading = new Promise((resolve, reject) => {
      if (!document.querySelector('link[data-jarvis-mapbox]')) {
        const stylesheet = document.createElement('link');
        stylesheet.rel = 'stylesheet';
        stylesheet.dataset.jarvisMapbox = 'true';
        stylesheet.href = 'https://api.mapbox.com/mapbox-gl-js/v' + version + '/mapbox-gl.css';
        document.head.append(stylesheet);
      }
      const script = document.createElement('script');
      script.src = 'https://api.mapbox.com/mapbox-gl-js/v' + version + '/mapbox-gl.js';
      script.onload = () => window.mapboxgl?.Map
        ? resolve(window.mapboxgl)
        : reject(new Error('Mapbox GL JS indisponível'));
      script.onerror = () => reject(new Error('Não foi possível carregar Mapbox GL JS'));
      document.head.append(script);
    }).catch(error => { mapboxLibraryLoading = null; throw error; });
    return mapboxLibraryLoading;
  }

  function showGlobeFromMap(destination = null) {
    if (!streetMode) return;
    const center = streetMap?.getCenter?.();
    const zoom = streetMap?.getZoom?.() ?? 5;
    const view = destination || (center ? {
      lat:center.lat, lng:center.lng,
      altitude:Math.max(1.2, altitudeFromMapZoom(zoom))
    } : home);
    streetMode = false;
    host.classList.remove('jarvis-earth-map-active');
    plannedAltitude = view.altitude;
    setExpanded(view.altitude);
    if (globe) globe.pointOfView(view, destination ? 1500 : 0);
    requestAnimationFrame(syncSize);
  }

  async function enterStreetDetails(lat, lng, zoom, smooth = true) {
    if (!visible || !hasMapboxToken()) return false;
    if (Date.now() - mapboxFailureAt < 25000) return false;
    if (!streetMap) {
      if (!streetLoading) {
        streetLoading = (async () => {
          const gl = await ensureMapboxLibrary();
          if (typeof gl.supported === 'function' && !gl.supported()) throw new Error('Mapbox precisa de WebGL');
          detailToken = publicMapboxToken();
          gl.accessToken = detailToken;
          const point = globe?.pointOfView?.() || home;
          const map = new gl.Map({
            container: mapLayer,
            style: 'mapbox://styles/mapbox/satellite-streets-v12',
            projection: 'globe',
            center: [point.lng, point.lat],
            zoom: Math.max(5, Math.min(zoom, 19)), maxZoom: 20,
            bearing: 0, pitch: 0,
            dragPan: true, dragRotate: false,
            scrollZoom: true, boxZoom: false, doubleClickZoom: true,
            touchZoomRotate: true, keyboard: false,
            cooperativeGestures: false, attributionControl: true, antialias: true
          });
          streetMap = map;
          map.on('click', event => {
            if (!streetMode) return;
            clearSelection();
            const lat = event.lngLat.lat, lng = event.lngLat.lng;
            selectedPlace = { lat, lng, name: '' };
            dismiss.hidden = false;
            if (gl.Marker) selectedMapMarker = new gl.Marker({color:'#ffce68',scale:0.55}).setLngLat([lng,lat]).addTo(map);
          });
          map.on('zoomend', () => {
            if (streetMode && map.getZoom() <= DETAIL_EXIT_ZOOM) showGlobeFromMap();
            else if (streetMode) setExpanded(0.4);
          });
          map.on('moveend', () => {
            if (!streetMode || !globe) return;
            const center = map.getCenter();
            if (center) globe.pointOfView({
              lat:center.lat, lng:center.lng,
              altitude: altitudeFromMapZoom(map.getZoom())
            },0);
          });
          await new Promise((resolve,reject) => {
            let ended=false;
            const finish = (error) => {
              if (ended) return; ended=true; clearTimeout(timer);
              if (error) reject(error); else resolve();
            };
            const timer=setTimeout(() => finish(new Error('Tempo limite do Mapbox')),16000);
            map.once('load',()=>finish());
            map.once('error',event => {
              if (!map.loaded?.()) finish(event.error || new Error('Erro de autenticação/mapa Mapbox'));
            });
          });
          return map;
        })().catch(error => {
          streetMap?.remove?.();
          streetMap = null;
          mapboxFailureAt = Date.now();
          lastError = error?.message || 'Mapa detalhado indisponível';
          terminal('Detalhes do Mapbox indisponíveis; globo 3D continua ativo. ' + lastError);
          return null;
        }).finally(() => { streetLoading = null; });
      }
      await streetLoading;
    }
    if (!streetMap || !visible) return false;
    streetMode = true;
    host.classList.add('jarvis-earth-map-active');
    setExpanded(0.4);
    requestAnimationFrame(() => streetMap?.resize?.());
    const destination = {center:[lng,lat], zoom:Math.max(5.1,Math.min(zoom,20)), pitch:0, bearing:0};
    if (smooth) streetMap.flyTo({...destination,essential:true,duration:1400});
    else streetMap.jumpTo(destination);
    return true;
  }

  // Globe.gl is the low-zoom earth sphere; switch to Mapbox tiles at close zoom,
  // without creating a modal, second page or secondary search bar.
  function prepareStreetDetails(point, zoom, smooth) {
    if (!hasMapboxToken()) return;
    void enterStreetDetails(point.lat, point.lng, zoom, smooth);
  }

  function focus(lat, lng, zoom = 5, clicked = false, name = '') {
    if (!globe || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      return { ok: false, error: 'Globo ou coordenadas indisponíveis' };
    }
    const altitude = altitudeForZoom(zoom);
    const controls = globe.controls();
    controls.autoRotate = false;
    clearSelection();
    const coordinate = { lat: clamp(lat, -85, 85), lng, altitude };
    if (clicked) {
      selectedPlace = { lat: coordinate.lat, lng, name };
      globe.pointsData([{ lat: coordinate.lat, lng }]);
      dismiss.hidden = false;
    }
    plannedAltitude = altitude;
    setExpanded(altitude);
    requestAnimationFrame(syncSize);
    globe.pointOfView(coordinate, 2400);
    if (zoom >= 7 && hasMapboxToken()) prepareStreetDetails(coordinate, zoom, true);
    else if (streetMode) showGlobeFromMap(coordinate);
    return { ok: true, mode: 'globe-3d', place: name || null, lat: coordinate.lat, lng, zoom };
  }
  async function init() {
    if (globe) return { ok: true, mode: 'globe-3d' };
    if (globeLoading) return globeLoading;
    globeLoading = (async () => {
      await ensureLibrary();
      if (!visible) return { ok: false, error: 'Globo fechado' };
      const canvasHost = document.createElement('div');
      canvasHost.className = 'jarvis-earth-renderer';
      host.prepend(canvasHost);
      try {
        globe = window.Globe()(canvasHost)
          .globeImageUrl('https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg')
          .bumpImageUrl('https://unpkg.com/three-globe/example/img/earth-topology.png')
          .backgroundColor('rgba(0,0,0,0)')
          .showAtmosphere(false)
          .pointsData([])
          .pointColor(() => '#ffce68')
          .pointRadius(0.28)
          .pointAltitude(0.015)
          .onGlobeClick(({ lat, lng }) => {
            if (Date.now() - lastDragEndedAt < 250) return; // A drag is not a location click.
            const result = focus(lat, lng, 10, true);
            if (result.ok) terminal('Ponto selecionado: ' + lat.toFixed(4) + ', ' + lng.toFixed(4) + '.');
          });
        const controls = globe.controls();
        controls.autoRotate = false;
        controls.autoRotateSpeed = 0;
        controls.enableDamping = false;
        controls.enablePan = false;
        controls.enableZoom = false; // Wheel is routed explicitly to zoom, never rotation.
        controls.enableRotate = false; // Mouse hover cannot rotate the globe.
        // Globe.gl's OrbitControls stays disabled for rotation. Drive the camera
        // ourselves only while the primary button is held, so a hover or mouseup
        // can never leave OrbitControls stuck in the rotate state.
        const startDrag = event => {
          if (!visible || streetMode || event.target.closest?.('.jarvis-earth-selection-close')) return;
          if (event.pointerType === 'mouse' && event.button !== 0) return;
          if (event.button !== undefined && event.button !== 0) return;
          plannedAltitude = null;
          controls.autoRotate = false;
          controls.enableRotate = false;
          dragState = {
            pointerId:event.pointerId ?? null,
            x:event.clientX, y:event.clientY,
            view:{...(globe.pointOfView() || home)},
            moved:false
          };
        };
        const stopDrag = () => {
          if (dragState?.moved) lastDragEndedAt = Date.now();
          dragState = null;
          controls.enableRotate = false;
        };
        const moveDrag = event => {
          if (!dragState || !visible || streetMode) return;
          if (event.pointerType === 'mouse' && !(event.buttons & 1)) return stopDrag();
          if (dragState.pointerId != null && event.pointerId != null && event.pointerId !== dragState.pointerId) return;
          const dx = event.clientX - dragState.x;
          const dy = event.clientY - dragState.y;
          if (Math.abs(dx) + Math.abs(dy) < 2) return;
          dragState.moved = true;
          const scale = clamp(dragState.view.altitude * 0.18, 0.015, 0.65);
          const lat = clamp(dragState.view.lat + dy * scale, -84, 84);
          const lng = ((dragState.view.lng - dx * scale + 540) % 360) - 180;
          globe.pointOfView({lat,lng,altitude:dragState.view.altitude},0);
        };
        canvasHost.addEventListener('pointerdown', startDrag, true);
        window.addEventListener('pointermove', moveDrag, true);
        window.addEventListener('pointerup', stopDrag, true);
        window.addEventListener('pointercancel', stopDrag, true);
        window.addEventListener('blur', stopDrag);
        // Continue a held drag even if the cursor crosses the canvas edge.
        // Release is handled by window.pointerup, pointercancel or blur.
        canvasHost.addEventListener('wheel', event => {
          if (!visible || streetMode) return;
          event.preventDefault();
          event.stopImmediatePropagation();
          stopDrag();
          plannedAltitude = null;
          const current = globe.pointOfView() || home;
          const altitude = clamp(current.altitude * Math.exp(event.deltaY * 0.0015), 0.06, 5);
          const target = {...current, altitude};
          setExpanded(altitude);
          globe.pointOfView(target, 140);
          if (altitude <= DETAIL_ENTRY_ALTITUDE && hasMapboxToken())
            prepareStreetDetails(target, mapZoomFromAltitude(altitude), true);
        }, {passive:false,capture:true});
        controls.addEventListener?.('change', () => {
          if (!visible) return;
          const current = Number(globe.pointOfView()?.altitude ?? 2.5);
          setExpanded(plannedAltitude === null ? current : Math.min(current, plannedAltitude));
        });
        controls.addEventListener?.('start', () => { plannedAltitude = null; });
        syncSize();
        globe.pointOfView(home, 0);
        lastError = null;
        return { ok: true, mode: 'globe-3d' };
      } catch (error) {
        globe = null;
        canvasHost.remove();
        throw error;
      }
    })();
    try { return await globeLoading; }
    finally { globeLoading = null; }
  }
  async function open() {
    visible = true;
    host.hidden = false;
    earthVisual.classList.add('jarvis-earth-active');
    window.JARVIS_COMMAND_CENTER?.setVisualMode?.('globe');
    globe?.resumeAnimation?.();
    requestAnimationFrame(syncSize);
    try {
      const result = await init();
      syncSize();
      return result;
    } catch (error) {
      lastError = error?.message || String(error);
      terminal('Globo indisponível: ' + lastError);
      close();
      return { ok: false, error: lastError };
    }
  }
  function close() {
    visible = false;
    dragState = null;
    streetMode = false;
    host.classList.remove('jarvis-earth-map-active');
    plannedAltitude = null;
    ++requestSequence;
    host.hidden = true;
    clearSelection();
    setExpanded(2.5);
    earthVisual.classList.remove('jarvis-earth-active');
    globe?.pauseAnimation?.();
    streetMap?.stop?.();
    window.JARVIS_COMMAND_CENTER?.setVisualMode?.('ring');
    return { ok: true, mode: 'ring' };
  }
  async function searchGeocoding(place) {
    const token = (() => { try { return localStorage.getItem('jarvis_mapbox_pk_v1') || ''; } catch { return ''; } })();
    if (/^pk\.[A-Za-z0-9._-]{20,}$/.test(token)) {
      try {
        const url = new URL('https://api.mapbox.com/search/geocode/v6/forward');
        for (const [key, value] of Object.entries({ q: place, language: 'pt', limit: 1, access_token: token }))
          url.searchParams.set(key, String(value));
        const response = await fetch(url.href);
        if (response.ok) {
          const result = (await response.json()).features?.[0];
          const lng = Number(result?.properties?.coordinates?.longitude ?? result?.geometry?.coordinates?.[0]);
          const lat = Number(result?.properties?.coordinates?.latitude ?? result?.geometry?.coordinates?.[1]);
          if (Number.isFinite(lat) && Number.isFinite(lng)) {
            const type = result.properties?.feature_type;
            return [lng, lat, type === 'country' ? 4 : type === 'region' ? 7 : 11];
          }
        }
      } catch (error) { console.warn('[EARTH] Busca Mapbox indisponível:', error); }
    }
    // Public OpenStreetMap geocoder: a fallback for new browsers without a saved token.
    const url = new URL('https://nominatim.openstreetmap.org/search');
    for (const [key, value] of Object.entries({ q: place, format: 'jsonv2', limit: '1', 'accept-language': 'pt' }))
      url.searchParams.set(key, value);
    const response = await fetch(url.href);
    if (!response.ok) throw new Error('Busca geográfica indisponível: HTTP ' + response.status);
    const results = await response.json();
    if (!results?.length) throw new Error('Local não encontrado');
    const item = results[0];
    const lng = Number(item.lon), lat = Number(item.lat);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new Error('Coordenadas inválidas');
    return [lng, lat, item.type === 'country' ? 4 : 10];
  }
  async function locate(query = '') {
    const sequence = ++requestSequence;
    const opened = await open();
    if (!opened.ok) return opened;
    const place = String(query || '').trim().replace(/[.!?]+$/, '');
    if (!place) return opened;
    let result = known[normalizePlace(place)];
    if (!result) {
      try { result = await searchGeocoding(place); }
      catch (error) {
        if (sequence !== requestSequence) return { ok: false, cancelled: true };
        lastError = error?.message || 'Pesquisa geográfica falhou';
        terminal(lastError);
        return { ok: false, error: lastError };
      }
    }
    if (sequence !== requestSequence) return { ok: false, cancelled: true };
    const [lng, lat, zoom] = result;
    const centered = focus(lat, lng, zoom, false, place);
    if (centered.ok) terminal('Centralizando o globo em ' + place + '.');
    return centered;
  }
  function navigate(action) {
    if (action === 'ring' || action === 'close') return close();
    if (action === 'globe' || action === 'open') return open();
    if (action === 'home' || action === 'reset') {
      if (!visible) return { ok: false };
      clearSelection();
      if (streetMode) {
        showGlobeFromMap();
        streetMode = false;
        host.classList.remove('jarvis-earth-map-active');
      }
      plannedAltitude = home.altitude;
      setExpanded(home.altitude);
      globe?.pointOfView(home, 1800);
      return { ok: true };
    }
    if (action === 'zoom-in' || action === 'zoom-out') {
      if (streetMode && streetMap) {
        const zoom = clamp(streetMap.getZoom() + (action === 'zoom-in' ? 1 : -1),0,20);
        streetMap.zoomTo?.(zoom,{duration:450});
        if (zoom <= DETAIL_EXIT_ZOOM) showGlobeFromMap();
        return {ok:true, mode:'mapbox-satellite'};
      }
      const point = globe?.pointOfView();
      if (!point) return { ok: false };
      const altitude = clamp(point.altitude * (action === 'zoom-in' ? .7 : 1.5), .12, 5);
      plannedAltitude = altitude;
      setExpanded(altitude);
      globe.pointOfView({ ...point, altitude }, 500);
      if (altitude <= DETAIL_ENTRY_ALTITUDE && hasMapboxToken())
        prepareStreetDetails({...point,altitude},mapZoomFromAltitude(altitude),true);
      return { ok: true };
    }
    return { ok: false, error: 'Comando desconhecido' };
  }
  const activateEarth = () => { if (!visible) void open(); };
  const restoreRing = () => { if (visible) close(); };
  // Pointerdown fires before responsive zoom can move the button under the pointer.
  // Click remains for keyboard and accessibility activation.
  earthButton?.addEventListener('pointerdown', activateEarth);
  earthButton?.addEventListener('click', activateEarth);
  ringButton?.addEventListener('pointerdown', restoreRing);
  ringButton?.addEventListener('click', restoreRing);
  window.addEventListener('ultron:earth-location', event => { void locate(event.detail?.place || ''); });
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(syncSize).observe(earthVisual);
  window.ULTRON_EARTH = {
    open, close, locate, navigate, focus, clearSelection, enterStreetDetails,
    get state() {
      const tokenConfigured = hasMapboxToken();
      return {
        available: true, ready: Boolean(globe), visible, mode: streetMode ? 'mapbox-satellite' : globe ? 'globe-3d' : 'not-opened',
        tokenConfigured, needsToken: false, lastError, selectedPlace,
        expanded: earthCommandPanel?.classList.contains('jarvis-earth-expanded') || false,
        view: streetMode && streetMap
          ? {lat:streetMap.getCenter().lat,lng:streetMap.getCenter().lng,altitude:altitudeFromMapZoom(streetMap.getZoom()),zoom:streetMap.getZoom()}
          : globe?.pointOfView?.() || null,
        dragRequiresHold: true, dragging: Boolean(dragState), streetZoomAvailable: tokenConfigured, streetMode
      };
    }
  };
  if (tokenInstalledFromLink) queueMicrotask(() => { void open(); });
}
