const stage = document.querySelector('.neural-stage');

if (stage) {
  const layer = document.createElement('div');
  layer.className = 'stark-zoom-diagnostics';
  layer.setAttribute('aria-hidden', 'true');
  layer.innerHTML = `
    <div class="stark-focus-magnet"></div>
    <div class="stark-callout left c1"><small>FOCUS TARGET</small><strong data-callout-target>NONE</strong></div>
    <div class="stark-callout right c2"><small>ZOOM LEVEL</small><strong data-callout-zoom>0 / 2</strong></div>
    <div class="stark-callout left c3"><small>MOTION</small><strong data-callout-motion>0%</strong></div>
    <div class="stark-callout right c4"><small>CAMERA</small><strong data-callout-camera>STANDBY</strong></div>
  `;
  stage.appendChild(layer);

  const target = layer.querySelector('[data-callout-target]');
  const zoom = layer.querySelector('[data-callout-zoom]');
  const motion = layer.querySelector('[data-callout-motion]');
  const camera = layer.querySelector('[data-callout-camera]');

  function refreshCamera() {
    camera.textContent = String(document.getElementById('camera-state')?.textContent || 'STANDBY');
  }

  window.addEventListener('ultron:camera-hand', (event) => {
    const detail = event.detail || {};
    target.textContent = String(detail.target || 'NONE').toUpperCase();
    zoom.textContent = `${Number(detail.zoomLevel || 0)} / 2`;
  });

  window.addEventListener('ultron:motion-level', (event) => {
    motion.textContent = `${Math.round(Number(event.detail?.level || 0))}%`;
  });

  window.addEventListener('ultron:stark-zoom-level', (event) => {
    zoom.textContent = `${Number(event.detail?.level || 0)} / 2`;
    refreshCamera();
  });

  const cameraState = document.getElementById('camera-state');
  if (cameraState) {
    new MutationObserver(refreshCamera).observe(cameraState, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }

  refreshCamera();

  window.ULTRON_ZOOM_DIAGNOSTICS = {
    refresh: refreshCamera
  };
}
