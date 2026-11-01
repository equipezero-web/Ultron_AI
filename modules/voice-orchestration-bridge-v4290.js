function installVisualVoiceBridge() {
  const vision = window.ULTRON_VISION_ROUTER;
  const orchestrator = window.ULTRON_ORCHESTRATOR;
  if (!vision?.run || !orchestrator?.execute || vision.__orchestratorBridge) return false;

  const originalRun = vision.run.bind(vision);
  vision.run = (command, ...args) => {
    if (window.ULTRON_ORCHESTRATOR?.state?.busy) return originalRun(command, ...args);
    return orchestrator.execute(String(command || '').trim(), 'voice-vision');
  };
  vision.__orchestratorBridge = true;
  vision.__directRun = originalRun;
  return true;
}

function install() {
  const voice = window.ULTRON_VOICE_INPUT;
  if (voice?.version === '4.29.0') voice.__orchestratorBridge = 'wake-aware-v4.29.0';
  return installVisualVoiceBridge();
}

if (!install()) {
  const timer = setInterval(() => {
    if (install()) clearInterval(timer);
  }, 100);
  setTimeout(() => clearInterval(timer), 12000);
}

window.ULTRON_VOICE_ORCHESTRATION_BRIDGE = {
  version: '4.29.0',
  wakeAwareDispatch: true,
  install
};
