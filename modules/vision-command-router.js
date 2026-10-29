import { addLog } from "./system.js";

const HAS_DOM = typeof document !== "undefined";
const HAS_WINDOW = typeof window !== "undefined";
const output = HAS_DOM ? document.getElementById("output-box") : null;
const input = HAS_DOM ? document.getElementById("command-input") : null;
const sendButton = HAS_DOM ? document.getElementById("btn-send") : null;
const visionModule = HAS_DOM ? document.getElementById("vision-module") : null;

let processing = false;
let lastVisualCommandAt = 0;

function normalize(text) {
  return String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForVisionRuntime(timeoutMs = 6000) {
  if (!HAS_WINDOW) return null;
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (window.ULTRON_VISION?.analyze) return window.ULTRON_VISION;
    await wait(100);
  }
  return window.ULTRON_VISION?.analyze ? window.ULTRON_VISION : null;
}

const DIRECT_VISUAL_PATTERNS = [
  /o que (voce )?(ve|esta vendo|enxerga|esta enxergando)/,
  /o que tem (na|nessa|pela) camera/,
  /o que aparece (na|nessa|pela) camera/,
  /descrev(a|e) (a )?(cena|imagem|camera|o que)/,
  /analis(a|e) (a )?(cena|imagem|camera|visao|o que)/,
  /observ(a|e) (a )?(cena|imagem|camera|o que)/,
  /identifiq(ue|a) (o|a|os|as|um|uma)? ?(objeto|objetos|texto|textos|item|itens)/,
  /leia (o )?(texto|que esta escrito|que aparece)/,
  /qual (e )?(o |a )?(objeto|texto|cor) (na|da|nessa) (imagem|camera|cena)/,
  /quantos? (objetos|itens|pessoas) (tem|ha|aparecem)/
];

const CAMERA_CONTEXT_WORDS = [
  "camera",
  "visao",
  "imagem",
  "cena",
  "visual",
  "enxerga",
  "vendo"
];

const ANALYSIS_WORDS = [
  "analisa",
  "analise",
  "descreva",
  "descreve",
  "identifica",
  "identifique",
  "observe",
  "observa",
  "leia",
  "texto",
  "objeto",
  "objetos",
  "cor",
  "cores",
  "quantos",
  "quantas",
  "o que"
];

const CAMERA_ONLY_PATTERNS = [
  /^(abrir|abra|ligar|ligue|ativar|ative|iniciar|inicie) (a )?camera$/,
  /^(mostrar|mostre) (a )?(camera|tela)$/,
  /^camera$/,
  /^mostrar tela$/
];

export function isVisualAnalysisCommand(command) {
  const text = normalize(command);
  if (!text) return false;
  if (CAMERA_ONLY_PATTERNS.some((pattern) => pattern.test(text))) return false;
  if (DIRECT_VISUAL_PATTERNS.some((pattern) => pattern.test(text))) return true;

  const hasCameraContext = CAMERA_CONTEXT_WORDS.some((word) => text.includes(word));
  const hasAnalysisIntent = ANALYSIS_WORDS.some((word) => text.includes(word));
  return hasCameraContext && hasAnalysisIntent;
}

function setVisionState(text, active = false) {
  if (!visionModule) return;
  visionModule.textContent = text;
  visionModule.className = active ? "green" : "";
}

export async function runVisualCommand(command) {
  const clean = String(command || "").trim();
  if (!clean || !isVisualAnalysisCommand(clean)) return null;

  if (processing) {
    addLog(output, "VISÃO: já existe uma análise visual em andamento.", "alert");
    return null;
  }

  processing = true;
  lastVisualCommandAt = Date.now();
  setVisionState("ANALYZING", true);
  addLog(output, `OPERATOR: ${clean}`);
  addLog(output, "ULTRON VISION: preparando o runtime visual e validando o frame atual...");

  const runtimeWindow = HAS_WINDOW ? window : null;

  try {
    const vision = await waitForVisionRuntime();
    if (!vision?.analyze) {
      addLog(output, "VISÃO: runtime visual não ficou disponível a tempo.", "alert");
      return null;
    }

    const result = await vision.analyze(clean);
    if (!result?.text) {
      addLog(output, "ULTRON VISION: a análise não retornou uma descrição válida.", "alert");
      return null;
    }

    if (typeof CustomEvent !== "undefined") {
      runtimeWindow?.dispatchEvent?.(new CustomEvent("ultron:vision-command-complete", {
        detail: {
          command: clean,
          text: result.text,
          provider: result.provider || null,
          model: result.model || null,
          completedAt: new Date().toISOString()
        }
      }));
    }

    runtimeWindow?.ULTRON_VOICE_OUTPUT?.speak?.(result.text, {
      reason: "vision-command",
      announce: false
    });

    return result;
  } catch (error) {
    addLog(output, `ULTRON VISION ERROR: ${error?.message || error}`, "alert");
    return null;
  } finally {
    processing = false;
    const active = Boolean(runtimeWindow?.ULTRON_CAMERA_CONTROLLER?.isActive?.());
    setVisionState(active ? "ACTIVE" : "STANDBY", active);
  }
}

function interceptCommand(event) {
  const command = String(input?.value || "").trim();
  if (!isVisualAnalysisCommand(command)) return false;

  event?.preventDefault?.();
  event?.stopImmediatePropagation?.();
  if (input) input.value = "";
  runVisualCommand(command);
  return true;
}

sendButton?.addEventListener("click", interceptCommand, true);

input?.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" || event.shiftKey) return;
  interceptCommand(event);
}, true);

if (HAS_WINDOW) {
  window.ULTRON_VISION_ROUTER = {
    isVisualAnalysisCommand,
    run: runVisualCommand,
    get state() {
      return {
        processing,
        lastVisualCommandAt: lastVisualCommandAt || null
      };
    }
  };
}
