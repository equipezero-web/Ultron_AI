import API_CONFIG from '../config.js';

const API_BASE = String(API_CONFIG?.backendUrl || '').replace(/\/$/, '');
const MIN_BACKEND_VERSION = '4.30.1';
const output = document.getElementById('output-box');
const infra = document.getElementById('infra-backend');

function semver(value) {
  return String(value || '')
    .replace(/^v/i, '')
    .split('.')
    .slice(0, 3)
    .map((item) => Number.parseInt(item, 10) || 0);
}

function gte(current, minimum) {
  const a = semver(current);
  const b = semver(minimum);
  for (let i = 0; i < 3; i += 1) {
    if (a[i] > b[i]) return true;
    if (a[i] < b[i]) return false;
  }
  return true;
}

function log(message, alert = false) {
  if (!output) return;
  const line = document.createElement('p');
  if (alert) line.className = 'alert';
  const time = new Date().toLocaleTimeString('pt-BR', { hour12: false });
  line.textContent = `> [${time}] [JARVIS-BACKEND] ${message}`;
  output.appendChild(line);
  output.scrollTop = output.scrollHeight;
}

function canonicalizeWorkerUrl(value) {
  const text = String(value || '');
  return text.replace(/backend\/worker-v(?:2|3|4|5|6)\.js/gi, 'backend/worker.js');
}

const previousFetch = window.fetch.bind(window);
window.fetch = function jarvisCanonicalWorkerFetch(input, init) {
  try {
    if (typeof input === 'string') {
      input = canonicalizeWorkerUrl(input);
    } else if (input instanceof Request) {
      const canonical = canonicalizeWorkerUrl(input.url);
      if (canonical !== input.url) input = new Request(canonical, input);
    }
  } catch {}
  return previousFetch(input, init);
};

function patchLegacyFileNodes() {
  const nodes = document.querySelectorAll('[data-file-path*="backend/worker-v"]');
  nodes.forEach((node) => {
    const currentPath = String(node.dataset.filePath || '');
    if (!/backend\/worker-v(?:2|3|4|5|6)\.js/i.test(currentPath)) return;
    const replacement = node.cloneNode(true);
    replacement.dataset.filePath = 'backend/worker.js';
    replacement.dataset.label = 'WORKER.JS';
    replacement.dataset.shortLabel = 'worker.js';
    replacement.setAttribute('aria-label', 'worker.js — abrir arquivo');
    replacement.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const filespace = window.ULTRON_NEURAL_FILESPACE || window.JARVIS_NEURAL_FILESPACE;
      filespace?.openFileNode?.({ filePath: 'backend/worker.js', path: 'backend/worker.js', label: 'worker.js', name: 'worker.js' });
    });
    node.replaceWith(replacement);
  });
}

async function check() {
  if (!API_BASE) {
    if (infra) infra.textContent = 'NOT CONFIGURED';
    return { ok: false, error: 'Backend não configurado.' };
  }
  try {
    const response = await previousFetch(`${API_BASE}/api/health?_jarvis=${Date.now()}`, {
      cache: 'no-store'
    });
    const health = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(health?.error || `HTTP ${response.status}`);

    const version = String(health?.backendVersion || '').trim();
    const canonical = health?.workerEntrypoint === 'worker.js';
    const single = health?.singleEntrypoint === true;
    const noLegacy = health?.legacyWorkerChain === false;
    const current = gte(version, MIN_BACKEND_VERSION) && canonical && single && noLegacy;

    if (infra) {
      infra.textContent = current ? `v${version} / worker.js` : `INCOMPATÍVEL v${version || '?'}`;
      infra.className = current ? 'green' : '';
    }

    if (current) {
      log(`v${version} ONLINE // worker.js // SINGLE ENTRYPOINT // LEGACY CHAIN OFF`);
    } else {
      log(`Backend incompatível. Recebido v${version || '?'} // entrypoint=${health?.workerEntrypoint || '?'} // single=${String(single)} // legacy=${String(health?.legacyWorkerChain)}.`, true);
    }

    const detail = { ok: true, current, version, health, minimum: MIN_BACKEND_VERSION };
    window.JARVIS_BACKEND_STATUS = detail;
    window.dispatchEvent(new CustomEvent('jarvis:backend-health', { detail }));
    return detail;
  } catch (error) {
    if (infra) infra.textContent = 'OFFLINE';
    const detail = { ok: false, current: false, error: error?.message || String(error) };
    window.JARVIS_BACKEND_STATUS = detail;
    log(`Falha ao verificar backend: ${detail.error}`, true);
    return detail;
  }
}

const observer = new MutationObserver(patchLegacyFileNodes);
observer.observe(document.documentElement, { subtree: true, childList: true });
window.addEventListener('ultron:neural-filespace-enter', patchLegacyFileNodes);
window.addEventListener('online', check);

window.JARVIS_BACKEND = { check, canonicalizeWorkerUrl, patchLegacyFileNodes, minimum: MIN_BACKEND_VERSION };
setTimeout(check, 900);
setTimeout(patchLegacyFileNodes, 1400);
