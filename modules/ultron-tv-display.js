/* TV layout opt-in; no device control, microphone or camera activation. */
const mode = new URLSearchParams(window.location.search).get('display');
if (mode === 'tv') {
  document.body.classList.add('ultron-tv-display');
  document.documentElement.classList.add('ultron-tv-display');
  document.title = 'ULTRON // TV COMMAND DISPLAY';
}
/* Browser back/forward retains layout when display query changes. */
window.addEventListener('popstate', () => {
  const tv = new URLSearchParams(window.location.search).get('display') === 'tv';
  document.body.classList.toggle('ultron-tv-display', tv);
  document.documentElement.classList.toggle('ultron-tv-display', tv);
});
