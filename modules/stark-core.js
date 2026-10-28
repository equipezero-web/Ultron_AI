const stage = document.querySelector('.neural-stage');
const output = document.getElementById('output-box');

if (!stage) {
  console.warn('ULTRON Stark-Core: .neural-stage ausente.');
} else {
  const layer = document.createElement('div');
  layer.className = 'stark-core-layer';
  layer.innerHTML = `
    <div class="stark-peripheral" aria-hidden="true">
      <div class="stark-readout lt"><small>VITA-FEED</small><strong id="stark-vitals" class="waiting">WAITING SENSOR</strong></div>
      <div class="stark-readout rt"><small>THREAT / CORE</small><strong id="stark-core-state">NOMINAL</strong></div>
      <div class="stark-readout lb"><small>GESTURE BUS</small><strong id="stark-gesture-state">POINTER READY</strong></div>
      <div class="stark-readout rb"><small>FOCUS TRACK</small><strong id="stark-focus-state">SIMULATED</strong></div>
    </div>
    <div class="stark-vortex" role="application" aria-label="Stark-Core volumetric interaction field">
      <div class="stark-vortex-ring r1"></div>
      <div class="stark-vortex-ring r2"></div>
      <div class="stark-vortex-ring r3"></div>
      <div class="stark-node-field"></div>
      <div class="stark-hud-label"><strong>STARK-CORE</strong><span>NEURAL MESH // READY</span></div>
    </div>
    <section class="stark-holo-panel" aria-hidden="true">
      <div class="stark-holo-head">
        <div><small>NEURAL NODE</small><strong class="stark-holo-title">CORE</strong></div>
        <button type="button" class="stark-holo-close" aria-label="Fechar painel">×</button>
      </div>
      <div class="stark-holo-content"></div>
    </section>
    <div class="stark-gesture-hint">PINCH/DRAG: ROTATE · TAP: OPEN NODE · SWIPE: WORKSPACE · WHEEL: DEPTH</div>
  `;
  stage.appendChild(layer);

  const vortex = layer.querySelector('.stark-vortex');
  const nodeField = layer.querySelector('.stark-node-field');
  const gestureState = layer.querySelector('#stark-gesture-state');
  const focusState = layer.querySelector('#stark-focus-state');
  const coreState = layer.querySelector('#stark-core-state');
  const holoPanel = layer.querySelector('.stark-holo-panel');
  const holoTitle = layer.querySelector('.stark-holo-title');
  const holoContent = layer.querySelector('.stark-holo-content');
  const holoClose = layer.querySelector('.stark-holo-close');

  const NODE_CONFIG = [
    { label: 'COMANDOS', icon: '⌘', action: 'commands' },
    { label: 'ARQUIVOS', icon: '▤', action: 'files' },
    { label: 'PRODUÇÃO', icon: '◇', action: 'production' },
    { label: 'VISÃO', icon: '◉', action: 'vision' },
    { label: 'MEMÓRIA', icon: '⌁', action: 'memory' },
    { label: 'DEVICE', icon: '▣', action: 'devices' },
    { label: 'NEWS', icon: '↗', action: 'news' },
    { label: 'PLANNER', icon: '✦', action: 'planner' },
    { label: 'TOOLS', icon: '⚙', action: 'tools' },
    { label: 'SECURITY', icon: '⬡', action: 'security' }
  ];

  const nodes = [];
  const productionVisuals = [];
  const localFiles = [];
  const objectUrls = new Set();

  function log(message) {
    if (!output) return;
    const line = document.createElement('p');
    const time = new Date().toLocaleTimeString('pt-BR', { hour12: false });
    line.textContent = `> [${time}] [STARK-CORE] ${message}`;
    output.appendChild(line);
    output.scrollTop = output.scrollHeight;
  }

  function createNodes() {
    NODE_CONFIG.forEach((config, index) => {
      const node = document.createElement('button');
      node.type = 'button';
      node.className = 'stark-node stark-functional-node';
      node.dataset.label = config.label;
      node.dataset.action = config.action;
      node.dataset.index = String(index);
      node.dataset.angle = String((Math.PI * 2 * index) / NODE_CONFIG.length - Math.PI / 2);
      node.innerHTML = `<span class="stark-node-icon" aria-hidden="true">${config.icon}</span>`;
      node.setAttribute('aria-label', `${config.label} — abrir módulo`);
      nodeField.appendChild(node);
      nodes.push(node);
    });
  }

  function layoutNodes() {
    const rect = vortex.getBoundingClientRect();
    const width = Math.max(280, rect.width || 420);
    const height = Math.max(280, rect.height || width);
    const radiusX = width * 0.43;
    const radiusY = height * 0.34;

    nodes.forEach((node, index) => {
      const angle = Number(node.dataset.angle || 0);
      const x = Math.cos(angle) * radiusX;
      const y = Math.sin(angle) * radiusY;
      const z = Math.sin(angle * 2) * 42 + (index % 2 ? 18 : -8);
      node.style.setProperty('--x', `${x}px`);
      node.style.setProperty('--y', `${y}px`);
      node.style.setProperty('--z', `${z}px`);
    });
  }

  let audioCtx = null;
  function feedback(kind = 'tap') {
    try {
      navigator.vibrate?.(kind === 'confirm' ? 22 : 10);
      audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      const now = audioCtx.currentTime;
      osc.type = 'sine';
      osc.frequency.setValueAtTime(kind === 'confirm' ? 180 : 520, now);
      osc.frequency.exponentialRampToValueAtTime(kind === 'confirm' ? 90 : 320, now + 0.055);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.035, now + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.07);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(now);
      osc.stop(now + 0.075);
    } catch {}
  }

  function ripple(clientX, clientY) {
    const rect = layer.getBoundingClientRect();
    const el = document.createElement('span');
    el.className = 'stark-ripple';
    el.style.left = `${clientX - rect.left}px`;
    el.style.top = `${clientY - rect.top}px`;
    layer.appendChild(el);
    setTimeout(() => el.remove(), 650);
  }

  function clearContent() {
    holoContent.replaceChildren();
  }

  function sectionTitle(text, detail = '') {
    const wrap = document.createElement('div');
    wrap.className = 'stark-holo-section-title';
    const strong = document.createElement('strong');
    strong.textContent = text;
    wrap.appendChild(strong);
    if (detail) {
      const small = document.createElement('small');
      small.textContent = detail;
      wrap.appendChild(small);
    }
    return wrap;
  }

  function actionButton(label, handler, variant = '') {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `stark-holo-action ${variant}`.trim();
    button.textContent = label;
    button.addEventListener('click', handler);
    return button;
  }

  function runCommand(command) {
    const input = document.getElementById('command-input');
    const send = document.getElementById('btn-send');
    if (!input || !send) return false;
    input.value = command;
    send.click();
    closePanel();
    return true;
  }

  function renderCommands() {
    clearContent();
    holoContent.appendChild(sectionTitle('ATALHOS OPERACIONAIS', 'Executam comandos reais no núcleo Ultron'));
    const grid = document.createElement('div');
    grid.className = 'stark-holo-action-grid';
    [
      ['STATUS DO SISTEMA', 'status'],
      ['VARREDURA', 'varredura'],
      ['NOTÍCIAS DE HOJE', 'quais são as principais notícias do Brasil hoje?'],
      ['ANALISAR ANOMALIAS', 'analise o estado atual do sistema e destaque anomalias'],
      ['RESUMIR CONTEXTO', 'resuma o contexto atual desta conversa'],
      ['PLANEJAR TAREFA', 'crie um plano operacional para a próxima tarefa complexa']
    ].forEach(([label, command]) => grid.appendChild(actionButton(label, () => runCommand(command))));
    holoContent.appendChild(grid);
  }

  function addProductionImage(src, label = 'PRODUÇÃO VISUAL', source = 'ULTRON') {
    const url = String(src || '').trim();
    if (!url) return false;
    if (productionVisuals.some((item) => item.src === url)) return false;
    productionVisuals.unshift({ src: url, label: String(label || 'PRODUÇÃO VISUAL'), source });
    if (productionVisuals.length > 16) productionVisuals.length = 16;
    return true;
  }

  function renderProduction() {
    clearContent();
    holoContent.appendChild(sectionTitle('PRODUÇÃO HOLOGRÁFICA', `${productionVisuals.length} visual(is) carregado(s)`));

    if (!productionVisuals.length) {
      const empty = document.createElement('div');
      empty.className = 'stark-holo-empty';
      empty.innerHTML = '<strong>NENHUMA IMAGEM CARREGADA</strong><span>Imagens recebidas pelo contexto visual, pesquisas ou arquivos locais aparecerão aqui.</span>';
      holoContent.appendChild(empty);
    } else {
      const gallery = document.createElement('div');
      gallery.className = 'stark-production-grid';
      productionVisuals.slice(0, 8).forEach((item, index) => {
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'stark-production-card';
        const img = document.createElement('img');
        img.src = item.src;
        img.alt = item.label;
        const meta = document.createElement('span');
        meta.innerHTML = `<b>${String(index + 1).padStart(2, '0')}</b><em>${item.label}</em>`;
        card.append(img, meta);
        card.addEventListener('click', () => {
          window.ULTRON_VISUAL_PANEL?.setImages?.([{ src: item.src, alt: item.label }], { intervalMs: 999999 });
          feedback('confirm');
        });
        gallery.appendChild(card);
      });
      holoContent.appendChild(gallery);
    }

    const actions = document.createElement('div');
    actions.className = 'stark-holo-action-grid compact';
    actions.append(
      actionButton('IMPORTAR IMAGENS', () => pickFiles(true)),
      actionButton('ANALISAR VISÃO', () => {
        window.ULTRON_VISION?.analyze?.();
        closePanel();
      })
    );
    holoContent.appendChild(actions);
  }

  function fileRow(name, detail, clickHandler = null) {
    const row = document.createElement(clickHandler ? 'button' : 'div');
    if (clickHandler) row.type = 'button';
    row.className = 'stark-file-row';
    const nameNode = document.createElement('strong');
    nameNode.textContent = name;
    const detailNode = document.createElement('small');
    detailNode.textContent = detail;
    row.append(nameNode, detailNode);
    if (clickHandler) row.addEventListener('click', clickHandler);
    return row;
  }

  function pickFiles(imagesOnly = false) {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    if (imagesOnly) input.accept = 'image/*';
    input.addEventListener('change', () => {
      [...(input.files || [])].forEach((file) => {
        localFiles.unshift({ name: file.name, type: file.type || 'arquivo', size: file.size });
        if (file.type.startsWith('image/')) {
          const url = URL.createObjectURL(file);
          objectUrls.add(url);
          addProductionImage(url, file.name, 'LOCAL');
        }
      });
      if (imagesOnly) renderProduction();
      else renderFiles();
      log(`${input.files?.length || 0} arquivo(s) selecionado(s) localmente. Nenhum upload automático foi feito.`);
    }, { once: true });
    input.click();
  }

  function renderFiles() {
    clearContent();
    holoContent.appendChild(sectionTitle('ARQUIVOS', 'Projeto + arquivos locais autorizados nesta sessão'));

    const list = document.createElement('div');
    list.className = 'stark-file-list';
    const repoBase = 'https://github.com/equipezero-web/Ultron_AI/blob/main/';
    [
      ['index.html', 'Interface principal'],
      ['script.js', 'Núcleo do frontend'],
      ['style.css', 'Layout base'],
      ['backend/worker-v3.js', 'Worker principal'],
      ['backend/providers.js', 'Gateway multi-IA'],
      ['backend/memory.js', 'Memória persistente'],
      ['modules/stark-core.js', 'HUD orbital Stark-Core'],
      ['modules/vision-client.js', 'Visão computacional explícita']
    ].forEach(([name, detail]) => {
      list.appendChild(fileRow(name, detail, () => window.open(`${repoBase}${name}`, '_blank', 'noopener')));
    });

    localFiles.slice(0, 8).forEach((file) => {
      const sizeKb = Math.max(1, Math.round(file.size / 1024));
      list.appendChild(fileRow(file.name, `LOCAL // ${file.type} // ${sizeKb} KB`));
    });

    holoContent.appendChild(list);
    holoContent.appendChild(actionButton('IMPORTAR ARQUIVO LOCAL', () => pickFiles(false), 'wide'));
  }

  function renderStatusCards(items) {
    const grid = document.createElement('div');
    grid.className = 'stark-status-grid';
    items.forEach(([label, value]) => {
      const card = document.createElement('div');
      card.className = 'stark-status-card';
      const small = document.createElement('small');
      small.textContent = label;
      const strong = document.createElement('strong');
      strong.textContent = value || 'UNKNOWN';
      card.append(small, strong);
      grid.appendChild(card);
    });
    return grid;
  }

  function renderMemory() {
    clearContent();
    const snapshot = window.ULTRON_TELEMETRY?.lastSnapshot;
    holoContent.appendChild(sectionTitle('MEMÓRIA', 'Contexto persistente e sessão atual'));
    holoContent.appendChild(renderStatusCards([
      ['D1 MEMORY', document.getElementById('memory-module')?.textContent || 'CHECKING'],
      ['CONVERSATION', window.ULTRON_MEMORY?.getConversationId?.()?.slice(0, 16) || 'N/A'],
      ['SYSTEM MODE', snapshot?.system?.mode || document.getElementById('system-mode')?.textContent || 'STANDBY'],
      ['CONNECTION', navigator.onLine ? 'ONLINE' : 'OFFLINE']
    ]));
    holoContent.appendChild(actionButton('RESUMIR MINHA MEMÓRIA', () => runCommand('resuma o que você lembra de mim e desta conversa'), 'wide'));
  }

  function renderDevices() {
    clearContent();
    const snapshot = window.ULTRON_TELEMETRY?.lastSnapshot;
    holoContent.appendChild(sectionTitle('DEVICE BRIDGE', 'Dispositivos e sensores conectados'));
    holoContent.appendChild(renderStatusCards([
      ['BRIDGE', document.getElementById('bridge-module')?.textContent || 'API WAIT'],
      ['MOBILE MIC', snapshot?.microphone?.remoteState || 'IDLE'],
      ['CAMERA', snapshot?.camera?.state || document.getElementById('camera-state')?.textContent || 'STANDBY'],
      ['NEURAL BUS', window.ULTRON_NEURAL_INPUT ? 'READY' : 'WAITING']
    ]));
    const actions = document.createElement('div');
    actions.className = 'stark-holo-action-grid';
    actions.append(
      actionButton('PAREAR CELULAR', () => document.getElementById('btn-pair-mobile')?.click()),
      actionButton('CONFIGURAR TV', () => document.getElementById('btn-pair-tv')?.click()),
      actionButton('CÂMERA', () => document.getElementById('btn-camera')?.click()),
      actionButton('MIC CELULAR', () => document.getElementById('btn-mobile-mic')?.click())
    );
    holoContent.appendChild(actions);
  }

  function renderPlanner() {
    clearContent();
    holoContent.appendChild(sectionTitle('PLANNER', 'Decomposição e execução assistida'));
    holoContent.appendChild(renderStatusCards([
      ['PLANNING', 'READY'],
      ['POLICY', 'AUTO / CONFIRM / BLOCK'],
      ['TOOLS', 'ROUTED'],
      ['EXECUTION', 'AUTHORIZED ONLY']
    ]));
    holoContent.appendChild(actionButton('CRIAR PLANO', () => runCommand('crie um plano operacional detalhado para a próxima tarefa que eu descrever'), 'wide'));
  }

  function renderTools() {
    clearContent();
    holoContent.appendChild(sectionTitle('TOOLS', 'Camadas disponíveis no navegador'));
    holoContent.appendChild(renderStatusCards([
      ['VISION', window.ULTRON_VISION ? 'READY' : 'WAITING'],
      ['TELEMETRY', window.ULTRON_TELEMETRY ? 'READY' : 'WAITING'],
      ['MEMORY', window.ULTRON_MEMORY ? 'READY' : 'WAITING'],
      ['VOICE', window.ULTRON_VOICE_OUTPUT ? 'READY' : 'CHECKING'],
      ['STARK CORE', 'ONLINE'],
      ['NEURAL INPUT', window.ULTRON_NEURAL_INPUT ? 'READY' : 'WAITING']
    ]));
  }

  function renderSecurity() {
    clearContent();
    holoContent.appendChild(sectionTitle('SECURITY', 'Estado de autorização operacional'));
    holoContent.appendChild(renderStatusCards([
      ['SIMPLE ACTIONS', 'AUTO'],
      ['SENSITIVE ACTIONS', 'CONFIRM'],
      ['UNSUPPORTED', 'BLOCKED'],
      ['LOCAL FILES', 'USER PICK ONLY'],
      ['CAMERA ANALYSIS', 'EXPLICIT FRAME'],
      ['BIOMETRICS', 'NO FAKE DATA']
    ]));
  }

  function renderVision() {
    clearContent();
    holoContent.appendChild(sectionTitle('VISÃO COMPUTACIONAL', 'Captura explícita de um único frame'));
    holoContent.appendChild(renderStatusCards([
      ['CAMERA', document.getElementById('camera-state')?.textContent || 'STANDBY'],
      ['VISION CORE', document.getElementById('vision-module')?.textContent || 'STANDBY'],
      ['MOTION', document.getElementById('motion-value')?.textContent || '0%'],
      ['PRIVACY', 'FRAME ON REQUEST']
    ]));
    holoContent.appendChild(actionButton('ANALISAR AGORA', () => {
      window.ULTRON_VISION?.analyze?.();
      closePanel();
    }, 'wide'));
  }

  function renderNews() {
    clearContent();
    holoContent.appendChild(sectionTitle('LIVE NEWS', 'Busca em múltiplas janelas e fontes'));
    holoContent.appendChild(renderStatusCards([
      ['ROUTING', 'REALTIME'],
      ['BRAZIL 24H', 'PRIMARY'],
      ['GLOBAL 48H', 'FALLBACK'],
      ['EXTENDED 72H', 'FALLBACK']
    ]));
    holoContent.appendChild(actionButton('BUSCAR NOTÍCIAS AGORA', () => runCommand('quais são as principais notícias do Brasil hoje?'), 'wide'));
  }

  function openPanel(action, label = action) {
    holoTitle.textContent = String(label || action).toUpperCase();
    holoPanel.classList.add('visible');
    holoPanel.setAttribute('aria-hidden', 'false');
    stage.classList.add('stark-panel-open');

    switch (action) {
      case 'commands': renderCommands(); break;
      case 'files': renderFiles(); break;
      case 'production': renderProduction(); break;
      case 'vision': renderVision(); break;
      case 'memory': renderMemory(); break;
      case 'devices': renderDevices(); break;
      case 'news': renderNews(); break;
      case 'planner': renderPlanner(); break;
      case 'tools': renderTools(); break;
      case 'security': renderSecurity(); break;
      default:
        clearContent();
        holoContent.appendChild(sectionTitle(String(label || 'CORE'), 'Módulo sem conteúdo associado'));
    }

    feedback('confirm');
  }

  function closePanel() {
    holoPanel.classList.remove('visible');
    holoPanel.setAttribute('aria-hidden', 'true');
    stage.classList.remove('stark-panel-open');
  }

  holoClose.addEventListener('click', closePanel);

  let tiltX = 0;
  let tiltY = 0;
  let scale = 1;
  let dragging = false;
  let startX = 0;
  let startY = 0;
  let lastX = 0;
  let lastY = 0;
  let pointerDownAt = 0;
  let workspace = 0;

  function applyTransform() {
    vortex.style.setProperty('--tilt-x', `${tiltX}deg`);
    vortex.style.setProperty('--tilt-y', `${tiltY}deg`);
    vortex.style.setProperty('--stark-scale', String(scale));
  }

  function focusNearest(clientX, clientY) {
    let best = null;
    let bestDistance = Infinity;
    for (const node of nodes) {
      const r = node.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const d = Math.hypot(clientX - cx, clientY - cy);
      node.classList.remove('is-focused');
      if (d < bestDistance) { bestDistance = d; best = node; }
    }
    if (best && bestDistance < 90) {
      best.classList.add('is-focused');
      focusState.textContent = best.dataset.label;
    } else {
      focusState.textContent = 'SIMULATED';
    }
  }

  function airTap(target, x, y) {
    const node = target.closest?.('.stark-node');
    ripple(x, y);
    feedback('tap');
    gestureState.textContent = 'AIR TAP';

    if (node) {
      nodes.forEach((item) => item.classList.toggle('is-focused', item === node));
      node.style.setProperty('--node-scale', '1.28');
      setTimeout(() => node.style.setProperty('--node-scale', '1'), 260);
      focusState.textContent = node.dataset.label;
      openPanel(node.dataset.action, node.dataset.label);
      log(`${node.dataset.label}: módulo holográfico aberto.`);
      window.dispatchEvent(new CustomEvent('ultron:stark-node', {
        detail: { label: node.dataset.label, action: node.dataset.action }
      }));
    }

    setTimeout(() => { gestureState.textContent = 'POINTER READY'; }, 700);
  }

  function sweep(direction) {
    workspace = Math.max(0, workspace + (direction === 'left' ? 1 : -1));
    const cls = direction === 'left' ? 'stark-workspace-shift-left' : 'stark-workspace-shift-right';
    stage.classList.remove('stark-workspace-shift-left','stark-workspace-shift-right');
    void stage.offsetWidth;
    stage.classList.add(cls);
    feedback('confirm');
    gestureState.textContent = `SWEEP ${direction.toUpperCase()}`;
    closePanel();
    log(`Workspace neural ${workspace + 1}.`);
    window.dispatchEvent(new CustomEvent('ultron:stark-workspace', { detail: { workspace, direction } }));
    setTimeout(() => { gestureState.textContent = 'POINTER READY'; }, 700);
  }

  vortex.addEventListener('pointerdown', (event) => {
    dragging = true;
    pointerDownAt = performance.now();
    startX = lastX = event.clientX;
    startY = lastY = event.clientY;
    vortex.setPointerCapture?.(event.pointerId);
    gestureState.textContent = 'PINCH HOLD';
  });

  vortex.addEventListener('pointermove', (event) => {
    focusNearest(event.clientX, event.clientY);
    if (!dragging) return;
    const dx = event.clientX - lastX;
    const dy = event.clientY - lastY;
    tiltY = Math.max(-32, Math.min(32, tiltY + dx * 0.18));
    tiltX = Math.max(-24, Math.min(24, tiltX - dy * 0.16));
    lastX = event.clientX;
    lastY = event.clientY;
    applyTransform();
    gestureState.textContent = 'MICRO-PINCH';
  });

  vortex.addEventListener('pointerup', (event) => {
    if (!dragging) return;
    dragging = false;
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    const distance = Math.hypot(dx, dy);
    const elapsed = performance.now() - pointerDownAt;
    if (Math.abs(dx) > 95 && Math.abs(dx) > Math.abs(dy) * 1.5 && elapsed < 850) {
      sweep(dx < 0 ? 'left' : 'right');
    } else if (distance < 12 && elapsed < 420) {
      airTap(event.target, event.clientX, event.clientY);
    } else {
      feedback('tap');
      setTimeout(() => { gestureState.textContent = 'POINTER READY'; }, 450);
    }
  });

  vortex.addEventListener('pointercancel', () => { dragging = false; gestureState.textContent = 'POINTER READY'; });
  vortex.addEventListener('wheel', (event) => {
    event.preventDefault();
    scale = Math.max(0.72, Math.min(1.42, scale - event.deltaY * 0.001));
    applyTransform();
    gestureState.textContent = 'DEPTH ZOOM';
    setTimeout(() => { gestureState.textContent = 'POINTER READY'; }, 350);
  }, { passive: false });

  function setProcessing(active) {
    layer.classList.toggle('is-processing', Boolean(active));
    coreState.textContent = active ? 'SYNTHESIZING' : 'NOMINAL';
  }

  function setAlert(active, label = 'ANOMALY') {
    layer.classList.toggle('is-alert', Boolean(active));
    coreState.textContent = active ? label : 'NOMINAL';
    coreState.classList.toggle('alert', Boolean(active));
  }

  window.addEventListener('ultron:speech-start', () => setProcessing(true));
  window.addEventListener('ultron:speech-end', () => setProcessing(false));
  window.addEventListener('ultron:proactive-alert', (event) => {
    const severity = String(event.detail?.severity || 'info');
    if (severity === 'warning' || severity === 'critical') {
      setAlert(true, severity.toUpperCase());
      setTimeout(() => setAlert(false), 2200);
    }
  });

  window.addEventListener('ultron:visual-context', (event) => {
    const images = Array.isArray(event.detail?.images) ? event.detail.images : [];
    images.forEach((item) => {
      if (typeof item === 'string') addProductionImage(item, 'VISUAL CONTEXT');
      else if (item?.src) addProductionImage(item.src, item.alt || item.title || 'VISUAL CONTEXT');
    });
    if (holoPanel.classList.contains('visible') && holoTitle.textContent === 'PRODUÇÃO') renderProduction();
  });

  createNodes();
  requestAnimationFrame(layoutNodes);
  new ResizeObserver(layoutNodes).observe(vortex);
  applyTransform();

  window.ULTRON_STARK_CORE = {
    airTap(x, y) { airTap(document.elementFromPoint(x, y) || vortex, x, y); },
    pinch({ dx = 0, dy = 0, scaleDelta = 0 } = {}) {
      tiltY = Math.max(-32, Math.min(32, tiltY + Number(dx) * 0.18));
      tiltX = Math.max(-24, Math.min(24, tiltX - Number(dy) * 0.16));
      scale = Math.max(0.72, Math.min(1.42, scale + Number(scaleDelta)));
      applyTransform();
      gestureState.textContent = 'EXTERNAL PINCH';
    },
    sweep,
    focus(label) {
      const wanted = String(label || '').toUpperCase();
      const node = nodes.find((item) => item.dataset.label === wanted);
      nodes.forEach((item) => item.classList.remove('is-focused'));
      if (node) {
        node.classList.add('is-focused');
        focusState.textContent = wanted;
      }
      return Boolean(node);
    },
    open(labelOrAction) {
      const wanted = String(labelOrAction || '').toUpperCase();
      const node = nodes.find((item) => item.dataset.label === wanted || item.dataset.action === String(labelOrAction || '').toLowerCase());
      if (!node) return false;
      nodes.forEach((item) => item.classList.toggle('is-focused', item === node));
      focusState.textContent = node.dataset.label;
      openPanel(node.dataset.action, node.dataset.label);
      return true;
    },
    close: closePanel,
    addProductionImage,
    processing: setProcessing,
    alert: setAlert,
    ingestGesture(event = {}) {
      const type = String(event.type || '').toLowerCase();
      if (type === 'air-tap') return this.airTap(Number(event.x || innerWidth / 2), Number(event.y || innerHeight / 2));
      if (type === 'pinch') return this.pinch(event);
      if (type === 'sweep') return sweep(event.direction === 'right' ? 'right' : 'left');
      if (type === 'focus') return this.focus(event.label);
      if (type === 'open-node') return this.open(event.label || event.action);
      return false;
    },
    get production() { return productionVisuals.map((item) => ({ ...item })); },
    get state() { return { tiltX, tiltY, scale, workspace, panelOpen: holoPanel.classList.contains('visible') }; }
  };

  window.addEventListener('beforeunload', () => {
    objectUrls.forEach((url) => URL.revokeObjectURL(url));
  });

  log('Stark-Core funcional online. Nós orbitais agora abrem comandos, arquivos, produção, visão, memória e ferramentas.');
}
