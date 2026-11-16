// J.A.R.V.I.S. // Visible mobile pairing: inline, no modal or extra page.
// The pairing code comes only from the authenticated device gateway.
// Codes are neither persisted nor placed in URL parameters.
function installVisibleMobilePairing() {
  const slot = document.getElementById("jarvis-cc-input-slot");
  if (!slot || document.getElementById("jarvis-mobile-pair-card")) return;

  const panel = document.createElement("section");
  panel.id = "jarvis-mobile-pair-card";
  panel.className = "jarvis-mobile-pair-card";
  panel.setAttribute("aria-label", "Pareamento do celular com o J.A.R.V.I.S.");

  const header = document.createElement("div");
  header.className = "jarvis-mobile-pair-header";
  const title = document.createElement("strong");
  title.textContent = "◈  CONECTAR CELULAR AO J.A.R.V.I.S.";
  const hint = document.createElement("span");
  hint.textContent = "ANDROID BRIDGE  /  PAREAMENTO SEGURO";
  header.append(title, hint);
  panel.append(header);

  const lead = document.createElement("p");
  lead.className = "jarvis-mobile-pair-help";
  lead.textContent = "Gere um código aqui no painel web, abra o aplicativo J.A.R.V.I.S. Bridge no Android e digite os 6 números em PAREAMENTO.";
  panel.append(lead);

  const controls = document.createElement("div");
  controls.className = "jarvis-mobile-pair-actions";
  const generate = document.createElement("button");
  generate.type = "button";
  generate.id = "btn-jarvis-pair-mobile";
  generate.className = "jarvis-mobile-pair-primary";
  generate.textContent = "PAREAR CELULAR";
  controls.append(generate);
  const copy = document.createElement("button");
  copy.type = "button";
  copy.className = "jarvis-mobile-pair-copy";
  copy.textContent = "COPIAR CÓDIGO";
  copy.hidden = true;
  controls.append(copy);
  panel.append(controls);

  const result = document.createElement("div");
  result.className = "jarvis-mobile-pair-result";
  result.hidden = true;
  const codeLabel = document.createElement("span");
  codeLabel.textContent = "SEU CÓDIGO TEMPORÁRIO";
  const codeValue = document.createElement("strong");
  codeValue.id = "jarvis-mobile-pair-code";
  codeValue.setAttribute("aria-label", "Código temporário de seis dígitos");
  result.append(codeLabel, codeValue);
  panel.append(result);

  const status = document.createElement("p");
  status.id = "jarvis-mobile-pair-status";
  status.className = "jarvis-mobile-pair-status";
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  status.textContent = "O código será exibido aqui — não na TV.";
  panel.append(status);
  slot.prepend(panel);

  let lastCode = "";
  let busy = false;
  async function pair() {
    if (busy) return;
    busy = true;
    generate.disabled = true;
    result.hidden = true;
    copy.hidden = true;
    lastCode = "";
    status.textContent = "Consultando gateway e gerando código...";
    try {
      const api = window.ULTRON_DEVICES;
      if (typeof api?.startPairing !== "function") {
        throw new Error("O módulo de dispositivos ainda não carregou. Atualize o painel e tente novamente.");
      }
      const response = await api.startPairing("mobile", "Ultron Mobile Bridge");
      const raw = String(response?.code ?? "");
      const normalized = /^\d{1,6}$/.test(raw) ? raw.padStart(6, "0") : raw;
      if (!/^\d{6}$/.test(normalized)) throw new Error("Gateway não retornou um código válido.");
      lastCode = normalized;
      codeValue.textContent = normalized;
      result.hidden = false;
      copy.hidden = false;
      const minutes = Math.max(1, Math.ceil((Number(response?.expiresInSeconds) || 600) / 60));
      status.textContent = "Válido por aproximadamente " + minutes +
        " min. No aplicativo Android, insira o código e toque em VINCULAR ESTE CELULAR.";
      document.getElementById("bridge-session-state")?.replaceChildren(
        document.createTextNode("CÓDIGO GERADO")
      );
    } catch (error) {
      status.textContent = "Não foi possível parear: " + String(error?.message || error);
    } finally {
      busy = false;
      generate.disabled = false;
    }
  }
  generate.addEventListener("click", pair);
  copy.addEventListener("click", async () => {
    if (!lastCode) return;
    try {
      await navigator.clipboard.writeText(lastCode);
      status.textContent = "Código copiado. Insira os seis números no aplicativo J.A.R.V.I.S. Bridge.";
    } catch {
      status.textContent = "Cópia bloqueada pelo navegador. Digite o código mostrado acima no aplicativo.";
    }
  });

  // Available at the very top of the Neural, including small phone screens.
  const topbar = document.querySelector(".jarvis-cc-top");
  if (topbar && !document.getElementById("btn-jarvis-mobile-pair-top")) {
    const quickPair = document.createElement("button");
    quickPair.type = "button";
    quickPair.id = "btn-jarvis-mobile-pair-top";
    quickPair.textContent = "PAREAR CELULAR";
    quickPair.setAttribute("aria-controls", "jarvis-mobile-pair-card");
    quickPair.setAttribute("aria-label", "Parear celular com J.A.R.V.I.S. e obter código");
    const firstStatus = topbar.querySelector(".jarvis-cc-live");
    if (firstStatus) firstStatus.before(quickPair);
    else topbar.append(quickPair);
    quickPair.addEventListener("click", () => {
      panel.scrollIntoView({ behavior: "smooth", block: "center" });
      void pair();
    });
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", installVisibleMobilePairing, { once: true });
} else {
  installVisibleMobilePairing();
}
