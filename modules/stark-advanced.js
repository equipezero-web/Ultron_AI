const stage = document.querySelector('.neural-stage');
const field = document.querySelector('.stark-node-field');
const vortex = document.querySelector('.stark-vortex');
const output = document.getElementById('output-box');

if (stage && field && vortex) {
  const style = document.createElement('style');
  style.textContent = `
    .stark-vortex.has-focus .stark-node:not(.is-focused) { opacity: .26; filter: blur(1.2px); }
    .stark-subnode {
      position: absolute; width: 7px; height: 7px; margin: -3.5px;
      border: 1px solid rgba(255,255,255,.86); border-radius: 50%;
      background: rgba(0,240,255,.25); box-shadow: 0 0 10px rgba(0,240,255,.8);
      transform: translate3d(var(--sx),var(--sy),var(--sz));
      opacity: 0; animation: stark-subnode-in .32s ease forwards;
      pointer-events: auto; cursor: pointer;
    }
    .stark-subnode::after {
      content: attr(data-label); position: absolute; left: 10px; top: -4px;
      color: rgba(255,255,255,.78); font: 7px/1 ui-monospace,monospace;
      letter-spacing:.08em; white-space:nowrap; opacity:.72;
    }
    .stark-subnode.is-anomaly { border-color:#ff5500; background:rgba(255,85,0,.55); box-shadow:0 0 12px #ff5500,0 0 24px rgba(255,85,0,.5); }
    @keyframes stark-subnode-in { from { opacity:0; transform:translate3d(var(--sx),var(--sy),var(--sz)) scale(.1); } to { opacity:1; transform:translate3d(var(--sx),var(--sy),var(--sz)) scale(1); } }
  `;
  document.head.appendChild(style);

  let blinkArmedUntil = 0;
  let activeGroup = null;

  function log(message) {
    if (!output) return;
    const line = document.createElement('p');
    const time = new Date().toLocaleTimeString('pt-BR', { hour12: false });
    line.textContent = `> [${time}] [STARK-CORE] ${message}`;
    output.appendChild(line);
    output.scrollTop = output.scrollHeight;
  }

  function focusedNode() {
    return field.querySelector('.stark-node.is-focused') || null;
  }

  function clearSubnodes() {
    field.querySelectorAll('.stark-subnode').forEach((node) => node.remove());
    activeGroup = null;
  }

  function decompose(label = '') {
    const parent = label
      ? [...field.querySelectorAll('.stark-node')].find((node) => node.dataset.label === String(label).toUpperCase())
      : focusedNode();
    if (!parent) return false;

    clearSubnodes();
    parent.classList.add('is-focused');
    vortex.classList.add('has-focus');

    const baseX = parseFloat(parent.style.getPropertyValue('--x')) || 0;
    const baseY = parseFloat(parent.style.getPropertyValue('--y')) || 0;
    const baseZ = parseFloat(parent.style.getPropertyValue('--z')) || 0;
    const groupId = `${parent.dataset.label}-${Date.now()}`;

    for (let i = 0; i < 10; i += 1) {
      const angle = (Math.PI * 2 * i) / 10;
      const radius = 46 + (i % 2) * 18;
      const child = document.createElement('button');
      child.type = 'button';
      child.className = 'stark-subnode';
      child.dataset.group = groupId;
      child.dataset.label = `${parent.dataset.label}.${String(i + 1).padStart(2, '0')}`;
      child.style.setProperty('--sx', `${baseX + Math.cos(angle) * radius}px`);
      child.style.setProperty('--sy', `${baseY + Math.sin(angle) * radius * .7}px`);
      child.style.setProperty('--sz', `${baseZ + ((i % 5) - 2) * 12}px`);
      child.style.animationDelay = `${i * 18}ms`;
      child.addEventListener('click', () => {
        field.querySelectorAll('.stark-subnode').forEach((item) => item.classList.remove('is-anomaly'));
        child.classList.add('is-anomaly');
        window.dispatchEvent(new CustomEvent('ultron:stark-subnode', {
          detail: { parent: parent.dataset.label, child: child.dataset.label, index: i }
        }));
      });
      field.appendChild(child);
    }

    activeGroup = { id: groupId, parent: parent.dataset.label };
    log(`${parent.dataset.label}: decomposto em 10 subcomponentes.`);
    window.dispatchEvent(new CustomEvent('ultron:stark-decompose', {
      detail: { label: parent.dataset.label, count: 10 }
    }));
    return true;
  }

  function armDoubleBlink() {
    blinkArmedUntil = Date.now() + 1600;
    log('Piscada dupla detectada. Micro-toque armado por 1,6s.');
  }

  window.addEventListener('ultron:neural-input', (event) => {
    const detail = event.detail || {};
    if (detail.type === 'blink' && Number(detail.count || 1) >= 2) armDoubleBlink();
    if (detail.type === 'air-tap' && Date.now() <= blinkArmedUntil) {
      blinkArmedUntil = 0;
      decompose(detail.label || '');
    }
  });

  window.addEventListener('ultron:stark-node', (event) => {
    if (Date.now() <= blinkArmedUntil) {
      blinkArmedUntil = 0;
      decompose(event.detail?.label || '');
    }
  });

  vortex.addEventListener('dblclick', (event) => {
    event.preventDefault();
    const node = event.target.closest?.('.stark-node');
    if (node) decompose(node.dataset.label);
  });

  const observer = new MutationObserver(() => {
    const has = Boolean(focusedNode());
    vortex.classList.toggle('has-focus', has);
  });
  observer.observe(field, { subtree: true, attributes: true, attributeFilter: ['class'] });

  window.ULTRON_STARK_ADVANCED = {
    decompose,
    clear: clearSubnodes,
    armDoubleBlink,
    highlightSubnode(index = 0) {
      const nodes = [...field.querySelectorAll('.stark-subnode')];
      nodes.forEach((node) => node.classList.remove('is-anomaly'));
      const target = nodes[Math.max(0, Math.min(nodes.length - 1, Number(index) || 0))];
      target?.classList.add('is-anomaly');
      return Boolean(target);
    },
    get activeGroup() { return activeGroup ? { ...activeGroup } : null; }
  };
}
