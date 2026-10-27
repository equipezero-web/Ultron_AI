const output = document.getElementById("output-box");
let lastProviderLabel = "AI";

function isAiRequest(input, init = {}) {
  const url = typeof input === "string" ? input : input?.url || "";
  const method = String(init?.method || (input instanceof Request ? input.method : "GET"))
    .toUpperCase();

  return method === "POST" && /\/api\/ai(?:\?|$)/.test(url);
}

function appendSpeed(performance = {}) {
  if (!output || !performance?.totalMs) return;

  const line = document.createElement("p");
  const ai = Math.round(Number(performance.aiMs || 0));
  const voice = Math.round(Number(performance.voiceMs || 0));
  const total = Math.round(Number(performance.totalMs || 0));

  line.textContent = `> [SPEED] IA ${ai}ms | voz ${voice}ms | total ${total}ms`;
  output.appendChild(line);
  output.scrollTop = output.scrollHeight;
}

const previousFetch = window.fetch.bind(window);

window.fetch = async function ultronProviderFetch(input, init = {}) {
  const response = await previousFetch(input, init);

  if (!isAiRequest(input, init)) {
    return response;
  }

  try {
    const data = await response.clone().json();
    lastProviderLabel = data?.providerLabel || data?.provider || "AI";
    appendSpeed(data?.performance);
  } catch {}

  return response;
};

function normalizeTerminalNode(node) {
  if (!(node instanceof HTMLElement)) return;

  const text = node.textContent || "";

  if (text.includes("ULTRON CORE: processando com Gemini")) {
    node.textContent = text.replace(
      "ULTRON CORE: processando com Gemini",
      "ULTRON CORE: roteando para a IA mais rápida"
    );
    return;
  }

  if (text.includes("GEMINI ERROR:")) {
    node.textContent = text.replace("GEMINI ERROR:", "ULTRON AI ERROR:");
    return;
  }

  if (text.includes("GEMINI:")) {
    node.textContent = text.replace("GEMINI:", `${String(lastProviderLabel).toUpperCase()}:`);
  }
}

if (output) {
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        normalizeTerminalNode(node);
      }
    }
  });

  observer.observe(output, { childList: true });
}
