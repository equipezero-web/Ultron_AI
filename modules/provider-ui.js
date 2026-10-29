const output = document.getElementById("output-box");
let lastProviderLabel = "AI";

function requestUrl(input) {
  return typeof input === "string" ? input : input?.url || "";
}

function requestMethod(input, init = {}) {
  return String(init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
}

function isAiRequest(input, init = {}) {
  return requestMethod(input, init) === "POST" && /\/api\/ai(?:\?|$)/.test(requestUrl(input));
}

function isHealthRequest(input, init = {}) {
  return requestMethod(input, init) === "GET" && /\/api\/health(?:\?|$)/.test(requestUrl(input));
}

function voiceIndicator(label, active = true) {
  const indicator = document.getElementById("voice-module");
  if (!indicator || !label) return;
  indicator.textContent = String(label).toUpperCase();
  indicator.className = active ? "green" : "";
}

function appendLine(text, alert = false) {
  if (!output || !text) return;
  const line = document.createElement("p");
  if (alert) line.className = "alert";
  line.textContent = text;
  output.appendChild(line);
  output.scrollTop = output.scrollHeight;
}

function appendSpeed(performance = {}) {
  if (!performance?.totalMs) return;

  const ai = Math.round(Number(performance.aiMs || 0));
  const research = Math.round(Number(performance.researchMs || 0));
  const voice = Math.round(
    Number(performance.voiceMs || 0) + Number(performance.fallbackVoiceMs || 0)
  );
  const total = Math.round(Number(performance.totalMs || 0));
  const passes = Math.max(1, Number(performance.aiPasses || 1));

  appendLine(`> [SPEED] pesquisa ${research}ms | IA ${ai}ms${passes > 1 ? ` (${passes} passes)` : ""} | voz ${voice}ms | total ${total}ms`);
}

function appendRouting(routing) {
  if (!routing?.class || !Array.isArray(routing?.order)) return;
  const route = routing.order.map((item) => String(item).toUpperCase()).join(" > ");
  appendLine(`> [ROUTER] ${String(routing.class).toUpperCase()} // ${route}`);
}

function appendPlan(plan) {
  if (!plan?.complex || !Array.isArray(plan?.steps)) return;
  const confirms = plan.steps.filter((item) => item?.permission === "confirm").length;
  const blocked = plan.steps.filter((item) => item?.permission === "blocked").length;
  const extra = [
    confirms ? `${confirms} confirmação(ões)` : "",
    blocked ? `${blocked} bloqueio(s)` : ""
  ].filter(Boolean).join(" | ");

  appendLine(
    `> [PLANNER] ${String(plan.intent || "general").toUpperCase()} // ${plan.steps.length} etapas${extra ? ` // ${extra}` : ""}`,
    blocked > 0
  );
}

function appendResearch(research) {
  if (!research?.requested) return;

  if (!research.used) {
    const reason = research.error ? ` // ${research.error}` : "";
    appendLine(`> [WEB RESEARCH] PESQUISA SOLICITADA, MAS NÃO UTILIZADA${reason}`, true);
    return;
  }

  const sourceCount = Number(research.sourceCount || 0);
  const origin = research.fromCache ? "MEMÓRIA DE PESQUISA" : String(research.provider || "WEB").toUpperCase();
  const saved = research.savedToMemory ? " // CACHE: SALVO" : "";
  const retry = research.automaticFallback ? " // AUTO-RETRY: INCERTEZA DETECTADA" : "";
  const searchMs = Number(research.searchMs || 0);
  const domains = Number(research?.quality?.diverseDomains || 0);
  const engines = Array.isArray(research?.quality?.engines) ? research.quality.engines.join("+").toUpperCase() : "";
  const quality = [
    domains ? `${domains} domínio(s)` : "",
    engines ? engines : "",
    searchMs ? `${Math.round(searchMs)}ms` : ""
  ].filter(Boolean).join(" // ");

  appendLine(`> [WEB RESEARCH] ${origin} // ${sourceCount} fonte(s)${quality ? ` // ${quality}` : ""}${saved}${retry}`);
}

function processingEvent(name, detail = {}) {
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

const previousFetch = window.fetch.bind(window);

window.fetch = async function ultronProviderFetch(input, init = {}) {
  const aiRequest = isAiRequest(input, init);
  const healthRequest = isHealthRequest(input, init);

  if (aiRequest) processingEvent("ultron:processing-start", { url: requestUrl(input) });

  try {
    const response = await previousFetch(input, init);

    if (!aiRequest && !healthRequest) return response;

    try {
      const data = await response.clone().json();

      if (healthRequest) {
        const router = data?.voiceRouter;
        if (router) {
          const cloudReady = Boolean(
            router?.elevenlabs?.configured ||
            router?.googleNeural2?.configured ||
            router?.googleWaveNet?.configured
          );
          voiceIndicator(cloudReady ? "VOICE ROUTER" : "BROWSER TTS", true);
        }
        return response;
      }

      lastProviderLabel = data?.providerLabel || data?.provider || "AI";
      appendResearch(data?.webResearch);
      appendRouting(data?.smartRouting);
      appendPlan(data?.operationalPlan);
      appendSpeed(data?.performance);

      if (data?.voice?.providerLabel) {
        voiceIndicator(data.voice.providerLabel, true);
      } else if (data?.voice?.nextFallback === "browser-tts") {
        voiceIndicator("FALLBACK READY", true);
      }
    } catch {}

    return response;
  } finally {
    if (aiRequest) processingEvent("ultron:processing-end", { url: requestUrl(input) });
  }
};

window.addEventListener("ultron:speech-start", (event) => {
  const provider = String(event?.detail?.provider || "").toLowerCase();
  if (provider === "browser-tts") voiceIndicator("BROWSER TTS", true);
  if (provider === "xtts-v2") voiceIndicator("XTTS V2", true);
});

function normalizeTerminalNode(node) {
  if (!(node instanceof HTMLElement)) return;

  let text = node.textContent || "";

  if (text.includes("ULTRON CORE: processando com Gemini")) {
    text = text.replace(
      "ULTRON CORE: processando com Gemini",
      "ULTRON CORE: roteando para a IA mais adequada"
    );
  }

  if (text.includes("GEMINI ERROR:")) {
    text = text.replace("GEMINI ERROR:", "ULTRON AI ERROR:");
  }

  if (text.includes("GEMINI:")) {
    text = text.replace("GEMINI:", `${String(lastProviderLabel).toUpperCase()}:`);
  }

  if (text.includes("Solicitando teste de voz ElevenLabs")) {
    text = text.replace(
      "Solicitando teste de voz ElevenLabs",
      "Solicitando teste do roteador de voz"
    );
  }

  if (text.includes("ElevenLabs: voz recebida e enviada para reprodução.")) {
    text = text.replace(
      "ElevenLabs: voz recebida e enviada para reprodução.",
      "VOICE ROUTER: voz recebida e enviada para reprodução."
    );
  }

  if (text.includes("ELEVENLABS ERROR:")) {
    text = text.replace("ELEVENLABS ERROR:", "VOICE ROUTER:");
  }

  if (text.includes("| ElevenLabs ")) {
    text = text.replace("| ElevenLabs ", "| Voice Router ");
  }

  if (node.textContent !== text) node.textContent = text;
}

if (output) {
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) normalizeTerminalNode(node);
    }
  });

  observer.observe(output, { childList: true });
}
