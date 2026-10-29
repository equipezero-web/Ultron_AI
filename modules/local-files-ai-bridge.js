const output = document.getElementById('output-box');
const previousFetch = window.fetch.bind(window);

function requestUrl(input) {
  return typeof input === 'string' ? input : input?.url || '';
}

function requestMethod(input, init = {}) {
  return String(init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
}

function isAiRequest(input, init = {}) {
  return requestMethod(input, init) === 'POST' && /\/api\/ai(?:\?|$)/.test(requestUrl(input));
}

function log(message, alert = false) {
  if (!output) return;
  const line = document.createElement('p');
  if (alert) line.className = 'alert';
  const time = new Date().toLocaleTimeString('pt-BR', { hour12: false });
  line.textContent = `> [${time}] [LOCAL RAG] ${message}`;
  output.appendChild(line);
  output.scrollTop = output.scrollHeight;
}

function parseInitBody(init) {
  if (!init?.body || typeof init.body !== 'string') return null;
  try {
    const body = JSON.parse(init.body);
    return body && typeof body === 'object' ? body : null;
  } catch {
    return null;
  }
}

window.fetch = async function ultronLocalRagFetch(input, init = {}) {
  if (!isAiRequest(input, init) || !window.ULTRON_LOCAL_FILES) {
    return previousFetch(input, init);
  }

  const body = parseInitBody(init);
  const originalMessage = String(body?.message || '').trim();
  if (!body || !originalMessage || body?.localFilesMeta?.active) {
    return previousFetch(input, init);
  }

  try {
    const local = await window.ULTRON_LOCAL_FILES.semanticContext(originalMessage, 8);
    if (!local?.matches?.length || !local?.contextText) {
      return previousFetch(input, init);
    }

    const top = local.matches[0];
    const activePath = local?.active_file?.path || null;
    log(`${local.matches.length} trecho(s) // ${local.search_mode || 'hybrid'} // alvo: ${local.target_file || activePath || 'base'} // ${Math.round((top?.score || 0) * 100)}%`);

    // A mensagem do operador permanece intacta. O contexto RAG segue separado,
    // para memória/histórico armazenarem apenas a pergunta real do usuário.
    body.localFilesContext = local.contextText;
    body.localFilesMeta = {
      active: true,
      originalMessage,
      searchMode: local.search_mode || 'hybrid',
      action: local.action || 'SEARCH_FILES',
      targetFile: local.target_file || activePath || null,
      targetFileId: local.target_file_id || local?.active_file?.file_id || null,
      componentId: local.component_id || null,
      topScore: Number(top?.score || 0),
      activeFile: local?.active_file ? {
        fileId: local.active_file.file_id,
        path: local.active_file.path,
        name: local.active_file.name
      } : null,
      matches: local.matches.slice(0, 8).map((item) => ({
        fileId: item.file_id,
        path: item.path,
        chunkIndex: item.chunk_index,
        score: item.score,
        semanticScore: item.semantic_score,
        lexicalScore: item.lexical_score
      }))
    };

    if (
      local.action === 'OPEN_FILE' &&
      body.localFilesMeta.targetFileId &&
      Number(top?.score || 0) >= 0.55 &&
      /\b(abra|abrir|open)\b/i.test(originalMessage)
    ) {
      window.ULTRON_LOCAL_FILES.open(body.localFilesMeta.targetFileId)
        .then(() => log(`Arquivo aberto: ${body.localFilesMeta.targetFile || 'arquivo local'}`))
        .catch((error) => log(`Não foi possível abrir o arquivo: ${error?.message || error}`, true));
    }

    window.dispatchEvent(new CustomEvent('ultron:local-rag-context', {
      detail: body.localFilesMeta
    }));

    return previousFetch(input, { ...init, body: JSON.stringify(body) });
  } catch (error) {
    console.warn('ULTRON Local RAG bridge:', error);
    return previousFetch(input, init);
  }
};

window.ULTRON_LOCAL_RAG_BRIDGE = {
  active: true,
  messageSafe: true,
  mode: 'separate-context-v2'
};
