const STYLE_ID = 'ultron-la-team-style';
if (!document.getElementById(STYLE_ID)) {
  const link = document.createElement('link');
  link.id = STYLE_ID;
  link.rel = 'stylesheet';
  link.href = 'modules/la-team.css?v=4.15.0';
  document.head.appendChild(link);
}

await import('./la-team-client.js?v=4.15.0');
await import('./la-team-ai-bridge.js?v=4.15.0');
await import('./backend-version-check.js?v=4.15.0');

const installNeural = async () => {
  if (!window.ULTRON_STARK_CORE || !document.querySelector('.stark-node-field')) return false;
  await import('./la-team-neural.js?v=4.15.0');
  return true;
};

if (!(await installNeural())) {
  window.addEventListener('ultron:stark-bootstrap-ready', () => {
    installNeural().catch((error) => console.warn('ULTRON L&A Team Neural:', error));
  }, { once: true });
}

window.dispatchEvent(new CustomEvent('ultron:la-team-bootstrap-ready', {
  detail: {
    version: '4.15.0',
    connector: Boolean(window.ULTRON_LA_TEAM),
    bridge: Boolean(window.ULTRON_LA_TEAM_BRIDGE)
  }
}));
