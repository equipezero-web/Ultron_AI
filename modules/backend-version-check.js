import API_CONFIG from '../config.js';

const output = document.getElementById('output-box');
const API_BASE = String(API_CONFIG?.backendUrl || '').replace(/\/$/, '');
const EXPECTED_VERSION = '4.13.0';

function log(message, alert = false) {
  if (!output) return;
  const line = document.createElement('p');
  if (alert) line.className = 'alert';
  const time = new Date().toLocaleTimeString('pt-BR', { hour12: false });
  line.textContent = `> [${time}] [BACKEND] ${message}`;
  output.appendChild(line);
  output.scrollTop = output.scrollHeight;
}

async function check() {
  if (!API_BASE) return { ok: false, error: 'Backend não configurado.' };
  try {
    const response = await fetch(`${API_BASE}/api/health`, { cache: 'no-store' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.error || `HTTP ${response.status}`);

    const version = String(data?.backendVersion || '').trim();
    const current = version === EXPECTED_VERSION;
    if (current) {
      const research = data?.webResearch || {};
      const flags = [
        research?.sourceRanking ? 'RANKING' : '',
        research?.uncertaintyRetry ? 'AUTO-RETRY' : '',
        research?.expiringResearchCache ? 'TTL CACHE' : '',
        research?.conversationMemorySafe ? 'MEMORY SAFE' : ''
      ].filter(Boolean).join(' + ');
      log(`v${version} ONLINE // LIVE NEWS: ${data?.liveNewsEngine || 'ativo'} // WEB RESEARCH: ${research?.mode || 'ativo'}${flags ? ` // ${flags}` : ''}`);
    } else {
      log(`Worker antigo detectado. Esperado v${EXPECTED_VERSION}; recebido ${version ? `v${version}` : 'sem versão'}. O frontend está novo, mas o Cloudflare ainda precisa publicar o backend atualizado.`, true);
    }

    window.dispatchEvent(new CustomEvent('ultron:backend-version', {
      detail: { expected: EXPECTED_VERSION, version: version || null, current, health: data }
    }));

    return { ok: true, current, version: version || null, health: data };
  } catch (error) {
    log(`Não foi possível verificar a versão do Worker: ${error?.message || error}`, true);
    return { ok: false, error: error?.message || String(error) };
  }
}

window.ULTRON_BACKEND_VERSION = { expected: EXPECTED_VERSION, check };
setTimeout(check, 2200);
