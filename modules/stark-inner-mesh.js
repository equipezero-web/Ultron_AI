const stage = document.querySelector('.neural-stage');
const vortex = document.querySelector('.stark-vortex');
const field = document.querySelector('.stark-node-field');

if (stage && vortex && field) {
  const nodes = [...field.querySelectorAll('.stark-functional-node')];
  let handZoom = false;
  let focused = null;

  function layoutInnerNodes() {
    const rect = vortex.getBoundingClientRect();
    const width = Math.max(260, rect.width || 420);
    const height = Math.max(260, rect.height || width);
    const radiusX = width * 0.185;
    const radiusY = height * 0.155;

    nodes.forEach((node, index) => {
      const angle = (Math.PI * 2 * index) / Math.max(1, nodes.length) - Math.PI / 2;
      const shell = index % 2 === 0 ? 1 : 0.76;
      const x = Math.cos(angle) * radiusX * shell;
      const y = Math.sin(angle) * radiusY * shell;
      const z = ((index % 5) - 2) * 22;
      node.style.setProperty('--x', `${x}px`);
      node.style.setProperty('--y', `${y}px`);
      node.style.setProperty('--z', `${z}px`);
      node.dataset.innerMesh = 'true';
    });
  }

  function setHandZoom(active) {
    handZoom = Boolean(active);
    vortex.classList.toggle('hand-zoom', handZoom);
    stage.classList.toggle('stark-hand-zoom', handZoom);
    if (!handZoom) {
      nodes.forEach((node) => node.classList.remove('hand-target'));
    }
  }

  function focusAtViewport(clientX, clientY, maxDistance = 82) {
    let best = null;
    let bestDistance = Infinity;

    nodes.forEach((node) => {
      const rect = node.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      const distance = Math.hypot(clientX - x, clientY - y);
      node.classList.remove('hand-target');
      if (distance < bestDistance) {
        bestDistance = distance;
        best = node;
      }
    });

    if (best && bestDistance <= maxDistance) {
      best.classList.add('hand-target');
      focused = best;
      window.ULTRON_STARK_CORE?.focus?.(best.dataset.label);
      return {
        label: best.dataset.label,
        action: best.dataset.action,
        distance: bestDistance
      };
    }

    focused = null;
    return null;
  }

  function openFocused() {
    if (!focused) return false;
    return Boolean(window.ULTRON_STARK_CORE?.open?.(focused.dataset.label));
  }

  function clearFocus() {
    focused = null;
    nodes.forEach((node) => node.classList.remove('hand-target'));
  }

  layoutInnerNodes();
  requestAnimationFrame(() => {
    layoutInnerNodes();
    requestAnimationFrame(layoutInnerNodes);
  });

  const resizeObserver = new ResizeObserver(() => requestAnimationFrame(layoutInnerNodes));
  resizeObserver.observe(vortex);

  window.ULTRON_STARK_MESH = {
    layout: layoutInnerNodes,
    zoom: setHandZoom,
    focusAtViewport,
    openFocused,
    clearFocus,
    get focused() {
      return focused?.dataset?.label || null;
    },
    get zoomed() {
      return handZoom;
    }
  };
}
