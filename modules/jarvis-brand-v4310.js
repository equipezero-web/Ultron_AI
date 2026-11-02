const BRAND = 'J.A.R.V.I.S';
const SPOKEN_NAME = 'JARVIS';
const VERSION = '4.31.0';

function replaceBrandText(value) {
  return String(value ?? '')
    .replace(/ULTRON AI/g, BRAND)
    .replace(/\bULTRON\b/g, BRAND)
    .replace(/\bUltron\b/g, SPOKEN_NAME)
    .replace(/\bultron\b/g, 'jarvis');
}

function brandNode(node) {
  if (!node) return;
  if (node.nodeType === Node.TEXT_NODE) {
    const parent = node.parentElement;
    if (!parent || parent.closest('script,style,textarea,code,pre')) return;
    const next = replaceBrandText(node.nodeValue);
    if (next !== node.nodeValue) node.nodeValue = next;
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return;
  if (node.matches('script,style,textarea,code,pre')) return;
  for (const attr of ['aria-label', 'title', 'placeholder']) {
    if (!node.hasAttribute(attr)) continue;
    const current = node.getAttribute(attr);
    const next = replaceBrandText(current);
    if (next !== current) node.setAttribute(attr, next);
  }
  node.childNodes.forEach(brandNode);
}

function applyDocumentBrand() {
  document.title = `${BRAND} // Holographic Neural Command`;
  const appName = document.querySelector('meta[name="application-name"]');
  const description = document.querySelector('meta[name="description"]');
  if (appName) appName.setAttribute('content', BRAND);
  if (description) description.setAttribute('content', `${BRAND} // Holographic Neural Command Core`);
  brandNode(document.body);
}

const observer = new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    mutation.addedNodes.forEach(brandNode);
    if (mutation.type === 'characterData') brandNode(mutation.target);
  }
});

function alias(name, source) {
  if (Object.prototype.hasOwnProperty.call(window, name)) return;
  try {
    Object.defineProperty(window, name, {
      configurable: true,
      enumerable: false,
      get() { return window[source]; },
      set(value) { window[source] = value; }
    });
  } catch {}
}

[
  ['JARVIS_NEURAL_3D', 'ULTRON_NEURAL_3D'],
  ['JARVIS_NEURAL_FILESPACE', 'ULTRON_NEURAL_FILESPACE'],
  ['JARVIS_FILE_MESH', 'ULTRON_FILE_MESH'],
  ['JARVIS_VOICE_INPUT', 'ULTRON_VOICE_INPUT'],
  ['JARVIS_VOICE_MATCH', 'ULTRON_VOICE_MATCH'],
  ['JARVIS_ORCHESTRATOR', 'ULTRON_ORCHESTRATOR'],
  ['JARVIS_DEVICES', 'ULTRON_DEVICES'],
  ['JARVIS_VISION', 'ULTRON_VISION'],
  ['JARVIS_LOCAL_FILES', 'ULTRON_LOCAL_FILES']
].forEach(([name, source]) => alias(name, source));

applyDocumentBrand();
observer.observe(document.documentElement, { subtree: true, childList: true, characterData: true });

document.body.classList.add('jarvis-system');
window.JARVIS_BRAND = Object.freeze({ name: BRAND, spokenName: SPOKEN_NAME, version: VERSION });
window.dispatchEvent(new CustomEvent('jarvis:brand-ready', { detail: window.JARVIS_BRAND }));
