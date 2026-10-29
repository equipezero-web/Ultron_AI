const stage = document.querySelector('.neural-stage');
const vortex = document.querySelector('.stark-vortex');
const field = document.querySelector('.stark-node-field');
const panel = document.querySelector('.stark-holo-panel');
const panelTitle = document.querySelector('.stark-holo-title');
const panelContent = document.querySelector('.stark-holo-content');
const output = document.getElementById('output-box');

function log(message) {
  if (!output) return;
  const line = document.createElement('p');
  const time = new Date().toLocaleTimeString('pt-BR', { hour12: false });
  line.textContent = `> [${time}] [L&A NEURAL] ${message}`;
  output.appendChild(line);
  output.scrollTop = output.scrollHeight;
}

function positionNode(node) {
  if (!vortex || !node) return;
  const rect = vortex.getBoundingClientRect();
  const width = Math.max(280, rect.width || 420);
  const height = Math.max(280, rect.height || width);
  node.style.setProperty('--x', `${width * 0.18}px`);
  node.style.setProperty('--y', `${height * 0.18}px`);
  node.style.setProperty('--z', '92px');
  node.dataset.innerMesh = 'true';
}

async function showPanel() {
  if (!panel || !panelTitle || !panelContent) return false;
  panelTitle.textContent = 'L&A TEAM';
  panel.classList.add('visible');
  panel.setAttribute('aria-hidden', 'false');
  stage?.classList.add('stark-panel-open');
  await window.ULTRON_LA_TEAM?.renderPanel?.(panelContent);
  return true;
}

function installNode() {
  if (!field || !vortex) return false;
  let node = field.querySelector('[data-ultron-la-team-node]');
  if (!node) {
    node = document.createElement('button');
    node.type = 'button';
    node.className = 'stark-node stark-functional-node ultron-la-team-node';
    node.dataset.ultronLaTeamNode = 'true';
    node.dataset.label = 'L&A TEAM';
    node.dataset.shortLabel = 'L&A TEAM';
    node.dataset.action = 'la-team';
    node.innerHTML = '<span class="stark-node-icon" aria-hidden="true">L&A</span>';
    node.setAttribute('aria-label', 'L&A TEAM — abrir sistema interno');
    field.appendChild(node);
  }
  positionNode(node);
  window.ULTRON_STARK_MESH?.refresh?.();
  return true;
}

function patchCore() {
  const core = window.ULTRON_STARK_CORE;
  if (!core || core.__laTeamPatched) return;
  const originalOpen = core.open?.bind(core);
  const originalFocus = core.focus?.bind(core);

  if (originalOpen) {
    core.open = (labelOrAction) => {
      const wanted = String(labelOrAction || '').trim().toUpperCase();
      if (wanted === 'L&A TEAM' || wanted === 'LA-TEAM' || wanted === 'LA TEAM') {
        field?.querySelectorAll('.stark-functional-node').forEach((item) => item.classList.remove('is-focused'));
        field?.querySelector('[data-ultron-la-team-node]')?.classList.add('is-focused');
        showPanel();
        return true;
      }
      return originalOpen(labelOrAction);
    };
  }

  if (originalFocus) {
    core.focus = (label) => {
      const wanted = String(label || '').trim().toUpperCase();
      if (wanted === 'L&A TEAM' || wanted === 'LA-TEAM' || wanted === 'LA TEAM') {
        field?.querySelectorAll('.stark-functional-node').forEach((item) => item.classList.remove('is-focused'));
        const node = field?.querySelector('[data-ultron-la-team-node]');
        node?.classList.add('is-focused');
        return Boolean(node);
      }
      return originalFocus(label);
    };
  }

  core.__laTeamPatched = true;
}

window.addEventListener('ultron:stark-node', (event) => {
  if (String(event.detail?.label || '').toUpperCase() === 'L&A TEAM') {
    showPanel();
  }
});

window.addEventListener('resize', () => {
  positionNode(field?.querySelector('[data-ultron-la-team-node]'));
});

installNode();
patchCore();
log('Nó L&A TEAM conectado ao Neural Command.');

window.ULTRON_LA_TEAM_NEURAL = {
  open: showPanel,
  refresh() {
    installNode();
    patchCore();
    return true;
  }
};
