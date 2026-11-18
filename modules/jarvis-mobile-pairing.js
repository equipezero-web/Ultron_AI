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
  let expiresAt = 0;
  let busy = false;
  async function pair() {
    if (busy) return;
    if (lastCode && Date.now() < expiresAt - 5000) {
      result.hidden = false;
      copy.hidden = false;
      status.textContent = "Código ainda válido. Digite os 6 números no aplicativo e toque em VINCULAR ESTE CELULAR. Não é necessário gerar outro código.";
      return;
    }
    busy = true;
    generate.disabled = true;
    result.hidden = true;
    copy.hidden = true;
    lastCode = "";
    expiresAt = 0;
    status.textContent = "Consultando gateway e gerando código para recuperar este celular...";
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
      const lifetime = Number(response?.expiresInSeconds) || 600;
      expiresAt = Date.now() + Math.max(30, Math.min(600, lifetime)) * 1000;
      window.ULTRON_MOBILE_LINK?.adoptPairingCode?.(normalized, lifetime);
      codeValue.textContent = normalized;
      result.hidden = false;
      copy.hidden = false;
      const minutes = Math.max(1, Math.ceil((Number(response?.expiresInSeconds) || 600) / 60));
      status.textContent = "Válido por aproximadamente " + minutes +
        " min. No Android, digite o código em PAREAMENTO e toque em VINCULAR ESTE CELULAR. Depois, verifique a conexão Cloud no aplicativo.";
      const sessionLabel = document.getElementById("bridge-session-state");
      if (sessionLabel) sessionLabel.textContent = "CODE " + normalized;
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
  // Route clicks on the old COMPUTADOR ↔ CELULAR button through the same
  // recovery flow. Capture before other modules so stale handlers cannot say
  // "already paired / offline" and block the operator from getting a code.
  // Never intercept other buttons or silently create pairing sessions.
  if (!document.__jarvisLegacyPairingCapture && typeof document.addEventListener === "function") {
    document.__jarvisLegacyPairingCapture = true;
    const isLegacy = event => {
      const target = event?.target;
      return target?.id === "btn-pair-mobile" ||
        target?.closest?.("#btn-pair-mobile") != null;
    };
    document.addEventListener("pointerdown", event => {
      if (isLegacy(event)) event.stopImmediatePropagation?.();
    }, true);
    document.addEventListener("click", event => {
      if (!isLegacy(event)) return;
      event.preventDefault?.();
      event.stopImmediatePropagation?.();
      panel.scrollIntoView({ behavior: "smooth", block: "center" });
      void pair();
    }, true);
  }
}

// Command-center mount is asynchronous relative to entrypoint evaluation.
// Retry once the current panel finishes mounting, without duplicating UI or codes.
window.addEventListener?.("jarvis:command-center-ready", installVisibleMobilePairing);
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", installVisibleMobilePairing, { once: true });
} else {
  installVisibleMobilePairing();
}
