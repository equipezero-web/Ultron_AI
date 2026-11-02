import API_CONFIG from '../config.js';

const output = document.getElementById('output-box');
const API_BASE = String(API_CONFIG?.backendUrl || '').replace(/\/$/, '');
const MIN_BACKEND_VERSION = '4.30.1';

function log(message, alert = false) {
  if (!output) return;
  const line = document.createElement('p');
  if (alert) line.className = 'alert';
  const time = new Date().toLocaleTimeString('pt-BR', { hour12: false });
  line.textContent = `> [${time}] [BACKEND] ${message}`;
  output.appendChild(line);
  output.scrollTop = output.scrollHeight;
}

function parseVersion(value) {
  const match = String(value || '').trim().match(/^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/);
  if (!match) return null;
  return match.slice(1, 4).map(Number);
}

function versionAtLeast(received, minimum) {
  const current = parseVersion(received);
  const required = parseVersion(minimum);
  if (!current || !required) return false;
  for (let index = 0; index < 3; index += 1) {
    if (current[index] > required[index]) return true;
    if (current[index] < required[index]) return false;
  }
  return true;
}

function backendContract(data, version) {
  const versionOk = versionAtLeast(version, MIN_BACKEND_VERSION);
  const entrypointOk = data?.workerEntrypoint === 'worker.js';
  const singleEntrypointOk = data?.singleEntrypoint === true;
  const noLegacyChain = data?.legacyWorkerChain === false;
  return {
    versionOk,
    entrypointOk,
    singleEntrypointOk,
    noLegacyChain,
    current: versionOk && entrypointOk && singleEntrypointOk && noLegacyChain
  };
}

async function check() {
  if (!API_BASE) return { ok: false, error: 'Backend não configurado.' };
  try {
    const response = await fetch(`${API_BASE}/api/health`, { cache: 'no-store' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.error || `HTTP ${response.status}`);

    const version = String(data?.backendVersion || '').trim();
    const contract = backendContract(data, version);

    if (contract.current) {
      const research = data?.webResearch || {};
      const internal = data?.internalSystems || {};
      const flags = [
        data?.singleEntrypoint ? 'SINGLE WORKER' : '',
        research?.sourceRanking ? 'RANKING' : '',
        research?.uncertaintyRetry ? 'AUTO-RETRY' : '',
        research?.expiringResearchCache ? 'TTL CACHE' : '',
        research?.conversationMemorySafe ? 'MEMORY SAFE' : '',
        internal?.laTeamContextBridge ? 'L&A TEAM' : ''
      ].filter(Boolean).join(' + ');
      log(`v${version} ONLINE // ${data?.workerEntrypoint || 'worker.js'} // LIVE NEWS: ${data?.liveNewsEngine || 'ativo'} // WEB RESEARCH: ${research?.mode || 'ativo'}${flags ? ` // ${flags}` : ''}`);
    } else {
      const reasons = [
        !contract.versionOk ? `versão mínima v${MIN_BACKEND_VERSION}` : '',
        !contract.entrypointOk ? 'entrypoint diferente de worker.js' : '',
        !contract.singleEntrypointOk ? 'singleEntrypoint ausente' : '',
        !contract.noLegacyChain ? 'legacyWorkerChain ainda ativo' : ''
      ].filter(Boolean).join('; ');
      log(`Backend incompatível detectado. Recebido ${version ? `v${version}` : 'sem versão'}${reasons ? ` // ${reasons}` : ''}.`, true);
    }

    window.dispatchEvent(new CustomEvent('ultron:backend-version', {
      detail: {
        minimum: MIN_BACKEND_VERSION,
        version: version || null,
        current: contract.current,
        contract,
        health: data
      }
    }));

    return {
      ok: true,
      current: contract.current,
      version: version || null,
      contract,
      health: data
    };
  } catch (error) {
    log(`Não foi possível verificar a versão do Worker: ${error?.message || error}`, true);
    return { ok: false, error: error?.message || String(error) };
  }
}

window.ULTRON_BACKEND_VERSION = {
  minimum: MIN_BACKEND_VERSION,
  check,
  versionAtLeast
};
setTimeout(check, 2200);
