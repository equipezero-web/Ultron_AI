const STYLE_ID = 'ultron-stark-core-style';

if (!document.getElementById(STYLE_ID)) {
  const link = document.createElement('link');
  link.id = STYLE_ID;
  link.rel = 'stylesheet';
  link.href = `modules/stark-core.css?v=4.5.0`;
  document.head.appendChild(link);
}

await import('./stark-core.js');
await import('./neural-input-bus.js');
await import('./stark-advanced.js');
await import('./vision-client.js');

window.dispatchEvent(new CustomEvent('ultron:stark-bootstrap-ready', {
  detail: {
    starkCore: Boolean(window.ULTRON_STARK_CORE),
    advanced: Boolean(window.ULTRON_STARK_ADVANCED),
    neuralInput: Boolean(window.ULTRON_NEURAL_INPUT),
    vision: Boolean(window.ULTRON_VISION)
  }
}));
