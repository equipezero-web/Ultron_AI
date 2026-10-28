const stage = document.querySelector('.neural-stage');
const vortex = document.querySelector('.stark-vortex');
const field = document.querySelector('.stark-node-field');
const output = document.getElementById('output-box');
const layer = document.querySelector('.stark-core-layer');

const CORE_FILES = [
  { name: 'index.html', path: 'index.html', kind: 'core', icon: 'HTML' },
  { name: 'script.js', path: 'script.js', kind: 'core', icon: 'JS' },
  { name: 'style.css', path: 'style.css', kind: 'core', icon: 'CSS' },
  { name: 'worker-v4.js', path: 'backend/worker-v4.js', kind: 'core', icon: 'WK' },
  { name: 'providers.js', path: 'backend/providers.js', kind: 'core', icon: 'AI' },
  { name: 'memory.js', path: 'backend/memory.js', kind: 'core', icon: 'MEM' },
  { name: 'stark-core.js', path: 'modules/stark-core.js', kind: 'core', icon: 'HUD' },
  { name: 'server.py', path: 'local-core/server.py', kind: 'core', icon: 'PY' }
];

const state = {
  active: false,
  localOnline: false,
  localFiles: [],
  rendered: [],
  selected: null
};

function log(message, alert = false) {
  if (!output) return;
  const line = document.createElement('p');
  if (alert) line.className = 'alert';
  const time = new Date().toLocaleTimeString('pt-BR', { hour12: false });
  line.textContent = `> [${time}] [FILE-MESH] ${message}`;
  output.appendChild(line);
  output.scrollTop = output.scrollHeight;
}

function shortLabel(name, max = 17) {
  const text = String(name || 'ARQUIVO');
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function iconFor(file) {
  const name = String(file?.name || file?.path || '').toLowerCase();
  if (name.endsWith('.js') || name.endsWith('.ts')) return 'JS';
  if (name.endsWith('.py')) return 'PY';
  if (name.endsWith('.html')) return '<>';
  if (name.endsWith('.css')) return '#';
  if (name.endsWith('.pdf')) return 'PDF';
  if (name.endsWith('.docx') || name.endsWith('.doc')) return 'DOC';
  if (name.endsWith('.xlsx') || name.endsWith('.xlsm') || name.endsWith('.csv')) return 'XL';
  if (/\.(png|jpe?g|webp|gif)$/i.test(name)) return 'IMG';
  if (/\.(mp4|mov|webm)$/i.test(name)) return 'VID';
  return 'FILE';
}

function banner() {
  if (!layer) return null;
  let el = layer.querySelector('.stark-file-mesh-banner');
  if (!el) {
    el = document.createElement('div');
    el.className = 'stark-file-mesh-banner';
    layer.appendChild(el);
  }
  return el;
}

function updateBanner() {
  const el = banner();
  if (!el) return;
  el.classList.toggle('visible', state.active);
  el.innerHTML = `<b>FILE MESH</b><span>${CORE_FILES.length} CORE // ${state.localFiles.length} ULTRON_DATA // ${state.localOnline ? 'LOCAL ONLINE' : 'LOCAL OFFLINE'}</span>`;
}

function clearFileNodes() {
  field?.querySelectorAll('.stark-file-node').forEach((node) => node.remove());
  state.rendered = [];
}

function nodePosition(index, count) {
  const rect = vortex.getBoundingClientRect();
  const width = Math.max(280, rect.width || 420);
  const height = Math.max(280, rect.height || width);
  const shellIndex = index % 3;
  const shell = [0.42, 0.62, 0.78][shellIndex];
  const angle = ((Math.PI * 2) * index / Math.max(1, count)) - Math.PI / 2 + shellIndex * 0.23;
  return {
    x: Math.cos(angle) * width * 0.23 * shell,
    y: Math.sin(angle) * height * 0.20 * shell,
    z: ((index % 7) - 3) * 15
  };
}

function placeNode(node, index, count) {
  const pos = nodePosition(index, count);
  node.style.setProperty('--x', `${pos.x}px`);
  node.style.setProperty('--y', `${pos.y}px`);
  node.style.setProperty('--z', `${pos.z}px`);
  node.dataset.innerMesh = 'true';
}

function makeNode(item, index, count) {
  const node = document.createElement('button');
  node.type = 'button';
  node.className = 'stark-functional-node stark-file-node';
  node.dataset.label = String(item.name || 'ARQUIVO').toUpperCase();
  node.dataset.shortLabel = shortLabel(item.name || item.path);
  node.dataset.fileKind = item.kind || 'local';
  if (item.file_id) node.dataset.fileId = item.file_id;
  if (item.path) node.dataset.filePath = item.path;
  node.innerHTML = `<span class="stark-node-icon" aria-hidden="true">${item.icon || iconFor(item)}</span>`;
  node.setAttribute('aria-label', `${item.name || item.path} — abrir arquivo`);
  node.addEventListener('click', (event) => {
    event.stopPropagation();
    openItem(item).catch((error) => log(error?.message || String(error), true));
  });
  placeNode(node, index, count);
  field.appendChild(node);
  state.rendered.push({ node, item });
  return node;
}

function openPanel(title) {
  const panel = document.querySelector('.stark-holo-panel');
  const panelTitle = document.querySelector('.stark-holo-title');
  const content = document.querySelector('.stark-holo-content');
  if (!panel || !panelTitle || !content) return null;
  panelTitle.textContent = String(title || 'ARQUIVO').toUpperCase();
  panel.classList.add('visible');
  panel.setAttribute('aria-hidden', 'false');
  stage?.classList.add('stark-panel-open');
  content.replaceChildren();
  return content;
}

function metaGrid(items) {
  const grid = document.createElement('div');
  grid.className = 'stark-file-detail-meta';
  items.forEach(([label, value]) => {
    const cell = document.createElement('div');
    const small = document.createElement('small');
    small.textContent = label;
    const strong = document.createElement('strong');
    strong.textContent = String(value ?? '—');
    cell.append(small, strong);
    grid.appendChild(cell);
  });
  return grid;
}

function action(label, handler) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'stark-holo-action';
  button.textContent = label;
  button.addEventListener('click', handler);
  return button;
}

function commandUltron(text) {
  const input = document.getElementById('command-input');
  const send = document.getElementById('btn-send');
  if (!input || !send) return false;
  input.value = text;
  send.click();
  return true;
}

async function openCoreFile(item) {
  const content = openPanel(item.name);
  if (!content) return;
  const shell = document.createElement('section');
  shell.className = 'stark-file-detail';
  shell.appendChild(metaGrid([
    ['TIPO', 'ULTRON CORE'],
    ['CAMINHO', item.path],
    ['ORIGEM', 'GITHUB'],
    ['MODO', 'READ / ASK ULTRON']
  ]));

  const actions = document.createElement('div');
  actions.className = 'stark-holo-action-grid';
  actions.append(
    action('ABRIR NO GITHUB', () => window.open(`https://github.com/equipezero-web/Ultron_AI/blob/main/${item.path}`, '_blank', 'noopener')),
    action('PEDIR ANÁLISE AO ULTRON', () => commandUltron(`Ultron, analise o arquivo ${item.path} do seu próprio sistema e me explique sua função, riscos e melhorias possíveis.`))
  );
  shell.appendChild(actions);

  const preview = document.createElement('div');
  preview.className = 'stark-holo-empty';
  preview.innerHTML = '<strong>CARREGANDO ARQUIVO DO NÚCLEO...</strong><span>Leitura somente para visualização holográfica.</span>';
  shell.appendChild(preview);
  content.appendChild(shell);

  try {
    const response = await fetch(`https://raw.githubusercontent.com/equipezero-web/Ultron_AI/main/${item.path}`, { cache: 'no-store' });
    const text = response.ok ? await response.text() : '';
    const area = document.createElement('textarea');
    area.readOnly = true;
    area.value = text.slice(0, 50000);
    area.style.cssText = 'width:100%;min-height:260px;resize:vertical;border:1px solid rgba(0,240,255,.16);background:rgba(0,0,0,.34);color:#dffcff;padding:8px;font:8px/1.45 ui-monospace,monospace;outline:none';
    preview.replaceChildren(area);
  } catch {
    preview.innerHTML = '<strong>PREVIEW INDISPONÍVEL</strong><span>Use ABRIR NO GITHUB para visualizar o arquivo.</span>';
  }
}

async function openLocalFile(item) {
  const api = window.ULTRON_LOCAL_FILES;
  if (!api || !item.file_id) return;
  const data = await api.split(item.file_id);
  const content = openPanel(data?.file?.name || item.name);
  if (!content) return;

  const shell = document.createElement('section');
  shell.className = 'stark-file-detail';
  shell.appendChild(metaGrid([
    ['TIPO', 'ULTRON_DATA'],
    ['CAMINHO', data?.file?.path || item.path],
    ['COMPONENTES', data?.components?.length || 0],
    ['MODO', 'EDIT / EXPORT SAFE']
  ]));

  const actions = document.createElement('div');
  actions.className = 'stark-holo-action-grid';
  actions.append(
    action('ABRIR NO SISTEMA', () => api.open(item.file_id).catch((error) => log(error?.message || error, true))),
    action('PEDIR REVISÃO AO ULTRON', () => commandUltron(`Ultron, analise o arquivo ${data?.file?.path || item.name} da minha Ultron_Data, identifique problemas e proponha uma nova versão sem sobrescrever o original.`))
  );
  shell.appendChild(actions);

  const components = document.createElement('div');
  components.className = 'stark-file-detail-components';
  (data?.components || []).forEach((component, index) => {
    const card = document.createElement('article');
    card.className = 'stark-file-detail-component';
    const label = document.createElement('span');
    label.textContent = `COMPONENTE ${String(index + 1).padStart(2, '0')}`;
    const textarea = document.createElement('textarea');
    textarea.value = component?.text || '';
    textarea.spellcheck = false;
    card.append(label, textarea);
    components.appendChild(card);
  });
  shell.appendChild(components);

  const exportButton = action('REMONTAR / EXPORTAR NOVA VERSÃO', async () => {
    if (!confirm('Criar uma nova versão em Ultron_Data/_exports? O arquivo original permanecerá intacto.')) return;
    const text = [...components.querySelectorAll('textarea')].map((area) => area.value).join('\n\n');
    try {
      const result = await api.export(item.file_id, text, null);
      log(`Nova versão exportada: ${result?.exported || 'concluída'}.`);
    } catch (error) {
      log(`Falha ao remontar: ${error?.message || error}`, true);
    }
  });
  exportButton.classList.add('wide');
  shell.appendChild(exportButton);
  content.appendChild(shell);
  state.selected = item.file_id;
}

async function openItem(item) {
  if (item.kind === 'back') {
    exit();
    return;
  }
  if (item.kind === 'more') {
    window.ULTRON_STARK_CORE?.open?.('ARQUIVOS');
    setTimeout(() => window.ULTRON_LOCAL_FILES?.render?.(), 80);
    return;
  }
  if (item.kind === 'core') return openCoreFile(item);
  return openLocalFile(item);
}

async function collectItems({ requestLocal = true } = {}) {
  let local = [];
  let online = false;
  const api = window.ULTRON_LOCAL_FILES;
  if (api) {
    try {
      const health = requestLocal ? await api.connect() : await api.health({ allowPrompt: false });
      online = Boolean(health?.ok);
      if (online) local = await api.files();
    } catch {
      online = false;
    }
  }
  state.localOnline = online;
  state.localFiles = Array.isArray(local) ? local : [];

  const localVisible = state.localFiles.slice(0, 10).map((file) => ({
    ...file,
    name: file.name || file.path || 'Arquivo local',
    kind: 'local',
    icon: iconFor(file)
  }));

  const items = [
    { name: '← CORE', kind: 'back', icon: '↩' },
    ...CORE_FILES,
    ...localVisible
  ];

  if (state.localFiles.length > localVisible.length) {
    items.push({ name: `+${state.localFiles.length - localVisible.length} MAIS`, kind: 'more', icon: '+' });
  } else if (!online) {
    items.push({ name: 'CONECTAR LOCAL', kind: 'more', icon: '⌁' });
  }
  return items;
}

async function render({ requestLocal = true } = {}) {
  clearFileNodes();
  const items = await collectItems({ requestLocal });
  items.forEach((item, index) => makeNode(item, index, items.length));
  window.ULTRON_STARK_MESH?.refresh?.();
  updateBanner();
  return items;
}

async function enter() {
  if (!field || !vortex) return false;
  state.active = true;
  vortex.classList.add('stark-file-mode');
  window.ULTRON_STARK_CORE?.close?.();
  await render({ requestLocal: true });
  log(`File Mesh aberto: ${CORE_FILES.length} arquivos do núcleo + ${state.localFiles.length} arquivo(s) Ultron_Data.`);
  return true;
}

function exit() {
  state.active = false;
  state.selected = null;
  vortex?.classList.remove('stark-file-mode');
  clearFileNodes();
  window.ULTRON_STARK_MESH?.refresh?.();
  updateBanner();
  log('File Mesh recolhido. Retornando aos módulos principais.');
  return true;
}

window.addEventListener('ultron:stark-node', (event) => {
  if (String(event.detail?.label || '').toUpperCase() === 'ARQUIVOS') {
    enter().catch((error) => log(error?.message || String(error), true));
  }
});

window.addEventListener('ultron:palm-fist-anchor', () => {
  if (state.active) exit();
});

window.addEventListener('resize', () => {
  if (!state.active) return;
  state.rendered.forEach(({ node }, index) => placeNode(node, index, state.rendered.length));
});

window.ULTRON_FILE_MESH = {
  enter,
  exit,
  refresh: render,
  openFileNode(labelOrId) {
    const wanted = String(labelOrId || '').toUpperCase();
    const entry = state.rendered.find(({ node, item }) =>
      node.dataset.label === wanted || String(item.file_id || '').toUpperCase() === wanted
    );
    if (!entry) return false;
    openItem(entry.item).catch((error) => log(error?.message || String(error), true));
    return true;
  },
  get active() { return state.active; },
  get state() { return { ...state, rendered: state.rendered.length }; }
};

updateBanner();
