import { normalizeIntent } from "./jarvis-intent-engine.js";

// P0 commands are operator-only terminal or voice inputs, not retrieved content.
// Specific "cancelar missão 123456" is a different command.
export function parseMissionControl(message) {
  const text = normalizeIntent(message).replace(/[.!?]+$/, "").trim();
  if (/^(?:pare|parar|stop|congele|congelar|interrompa|interromper|aborte|abortar|cancele tudo|cancelar tudo)(?: (?:tudo|a execucao|os comandos|as operacoes|a missao atual|as tarefas))?$/.test(text)) {
    return { type: "stop" };
  }
  const confirm = text.match(/^(?:confirme|confirmar) (?:a )?missao ([0-9]{6})$/);
  if (confirm) return { type: "confirm", code: confirm[1] };
  const cancel = text.match(/^(?:cancele|cancelar) (?:a )?missao ([0-9]{6})$/);
  if (cancel) return { type: "cancel", code: cancel[1] };
  return null;
}

const STATUS_COMMANDS = new Set(["device.status", "tv.status", "desktop.status", "tv.volume.get", "tv.inputs.list", "tv.apps.list"]);

export function assessCompoundMission(parts, parseDeviceIntent) {
  if (!Array.isArray(parts) || parts.length < 2) return { requiresApproval: false, blocked: false };
  const content = parts.map(part => normalizeIntent(part));
  // No textual or voice approval can authorize unsupported destructive/financial actions.
  const blocked = content.some(text =>
    /\b(?:apagar|apague|excluir|exclua|deletar|delete)\b.{0,60}\b(?:arquivo|documento|pasta|dados|backup)\b/.test(text) ||
    /\b(?:pagar|pagamento|pix|transferir|transfira|comprar|compre)\b/.test(text) ||
    /\b(?:enviar|envie|mandar|mande)\b.{0,40}\b(?:whatsapp|sms|email|e-mail|mensagem)\b/.test(text) ||
    /\b(?:senha|token secreto|chave privada|credencial)\b/.test(text)
  );
  if (blocked) return { requiresApproval: false, blocked: true };
  const requiresApproval = parts.some((part, index) => {
    const intent = typeof parseDeviceIntent === "function" ? parseDeviceIntent(part) : null;
    if (intent && !STATUS_COMMANDS.has(intent.command)) return true;
    const text = content[index];
    return /\b(?:abrir|abra|ative|ativar|ligue|ligar|conecte|conectar|inicie|iniciar)\b.{0,45}\b(?:camera|microfone|sensor optico)\b/.test(text);
  });
  return { requiresApproval, blocked: false };
}

function secureCode() {
  if (typeof crypto?.getRandomValues !== "function") throw new Error("Gerador seguro indisponível para confirmar missões.");
  const buffer = new Uint32Array(1);
  crypto.getRandomValues(buffer);
  return String(buffer[0] % 1_000_000).padStart(6, "0");
}

export function createMissionGate({ now = () => Date.now(), makeCode = secureCode, ttlMs = 120_000 } = {}) {
  let pending = null;
  const current = () => {
    if (pending && now() >= pending.expiresAt) pending = null;
    return pending;
  };
  return {
    preview(message, parts) {
      if (!Array.isArray(parts) || parts.length < 2 || parts.length > 6) throw new Error("Missão composta inválida.");
      const code = String(makeCode());
      if (!/^[0-9]{6}$/.test(code)) throw new Error("Código da missão inválido.");
      pending = { code, message: String(message), parts: [...parts], expiresAt: now() + ttlMs };
      return { ...pending, parts: [...pending.parts] };
    },
    consume(code) {
      const saved = current();
      if (!saved || saved.code !== String(code)) return null;
      pending = null;
      return { ...saved, parts: [...saved.parts] };
    },
    cancel(code) {
      if (!current() || pending.code !== String(code)) return false;
      pending = null;
      return true;
    },
    clear() { pending = null; },
    snapshot() {
      const saved = current();
      return saved ? { code: saved.code, parts: [...saved.parts], expiresAt: saved.expiresAt } : null;
    }
  };
}
