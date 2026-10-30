const output = document.getElementById('output-box');
const IMAGE_RE = /\.(png|jpe?g|webp|gif|bmp|avif)(?:\?|#|$)/i;
const URL_RE = /https?:\/\/[^\s)\]}>"']+?\.(?:png|jpe?g|webp|gif|bmp|avif)(?:\?[^\s)\]}>"']*)?/gi;

if (output) {
  let knownFiles = [];
  let refreshAt = 0;
  let lastSignature = '';

  async function refreshFiles() {
    const api = window.ULTRON_LOCAL_FILES;
    if (!api) return [];
    const now = Date.now();
    if (knownFiles.length && now - refreshAt < 15000) return knownFiles;
    try {
      knownFiles = await api.files();
      refreshAt = now;
    } catch {
      knownFiles = Array.isArray(api.state?.files) ? api.state.files : [];
    }
    return knownFiles;
  }

  function directUrls(text) {
    return [...new Set(String(text || '').match(URL_RE) || [])].slice(0, 6);
  }

  async function localImagesForText(text) {
    const api = window.ULTRON_LOCAL_FILES;
    if (!api) return [];
    const clean = String(text || '').toLowerCase();
    const files = await refreshFiles();
    return files.filter((file) => {
      const path = String(file.path || '').toLowerCase();
      const name = String(file.name || '').toLowerCase();
      if (!IMAGE_RE.test(path || name)) return false;
      return (name && clean.includes(name)) || (path && clean.includes(path));
    }).slice(0, 6).map((file) => ({
      src: `${String(api.baseUrl || '').replace(/\/$/, '')}/file/${encodeURIComponent(file.file_id)}/raw`,
      alt: file.name || file.path || 'Imagem',
      title: file.name || file.path || 'Imagem',
      source: 'ULTRON_DATA'
    }));
  }

  async function visualize(text) {
    const panel = window.ULTRON_VISUAL_PANEL;
    if (!panel) return;
    const local = await localImagesForText(text);
    const remote = directUrls(text).map((src) => ({ src, alt: 'Imagem mencionada pelo Ultron', title: src, source: 'ULTRON' }));
    const items = [...local, ...remote].slice(0, 6);
    const signature = items.map((item) => item.src).join('|');
    if (!items.length || signature === lastSignature) return;
    lastSignature = signature;
    panel.setImages(items);
    panel.setCards?.(items.map((item) => ({ title: item.title, source: item.source })), 'image-files');
    window.dispatchEvent(new CustomEvent('ultron:neural-image-files', { detail: { images: items, sourceText: text } }));
  }

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes || []) {
        if (!(node instanceof HTMLElement)) continue;
        const text = String(node.textContent || '').trim();
        if (!text || (!IMAGE_RE.test(text) && !URL_RE.test(text))) continue;
        URL_RE.lastIndex = 0;
        visualize(text).catch(() => {});
      }
    }
  });
  observer.observe(output, { childList: true, subtree: true });

  window.addEventListener('ultron:file-inspector-open', (event) => {
    const src = event.detail?.rawUrl;
    if (src) {
      window.ULTRON_VISUAL_PANEL?.setImages?.([{ src, alt: event.detail?.name || event.detail?.label || 'Imagem' }]);
    }
  });

  window.ULTRON_NEURAL_FILE_VISUALS = {
    visualize,
    refresh: refreshFiles
  };
}
