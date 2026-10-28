const stage = document.querySelector('.neural-stage');
const vortex = document.querySelector('.stark-vortex');
const field = document.querySelector('.stark-node-field');

if (stage && vortex && field) {
  let nodes = [];
  let zoomLevel = 0;
  let focused = null;
  let dragging = null;
  const manualPositions = new Map();

  function currentNodes() {
    return [...field.querySelectorAll('.stark-functional-node')]
      .filter((node) => !node.classList.contains('stark-node-hidden'))
      .filter((node) => {
        if (vortex.classList.contains('stark-file-mode')) return node.classList.contains('stark-file-node');
        return !node.classList.contains('stark-file-node');
      });
  }

  function basePosition(index) {
    const rect = vortex.getBoundingClientRect();
    const width = Math.max(260, rect.width || 420);
    const height = Math.max(260, rect.height || width);
    const radiusX = width * 0.185;
    const radiusY = height * 0.155;
    const angle = (Math.PI * 2 * index) / Math.max(1, nodes.length) - Math.PI / 2;
    const shell = index % 2 === 0 ? 1 : 0.76;
    return {
      x: Math.cos(angle) * radiusX * shell,
      y: Math.sin(angle) * radiusY * shell,
      z: ((index % 5) - 2) * 22
    };
  }

  function setNodePosition(node, position, persist = false) {
    if (!node || !position) return;
    node.style.setProperty('--x', `${position.x}px`);
    node.style.setProperty('--y', `${position.y}px`);
    node.style.setProperty('--z', `${position.z || 0}px`);
    if (persist) manualPositions.set(node.dataset.label, { ...position });
  }

  function layoutInnerNodes({ preserveExisting = false } = {}) {
    nodes = currentNodes();
    nodes.forEach((node, index) => {
      const saved = manualPositions.get(node.dataset.label);
      const hasPosition = node.style.getPropertyValue('--x') && node.style.getPropertyValue('--y');
      if (!preserveExisting || saved || !hasPosition) {
        setNodePosition(node, saved || basePosition(index));
      }
      node.dataset.innerMesh = 'true';
    });
  }

  function refresh() {
    clearFocus();
    nodes = currentNodes();
    layoutInnerNodes({ preserveExisting: vortex.classList.contains('stark-file-mode') });
    return nodes.length;
  }

  function setZoomLevel(level = 0) {
    zoomLevel = Math.max(0, Math.min(2, Number(level) || 0));
    vortex.dataset.handZoomLevel = String(zoomLevel);
    stage.dataset.starkZoomLevel = String(zoomLevel);
    vortex.classList.toggle('hand-zoom', zoomLevel > 0);
    vortex.classList.toggle('hand-zoom-full', zoomLevel === 2);
    stage.classList.toggle('stark-hand-zoom', zoomLevel > 0);
    stage.classList.toggle('stark-hand-zoom-full', zoomLevel === 2);

    nodes = currentNodes();
    if (zoomLevel === 0) {
      nodes.forEach((node) => node.classList.remove('hand-target'));
      focused = null;
    }

    window.dispatchEvent(new CustomEvent('ultron:stark-zoom-level', {
      detail: { level: zoomLevel }
    }));
  }

  function focusAtViewport(clientX, clientY, maxDistance = 82) {
    nodes = currentNodes();
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
      if (best.classList.contains('stark-file-node')) {
        window.dispatchEvent(new CustomEvent('ultron:file-mesh-focus', {
          detail: { label: best.dataset.label, fileId: best.dataset.fileId || null }
        }));
      } else {
        window.ULTRON_STARK_CORE?.focus?.(best.dataset.label);
      }
      return {
        label: best.dataset.label,
        action: best.dataset.action,
        fileId: best.dataset.fileId || null,
        distance: bestDistance
      };
    }

    focused = null;
    return null;
  }

  function openFocused() {
    if (!focused || zoomLevel < 2) return false;

    if (focused.classList.contains('stark-file-node')) {
      return Boolean(window.ULTRON_FILE_MESH?.openFileNode?.(focused.dataset.fileId || focused.dataset.label));
    }

    const opened = Boolean(window.ULTRON_STARK_CORE?.open?.(focused.dataset.label));
    if (opened) {
      window.dispatchEvent(new CustomEvent('ultron:stark-node', {
        detail: { label: focused.dataset.label, action: focused.dataset.action || null, source: 'hand' }
      }));
    }
    return opened;
  }

  function beginDrag(clientX, clientY) {
    if (!focused || zoomLevel < 2) return false;
    const node = focused;
    const rect = vortex.getBoundingClientRect();
    const current = {
      x: parseFloat(node.style.getPropertyValue('--x')) || 0,
      y: parseFloat(node.style.getPropertyValue('--y')) || 0,
      z: parseFloat(node.style.getPropertyValue('--z')) || 0
    };
    dragging = {
      node,
      startClientX: clientX,
      startClientY: clientY,
      startX: current.x,
      startY: current.y,
      startZ: current.z,
      vortexRect: rect,
      moved: false
    };
    node.classList.add('is-dragging');
    return true;
  }

  function dragTo(clientX, clientY) {
    if (!dragging) return false;
    const dx = clientX - dragging.startClientX;
    const dy = clientY - dragging.startClientY;
    const maxX = dragging.vortexRect.width * 0.36;
    const maxY = dragging.vortexRect.height * 0.31;
    const next = {
      x: Math.max(-maxX, Math.min(maxX, dragging.startX + dx)),
      y: Math.max(-maxY, Math.min(maxY, dragging.startY + dy)),
      z: dragging.startZ + Math.max(-40, Math.min(40, -dy * 0.18))
    };
    dragging.moved ||= Math.hypot(dx, dy) > 10;
    setNodePosition(dragging.node, next);
    return dragging.moved;
  }

  function endDrag({ persist = true } = {}) {
    if (!dragging) return { moved: false, label: null };
    const { node, moved } = dragging;
    node.classList.remove('is-dragging');
    if (persist && moved) {
      manualPositions.set(node.dataset.label, {
        x: parseFloat(node.style.getPropertyValue('--x')) || 0,
        y: parseFloat(node.style.getPropertyValue('--y')) || 0,
        z: parseFloat(node.style.getPropertyValue('--z')) || 0
      });
    }
    dragging = null;
    return { moved, label: node.dataset.label };
  }

  function togglePinned(label = focused?.dataset?.label) {
    nodes = currentNodes();
    const node = nodes.find((item) => item.dataset.label === label);
    if (!node) return false;
    node.classList.toggle('is-pinned');
    return node.classList.contains('is-pinned');
  }

  function resetPositions() {
    manualPositions.clear();
    nodes = currentNodes();
    nodes.forEach((node) => node.classList.remove('is-pinned', 'is-dragging'));
    layoutInnerNodes();
  }

  function clearFocus() {
    focused = null;
    currentNodes().forEach((node) => node.classList.remove('hand-target'));
  }

  layoutInnerNodes();
  const resizeObserver = new ResizeObserver(() => layoutInnerNodes({ preserveExisting: vortex.classList.contains('stark-file-mode') }));
  resizeObserver.observe(vortex);

  window.ULTRON_STARK_MESH = {
    layout: layoutInnerNodes,
    refresh,
    zoom(levelOrActive) {
      setZoomLevel(typeof levelOrActive === 'boolean' ? (levelOrActive ? 2 : 0) : levelOrActive);
    },
    setZoomLevel,
    focusAtViewport,
    openFocused,
    clearFocus,
    beginDrag,
    dragTo,
    endDrag,
    togglePinned,
    resetPositions,
    get focused() { return focused?.dataset?.label || null; },
    get zoomed() { return zoomLevel > 0; },
    get zoomLevel() { return zoomLevel; },
    get dragging() { return dragging?.node?.dataset?.label || null; }
  };
}
