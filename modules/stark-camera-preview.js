const sourceVideo = document.getElementById('webcam');
const host = document.getElementById('camera-placeholder');

if (sourceVideo && host) {
  host.classList.add('stark-live-camera');

  const preview = document.createElement('video');
  preview.className = 'stark-camera-feed';
  preview.autoplay = true;
  preview.muted = true;
  preview.playsInline = true;
  preview.setAttribute('aria-label', 'Prévia da câmera do Ultron');

  const overlay = document.createElement('canvas');
  overlay.className = 'stark-camera-overlay';
  overlay.setAttribute('aria-hidden', 'true');

  const scan = document.createElement('div');
  scan.className = 'stark-camera-scan';
  scan.setAttribute('aria-hidden', 'true');

  const readout = document.createElement('div');
  readout.className = 'stark-camera-readout';
  readout.innerHTML = `
    <div><small>HAND TRACK</small><strong data-hand-state>SEARCHING</strong></div>
    <div class="motion"><small>MOTION</small><strong data-motion-state>0%</strong></div>
  `;

  host.prepend(preview, overlay, scan);
  host.appendChild(readout);

  const handState = readout.querySelector('[data-hand-state]');
  const motionState = readout.querySelector('[data-motion-state]');
  const ctx = overlay.getContext('2d');
  let lastLandmarks = [];
  let lastGesture = 'None';
  let lastTarget = null;
  let lastMotion = 0;

  const HAND_CONNECTIONS = [
    [0,1],[1,2],[2,3],[3,4],
    [0,5],[5,6],[6,7],[7,8],
    [5,9],[9,10],[10,11],[11,12],
    [9,13],[13,14],[14,15],[15,16],
    [13,17],[17,18],[18,19],[19,20],[0,17]
  ];

  function syncStream() {
    const stream = sourceVideo.srcObject;
    if (!stream) {
      preview.srcObject = null;
      clearOverlay();
      handState.textContent = 'STANDBY';
      return;
    }
    if (preview.srcObject !== stream) preview.srcObject = stream;
    preview.play().catch(() => {});
  }

  function fitCanvas() {
    const rect = host.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const width = Math.max(1, Math.round(rect.width * dpr));
    const height = Math.max(1, Math.round(rect.height * dpr));
    if (overlay.width !== width || overlay.height !== height) {
      overlay.width = width;
      overlay.height = height;
      overlay.style.width = `${rect.width}px`;
      overlay.style.height = `${rect.height}px`;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { width: rect.width, height: rect.height };
  }

  function clearOverlay() {
    const { width, height } = fitCanvas();
    ctx.clearRect(0, 0, width, height);
  }

  function mapPoint(point, width, height) {
    return {
      x: (1 - Number(point?.x || 0)) * width,
      y: Number(point?.y || 0) * height
    };
  }

  function drawHand() {
    const { width, height } = fitCanvas();
    ctx.clearRect(0, 0, width, height);

    if (!lastLandmarks.length) return;
    const points = lastLandmarks.map((point) => mapPoint(point, width, height));
    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    const minX = Math.max(0, Math.min(...xs) - 12);
    const maxX = Math.min(width, Math.max(...xs) + 12);
    const minY = Math.max(0, Math.min(...ys) - 12);
    const maxY = Math.min(height, Math.max(...ys) + 12);

    ctx.save();
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = 'rgba(0,240,255,.78)';
    ctx.shadowColor = 'rgba(0,240,255,.75)';
    ctx.shadowBlur = 8;

    for (const [from, to] of HAND_CONNECTIONS) {
      const a = points[from];
      const b = points[to];
      if (!a || !b) continue;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }

    for (let index = 0; index < points.length; index += 1) {
      const point = points[index];
      ctx.beginPath();
      ctx.arc(point.x, point.y, index === 4 || index === 8 ? 3.2 : 2.1, 0, Math.PI * 2);
      ctx.fillStyle = index === 4 || index === 8 ? '#ffffff' : '#00f0ff';
      ctx.fill();
    }

    ctx.setLineDash([7, 5]);
    ctx.strokeStyle = 'rgba(255,255,255,.64)';
    ctx.shadowBlur = 4;
    ctx.strokeRect(minX, minY, Math.max(12, maxX - minX), Math.max(12, maxY - minY));
    ctx.setLineDash([]);

    const label = `${lastGesture.toUpperCase()}${lastTarget ? ` // ${lastTarget}` : ''}`;
    ctx.font = '10px ui-monospace, monospace';
    const labelWidth = ctx.measureText(label).width + 12;
    ctx.fillStyle = 'rgba(2,7,17,.78)';
    ctx.fillRect(minX, Math.max(0, minY - 19), labelWidth, 17);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(label, minX + 6, Math.max(11, minY - 7));
    ctx.restore();
  }

  sourceVideo.addEventListener('playing', syncStream);
  sourceVideo.addEventListener('loadedmetadata', syncStream);
  sourceVideo.addEventListener('emptied', syncStream);

  window.addEventListener('ultron:camera-hand', (event) => {
    const detail = event.detail || {};
    lastLandmarks = Array.isArray(detail.landmarks) ? detail.landmarks : [];
    lastGesture = String(detail.gesture || 'None');
    lastTarget = detail.target || null;
    handState.textContent = lastTarget
      ? `${lastGesture.toUpperCase()} // ${lastTarget}`
      : lastGesture.toUpperCase();
    host.classList.toggle('hand-detected', lastLandmarks.length > 0);
    drawHand();
  });

  window.addEventListener('ultron:motion-level', (event) => {
    lastMotion = Math.max(0, Math.min(100, Number(event.detail?.level || 0)));
    motionState.textContent = `${Math.round(lastMotion)}%`;
    host.classList.toggle('motion-alert', lastMotion >= 20);
  });

  window.addEventListener('ultron:motion-event', () => {
    host.classList.add('motion-alert');
    setTimeout(() => host.classList.toggle('motion-alert', lastMotion >= 20), 700);
  });

  new ResizeObserver(() => drawHand()).observe(host);
  syncStream();

  window.ULTRON_CAMERA_PREVIEW = {
    sync: syncStream,
    get state() {
      return {
        active: Boolean(preview.srcObject),
        gesture: lastGesture,
        target: lastTarget,
        motion: lastMotion
      };
    }
  };
}
