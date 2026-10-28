const panel = window.ULTRON_VISUAL_PANEL;
const core = window.ULTRON_STARK_CORE;

if (panel && core?.addProductionImage) {
  const capture = (items = []) => {
    const list = Array.isArray(items) ? items : [];
    list.forEach((item) => {
      if (typeof item === 'string') {
        core.addProductionImage(item, 'VISUAL CONTEXT', 'ULTRON');
      } else if (item?.src) {
        core.addProductionImage(
          item.src,
          item.alt || item.title || 'VISUAL CONTEXT',
          item.source || 'ULTRON'
        );
      }
    });
  };

  if (typeof panel.setImages === 'function') {
    const original = panel.setImages.bind(panel);
    panel.setImages = (items, options) => {
      capture(items);
      return original(items, options);
    };
  }

  if (typeof panel.showContext === 'function') {
    const original = panel.showContext.bind(panel);
    panel.showContext = (context = {}) => {
      capture(context?.images || []);
      return original(context);
    };
  }

  window.ULTRON_STARK_PRODUCTION = {
    add: core.addProductionImage,
    get items() {
      return core.production || [];
    }
  };
}
