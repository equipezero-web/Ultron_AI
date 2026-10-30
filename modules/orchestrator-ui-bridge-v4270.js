const ACTION_MAP = {
  status: "status do sistema",
  camera: "ativar optical sensor",
  center: "centralizar esfera neural 3D"
};

function install() {
  const orchestrator = window.ULTRON_ORCHESTRATOR;
  if (!orchestrator?.execute) return false;
  const buttons = document.querySelectorAll("[data-command]");
  for (const button of buttons) {
    if (button.dataset.orchestratorBound === "1") continue;
    const command = ACTION_MAP[button.dataset.command];
    if (!command) continue;
    button.dataset.orchestratorBound = "1";
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      orchestrator.execute(command, "quick-action");
    }, true);
  }
  return true;
}

if (!install()) {
  const timer = setInterval(() => {
    if (install()) clearInterval(timer);
  }, 100);
  setTimeout(() => clearInterval(timer), 10000);
}

window.ULTRON_ORCHESTRATOR_UI = {
  version: "4.27.0",
  install
};
