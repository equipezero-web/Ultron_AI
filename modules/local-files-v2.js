const legacy = window.ULTRON_LOCAL_FILES;
const output = document.getElementById('output-box');

if (legacy) {
  const BASE_URL = legacy.baseUrl || localStorage.getItem('ultron_local_core_url') || 'http://127.0.0.1:8765';
  let syncTimer = null;
  let lastFingerprint = '';

  function log(message, alert = false) {
    if (!output || !message) return;
    const line = document.createElement('p');
    if (alert) line.className = 'alert';
    const time = new Date().toLocaleTimeString('pt-BR', { hour12: false });
    line.textContent = `> [${time}] [LOCAL RAG V2] ${message}`;
    output.appendChild(line);
    output.scrollTop = output.scrollHeight;
  }

  function loopbackRequest(url, init) {
    try {
      return new Request(url, { ...init, targetAddressSpace: 'loopback' });
    } catch {
      return new Request(url, init);
    }
  }

  async function request(path, options = {}, timeoutMs = 10000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort('timeout'), timeoutMs);
    try {
      const init = {
        ...options,
        mode: 'cors',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...(options.headers || {})
        }
      };
      const response = await fetch(loopbackRequest(`${BASE_URL}${path}`, init));
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.detail || data?.error || `HTTP ${response.status}`);
      return data;
    } finally {
      clearTimeout(timer);
    }
  }

  async function stats() {
    return request('/stats', {}, 5000);
  }

  async function hybridSearch(query, limit = 8, fileId = null) {
    const data = await request('/search', {
      method: 'POST',
      body: JSON.stringify({ query, limit, file_id: fileId || null })
    }, 12000);
    return Array.isArray(data?.results) ? data.results : [];
  }

  async function hybridCommand(commandText, limit = 8, fileId = null) {
    return request('/command', {
      method: 'POST',
      body: JSON.stringify({ command: commandText, limit, file_id: fileId || null })
    }, 12000);
  }

  async function versions(fileId) {
    const data = await request(`/file/${encodeURIComponent(fileId)}/versions`);
    return Array.isArray(data?.versions) ? data.versions : [];
  }

  async function reindexFile(fileId) {
    const result = await request(`/index/file/${encodeURIComponent(fileId)}`, {
      method: 'POST',
      body: '{}'
    }, 120000);
    await refreshFiles('reindex-file');
    return result;
  }

  async function removeFromIndex(fileId) {
    const result = await request(`/index/remove/${encodeURIComponent(fileId)}`, {
      method: 'POST',
      body: '{}'
    });
    await refreshFiles('remove-index');
    return result;
  }

  function looksLikeFileCommand(text) {
    return /\b(arquivo|arquivos|documento|documentos|pdf|planilha|codigo|código|relatorio|relatório|slide|slides|pptx|csv|ultron_data|base local)\b/i.test(String(text || ''));
  }

  function asksWholeBase(text) {
    return /\b(todos os arquivos|meus arquivos|na base|base local|ultron_data|procure|pesquise|busque|encontre)\b/i.test(String(text || ''));
  }

  function contextText(result, activeFile) {
    const matches = Array.isArray(result?.matches) ? result.matches : [];
    return [
      'CONTEXTO LOCAL RECUPERADO DA ULTRON_DATA:',
      activeFile ? `ARQUIVO ATIVO: ${activeFile.path || activeFile.name}` : 'ESCOPO: base local',
      'Busca: híbrida (embedding semântico + nome/caminho/conteúdo).',
      'Use somente estes trechos para afirmações sobre arquivos locais. Não invente conteúdo ausente.',
      '',
      ...matches.slice(0, 8).map((item, index) => [
        `${index + 1}. ${item.path}`,
        `Score híbrido: ${Math.round(Number(item.score || 0) * 100)}%`,
        `Semântico: ${Math.round(Number(item.semantic_score || 0) * 100)}% | lexical: ${Math.round(Number(item.lexical_score || 0) * 100)}%`,
        `Componente: ${Number(item.chunk_index || 0) + 1}`,
        `Trecho: ${String(item.text || '').slice(0, 1400)}`
      ].join('\n'))
    ].join('\n\n');
  }

  async function semanticContext(commandText, limit = 8) {
    const text = String(commandText || '').trim();
    if (!text) return null;

    const status = await legacy.health({ allowPrompt: false });
    if (!status?.ok) return null;

    const activeFile = legacy.state?.activeFile || null;
    const useActiveFile = Boolean(activeFile?.file_id && !asksWholeBase(text));
    if (!useActiveFile && !looksLikeFileCommand(text)) return null;

    const result = await hybridCommand(text, limit, useActiveFile ? activeFile.file_id : null);
    if (!result) return null;
    result.active_file = useActiveFile ? activeFile : null;
    result.contextText = contextText(result, result.active_file);
    result.search_mode = 'hybrid';
    return result;
  }

  async function refreshFiles(reason = 'sync') {
    try {
      const files = await legacy.files();
      window.dispatchEvent(new CustomEvent('ultron:local-files-updated', {
        detail: { reason, files, count: files.length }
      }));
      if (window.ULTRON_FILE_MESH?.state?.active) {
        window.ULTRON_FILE_MESH.refresh?.({ requestLocal: false });
      }
      return files;
    } catch (error) {
      console.warn('ULTRON local files refresh:', error);
      return [];
    }
  }

  const oldIndex = legacy.index.bind(legacy);
  legacy.index = async (...args) => {
    const result = await oldIndex(...args);
    await refreshFiles('index');
    return result;
  };

  const oldExport = legacy.export.bind(legacy);
  legacy.export = async (...args) => {
    const result = await oldExport(...args);
    await refreshFiles('export');
    if (result?.exported) {
      log(`Nova versão válida criada e indexada: ${result.exported} // ${String(result.format || '').toUpperCase()}`);
    }
    return result;
  };

  legacy.searchHybrid = hybridSearch;
  legacy.commandHybrid = hybridCommand;
  legacy.stats = stats;
  legacy.versions = versions;
  legacy.reindexFile = reindexFile;
  legacy.removeFromIndex = removeFromIndex;
  legacy.semanticContext = semanticContext;
  legacy.refreshFiles = refreshFiles;
  legacy.capabilities = {
    hybridSearch: true,
    activeFileRag: true,
    automaticSync: true,
    versionedExports: true,
    safeBinaryWriters: true
  };

  async function pollSync() {
    if (document.hidden) return;
    try {
      const data = await stats();
      const fingerprint = `${data.files || 0}:${data.vector_chunks || 0}:${data.last_index_at || ''}`;
      if (lastFingerprint && fingerprint !== lastFingerprint) {
        await refreshFiles('watcher');
      }
      lastFingerprint = fingerprint;
    } catch {}
  }

  function schedule() {
    clearInterval(syncTimer);
    const mobile = ['balanced', 'lite'].includes(String(window.ULTRON_PERFORMANCE?.mode || '').toLowerCase());
    syncTimer = setInterval(pollSync, mobile ? 30000 : 15000);
  }

  window.addEventListener('ultron:performance-mode', schedule);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) pollSync();
  });

  setTimeout(async () => {
    try {
      const health = await legacy.health({ allowPrompt: false });
      if (health?.ok) {
        const data = await stats();
        lastFingerprint = `${data.files || 0}:${data.vector_chunks || 0}:${data.last_index_at || ''}`;
        log(`LOCAL CORE v${health.version || '2'} // HYBRID RAG // ${data.files || 0} arquivo(s) // ${data.vector_chunks || 0} vetores.`);
      }
    } catch {}
  }, 1800);

  schedule();

  window.ULTRON_LOCAL_FILES_V2 = {
    stats,
    search: hybridSearch,
    command: hybridCommand,
    semanticContext,
    versions,
    reindexFile,
    removeFromIndex,
    refreshFiles
  };
}
