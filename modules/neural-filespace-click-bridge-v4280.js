window.addEventListener('click', (event) => {
  const node = event.target?.closest?.('.stark-file-node');
  const filespace = window.ULTRON_NEURAL_FILESPACE;
  if (!node || !filespace?.active) return;

  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();

  filespace.openFileNode({
    label: node.dataset.label || node.dataset.shortLabel || 'ARQUIVO',
    fileId: node.dataset.fileId || null,
    filePath: node.dataset.filePath || null
  }).catch((error) => {
    console.error('ULTRON Neural filespace click bridge:', error);
  });
}, true);
