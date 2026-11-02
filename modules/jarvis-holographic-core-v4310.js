const stage = document.querySelector('.neural-stage');
const orbStage = document.querySelector('.orb-stage');
const output = document.getElementById('output-box');

if (stage && orbStage) {
  const VERSION = '4.31.0';
  const THREE_URL = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';

  function log(message, alert = false) {
    if (!output) return;
    const line = document.createElement('p');
    if (alert) line.className = 'alert';
    const time = new Date().toLocaleTimeString('pt-BR', { hour12: false });
    line.textContent = `> [${time}] [JARVIS-3D] ${message}`;
    output.appendChild(line);
    output.scrollTop = output.scrollHeight;
  }

  async function ensureThree() {
    if (window.THREE) return window.THREE;
    await new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[src="${THREE_URL}"]`);
      if (existing) {
        existing.addEventListener('load', resolve, { once: true });
        existing.addEventListener('error', reject, { once: true });
        return;
      }
      const script = document.createElement('script');
      script.src = THREE_URL;
      script.async = true;
      script.crossOrigin = 'anonymous';
      script.onload = resolve;
      script.onerror = () => reject(new Error('Falha ao carregar Three.js.'));
      document.head.appendChild(script);
    });
    if (!window.THREE) throw new Error('Three.js indisponível após carregamento.');
    return window.THREE;
  }

  function createNeuralBackground() {
    const canvas = document.createElement('canvas');
    canvas.className = 'jarvis-neural-bg';
    canvas.setAttribute('aria-hidden', 'true');
    orbStage.prepend(canvas);
    const ctx = canvas.getContext('2d');
    const particles = [];
    const count = window.matchMedia('(max-width: 720px)').matches ? 42 : 70;

    function resize() {
      const rect = orbStage.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (!particles.length) {
        for (let i = 0; i < count; i += 1) {
          particles.push({
            x: Math.random() * rect.width,
            y: Math.random() * rect.height,
            vx: (Math.random() - 0.5) * 0.38,
            vy: (Math.random() - 0.5) * 0.38,
            size: Math.random() * 1.4 + 0.45
          });
        }
      }
    }

    function draw() {
      const rect = orbStage.getBoundingClientRect();
      ctx.clearRect(0, 0, rect.width, rect.height);
      ctx.fillStyle = 'rgba(0,243,255,.34)';
      ctx.strokeStyle = 'rgba(0,243,255,.055)';
      for (let i = 0; i < particles.length; i += 1) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0 || p.x > rect.width) p.vx *= -1;
        if (p.y < 0 || p.y > rect.height) p.vy *= -1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        for (let j = i + 1; j < particles.length; j += 1) {
          const p2 = particles[j];
          const distance = Math.hypot(p.x - p2.x, p.y - p2.y);
          if (distance > 118) continue;
          ctx.globalAlpha = Math.max(0.15, 1 - distance / 118);
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
      }
      requestAnimationFrame(draw);
    }

    resize();
    window.addEventListener('resize', resize);
    requestAnimationFrame(draw);
    return canvas;
  }

  async function boot() {
    const THREE = await ensureThree();
    createNeuralBackground();

    const host = document.createElement('div');
    host.className = 'jarvis-webgl-core';
    host.setAttribute('aria-hidden', 'true');
    orbStage.prepend(host);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(58, 1, 0.1, 1000);
    camera.position.z = 6.3;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    host.appendChild(renderer.domElement);

    const root = new THREE.Group();
    scene.add(root);

    const coreGroup = new THREE.Group();
    const orbitalGroup = new THREE.Group();
    const shardGroup = new THREE.Group();
    root.add(coreGroup, orbitalGroup, shardGroup);

    const cyan = new THREE.MeshBasicMaterial({
      color: 0x00f3ff,
      wireframe: true,
      transparent: true,
      opacity: 0.28,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const bright = new THREE.MeshBasicMaterial({
      color: 0x3df7ff,
      wireframe: true,
      transparent: true,
      opacity: 0.78,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const violet = new THREE.MeshBasicMaterial({
      color: 0x5868ff,
      wireframe: true,
      transparent: true,
      opacity: 0.34,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    const core = new THREE.Mesh(new THREE.SphereGeometry(0.82, 28, 28), cyan.clone());
    const inner = new THREE.Mesh(new THREE.IcosahedronGeometry(0.48, 2), bright.clone());
    inner.material.opacity = 0.62;
    coreGroup.add(core, inner);

    const ring1 = new THREE.Mesh(new THREE.TorusGeometry(1.58, 0.018, 12, 128), bright.clone());
    const ring2 = new THREE.Mesh(new THREE.TorusGeometry(2.05, 0.014, 12, 128), cyan.clone());
    ring2.rotation.x = Math.PI / 2;
    const ring3 = new THREE.Mesh(new THREE.TorusGeometry(2.48, 0.011, 12, 128), violet.clone());
    ring3.rotation.y = Math.PI / 4;
    ring3.rotation.z = Math.PI / 4;
    const ring4 = new THREE.Mesh(new THREE.TorusGeometry(1.28, 0.009, 10, 96), violet.clone());
    ring4.rotation.x = Math.PI / 3;
    ring4.rotation.z = -Math.PI / 5;
    orbitalGroup.add(ring1, ring2, ring3, ring4);

    const nodeGeometry = new THREE.BufferGeometry();
    const nodePositions = [];
    for (let i = 0; i < 180; i += 1) {
      const radius = 1.0 + Math.random() * 1.55;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      nodePositions.push(
        radius * Math.sin(phi) * Math.cos(theta),
        radius * Math.cos(phi),
        radius * Math.sin(phi) * Math.sin(theta)
      );
    }
    nodeGeometry.setAttribute('position', new THREE.Float32BufferAttribute(nodePositions, 3));
    const nodes = new THREE.Points(nodeGeometry, new THREE.PointsMaterial({
      color: 0x77fbff,
      size: 0.032,
      transparent: true,
      opacity: 0.7,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    }));
    root.add(nodes);

    const dustGeometry = new THREE.BufferGeometry();
    const dustPositions = [];
    for (let i = 0; i < 260; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const radius = 2.2 + Math.random() * 1.8;
      const y = (Math.random() - 0.5) * 1.0;
      dustPositions.push(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
    }
    dustGeometry.setAttribute('position', new THREE.Float32BufferAttribute(dustPositions, 3));
    const dust = new THREE.Points(dustGeometry, new THREE.PointsMaterial({
      color: 0x2bbdff,
      size: 0.018,
      transparent: true,
      opacity: 0.42,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    }));
    dust.rotation.x = 0.42;
    root.add(dust);

    const shock = new THREE.Mesh(
      new THREE.SphereGeometry(1.03, 24, 24),
      new THREE.MeshBasicMaterial({
        color: 0x7fffff,
        wireframe: true,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })
    );
    root.add(shock);

    const shards = [];
    for (let i = 0; i < 30; i += 1) {
      const material = (i % 3 === 0 ? violet : cyan).clone();
      material.opacity = 0;
      const shard = new THREE.Mesh(new THREE.TetrahedronGeometry(0.12 + (i % 5) * 0.018, 0), material);
      const theta = (i / 30) * Math.PI * 2;
      const phi = ((i % 7) / 7) * Math.PI - Math.PI / 2;
      shard.userData.base = new THREE.Vector3(
        Math.cos(theta) * Math.cos(phi),
        Math.sin(phi),
        Math.sin(theta) * Math.cos(phi)
      );
      shard.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
      shardGroup.add(shard);
      shards.push(shard);
    }

    const visual = {
      targetFilespace: 0,
      filespace: 0,
      speech: 0,
      shock: 0,
      currentX: 0,
      currentY: 0,
      currentZ: 0,
      currentScale: 1,
      idleYaw: 0,
      lastAt: performance.now()
    };

    function resize() {
      const rect = orbStage.getBoundingClientRect();
      const width = Math.max(1, rect.width);
      const height = Math.max(1, rect.height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    }
    resize();
    window.addEventListener('resize', resize);

    window.addEventListener('ultron:neural-filespace-enter', () => { visual.targetFilespace = 1; });
    window.addEventListener('ultron:neural-filespace-exit', () => { visual.targetFilespace = 0; });
    window.addEventListener('ultron:speech-start', () => { visual.speech = 1; visual.shock = 1; });
    window.addEventListener('ultron:speech-end', () => { visual.speech = 0; });
    window.addEventListener('ultron:priority-freeze', () => { root.rotation.set(root.rotation.x, root.rotation.y, root.rotation.z); });

    function animate(now = performance.now()) {
      requestAnimationFrame(animate);
      const dt = Math.min(40, Math.max(8, now - visual.lastAt));
      visual.lastAt = now;
      const spatial = window.ULTRON_NEURAL_3D?.state || window.JARVIS_NEURAL_3D?.state || {};
      const targetX = THREE.MathUtils.degToRad(Number(spatial.rx || 0));
      const targetY = THREE.MathUtils.degToRad(Number(spatial.ry || 0));
      const targetZ = THREE.MathUtils.degToRad(Number(spatial.rz || 0));
      const targetScale = Number(spatial.scale || 1);
      const smooth = 1 - Math.pow(0.00045, dt / 1000);
      const lerp = Math.min(0.18, Math.max(0.055, smooth * 1.65));

      visual.currentX = THREE.MathUtils.lerp(visual.currentX, targetX, lerp);
      visual.currentY = THREE.MathUtils.lerp(visual.currentY, targetY, lerp);
      visual.currentZ = THREE.MathUtils.lerp(visual.currentZ, targetZ, lerp);
      visual.currentScale = THREE.MathUtils.lerp(visual.currentScale, targetScale, lerp);
      visual.filespace = THREE.MathUtils.lerp(visual.filespace, visual.targetFilespace, Math.min(0.12, lerp));
      visual.speech = THREE.MathUtils.lerp(visual.speech, 0, visual.speech > 0 ? 0.018 : 0.04);
      visual.shock = Math.max(0, visual.shock - 0.018);

      const source = String(spatial.source || 'IDLE');
      if (source === 'IDLE' && visual.filespace < 0.1) visual.idleYaw += 0.0018;
      root.rotation.x = visual.currentX;
      root.rotation.y = visual.currentY + visual.idleYaw;
      root.rotation.z = visual.currentZ;
      const pulse = 1 + Math.sin(now * 0.0026) * 0.018 + visual.speech * 0.035;
      root.scale.setScalar(visual.currentScale * pulse);

      core.rotation.y -= 0.0055;
      inner.rotation.x += 0.007;
      inner.rotation.y -= 0.010;
      ring1.rotation.z += 0.0042;
      ring2.rotation.y -= 0.0065;
      ring3.rotation.x += 0.0037;
      ring4.rotation.y += 0.008;
      nodes.rotation.y += 0.0017;
      dust.rotation.z += 0.0007;

      const intact = 1 - visual.filespace;
      core.material.opacity = 0.28 * intact;
      inner.material.opacity = 0.62 * intact;
      orbitalGroup.children.forEach((ring, index) => {
        ring.material.opacity = (index === 0 ? 0.78 : 0.34) * (0.35 + intact * 0.65);
        const spread = 1 + visual.filespace * (0.22 + index * 0.07);
        ring.scale.setScalar(spread);
      });

      shards.forEach((shard, index) => {
        const distance = 0.72 + (index % 6) * 0.11;
        shard.position.copy(shard.userData.base).multiplyScalar(visual.filespace * distance);
        shard.position.y += Math.sin(now * 0.0014 + index) * 0.028 * visual.filespace;
        shard.material.opacity = visual.filespace * (0.34 + (index % 4) * 0.07);
        shard.rotation.x += 0.004 + index * 0.00003;
        shard.rotation.y -= 0.003;
      });

      shock.visible = visual.shock > 0;
      if (shock.visible) {
        const progress = 1 - visual.shock;
        shock.scale.setScalar(1 + progress * 2.4);
        shock.material.opacity = Math.max(0, visual.shock * 0.46);
      }

      renderer.render(scene, camera);
    }

    stage.classList.add('jarvis-three-ready');
    window.JARVIS_HOLOGRAPHIC_CORE = {
      version: VERSION,
      renderer,
      scene,
      root,
      get state() {
        return {
          filespace: visual.filespace,
          speaking: visual.speech > 0.05,
          rotation: { x: visual.currentX, y: visual.currentY, z: visual.currentZ },
          scale: visual.currentScale
        };
      }
    };
    window.ULTRON_HOLOGRAPHIC_CORE = window.JARVIS_HOLOGRAPHIC_CORE;
    log('J.A.R.V.I.S HOLOGRAPHIC CORE ONLINE // THREE.JS // 360° YAW + PITCH + LERP');
    window.dispatchEvent(new CustomEvent('jarvis:holographic-core-ready', { detail: { version: VERSION, three: true, rotation360: true, lerp: true } }));
    requestAnimationFrame(animate);
  }

  boot().catch((error) => {
    stage.classList.add('jarvis-three-fallback');
    log(`Three.js indisponível; mantendo núcleo CSS de contingência. ${error?.message || error}`, true);
  });
}
