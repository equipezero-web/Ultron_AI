import API_CONFIG from "../config.js";

const output = document.getElementById("output-box");
const synth = window.speechSynthesis || null;
const nativeFetch = window.fetch.bind(window);
const API_BASE = String(API_CONFIG?.backendUrl || "").replace(/\/$/, "");

let speaking = false;
let lastFallbackNoticeAt = 0;
let activeUtterance = null;
let xttsBusy = false;

function log(message, alert = false) {
  if (!output) return;
  const line = document.createElement("p");
  line.className = alert ? "alert" : "";
  line.textContent = `> [VOICE] ${message}`;
  output.appendChild(line);
  output.scrollTop = output.scrollHeight;
}

function dispatchSpeechEvent(type, detail = {}) {
  window.dispatchEvent(new CustomEvent(type, { detail }));
}

function pickPortugueseVoice() {
  if (!synth) return null;
  const voices = synth.getVoices?.() || [];
  if (!voices.length) return null;

  return (
    voices.find((voice) => /^pt-BR$/i.test(voice.lang)) ||
    voices.find((voice) => /^pt(?:-|$)/i.test(voice.lang)) ||
    voices.find((voice) => /brasil|brazil/i.test(`${voice.name} ${voice.lang}`)) ||
    null
  );
}

function markSpeaking(text, provider = "browser") {
  speaking = true;
  window.ULTRON_VISUAL_PANEL?.speaking?.();
  dispatchSpeechEvent("ultron:speech-start", { text, provider });
}

function markIdle(text, provider = "browser") {
  speaking = false;
  window.ULTRON_VISUAL_PANEL?.idle?.();
  dispatchSpeechEvent("ultron:speech-end", { text, provider });
}

function updateIndicator(label) {
  const indicator = document.getElementById("voice-module");
  if (!indicator) return;
  indicator.textContent = label;
  indicator.className = "green";
}

function playBase64Audio(base64, mime = "audio/wav", providerLabel = "XTTS v2") {
  if (!base64) return false;

  try {
    const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
    const blob = new Blob([bytes], { type: mime });
    const url = URL.createObjectURL(blob);
    const audio = document.getElementById("voice-audio");
    if (!audio) {
      URL.revokeObjectURL(url);
      return false;
    }

    if (audio.dataset.audioUrl) URL.revokeObjectURL(audio.dataset.audioUrl);
    audio.dataset.audioUrl = url;
    audio.src = url;
    audio.load();
    updateIndicator(providerLabel.toUpperCase());

    audio.onended = () => {
      if (audio.dataset.audioUrl === url) {
        URL.revokeObjectURL(url);
        delete audio.dataset.audioUrl;
      }
    };

    audio.play().catch((error) => {
      log(`Áudio ${providerLabel} gerado, mas o navegador bloqueou a reprodução: ${error?.message || error}`, true);
    });
    return true;
  } catch (error) {
    log(`Falha ao reproduzir ${providerLabel}: ${error?.message || error}`, true);
    return false;
  }
}

export async function speakWithXtts(text, { announce = true } = {}) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (!clean || !API_BASE || xttsBusy) return false;

  xttsBusy = true;
  try {
    const response = await nativeFetch(`${API_BASE}/api/voice/xtts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: clean }),
      cache: "no-store"
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data?.audioBase64) return false;

    if (announce) log("Browser TTS indisponível. Usando XTTS v2 como último fallback.");
    return playBase64Audio(
      data.audioBase64,
      data.audioMimeType || "audio/wav",
      data?.voice?.providerLabel || "XTTS v2"
    );
  } catch (error) {
    console.warn("ULTRON XTTS fallback:", error);
    return false;
  } finally {
    xttsBusy = false;
  }
}

export function speakWithBrowser(text, { reason = "fallback", announce = true } = {}) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (!clean) return false;

  if (!synth || typeof SpeechSynthesisUtterance === "undefined") {
    speakWithXtts(clean, { announce: true });
    return false;
  }

  try {
    synth.cancel();

    const utterance = new SpeechSynthesisUtterance(clean);
    const voice = pickPortugueseVoice();
    if (voice) utterance.voice = voice;
    utterance.lang = voice?.lang || "pt-BR";
    utterance.rate = 0.96;
    utterance.pitch = 0.92;
    utterance.volume = 1;

    utterance.onstart = () => {
      activeUtterance = utterance;
      markSpeaking(clean, "browser-tts");
      updateIndicator("BROWSER TTS");

      if (announce && Date.now() - lastFallbackNoticeAt > 15000) {
        lastFallbackNoticeAt = Date.now();
        log(
          reason === "quota"
            ? "Provedor de voz em nuvem sem cota. Usando Browser TTS automaticamente."
            : "Usando Browser TTS como fallback de voz."
        );
      }
    };

    utterance.onend = () => {
      if (activeUtterance === utterance) activeUtterance = null;
      markIdle(clean, "browser-tts");
    };

    utterance.onerror = (event) => {
      if (activeUtterance === utterance) activeUtterance = null;
      markIdle(clean, "browser-tts");

      const code = String(event?.error || "").toLowerCase();
      if (code !== "interrupted" && code !== "canceled") {
        speakWithXtts(clean, { announce: true });
      }
    };

    synth.speak(utterance);
    return true;
  } catch (error) {
    log(`Browser TTS indisponível: ${error?.message || error}`, true);
    speakWithXtts(clean, { announce: true });
    return false;
  }
}

function isApiRequest(input, path) {
  const url = typeof input === "string" ? input : input?.url || "";
  return url.includes(path);
}

function requestText(init = {}) {
  if (typeof init?.body !== "string") return "";
  try {
    const parsed = JSON.parse(init.body);
    return String(parsed?.text || parsed?.message || "").trim();
  } catch {
    return "";
  }
}

function looksLikeQuotaError(data) {
  const raw = JSON.stringify(data || {}).toLowerCase();
  return raw.includes("quota_exceeded") || raw.includes("0 credits") || raw.includes("exceeds your quota");
}

window.fetch = async function ultronVoiceFallbackFetch(input, init = {}) {
  const isAi = isApiRequest(input, "/api/ai");
  const isVoice = isApiRequest(input, "/api/voice") && !isApiRequest(input, "/api/voice/xtts");
  const fallbackText = requestText(init);

  const response = await nativeFetch(input, init);
  if (!isAi && !isVoice) return response;

  try {
    const data = await response.clone().json();

    if (isAi && response.ok && data?.text && !data?.audioBase64) {
      speakWithBrowser(data.text, {
        reason: looksLikeQuotaError(data?.voice?.attempts) ? "quota" : "fallback"
      });
    }

    if (isVoice && !response.ok && fallbackText) {
      speakWithBrowser(fallbackText, {
        reason: looksLikeQuotaError(data) ? "quota" : "fallback"
      });
    }
  } catch {}

  return response;
};

window.ULTRON_VOICE_OUTPUT = {
  speak: speakWithBrowser,
  speakWithXtts,
  get speaking() {
    return speaking || Boolean(synth?.speaking);
  },
  get available() {
    return Boolean(synth && typeof SpeechSynthesisUtterance !== "undefined");
  }
};
