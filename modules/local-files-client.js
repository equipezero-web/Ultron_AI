const BASE_URL = localStorage.getItem('ultron_local_core_url') || 'http://127.0.0.1:8765';
const output = document.getElementById('output-box');

const state = {
  online: false,
  health: null,
  files: [],
  lastResults: [],
  activeFile: null,
  components: []
};

function log(message, alert = false) {
  if (!output) return;
  const line = document.createElement('p');
  if (alert) line.className = 'alert';
  const time = new Date().toLocaleTimeString('pt-BR', { hour12: false });
  line.textContent = `> [${time}] [LOCAL FILES] ${message}`;
  output.appendChild(line);
  output.scrollTop = output.scrollHeight;
}

async function request(path, options = {}, timeoutMs = 5000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort('timeout'), timeoutMs);
  try {
    const response = await fetch(`${BASE_URL}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.detail || data?.error || `HTTP ${response.status}`);
    return data;
  } finally {
    clearTimeout(timer);
  }
}

async function health() {
  try {
    const data = await request('/health', {}, 2200);
    state.online = Boolean(data?.ok);
    state.health = data;
    return data;
  } catch (error) {
    state.online = false;
    state.health = null;
    return { ok: false, error: error?.message || String(error) };
  }
}

async function indexBase(force = false) {
  const data = await request('/index', {
    method: 'POST',
    body: JSON.stringify({ force })
  }, 120000);
  await loadFiles();
  return data;
}

async function loadFiles() {
  const data = await request('/files');
  state.files = Array.isArray(data?.files) ? data.files : [];
  return state.files;
}

async function search(query, limit = 6) {
  const data = await request('/search', {
    method: 'POST',
    body: JSON.stringify({ query, limit })
  }, 10000);
  state.lastResults = Array.isArray(data?.results) ? data.results : [];
  return state.lastResults;
}

async function command(commandText, limit = 6) {
  return request('/command', {
    method: 'POST',
    body: JSON.stringify({ command: commandText, limit })
  }, 10000);
}

async function splitFile(fileId) {
  const data = await request(`/file/${encodeURIComponent(fileId)}/split`);
  state.activeFile = data?.file || null;
  state.components = Array.isArray(data?.components) ? data.components : [];
  return data;
}

async function openFile(fileId) {
  return request(`/file/${encodeURIComponent(fileId)}/open`, { method: 'POST', body: '{}' });
}

async function exportFile(sourceFileId, content, filename) {
  return request('/compose/export', {
    method: 'POST',
    body: JSON.stringify({ source_file_id: sourceFileId, content, filename, confirm: true })
  }, 15000);
}

function panelContent() {
  return document.querySelector('.stark-holo-content');
}

function panelTitle() {
  return String(document.querySelector('.stark-holo-title')?.textContent || '').trim().toUpperCase();
}

function button(label, handler) {
  const el = document.createElement('button');
  el.type = 'button';
  el.textContent = label;
  el.addEventListener('click', handler);
  return el;
}

function fileCard(file, detail = '') {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'ultron-file-card';
  const strong = document.createElement('strong');
  strong.textContent = file?.name || file?.path || 'Arquivo';
  const small = document.createElement('small');
  small.textContent = detail || `${file?.path || ''} // ${file?.chunks ?? 0} bloco(s)`;
  el.append(strong, small);
  el.addEventListener('click', () => renderFileLab(file.file_id));
  return el;
}

function rootShell() {
  const shell = document.createElement('section');
  shell.className = 'ultron-local-base';
  shell.dataset.ultronLocalBase = 'true';

  const head = document.createElement('div');
  head.className = 'ultron-local-head';
  const title = document.createElement('strong');
  title.textContent = 'ULTRON_DATA // LOCAL KNOWLEDGE BASE';
  const status = document.createElement('span');
  status.className = `ultron-local-status${state.online ? ' online' : ''}`;
  status.textContent = state.online ? 'LOCAL CORE ONLINE' : 'LOCAL CORE OFFLINE';
  head.append(title, status);
  shell.appendChild(head);
  return shell;
}

async function renderBase() {
  if (panelTitle() !== 'ARQUIVOS') return;
  const content = panelContent();
  if (!content) return;
  content.querySelector('[data-ultron-local-base]')?.remove();

  await health();
  const shell = rootShell();
  content.appendChild(shell);

  const note = document.createElement('div');
  note.className = 'ultron-local-note';

  if (!state.online) {
    note.classList.add('ultron-local-error');
    note.textContent = 'O serviço local não está rodando. Inicie local-core/start.bat no computador para conectar a pasta Ultron_Data.';
    shell.appendChild(note);
    const actions = document.createElement('div');
    actions.className = 'ultron-local-actions';
    actions.append(button('TENTAR CONECTAR', () => renderBase()));
    shell.appendChild(actions);
    return;
  }

  note.textContent = `${state.health?.files || 0} arquivo(s) indexado(s) // ${state.health?.vector_chunks || 0} vetor(es) // ${state.health?.model || 'embedding local'}`;
  shell.appendChild(note);

  const actions = document.createElement('div');
  actions.className = 'ultron-local-actions';
  actions.append(
    button('INDEXAR BASE', async () => {
      log('Indexando Ultron_Data...');
      try {
        const result = await indexBase(false);
        log(`Indexação concluída: ${result.files_indexed || 0} atualizado(s), ${result.files_skipped || 0} preservado(s).`);
        await renderBase();
      } catch (error) {
        log(`Falha na indexação: ${error?.message || error}`, true);
      }
    }),
    button('REINDEXAR TUDO', async () => {
      if (!confirm('Reindexar toda a base local do Ultron? Os arquivos originais não serão alterados.')) return;
      try {
        await indexBase(true);
        await renderBase();
      } catch (error) {
        log(`Falha na reindexação: ${error?.message || error}`, true);
      }
    })
  );
  shell.appendChild(actions);

  const searchBox = document.createElement('div');
  searchBox.className = 'ultron-local-search';
  const input = document.createElement('input');
  input.placeholder = 'Buscar por significado na base local...';
  const searchBtn = button('BUSCAR', async () => {
    const query = input.value.trim();
    if (!query) return;
    try {
      const results = await search(query, 8);
      renderSearchResults(shell, results);
    } catch (error) {
      log(`Busca local falhou: ${error?.message || error}`, true);
    }
  });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') searchBtn.click();
  });
  searchBox.append(input, searchBtn);
  shell.appendChild(searchBox);

  try {
    const files = await loadFiles();
    renderFileList(shell, files.slice(0, 14));
  } catch (error) {
    note.classList.add('ultron-local-error');
    note.textContent = `Falha ao listar a base local: ${error?.message || error}`;
  }
}

function renderFileList(shell, files) {
  shell.querySelector('.ultron-file-list')?.remove();
  const list = document.createElement('div');
  list.className = 'ultron-file-list';
  if (!files.length) {
    const empty = document.createElement('div');
    empty.className = 'ultron-local-note';
    empty.textContent = 'Nenhum arquivo indexado. Coloque arquivos em Ultron_Data e use INDEXAR BASE.';
    list.appendChild(empty);
  } else {
    files.forEach((file) => list.appendChild(fileCard(file)));
  }
  shell.appendChild(list);
}

function renderSearchResults(shell, results) {
  shell.querySelector('.ultron-file-list')?.remove();
  const list = document.createElement('div');
  list.className = 'ultron-file-list';
  if (!results.length) {
    const empty = document.createElement('div');
    empty.className = 'ultron-local-note ultron-local-error';
    empty.textContent = 'Nenhum resultado semântico encontrado.';
    list.appendChild(empty);
  } else {
    const unique = new Map();
    for (const result of results) {
      if (!unique.has(result.file_id)) unique.set(result.file_id, result);
    }
    [...unique.values()].forEach((result) => {
      list.appendChild(fileCard(result, `${result.path} // similaridade ${Math.round((result.score || 0) * 100)}%`));
    });
  }
  shell.appendChild(list);
}

async function renderFileLab(fileId) {
  const content = panelContent();
  if (!content) return;

  try {
    const data = await splitFile(fileId);
    content.replaceChildren();

    const lab = document.createElement('section');
    lab.className = 'ultron-file-lab';

    const title = document.createElement('div');
    title.className = 'ultron-file-lab-title';
    const titleText = document.createElement('div');
    const strong = document.createElement('strong');
    strong.textContent = data.file?.name || 'ARQUIVO';
    const small = document.createElement('small');
    small.textContent = `${data.file?.path || ''} // ${data.components?.length || 0} componente(s)`;
    titleText.append(strong, small);
    title.appendChild(titleText);
    lab.appendChild(title);

    const actions = document.createElement('div');
    actions.className = 'ultron-local-actions';
    actions.append(
      button('← VOLTAR À BASE', renderBase),
      button('ABRIR NO SISTEMA', async () => {
        try {
          await openFile(fileId);
          log(`${data.file?.name || 'Arquivo'} aberto no sistema.`);
        } catch (error) {
          log(`Não foi possível abrir o arquivo: ${error?.message || error}`, true);
        }
      }),
      button('REMONTAR / EXPORTAR', async () => {
        const cards = [...lab.querySelectorAll('.ultron-component-card')];
        const contentText = cards.map((card) => card.querySelector('textarea')?.value || '').join('\n\n');
        if (!confirm('Criar uma NOVA versão remontada em Ultron_Data/_exports? O original não será sobrescrito.')) return;
        try {
          const result = await exportFile(fileId, contentText, null);
          log(`Arquivo remontado exportado em ${result.exported}.`);
        } catch (error) {
          log(`Falha ao exportar: ${error?.message || error}`, true);
        }
      })
    );
    lab.appendChild(actions);

    const note = document.createElement('div');
    note.className = 'ultron-local-note';
    note.textContent = 'Arraste os blocos para reordenar. Edite o conteúdo diretamente. A alteração só vira arquivo quando você confirmar REMONTAR / EXPORTAR.';
    lab.appendChild(note);

    const components = document.createElement('div');
    components.className = 'ultron-components';
    (data.components || []).forEach((component, index) => {
      components.appendChild(componentCard(component, index));
    });
    lab.appendChild(components);
    content.appendChild(lab);

    enableComponentDnD(components);
    window.dispatchEvent(new CustomEvent('ultron:file-workspace-open', {
      detail: { file: data.file, components: data.components || [] }
    }));
  } catch (error) {
    log(`Falha ao desmembrar arquivo: ${error?.message || error}`, true);
  }
}

function componentCard(component, index) {
  const card = document.createElement('article');
  card.className = 'ultron-component-card';
  card.draggable = true;
  card.dataset.componentId = component.id;

  const top = document.createElement('div');
  top.className = 'ultron-component-top';
  const label = document.createElement('span');
  label.textContent = `COMPONENTE ${String(index + 1).padStart(2, '0')}`;
  const controls = document.createElement('div');
  controls.append(
    button('↑', () => card.previousElementSibling?.before(card)),
    button('↓', () => card.nextElementSibling?.after(card))
  );
  top.append(label, controls);

  const textarea = document.createElement('textarea');
  textarea.value = component.text || '';
  textarea.spellcheck = false;
  card.append(top, textarea);
  return card;
}

function enableComponentDnD(container) {
  let dragging = null;
  container.addEventListener('dragstart', (event) => {
    const card = event.target.closest('.ultron-component-card');
    if (!card) return;
    dragging = card;
    card.classList.add('dragging');
    event.dataTransfer.effectAllowed = 'move';
  });
  container.addEventListener('dragend', () => {
    dragging?.classList.remove('dragging');
    dragging = null;
  });
  container.addEventListener('dragover', (event) => {
    if (!dragging) return;
    event.preventDefault();
    const target = event.target.closest('.ultron-component-card');
    if (!target || target === dragging) return;
    const rect = target.getBoundingClientRect();
    const before = event.clientY < rect.top + rect.height / 2;
    container.insertBefore(dragging, before ? target : target.nextSibling);
  });
}

function looksLikeFileCommand(text) {
  return /\b(arquivo|arquivos|documento|documentos|pdf|planilha|codigo|código|relatorio|relatório|ultron_data)\b/i.test(String(text || ''));
}

async function buildSemanticContext(commandText, limit = 6) {
  if (!looksLikeFileCommand(commandText)) return null;
  const status = await health();
  if (!status?.ok) return null;
  const result = await command(commandText, limit);
  if (!result?.matches?.length) return result;
  result.contextText = [
    'CONTEXTO LOCAL RECUPERADO DA BASE ULTRON_DATA:',
    ...result.matches.slice(0, limit).map((item, index) => [
      `${index + 1}. ${item.path}`,
      `Similaridade: ${Math.round((item.score || 0) * 100)}%`,
      `Trecho: ${String(item.text || '').slice(0, 1000)}`
    ].join('\n'))
  ].join('\n\n');
  return result;
}

document.addEventListener('click', (event) => {
  const node = event.target.closest?.('.stark-functional-node');
  if (node?.dataset?.label === 'ARQUIVOS') {
    setTimeout(renderBase, 70);
  }
}, true);

window.ULTRON_LOCAL_FILES = {
  baseUrl: BASE_URL,
  health,
  index: indexBase,
  files: loadFiles,
  search,
  command,
  split: splitFile,
  open: openFile,
  export: exportFile,
  render: renderBase,
  semanticContext: buildSemanticContext,
  get state() { return { ...state }; }
};

setTimeout(async () => {
  const status = await health();
  if (status?.ok) log(`Base local conectada: ${status.files || 0} arquivo(s), ${status.vector_chunks || 0} vetor(es).`);
}, 1600);
