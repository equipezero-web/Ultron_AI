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

  // The reference Mapbox UI overlays the whole neural stage, not another page.
  // It copies the supplied full-screen-style HUD, region sidebar and reset behavior.
  const earthStage = earthVisual.closest('.jarvis-cc-center') || earthVisual;
  const reference = document.createElement('section');
  reference.id = 'jarvis-earth-reference-layout';
  reference.className = 'jarvis-earth-reference-layout';
  reference.hidden = true;
  reference.setAttribute('aria-label', 'Neural Command — Globo 3D fotorrealista');
  reference.innerHTML = [
    '<div class="jarvis-earth-reference-map" aria-label="Terra e mapa Mapbox em projeção globo"></div>',
    '<header class="jarvis-earth-reference-hud">',
      '<div class="jarvis-earth-reference-title"><span aria-hidden="true">◈</span><div><strong>NEURAL COMMAND</strong><small>GLOBO FOTORREALISTA 3D</small></div></div>',
      '<div class="jarvis-earth-reference-metrics">',
        '<div><span>PROJEÇÃO:</span><b>GLOBE 3D REAL</b></div>',
        '<div><span>ILUMINAÇÃO:</span><b>SOLAR DIRETA</b></div>',
        '<div><span>STATUS:</span><b id="jarvis-earth-reference-status">INICIALIZANDO</b></div>',
      '</div>',
    '</header>',
    '<aside class="jarvis-earth-reference-side" aria-hidden="true">',
      '<div class="jarvis-earth-reference-side-top">',
        '<div><small>COORDENADA</small><h2>PONTO SELECIONADO</h2></div>',
        '<button type="button" data-earth-reference="close-panel" aria-label="Fechar detalhes e retornar à Terra">×</button>',
      '</div>',
      '<div class="jarvis-earth-reference-card">',
        '<div><b>LATITUDE:</b> <span data-earth-reference-value="lat">--</span></div>',
        '<div><b>LONGITUDE:</b> <span data-earth-reference-value="lng">--</span></div>',
        '<div><b>ZOOM:</b> <span data-earth-reference-value="zoom">--</span></div>',
      '</div>',
      '<div class="jarvis-earth-reference-card jarvis-earth-reference-note">Ao aproximar o zoom no globo, os dados do Mapbox carregam as divisões territoriais, limites de estados, nomes de cidades e a malha viária disponível para ruas.</div>',
      '<button type="button" data-earth-reference="minimize" class="jarvis-earth-reference-minimize">MINIMIZAR E RETORNAR AO GLOBO COMPLETO</button>',
    '</aside>',
    '<div class="jarvis-earth-reference-zoom" role="group" aria-label="Aproximar e afastar globo">',
      '<button type="button" data-earth-reference="zoom-in" aria-label="Aproximar globo ou mapa" title="Aproximar">+</button>',
      '<button type="button" data-earth-reference="zoom-out" aria-label="Afastar globo ou mapa" title="Afastar">−</button>',
    '</div>',
    '<nav class="jarvis-earth-reference-choices" aria-label="Alternar visualizações do comando neural">',
      '<button type="button" data-earth-reference="ring" aria-label="Voltar ao Neural Ring 3D" title="Voltar ao Neural Ring 3D">◎</button>',
      '<button type="button" data-earth-reference="globe" aria-pressed="true" aria-label="Globo 3D ativo" title="Globo 3D">◉</button>',
    '</nav>'
  ].join('');
  earthStage.append(reference);
  const referenceMapHost = reference.querySelector('.jarvis-earth-reference-map');
  const referenceSide = reference.querySelector('.jarvis-earth-reference-side');
  const referenceStatus = reference.querySelector('#jarvis-earth-reference-status');
  let referenceMap = null, referenceLoading = null, referenceMode = false;
  let referenceSelection = false;
  function hideReferenceDetails() {
    referenceSelection = false;
    referenceSide.classList.remove('is-open');
    referenceSide.setAttribute('aria-hidden','true');
  }
  function showReferenceDetails(lat,lng,zoom) {
    referenceSelection = true;
    referenceSide.querySelector('[data-earth-reference-value="lat"]').textContent = Number(lat).toFixed(4);
    referenceSide.querySelector('[data-earth-reference-value="lng"]').textContent = Number(lng).toFixed(4);
    referenceSide.querySelector('[data-earth-reference-value="zoom"]').textContent = Number(zoom).toFixed(1);
    referenceSide.classList.add('is-open');
    referenceSide.setAttribute('aria-hidden','false');
  }
  function resetReferenceMap() {
    hideReferenceDetails();
    if (referenceMode && referenceMap) referenceMap.flyTo({
      center:[-34.8770,-8.0476], zoom:2.2, pitch:0, bearing:0, duration:2000, essential:true
    });
    else if (globe) {
      plannedAltitude=home.altitude;
      globe.pointOfView(home,1800);
    }
    return {ok:true,mode:referenceMode?'mapbox-globe':'globe-3d'};
  }
  for(const selector of ['[data-earth-reference="close-panel"]','[data-earth-reference="minimize"]']){
    const button=reference.querySelector(selector);
    // A sliding side-panel can move between pointerdown and pointerup.
    button.addEventListener('pointerdown',event=>{if(event.button===0)resetReferenceMap();});
    button.addEventListener('click',resetReferenceMap);
  }
  const backToRing=reference.querySelector('[data-earth-reference="ring"]');
  backToRing.addEventListener('pointerdown',event=>{
    if(event.button!==0)return;
    close(); // Handle press before any responsive resize can move the button.
  });
  backToRing.addEventListener('click',()=>{if(visible)close();});
  reference.querySelector('[data-earth-reference="globe"]').addEventListener('click',()=>void open());
  for (const action of ['zoom-in','zoom-out']) {
    reference.querySelector('[data-earth-reference="'+action+'"]').addEventListener('click',()=>{
      void navigate(action);
    });
  }

  async function ensureReferenceMap() {
    if (referenceMap) return true;
    if (!hasMapboxToken()) return false;
    if (referenceLoading) return referenceLoading;
    referenceLoading=(async()=>{
      const gl=await ensureMapboxLibrary();
      if (typeof gl.supported==='function' && !gl.supported()) throw new Error('Mapbox WebGL indisponível');
      gl.accessToken=publicMapboxToken();
      const map=new gl.Map({
        container:referenceMapHost,
        style:'mapbox://styles/mapbox/satellite-streets-v12',
        center:[-34.8770,-8.0476],
        zoom:2.2,
        projection:'globe',
        dragPan:true,dragRotate:false,
        scrollZoom:true,doubleClickZoom:true,touchZoomRotate:true,touchPitch:false,
        boxZoom:false,keyboard:false,cooperativeGestures:false,
        attributionControl:true,antialias:!mobileGPU,maxZoom:20,
        fadeDuration:mobileGPU?0:300
      });
      referenceMap=map;
      // Pinch zoom and double-tap zoom remain enabled; two-finger twisting won't spin.
      map.touchZoomRotate?.enable?.();
      map.touchZoomRotate?.disableRotation?.();
      map.touchPitch?.disable?.();
      map.dragPan?.enable?.();
      map.on('style.load',()=>{
        try {
          map.setFog?.({
            color:'rgba(255, 255, 255, 0.5)',
            'high-color':'rgba(36, 92, 223, 0.7)',
            'space-color':'rgb(11, 15, 25)',
            'horizon-blend':0.1,'star-intensity':0.8
          });
          map.setLight?.({anchor:'viewport',color:'white',intensity:0.4});
        } catch(error) {console.warn('[EARTH] Iluminação indisponível:',error);}
      });
      map.on('click',(event)=>{
        if (!referenceMode || !visible) return;
        const lat=Number(event.lngLat?.lat),lng=Number(event.lngLat?.lng);
        if (!Number.isFinite(lat)||!Number.isFinite(lng)) return;
        selectedPlace={lat,lng,name:''};
        showReferenceDetails(lat,lng,map.getZoom());
        map.flyTo({
          center:[lng,lat],
          zoom:Math.min(20,Math.max(map.getZoom()+2,6)),
          duration:2000,essential:true
        });
      });
      map.on('moveend',()=>{
        if(referenceSelection && referenceMode){
          const center=map.getCenter();
          showReferenceDetails(center.lat,center.lng,map.getZoom());
        }
      });
      await new Promise((resolve,reject)=>{
        let finished=false;
        const finish=(error)=>{
          if(finished)return;finished=true;clearTimeout(timeout);
          if(error)reject(error);else resolve();
        };
        const timeout=setTimeout(()=>finish(new Error('Tempo limite ao carregar globo Mapbox')),16000);
        map.once('load',()=>finish());
        map.once('error',event=>{
          if(!map.loaded?.())finish(event.error||new Error('Erro ao carregar estilo Mapbox'));
        });
      });
      return true;
    })().catch(error=>{
      const message=error?.message||String(error);
      lastError=message;
      referenceStatus.textContent='MAPBOX INDISPONÍVEL';
      terminal('Mapbox indisponível, utilizando globo 3D alternativo: '+message);
      try{referenceMap?.remove?.();}catch{}
      referenceMap=null;
      return false;
    }).finally(()=>{referenceLoading=null;});
    return referenceLoading;
  }

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
  const mobileGPU = window.matchMedia?.('(max-width: 820px), (pointer: coarse)')?.matches ?? false;
  const lowMemory = Number(navigator.deviceMemory || 4) <= 2;
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
    earthCommandPanel?.classList.toggle('jarvis-earth-expanded', visible && reference.hidden && !referenceMode && altitude < 0.95);
  }
  function syncSize() {
    if (visible && referenceMode) referenceMap?.resize?.();
    if (visible && streetMode) streetMap?.resize?.();
    if (!globe || !visible) return;
    const width = Math.round(host.clientWidth || earthVisual.clientWidth);
    const height = Math.round(host.clientHeight || earthVisual.clientHeight);
    if (width > 0 && height > 0) globe.width(width).height(height);
  }
  function clearSelection() {
    dismiss.hidden = true;
    selectedPlace = null;
    hideReferenceDetails();
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
            touchZoomRotate: true, touchPitch: false, keyboard: false,
            cooperativeGestures: false, attributionControl: true, antialias: !mobileGPU,
            fadeDuration:mobileGPU?0:300
          });
          streetMap = map;
          map.touchZoomRotate?.enable?.();
          map.touchZoomRotate?.disableRotation?.();
          map.touchPitch?.disable?.();
          map.dragPan?.enable?.();
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
    if (referenceMode && referenceMap) {
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return {ok:false,error:'Coordenadas inválidas'};
      if(clicked)showReferenceDetails(lat,lng,referenceMap.getZoom());
      else hideReferenceDetails();
      selectedPlace=clicked?{lat,lng,name}:null;
      referenceMap.flyTo({center:[lng,lat],zoom:clamp(zoom,2.2,20),duration:2400,essential:true});
      return {ok:true,mode:'mapbox-globe',place:name||null,lat,lng,zoom};
    }
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
        // Avoid huge WebGL buffers on high-DPI phones. Keep desktop sharp.
        try {
          const renderer = globe.renderer?.();
          renderer?.setPixelRatio?.(Math.min(
            window.devicePixelRatio || 1,
            mobileGPU ? (lowMemory ? 1 : 1.35) : 1.8
          ));
        } catch (error) {
          console.warn('[EARTH] Renderer pixel-density cap unavailable:',error);
        }
        const controls = globe.controls();
        controls.autoRotate = false;
        controls.autoRotateSpeed = 0;
        controls.enableDamping = false;
        controls.enablePan = false;
        controls.enableZoom = false; // Wheel is routed explicitly to zoom, never rotation.
        controls.enableRotate = false; // Mouse hover cannot rotate the globe.
        // Track multitouch as a real pinch, independent of desktop wheel events.
        const touchPointers = new Map();
        let touchPinch = null;
        const touchDistance = () => {
          const fingers=[...touchPointers.values()];
          return fingers.length<2?0:Math.hypot(
            fingers[0].x-fingers[1].x, fingers[0].y-fingers[1].y);
        };
        // Globe.gl's OrbitControls stays disabled for rotation. Drive the camera
        // ourselves only while the primary button is held, so a hover or mouseup
        // can never leave OrbitControls stuck in the rotate state.
        const startDrag = event => {
          if (!visible || streetMode || referenceMode || event.target.closest?.('.jarvis-earth-selection-close')) return;
          if (event.pointerType === 'mouse' && event.button !== 0) return;
          if (event.pointerType !== 'touch' && event.button !== undefined && event.button !== 0) return;
          if (event.pointerType === 'touch') {
            touchPointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
            if (touchPointers.size >= 2) {
              const current=globe.pointOfView()||home;
              touchPinch={distance:Math.max(1,touchDistance()),altitude:current.altitude};
              dragState=null;
              event.preventDefault();
              return;
            }
          }
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
        const stopDrag = event => {
          if (event?.pointerType === 'touch') {
            touchPointers.delete(event.pointerId);
            if (touchPinch && touchPointers.size < 2) touchPinch=null;
          } else if (!event?.pointerType) {
            touchPointers.clear(); touchPinch=null;
          }
          if (dragState?.moved) lastDragEndedAt = Date.now();
          dragState = null;
          controls.enableRotate = false;
        };
        const moveDrag = event => {
          if (!visible || streetMode || referenceMode) return;
          if (event.pointerType === 'touch' && touchPointers.has(event.pointerId)) {
            touchPointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
            if(touchPinch && touchPointers.size>=2){
              const scale=touchPinch.distance/Math.max(1,touchDistance());
              const altitude=clamp(touchPinch.altitude*scale,0.06,5);
              const point=globe.pointOfView()||home;
              plannedAltitude=altitude;
              setExpanded(altitude);
              globe.pointOfView({...point,altitude},0);
              if (altitude<=DETAIL_ENTRY_ALTITUDE && hasMapboxToken())
                prepareStreetDetails({...point,altitude},mapZoomFromAltitude(altitude),false);
              event.preventDefault();
              return;
            }
          }
          if (!dragState) return;
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
        window.addEventListener('blur', () => {
          touchPointers.clear(); touchPinch=null;
          stopDrag();
        });
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
    if (visible && referenceMode && referenceMap) return {ok:true,mode:'mapbox-globe'};
    visible = true;
    reference.hidden = false;
    earthVisual.classList.add('jarvis-earth-active');
    earthCommandPanel?.classList.add('jarvis-earth-reference-active');
    window.JARVIS_COMMAND_CENTER?.setVisualMode?.('globe');
    const canMap=hasMapboxToken();
    if(canMap){
      referenceStatus.textContent='CONECTANDO';
      const supported=await ensureReferenceMap();
      if(!visible)return {ok:false,cancelled:true};
      if(supported){
        referenceMode=true;
        reference.classList.add('has-mapbox');
        host.hidden=true;
        referenceStatus.textContent='CONECTADO';
        earthCommandPanel?.classList.remove('jarvis-earth-expanded');
        requestAnimationFrame(()=>referenceMap?.resize?.());
        return {ok:true,mode:'mapbox-globe'};
      }
    }
    referenceMode=false;
    reference.classList.remove('has-mapbox');
    referenceMapHost.append(host);
    host.hidden=false;
    referenceStatus.textContent=canMap?'GLOBO ALTERNATIVO':'MAPBOX NÃO CONFIGURADO';
    globe?.resumeAnimation?.();
    requestAnimationFrame(syncSize);
    try {
      const result=await init();
      syncSize();
      return result;
    } catch(error) {
      lastError=error?.message||String(error);
      terminal('Globo indisponível: '+lastError);
      close();
      return {ok:false,error:lastError};
    }
  }
  function close() {
    visible=false;
    referenceMode=false;
    dragState=null;
    streetMode=false;
    host.classList.remove('jarvis-earth-map-active');
    plannedAltitude=null;
    ++requestSequence;
    host.hidden=true;
    clearSelection();
    reference.hidden=true;
    reference.classList.remove('has-mapbox');
    earthCommandPanel?.classList.remove('jarvis-earth-reference-active');
    earthCommandPanel?.classList.remove('jarvis-earth-expanded');
    if(host.parentElement!==earthVisual)earthVisual.append(host);
    earthVisual.classList.remove('jarvis-earth-active');
    globe?.pauseAnimation?.();
    streetMap?.stop?.();
    referenceMap?.stop?.();
    window.JARVIS_COMMAND_CENTER?.setVisualMode?.('ring');
    return {ok:true,mode:'ring'};
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
      if(referenceMode) return resetReferenceMap();
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
      if(referenceMode && referenceMap){
        const zoom=clamp(referenceMap.getZoom()+(action==='zoom-in'?1:-1),0,20);
        referenceMap.zoomTo(zoom,{duration:500});
        return {ok:true,mode:'mapbox-globe'};
      }
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
  document.addEventListener('visibilitychange', () => {
    if (!globe || !visible || referenceMode) return;
    if (document.hidden) globe.pauseAnimation?.();
    else globe.resumeAnimation?.();
  });
  if (typeof ResizeObserver !== 'undefined') {
    const observer=new ResizeObserver(syncSize);
    observer.observe(earthVisual);
    if(earthStage!==earthVisual)observer.observe(earthStage);
  }
  window.ULTRON_EARTH = {
    open, close, locate, navigate, focus, clearSelection, enterStreetDetails,
    resetReferenceMap, get referenceMap(){return referenceMap;},
    get state() {
      const tokenConfigured = hasMapboxToken();
      return {
        available: true, ready: Boolean(referenceMap || globe), visible,
        mode: referenceMode ? 'mapbox-globe' : streetMode ? 'mapbox-satellite' : globe ? 'globe-3d' : 'not-opened',
        tokenConfigured, needsToken: false, lastError, selectedPlace,
        expanded: earthCommandPanel?.classList.contains('jarvis-earth-expanded') || false,
        view: referenceMode && referenceMap
          ? {lat:referenceMap.getCenter().lat,lng:referenceMap.getCenter().lng,zoom:referenceMap.getZoom(),altitude:altitudeFromMapZoom(referenceMap.getZoom())}
          : streetMode && streetMap
          ? {lat:streetMap.getCenter().lat,lng:streetMap.getCenter().lng,altitude:altitudeFromMapZoom(streetMap.getZoom()),zoom:streetMap.getZoom()}
          : globe?.pointOfView?.() || null,
        dragRequiresHold: true, dragging: Boolean(dragState), streetZoomAvailable: tokenConfigured, streetMode,
        referenceMode, referenceOverlay: !reference.hidden, referenceSelection
      };
    }
  };
  if (tokenInstalledFromLink) queueMicrotask(() => { void open(); });
}
