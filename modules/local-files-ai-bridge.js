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

function enrichedMessage(original, local) {
  return [
    'MODO ULTRON LOCAL FILE RAG ATIVO.',
    'Use o contexto local abaixo para responder sobre os arquivos do operador.',
    'Não invente conteúdo que não esteja nos trechos recuperados.',
    'Se houver baixa similaridade ou ambiguidade, diga isso antes de sugerir uma ação.',
    'O caminho mostrado é relativo à pasta segura Ultron_Data.',
    '',
    local.contextText || '',
    '',
    'AÇÃO LOCAL SUGERIDA:',
    `action: ${local.action || 'SEARCH_FILES'}`,
    `target_file: ${local.target_file || 'nenhum'}`,
    `component_id: ${local.component_id || 'nenhum'}`,
    '',
    'COMANDO ORIGINAL DO OPERADOR:',
    original
  ].filter(Boolean).join('\n');
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
  if (!body || !originalMessage || originalMessage.includes('MODO ULTRON LOCAL FILE RAG ATIVO')) {
    return previousFetch(input, init);
  }

  try {
    const local = await window.ULTRON_LOCAL_FILES.semanticContext(originalMessage, 6);
    if (!local?.matches?.length || !local?.contextText) {
      return previousFetch(input, init);
    }

    const top = local.matches[0];
    log(`${local.matches.length} trecho(s) recuperado(s) // alvo: ${local.target_file || 'sem alvo'} // ${Math.round((top?.score || 0) * 100)}%`);

    body.message = enrichedMessage(originalMessage, local);
    body.localFilesMeta = {
      active: true,
      originalMessage,
      action: local.action || 'SEARCH_FILES',
      targetFile: local.target_file || null,
      targetFileId: local.target_file_id || null,
      componentId: local.component_id || null,
      topScore: Number(top?.score || 0),
      matches: local.matches.slice(0, 6).map((item) => ({
        fileId: item.file_id,
        path: item.path,
        chunkIndex: item.chunk_index,
        score: item.score
      }))
    };

    if (
      local.action === 'OPEN_FILE' &&
      local.target_file_id &&
      Number(top?.score || 0) >= 0.6 &&
      /\b(abra|abrir|open)\b/i.test(originalMessage)
    ) {
      window.ULTRON_LOCAL_FILES.open(local.target_file_id)
        .then(() => log(`Arquivo aberto: ${local.target_file}`))
        .catch((error) => log(`Não foi possível abrir ${local.target_file}: ${error?.message || error}`, true));
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
  active: true
};
