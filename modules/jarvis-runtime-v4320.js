const KEY = '__JARVIS_RUNTIME_V4320__';

if (!window[KEY]) {
  window[KEY] = true;
  const root = document.documentElement;
  const body = document.body;
  const output = document.getElementById('output-box');
  const metrics = [];
  const MAX_METRICS = 80;

  function setState(name, enabled) {
    body?.classList.toggle(`jarvis-${name}`, Boolean(enabled));
  }

  function metric(name, duration, detail = {}) {
    const entry = { name, duration: Math.max(0, Math.round(Number(duration) || 0)), at: Date.now(), ...detail };
    metrics.push(entry);
    if (metrics.length > MAX_METRICS) metrics.splice(0, metrics.length - MAX_METRICS);
    window.dispatchEvent(new CustomEvent('jarvis:metric', { detail: entry }));
    return entry;
  }

  function brandTextNode(node) {
    if (!node || node.nodeType !== Node.TEXT_NODE || !/ultron/i.test(node.nodeValue || '')) return;
    const parent = node.parentElement;
    if (parent?.closest('script,style,textarea,[data-preserve-legacy-name]')) return;
    node.nodeValue = node.nodeValue.replace(/ULTRON AI/gi, 'J.A.R.V.I.S').replace(/ULTRON CORE/gi, 'JARVIS CORE').replace(/ULTRON/g, 'JARVIS').replace(/Ultron/g, 'Jarvis').replace(/ultron/g, 'jarvis');
  }

  function brandTree(target = document.body) {
    if (!target) return;
    const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) brandTextNode(node);
  }

  let brandQueued = false;
  const observer = new MutationObserver((mutations) => {
    if (brandQueued) return;
    if (!mutations.some((m) => m.addedNodes?.length || m.type === 'characterData')) return;
    brandQueued = true;
    queueMicrotask(() => {
      brandQueued = false;
      brandTree(document.body);
    });
  });
  if (document.body) observer.observe(document.body, { subtree: true, childList: true, characterData: true });
  brandTree();

  const eventMap = [
    ['ultron:processing-start', 'processing', true],
    ['ultron:processing-end', 'processing', false],
    ['ultron:speech-start', 'speaking', true],
    ['ultron:speech-end', 'speaking', false],
    ['ultron:neural-filespace-enter', 'filespace', true],
    ['ultron:neural-filespace-exit', 'filespace', false]
  ];
  eventMap.forEach(([event, state, enabled]) => window.addEventListener(event, () => setState(state, enabled)));

  let requestStart = 0;
  window.addEventListener('ultron:processing-start', () => { requestStart = performance.now(); });
  window.addEventListener('ultron:processing-end', () => {
    if (requestStart) metric('interaction-total', performance.now() - requestStart);
    requestStart = 0;
  });

  const audio = document.getElementById('voice-audio');
  if (audio) {
    audio.addEventListener('play', () => {
      setState('speaking', true);
      window.ULTRON_VOICE_INPUT?.suspend?.('jarvis-tts');
      window.dispatchEvent(new CustomEvent('ultron:speech-start'));
    });
    const releaseVoice = () => {
      setState('speaking', false);
      window.dispatchEvent(new CustomEvent('ultron:speech-end'));
      setTimeout(() => window.ULTRON_VOICE_INPUT?.resume?.('jarvis-tts'), 180);
    };
    audio.addEventListener('ended', releaseVoice);
    audio.addEventListener('pause', () => { if (audio.ended || !audio.currentTime) releaseVoice(); });
  }

  document.addEventListener('visibilitychange', () => setState('background', document.hidden));
  root.dataset.jarvisVersion = '4.32.0';

  window.JARVIS_RUNTIME = {
    version: '4.32.0',
    metric,
    metrics() { return metrics.map((item) => ({ ...item })); },
    state(name, enabled) { setState(name, enabled); },
    brandTree,
    diagnostics() {
      return {
        version: '4.32.0',
        performance: window.JARVIS_PERFORMANCE?.state || null,
        backend: window.JARVIS_BACKEND_STATUS || null,
        filespace: window.ULTRON_NEURAL_FILESPACE?.state || null,
        neural3d: window.ULTRON_NEURAL_3D?.state || null,
        metrics: metrics.slice(-20)
      };
    }
  };

  if (output) {
    const line = document.createElement('p');
    line.textContent = '> [JARVIS-RUNTIME] v4.32.0 // EXPERIENCE + VOICE GUARD + TELEMETRY ONLINE';
    output.appendChild(line);
  }
}