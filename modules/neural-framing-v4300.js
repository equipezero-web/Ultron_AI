const VERSION = '4.30.0';
const body = document.body;
const state = { focus: 'core', reason: 'idle', lastChangedAt: Date.now() };

function setFocus(focus, reason = 'runtime') {
  const next = String(focus || 'core');
  if (state.focus === next && state.reason === reason) return;
  state.focus = next;
  state.reason = reason;
  state.lastChangedAt = Date.now();
  body.dataset.neuralFocus = next;
  window.dispatchEvent(new CustomEvent('ultron:framing-change', { detail: { focus: next, reason, version: VERSION } }));
}

window.addEventListener('ultron:priority-change', (event) => {
  const level = event?.detail?.level;
  if (level === 'P0' || level === 'P1') setFocus('critical', level);
  else if (level === 'P2') setFocus('voice', 'voice-authority');
  else if (level === 'P3') setFocus('core', 'active-command');
});

window.addEventListener('ultron:predictive-intent', (event) => {
  const intent = event?.detail?.intent;
  const confidence = Number(event?.detail?.confidence || 0);
  if (confidence < .18) return;
  if (intent === 'PRECISION_ZOOM') setFocus('precision', 'pinch');
  else if (intent === 'EXPAND' || intent === 'ROTATE_PREDICT') setFocus('neural', intent);
  else if (intent === 'COLLAPSE_LOCK') setFocus('locked', intent);
});

window.addEventListener('ultron:voice-command', () => setFocus('voice', 'voice-command'));
window.addEventListener('ultron:speech-start', () => setFocus('voice', 'ultron-speaking'));
window.addEventListener('ultron:speech-end', () => {
  setTimeout(() => {
    if (!window.ULTRON_PRIORITY?.state?.frozen) setFocus('core', 'speech-finished');
  }, 900);
});
window.addEventListener('ultron:camera-stream', (event) => {
  if (event?.detail?.active) setFocus('optical', 'camera-active');
});
window.addEventListener('ultron:emergency-stop', () => setFocus('critical', 'p0-stop'));
window.addEventListener('ultron:priority-resume', () => setFocus('core', 'resume'));
window.addEventListener('ultron:neural-filespace-open', () => setFocus('filespace', 'filespace-open'));
window.addEventListener('ultron:neural-filespace-close', () => setFocus('neural', 'filespace-close'));

document.addEventListener('pointerover', (event) => {
  if (window.ULTRON_PRIORITY?.state?.frozen) return;
  if (event.target?.closest?.('.neural-stage')) setFocus('neural', 'pointer');
  else if (event.target?.closest?.('.optical-panel')) setFocus('optical', 'pointer');
  else if (event.target?.closest?.('.microphone-panel')) setFocus('voice', 'pointer');
  else if (event.target?.closest?.('.terminal-panel')) setFocus('terminal', 'pointer');
}, { passive: true });

setFocus('core', 'boot');
window.ULTRON_FRAMING = { version: VERSION, setFocus, get state() { return { ...state }; } };
