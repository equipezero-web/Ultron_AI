function normalize(text) {
  return String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function isVoiceRuntimeCommand(text) {
  const value = normalize(text);
  return [
    "dormir",
    "durma",
    "modo passivo",
    "pare de responder",
    "encerrar conversa",
    "finalizar conversa"
  ].some((command) => value === command || value.endsWith(` ${command}`));
}

function installVoiceDispatchBridge() {
  const voice = window.ULTRON_VOICE_INPUT;
  const orchestrator = window.ULTRON_ORCHESTRATOR;
  if (!voice?.dispatch || !orchestrator?.execute || voice.__orchestratorBridge) return false;

  const originalDispatch = voice.dispatch.bind(voice);
  voice.dispatch = (text, options = {}) => {
    if (isVoiceRuntimeCommand(text)) return originalDispatch(text, options);
    return orchestrator.execute(String(text || "").trim(), options?.source || "voice");
  };
  voice.__orchestratorBridge = true;
  return true;
}

function installVisualVoiceBridge() {
  const vision = window.ULTRON_VISION_ROUTER;
  const orchestrator = window.ULTRON_ORCHESTRATOR;
  if (!vision?.run || !orchestrator?.execute || vision.__orchestratorBridge) return false;

  const originalRun = vision.run.bind(vision);
  vision.run = (command, ...args) => {
    if (window.ULTRON_ORCHESTRATOR?.state?.busy) {
      return originalRun(command, ...args);
    }
    return orchestrator.execute(String(command || "").trim(), "voice-vision");
  };
  vision.__orchestratorBridge = true;
  vision.__directRun = originalRun;
  return true;
}

function install() {
  const voiceInstalled = installVoiceDispatchBridge();
  const visionInstalled = installVisualVoiceBridge();
  return voiceInstalled && visionInstalled;
}

if (!install()) {
  const timer = setInterval(() => {
    if (install()) clearInterval(timer);
  }, 100);
  setTimeout(() => clearInterval(timer), 12000);
}

window.ULTRON_VOICE_ORCHESTRATION_BRIDGE = {
  version: "4.27.0",
  install
};
