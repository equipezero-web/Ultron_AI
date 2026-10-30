const stage = document.querySelector('.neural-stage');
const output = document.getElementById('output-box');

if (stage) {
  const IMAGE_RE = /\.(png|jpe?g|webp|gif|bmp|avif)$/i;

  const panel = document.createElement('section');
  panel.className = 'neural-file-inspector-v420';
  panel.setAttribute('aria-hidden', 'true');
  panel.innerHTML = `
    <div class="nfiv420-head">
      <div><strong data-file-title>ARQUIVO</strong><small>UNIFIED FILE VIEW // TEXT + METADATA + PREVIEW + STATUS</small></div>
      <button type="button" class="nfiv420-close" aria-label="Fechar">×</button>
    </div>
    <div class="nfiv420-body">
      <div class="nfiv420-meta" data-file-meta></div>
      <div class="nfiv420-status" data-file-status>AGUARDANDO ARQUIVO.</div>
      <div class="nfiv420-preview" data-file-preview></div>
      <div class="nfiv420-actions" data-file-actions></div>
    </div>
  `;
  stage.appendChild(panel);

  const title = panel.querySelector('[data-file-title]');
  const meta = panel.querySelector('[data-file-meta]');
  const status = panel.querySelector('[data-file-status]');
  const preview = panel.querySelector('[data-file-preview]');
  const actions = panel.querySelector('[data-file-actions]');
  const closeButton = panel.querySelector('.nfiv420-close');

  const state = {
    open: false,
    current: null,
    lastOpenedAt: null
  };

  function log(message, alert = false) {
    if (!output) return;
    const line = document.createElement('p');
    if (alert) line.className = 'alert';
    const time = new Date().toLocaleTimeString('pt-BR', { hour12: false });
    line.textContent = `> [${time}] [FILE-VIEW-4.20] ${message}`;
    output.appendChild(line);
    output.scrollTop = output.scrollHeight;
  }

  function setVisible(visible) {
    state.open = Boolean(visible);
    panel.classList.toggle('visible', state.open);
    panel.setAttribute('aria-hidden', state.open ? 'false' : 'true');
    stage.classList.toggle('neural-file-inspector-open', state.open);
  }

  function close() {
    setVisible(false);
    return true;
  }

  function cell(label, value) {
    const item = document.createElement('div');
    const small = document.createElement('small');
    const strong = document.createElement('strong');
    small.textContent = label;
    strong.textContent = String(value ?? '—');
    item.append(small, strong);
    return item;
  }

  function setMeta(items) {
    meta.replaceChildren(...items.map(([label, value]) => cell(label, value)));
  }

  function button(label, handler) {
    const el = document.createElement('button');
    el.type = 'button';
    el.textContent = label;
    el.addEventListener('click', handler);
    return el;
  }

  function textPreview(text = '') {
    const area = document.createElement('textarea');
    area.readOnly = true;
    area.spellcheck = false;
    area.value = String(text || 'Sem texto disponível para visualização.');
    preview.replaceChildren(area);
  }

  function imagePreview(src, alt = '') {
    const img = document.createElement('img');
    img.alt = alt || 'Imagem do arquivo selecionado';
    img.src = src;
    img.addEventListener('error', () => {
      status.textContent = 'PREVIEW DA IMAGEM INDISPONÍVEL. VERIFIQUE LOCAL CORE / CORS / ARQUIVO.';
      textPreview('A imagem existe na base, mas o navegador não conseguiu renderizar o preview bruto.');
    }, { once: true });
    preview.replaceChildren(img);
    window.ULTRON_VISUAL_PANEL?.setImages?.([{ src, alt }]);
  }

  function normalizeTarget(target) {
    if (typeof target === 'string') return { label: target, target };
    return {
      ...(target || {}),
      label: String(target?.label || target?.target || target?.name || '').trim(),
      target: String(target?.target || target?.label || target?.name || '').trim(),
      fileId: target?.fileId || target?.file_id || null,
      filePath: target?.filePath || target?.path || null
    };
  }

  async function findLocal(target) {
    const api = window.ULTRON_LOCAL_FILES;
    if (!api) return null;
    let files = Array.isArray(api.state?.files) ? api.state.files : [];
    if (!files.length) {
      try { files = await api.files(); } catch { files = []; }
    }
    const wantedId = String(target.fileId || '');
    const wantedLabel = String(target.label || '').toLowerCase();
    const wantedPath = String(target.filePath || '').toLowerCase();
    return files.find((file) => {
      if (wantedId && String(file.file_id || '') === wantedId) return true;
      if (wantedPath && String(file.path || '').toLowerCase() === wantedPath) return true;
      const name = String(file.name || '').toLowerCase();
      const path = String(file.path || '').toLowerCase();
      return wantedLabel && (name === wantedLabel || path === wantedLabel || path.endsWith(`/${wantedLabel}`));
    }) || null;
  }

  function coreNodeFor(target) {
    const wantedLabel = String(target.label || '').trim().toUpperCase();
    const wantedId = String(target.fileId || '').trim();
    return [...document.querySelectorAll('.stark-file-node')].find((node) => {
      return (wantedId && node.dataset.fileId === wantedId) ||
        (wantedLabel && String(node.dataset.label || '').trim().toUpperCase() === wantedLabel);
    }) || null;
  }

  async function openLocal(file) {
    const api = window.ULTRON_LOCAL_FILES;
    const extension = String(file.extension || file.name || file.path || '').toLowerCase();
    const rawUrl = `${String(api.baseUrl || '').replace(/\/$/, '')}/file/${encodeURIComponent(file.file_id)}/raw`;

    title.textContent = String(file.name || file.path || 'ARQUIVO').toUpperCase();
    setMeta([
      ['TIPO', extension || 'LOCAL'],
      ['CAMINHO', file.path || '—'],
      ['TAMANHO', Number(file.size || 0) ? `${Math.round(Number(file.size) / 1024)} KB` : '—'],
      ['STATUS', api.state?.online ? 'LOCAL ONLINE' : 'LOCAL CORE']
    ]);
    status.textContent = 'ULTRON_DATA // ARQUIVO LOCAL // VISÃO UNIFICADA';
    actions.replaceChildren(
      button('ABRIR NO SISTEMA', () => api.open(file.file_id).catch((error) => log(error?.message || error, true))),
      button('PEDIR ANÁLISE AO ULTRON', () => {
        const input = document.getElementById('command-input');
        const send = document.getElementById('btn-send');
        if (input && send) {
          input.value = `Ultron, analise o arquivo ${file.path || file.name} e me mostre os pontos mais importantes.`;
          send.click();
        }
      })
    );

    if (IMAGE_RE.test(extension)) {
      imagePreview(rawUrl, file.name || file.path || 'Imagem');
    } else {
      status.textContent = 'CARREGANDO TEXTO + METADADOS + STATUS...';
      try {
        const data = await api.split(file.file_id);
        const combined = (data?.components || []).map((item) => item.text || '').join('\n\n');
        textPreview(combined.slice(0, 100000));
        status.textContent = `ULTRON_DATA // ${data?.components?.length || 0} COMPONENTE(S) // PREVIEW ÚNICO`;
      } catch (error) {
        textPreview(`Preview textual indisponível: ${error?.message || error}`);
        status.textContent = 'PREVIEW TEXTUAL INDISPONÍVEL';
      }
    }

    state.current = { ...file, source: 'local', rawUrl: IMAGE_RE.test(extension) ? rawUrl : null };
    state.lastOpenedAt = new Date().toISOString();
    window.dispatchEvent(new CustomEvent('ultron:file-inspector-open', { detail: state.current }));
    return true;
  }

  async function openCore(target) {
    const node = coreNodeFor(target);
    const path = String(target.filePath || node?.dataset?.filePath || '').trim();
    const name = String(target.label || node?.dataset?.label || path || 'ARQUIVO').trim();
    if (!path) return false;
    const rawUrl = `https://raw.githubusercontent.com/equipezero-web/Ultron_AI/main/${path}`;
    title.textContent = name.toUpperCase();
    setMeta([
      ['TIPO', 'ULTRON CORE'],
      ['CAMINHO', path],
      ['ORIGEM', 'GITHUB'],
      ['STATUS', 'READ ONLY']
    ]);
    actions.replaceChildren(
      button('ABRIR NO GITHUB', () => window.open(`https://github.com/equipezero-web/Ultron_AI/blob/main/${path}`, '_blank', 'noopener'))
    );

    if (IMAGE_RE.test(path)) {
      imagePreview(rawUrl, name);
      status.textContent = 'ULTRON CORE // IMAGEM REAL RENDERIZADA';
    } else {
      status.textContent = 'CARREGANDO ARQUIVO DO NÚCLEO...';
      try {
        const response = await fetch(rawUrl, { cache: 'no-store' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        textPreview((await response.text()).slice(0, 100000));
        status.textContent = 'ULTRON CORE // TEXTO + METADADOS + STATUS // PREVIEW ÚNICO';
      } catch (error) {
        textPreview(`Preview indisponível: ${error?.message || error}`);
        status.textContent = 'PREVIEW DO NÚCLEO INDISPONÍVEL';
      }
    }

    state.current = { label: name, path, source: 'core', rawUrl: IMAGE_RE.test(path) ? rawUrl : null };
    state.lastOpenedAt = new Date().toISOString();
    window.dispatchEvent(new CustomEvent('ultron:file-inspector-open', { detail: state.current }));
    return true;
  }

  async function open(targetValue) {
    const target = normalizeTarget(targetValue);
    if (!target.label && !target.fileId && !target.filePath) return false;
    setVisible(true);
    title.textContent = String(target.label || 'ARQUIVO').toUpperCase();
    status.textContent = 'RESOLVENDO ARQUIVO...';
    preview.replaceChildren();
    actions.replaceChildren();

    const local = await findLocal(target);
    if (local) {
      const handled = await openLocal(local);
      if (handled) log(`${local.name || local.path}: aberto em popup central único.`);
      return handled;
    }

    const handled = await openCore(target);
    if (handled) {
      log(`${target.label || target.filePath}: aberto em popup central único.`);
      return true;
    }

    status.textContent = 'ARQUIVO NÃO ENCONTRADO NA BASE LOCAL OU NÚCLEO VISÍVEL.';
    textPreview(`Não foi possível resolver o arquivo ${target.label || target.filePath || target.fileId}.`);
    return false;
  }

  closeButton.addEventListener('click', close);
  panel.addEventListener('click', (event) => event.stopPropagation());

  document.addEventListener('click', (event) => {
    const node = event.target.closest?.('.stark-file-node');
    if (!node) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    open({
      label: node.dataset.label,
      fileId: node.dataset.fileId || null,
      filePath: node.dataset.filePath || null
    }).catch((error) => log(error?.message || error, true));
  }, true);

  window.ULTRON_FILE_INSPECTOR = {
    open,
    close,
    get state() { return { ...state }; }
  };
}
