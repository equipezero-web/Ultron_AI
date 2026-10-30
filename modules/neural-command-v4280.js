const stage = document.querySelector('.neural-stage');
const orbStage = document.querySelector('.orb-stage');
const output = document.getElementById('output-box');

if (stage && orbStage) {
  const CORE_FILES = new Set([
    'index.html', 'script.js', 'style.css', 'backend/worker-v6.js', 'backend/providers.js',
    'backend/memory.js', 'modules/stark-core.js', 'local-core/server.py'
  ]);

  const state = {
    inside: false,
    transitioning: false,
    workspaceOpen: false,
    current: null,
    localFiles: [],
    cache: new Map(),
    transfers: [],
    dragPayload: null,
    lastEnterAt: 0,
    lastScaleProbeAt: 0,
    filesReady: false
  };

  function log(message, alert = false) {
    if (!output) return;
    const line = document.createElement('p');
    if (alert) line.className = 'alert';
    const time = new Date().toLocaleTimeString('pt-BR', { hour12: false });
    line.textContent = `> [${time}] [NEURAL-COMMAND-4.28] ${message}`;
    output.appendChild(line);
    output.scrollTop = output.scrollHeight;
  }

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function esc(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  const fragmentLayer = document.createElement('div');
  fragmentLayer.className = 'nc-fragment-layer';
  fragmentLayer.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < 24; i += 1) {
    const shard = document.createElement('i');
    shard.className = 'nc-fragment';
    const angle = (360 / 24) * i + (i % 2 ? 7 : -5);
    const distance = 155 + (i % 6) * 28;
    const z = ((i % 7) - 3) * 28;
    shard.style.setProperty('--fa', `${angle}deg`);
    shard.style.setProperty('--fd', `${distance}px`);
    shard.style.setProperty('--fz', `${z}px`);
    shard.style.setProperty('--fr', `${(i * 47) % 260 - 130}deg`);
    fragmentLayer.appendChild(shard);
  }
  orbStage.appendChild(fragmentLayer);

  const controls = document.createElement('div');
  controls.className = 'nc-enter-controls';
  controls.innerHTML = `
    <button type="button" class="nc-enter-button">ENTRAR NO NÚCLEO</button>
    <span class="nc-enter-status">ZOOM PROFUNDO / DUPLO CLIQUE</span>
  `;
  stage.appendChild(controls);

  const workspace = document.createElement('section');
  workspace.className = 'nc-workspace';
  workspace.setAttribute('aria-hidden', 'true');
  workspace.innerHTML = `
    <div class="nc-workspace-head">
      <div class="nc-workspace-title">
        <small>NEURAL COMMAND // INTERNAL FILESPACE</small>
        <strong data-nc-title>ARQUIVO</strong>
      </div>
      <div class="nc-workspace-actions">
        <button type="button" data-nc-apply disabled>APLICAR TRANSFERÊNCIAS</button>
        <button type="button" data-nc-close>VOLTAR AOS ARQUIVOS</button>
        <button type="button" data-nc-exit>FECHAR NÚCLEO</button>
      </div>
    </div>
    <div class="nc-workspace-grid">
      <div class="nc-file-content" data-nc-content></div>
      <aside class="nc-destination-dock">
        <h3 class="nc-dock-title">DESTINOS ULTRON_DATA</h3>
        <p class="nc-dock-note">Arraste um componente do arquivo aberto para outro arquivo. A transferência só é gravada após confirmação e gera novas versões; os originais ficam preservados.</p>
        <div class="nc-destination-list" data-nc-destinations></div>
        <div class="nc-transfer-list" data-nc-transfers></div>
      </aside>
    </div>
  `;
  stage.appendChild(workspace);

  const titleEl = workspace.querySelector('[data-nc-title]');
  const contentEl = workspace.querySelector('[data-nc-content]');
  const destinationsEl = workspace.querySelector('[data-nc-destinations]');
  const transfersEl = workspace.querySelector('[data-nc-transfers]');
  const applyButton = workspace.querySelector('[data-nc-apply]');
  const closeButton = workspace.querySelector('[data-nc-close]');
  const exitButton = workspace.querySelector('[data-nc-exit]');
  const enterButton = controls.querySelector('.nc-enter-button');

  function showWorkspace(visible) {
    state.workspaceOpen = Boolean(visible);
    workspace.classList.toggle('visible', state.workspaceOpen);
    workspace.setAttribute('aria-hidden', state.workspaceOpen ? 'false' : 'true');
    stage.classList.toggle('nc-workspace-open', state.workspaceOpen);
  }

  function renderMessage(message, alert = false) {
    const box = document.createElement('div');
    box.className = 'nc-workspace-message';
    if (alert) box.style.borderLeftColor = 'rgba(255,100,125,.75)';
    box.textContent = String(message || '');
    contentEl.replaceChildren(box);
  }

  function renderMeta(items) {
    const meta = document.createElement('div');
    meta.className = 'nc-file-meta';
    for (const [label, value] of items) {
      const cell = document.createElement('div');
      const small = document.createElement('small');
      const strong = document.createElement('strong');
      small.textContent = label;
      strong.textContent = String(value ?? '—');
      cell.append(small, strong);
      meta.appendChild(cell);
    }
    return meta;
  }

  async function refreshLocalFiles({ prompt = false } = {}) {
    const api = window.ULTRON_LOCAL_FILES;
    if (!api) return [];
    try {
      const health = prompt ? await api.connect?.() : await api.health?.({ allowPrompt: false });
      if (!health?.ok) return [];
      const files = await api.files?.();
      state.localFiles = Array.isArray(files) ? files : [];
      state.filesReady = true;
      return state.localFiles;
    } catch {
      return [];
    }
  }

  async function splitCached(fileId, { force = false } = {}) {
    if (!fileId) return null;
    if (!force && state.cache.has(fileId)) return state.cache.get(fileId);
    const api = window.ULTRON_LOCAL_FILES;
    if (!api?.split) return null;
    const data = await api.split(fileId);
    state.cache.set(fileId, data);
    return data;
  }

  function currentDomComponents() {
    return [...contentEl.querySelectorAll('.nc-component')].map((card, index) => ({
      id: card.dataset.componentId || `component-${index + 1}`,
      text: card.querySelector('textarea')?.value || '',
      staged: card.classList.contains('staged-move')
    }));
  }

  function renderTransfers() {
    transfersEl.replaceChildren();
    if (!state.transfers.length) {
      const empty = document.createElement('div');
      empty.className = 'nc-transfer-item';
      empty.textContent = 'NENHUMA TRANSFERÊNCIA PENDENTE';
      transfersEl.appendChild(empty);
    } else {
      for (const transfer of state.transfers) {
        const item = document.createElement('div');
        item.className = 'nc-transfer-item';
        item.textContent = `${transfer.sourceName} // ${transfer.componentLabel} → ${transfer.targetName}`;
        transfersEl.appendChild(item);
      }
    }
    applyButton.disabled = !state.transfers.length;
  }

  function makeDestination(file) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'nc-destination';
    button.dataset.fileId = file.file_id || '';
    button.innerHTML = `<strong>${esc(file.name || file.path || 'ARQUIVO')}</strong><small>${esc(file.path || '')}</small>`;
    button.addEventListener('click', () => openLocal(file).catch((error) => log(error?.message || error, true)));
    button.addEventListener('dragenter', (event) => {
      event.preventDefault();
      button.classList.add('drop-ready');
    });
    button.addEventListener('dragover', (event) => {
      if (!state.dragPayload) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      button.classList.add('drop-ready');
    });
    button.addEventListener('dragleave', () => button.classList.remove('drop-ready'));
    button.addEventListener('drop', async (event) => {
      event.preventDefault();
      button.classList.remove('drop-ready');
      const payload = state.dragPayload;
      if (!payload || !file.file_id || file.file_id === payload.sourceFileId) return;
      await stageTransfer(payload, file);
    });
    return button;
  }

  function renderDestinations() {
    destinationsEl.replaceChildren();
    const currentId = state.current?.file_id || null;
    const destinations = state.localFiles.filter((file) => file.file_id && file.file_id !== currentId);
    if (!destinations.length) {
      const empty = document.createElement('div');
      empty.className = 'nc-workspace-message';
      empty.textContent = 'Nenhum outro arquivo local disponível como destino.';
      destinationsEl.appendChild(empty);
      return;
    }
    destinations.slice(0, 30).forEach((file) => destinationsEl.appendChild(makeDestination(file)));
  }

  function componentCard(component, index, source) {
    const card = document.createElement('article');
    card.className = 'nc-component';
    card.draggable = true;
    card.dataset.componentId = component.id || `component-${index + 1}`;
    const top = document.createElement('div');
    top.className = 'nc-component-top';
    const label = document.createElement('span');
    label.textContent = `COMPONENTE ${String(index + 1).padStart(2, '0')}`;
    const hint = document.createElement('span');
    hint.textContent = 'ARRASTE PARA MOVER';
    top.append(label, hint);
    const textarea = document.createElement('textarea');
    textarea.value = component.text || '';
    textarea.spellcheck = false;
    card.append(top, textarea);

    card.addEventListener('dragstart', (event) => {
      state.dragPayload = {
        sourceFileId: source.file_id,
        sourceName: source.name || source.path || 'ARQUIVO',
        componentId: card.dataset.componentId,
        componentLabel: label.textContent,
        text: textarea.value
      };
      card.classList.add('dragging');
      event.dataTransfer.effectAllowed = 'move';
      try { event.dataTransfer.setData('text/plain', `${source.name || source.path}: ${label.textContent}`); } catch {}
    });
    card.addEventListener('dragend', () => {
      card.classList.remove('dragging');
      state.dragPayload = null;
      workspace.querySelectorAll('.drop-ready').forEach((el) => el.classList.remove('drop-ready'));
    });
    return card;
  }

  async function stageTransfer(payload, targetFile) {
    if (!payload?.sourceFileId || !payload.componentId || !targetFile?.file_id) return false;
    const duplicate = state.transfers.some((item) =>
      item.sourceFileId === payload.sourceFileId &&
      item.componentId === payload.componentId &&
      item.targetFileId === targetFile.file_id
    );
    if (duplicate) return false;

    const transfer = {
      sourceFileId: payload.sourceFileId,
      sourceName: payload.sourceName,
      componentId: payload.componentId,
      componentLabel: payload.componentLabel,
      text: payload.text,
      targetFileId: targetFile.file_id,
      targetName: targetFile.name || targetFile.path || 'DESTINO'
    };
    state.transfers.push(transfer);
    contentEl.querySelector(`.nc-component[data-component-id="${CSS.escape(payload.componentId)}"]`)?.classList.add('staged-move');
    renderTransfers();
    log(`Transferência preparada: ${transfer.componentLabel} → ${transfer.targetName}.`);
    return true;
  }

  async function openLocal(file) {
    if (!file?.file_id) return false;
    showWorkspace(true);
    titleEl.textContent = String(file.name || file.path || 'ARQUIVO').toUpperCase();
    renderMessage('CARREGANDO CONTEÚDO INTERNO DO ARQUIVO...');
    state.current = { ...file, kind: 'local' };
    state.transfers = [];
    renderTransfers();

    try {
      if (!state.filesReady) await refreshLocalFiles({ prompt: true });
      const data = await splitCached(file.file_id, { force: true });
      if (!data?.file) throw new Error('O Local Core não retornou os dados do arquivo.');
      state.current = { ...data.file, kind: 'local' };
      titleEl.textContent = String(data.file.name || data.file.path || 'ARQUIVO').toUpperCase();
      const shell = document.createElement('div');
      shell.appendChild(renderMeta([
        ['TIPO', 'ULTRON_DATA'],
        ['CAMINHO', data.file.path || file.path || '—'],
        ['COMPONENTES', data.components?.length || 0],
        ['MODO', 'NEURAL WORKSPACE']
      ]));

      const note = document.createElement('div');
      note.className = 'nc-workspace-message';
      note.textContent = 'Todo o conteúdo extraído está aberto dentro do Neural Command. Edite livremente ou arraste componentes para outro arquivo. Nada é sobrescrito diretamente.';
      shell.appendChild(note);

      const components = document.createElement('div');
      components.className = 'nc-components';
      (data.components || []).forEach((component, index) => components.appendChild(componentCard(component, index, state.current)));
      if (!data.components?.length) {
        const empty = document.createElement('div');
        empty.className = 'nc-workspace-message';
        empty.textContent = 'Este arquivo não possui componentes textuais extraíveis pelo Local Core.';
        components.appendChild(empty);
      }
      shell.appendChild(components);
      contentEl.replaceChildren(shell);
      renderDestinations();
      window.dispatchEvent(new CustomEvent('ultron:neural-file-open', { detail: { file: state.current, components: data.components || [] } }));
      log(`${state.current.name || state.current.path}: aberto dentro do Neural Command.`);
      return true;
    } catch (error) {
      renderMessage(`Não foi possível abrir o arquivo local: ${error?.message || error}`, true);
      return false;
    }
  }

  async function openCore(target) {
    const path = String(target?.filePath || target?.path || '').trim();
    const label = String(target?.label || target?.name || path || 'ARQUIVO').trim();
    if (!path) return false;
    showWorkspace(true);
    state.current = { path, name: label, kind: 'core' };
    state.transfers = [];
    titleEl.textContent = label.toUpperCase();
    renderTransfers();
    renderDestinations();
    renderMessage('CARREGANDO ARQUIVO READ-ONLY DO NÚCLEO...');

    const rawUrl = `https://raw.githubusercontent.com/equipezero-web/Ultron_AI/main/${path}`;
    try {
      const response = await fetch(rawUrl, { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const text = await response.text();
      const shell = document.createElement('div');
      shell.appendChild(renderMeta([
        ['TIPO', 'ULTRON CORE'],
        ['CAMINHO', path],
        ['ORIGEM', 'GITHUB'],
        ['MODO', 'READ ONLY']
      ]));
      const note = document.createElement('div');
      note.className = 'nc-workspace-message';
      note.textContent = 'Arquivo do núcleo aberto dentro do Neural Command. Arquivos do CORE são leitura somente; transferências são habilitadas apenas para Ultron_Data.';
      const preview = document.createElement('div');
      preview.className = 'nc-core-preview';
      const area = document.createElement('textarea');
      area.readOnly = true;
      area.value = text.slice(0, 160000);
      preview.appendChild(area);
      shell.append(note, preview);
      contentEl.replaceChildren(shell);
      log(`${path}: aberto no Neural Command em modo somente leitura.`);
      return true;
    } catch (error) {
      renderMessage(`Preview do núcleo indisponível: ${error?.message || error}`, true);
      return false;
    }
  }

  async function resolveLocalTarget(target) {
    const api = window.ULTRON_LOCAL_FILES;
    if (!api) return null;
    if (!state.filesReady) await refreshLocalFiles({ prompt: true });
    const wantedId = String(target?.fileId || target?.file_id || '');
    const wantedPath = String(target?.filePath || target?.path || '').toLowerCase();
    const wantedLabel = String(target?.label || target?.name || '').toLowerCase();
    return state.localFiles.find((file) => {
      if (wantedId && String(file.file_id || '') === wantedId) return true;
      const path = String(file.path || '').toLowerCase();
      const name = String(file.name || '').toLowerCase();
      return (wantedPath && path === wantedPath) || (wantedLabel && (name === wantedLabel || path.endsWith(`/${wantedLabel}`)));
    }) || null;
  }

  async function openFileNode(target = {}) {
    if (!state.inside) await enterCore({ source: 'file-click' });
    const local = await resolveLocalTarget(target);
    if (local) return openLocal(local);
    return openCore(target);
  }

  async function applyTransfers() {
    if (!state.transfers.length) return false;
    const api = window.ULTRON_LOCAL_FILES;
    if (!api?.split || !api?.export) {
      log('Local Core indisponível para aplicar transferências.', true);
      return false;
    }
    if (!confirm(`Criar novas versões dos ${new Set(state.transfers.flatMap((item) => [item.sourceFileId, item.targetFileId])).size} arquivo(s) afetados? Os originais permanecerão intactos.`)) return false;

    applyButton.disabled = true;
    applyButton.textContent = 'APLICANDO...';
    try {
      const affectedIds = [...new Set(state.transfers.flatMap((item) => [item.sourceFileId, item.targetFileId]))];
      const buffers = new Map();
      for (const fileId of affectedIds) {
        const data = await splitCached(fileId, { force: true });
        buffers.set(fileId, {
          file: data?.file || { file_id: fileId },
          components: (data?.components || []).map((component, index) => ({
            id: component.id || `component-${index + 1}`,
            text: component.text || ''
          }))
        });
      }

      if (state.current?.file_id && buffers.has(state.current.file_id)) {
        const currentBuffer = buffers.get(state.current.file_id);
        currentBuffer.components = currentDomComponents().map((component) => ({ id: component.id, text: component.text }));
      }

      for (const transfer of state.transfers) {
        const source = buffers.get(transfer.sourceFileId);
        const target = buffers.get(transfer.targetFileId);
        if (!source || !target) continue;
        const componentIndex = source.components.findIndex((component) => component.id === transfer.componentId);
        const [component] = componentIndex >= 0 ? source.components.splice(componentIndex, 1) : [{ id: transfer.componentId, text: transfer.text }];
        target.components.push({ id: `moved-${Date.now()}-${target.components.length}`, text: component?.text || transfer.text || '' });
      }

      const results = [];
      for (const [fileId, buffer] of buffers.entries()) {
        const composed = buffer.components.map((component) => component.text || '').join('\n\n');
        const result = await api.export(fileId, composed, null);
        results.push(result?.exported || buffer.file?.name || fileId);
      }

      log(`Transferência concluída em versões seguras: ${results.join(' // ')}.`);
      state.transfers = [];
      state.cache.clear();
      renderTransfers();
      if (state.current?.file_id) {
        const refreshed = state.localFiles.find((file) => file.file_id === state.current.file_id) || state.current;
        await openLocal(refreshed);
      }
      return true;
    } catch (error) {
      log(`Falha ao aplicar transferências: ${error?.message || error}`, true);
      return false;
    } finally {
      applyButton.textContent = 'APLICAR TRANSFERÊNCIAS';
      applyButton.disabled = !state.transfers.length;
    }
  }

  async function enterCore({ source = 'operator' } = {}) {
    if (state.inside || state.transitioning) return true;
    state.transitioning = true;
    state.lastEnterAt = performance.now();
    stage.classList.add('neural-core-fracturing');
    log(`Entrada no núcleo iniciada (${source}). Fragmentando camada holográfica...`);
    try { navigator.vibrate?.([18, 32, 22]); } catch {}
    await wait(520);
    state.inside = true;
    stage.classList.add('neural-files-open');
    stage.classList.remove('neural-core-fracturing');
    try {
      await window.ULTRON_FILE_MESH?.enter?.();
    } catch (error) {
      log(`File Mesh não respondeu: ${error?.message || error}`, true);
    }
    await refreshLocalFiles({ prompt: false });
    log('NEURAL FILESPACE ONLINE // arquivos internos liberados para navegação.');
    window.dispatchEvent(new CustomEvent('ultron:neural-filespace-enter', { detail: { source, localFiles: state.localFiles.length } }));
    state.transitioning = false;
    return true;
  }

  async function exitCore() {
    if (!state.inside && !state.transitioning) return true;
    showWorkspace(false);
    state.transitioning = true;
    state.transfers = [];
    state.current = null;
    renderTransfers();
    stage.classList.remove('neural-files-open');
    stage.classList.add('neural-core-fracturing');
    try { window.ULTRON_FILE_MESH?.exit?.(); } catch {}
    await wait(360);
    stage.classList.remove('neural-core-fracturing');
    state.inside = false;
    state.transitioning = false;
    window.ULTRON_NEURAL_3D?.reset?.();
    log('Neural filespace recolhido. Esfera recomposta.');
    window.dispatchEvent(new CustomEvent('ultron:neural-filespace-exit'));
    return true;
  }

  function closeWorkspace() {
    showWorkspace(false);
    state.current = null;
    state.transfers = [];
    renderTransfers();
    return true;
  }

  function probeZoomEntry() {
    if (state.inside || state.transitioning) return;
    const scale = Number(window.ULTRON_NEURAL_3D?.state?.scale || 1);
    const now = performance.now();
    if (scale >= 1.34 && now - state.lastEnterAt > 1000 && now - state.lastScaleProbeAt > 300) {
      state.lastScaleProbeAt = now;
      enterCore({ source: 'deep-zoom' });
    }
  }

  enterButton.addEventListener('click', () => enterCore({ source: 'button' }));
  closeButton.addEventListener('click', closeWorkspace);
  exitButton.addEventListener('click', exitCore);
  applyButton.addEventListener('click', applyTransfers);

  orbStage.addEventListener('dblclick', (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    if (state.workspaceOpen) closeWorkspace();
    else if (state.inside) exitCore();
    else enterCore({ source: 'double-click' });
  }, true);

  orbStage.addEventListener('wheel', () => setTimeout(probeZoomEntry, 120), { passive: true });
  setInterval(probeZoomEntry, 260);

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (state.workspaceOpen) closeWorkspace();
    else if (state.inside) exitCore();
  });

  window.addEventListener('ultron:stark-node', (event) => {
    if (String(event.detail?.label || '').toUpperCase() === 'ARQUIVOS') {
      enterCore({ source: 'files-node' });
    }
  });

  window.addEventListener('ultron:speech-start', () => stage.classList.add('nc-speaking'));
  window.addEventListener('ultron:speech-end', () => stage.classList.remove('nc-speaking'));

  renderTransfers();

  window.ULTRON_NEURAL_FILESPACE = {
    version: '4.28.0',
    enter: enterCore,
    exit: exitCore,
    openFileNode,
    openLocal,
    closeWorkspace,
    applyTransfers,
    refreshFiles: refreshLocalFiles,
    get active() { return state.inside; },
    get state() {
      return {
        inside: state.inside,
        workspaceOpen: state.workspaceOpen,
        current: state.current ? { ...state.current } : null,
        transfers: state.transfers.map((item) => ({ ...item })),
        localFiles: state.localFiles.length
      };
    }
  };

  window.dispatchEvent(new CustomEvent('ultron:neural-filespace-ready', {
    detail: {
      version: '4.28.0',
      rotation360: true,
      hiddenFilesUntilEntry: true,
      deepZoomEntry: true,
      holographicFragmentation: true,
      floatingFiles: true,
      integratedFileOpen: true,
      dragTransfer: true,
      safeVersionedExport: true
    }
  }));
}
