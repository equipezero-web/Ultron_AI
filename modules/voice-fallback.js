const output = document.getElementById("output-box");
const synth = window.speechSynthesis || null;
const nativeFetch = window.fetch.bind(window);

let speaking = false;
let lastFallbackNoticeAt = 0;
let activeUtterance = null;

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

export function speakWithBrowser(text, { reason = "fallback", announce = true } = {}) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (!clean || !synth || typeof SpeechSynthesisUtterance === "undefined") {
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

      const indicator = document.getElementById("voice-module");
      if (indicator) {
        indicator.textContent = "BROWSER TTS";
        indicator.className = "green";
      }

      if (announce && Date.now() - lastFallbackNoticeAt > 15000) {
        lastFallbackNoticeAt = Date.now();
        log(
          reason === "quota"
            ? "ElevenLabs sem créditos. Usando TTS nativo do navegador automaticamente."
            : "Usando TTS nativo do navegador como saída de voz alternativa."
        );
      }
    };

    const finish = () => {
      if (activeUtterance === utterance) activeUtterance = null;
      markIdle(clean, "browser-tts");
    };

    utterance.onend = finish;
    utterance.onerror = finish;
    synth.speak(utterance);
    return true;
  } catch (error) {
    log(`TTS nativo indisponível: ${error?.message || error}`, true);
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
  const isVoice = isApiRequest(input, "/api/voice");
  const fallbackText = requestText(init);

  const response = await nativeFetch(input, init);

  if (!isAi && !isVoice) return response;

  try {
    const data = await response.clone().json();

    if (isAi && response.ok && data?.text && !data?.audioBase64) {
      speakWithBrowser(data.text, {
        reason: data?.voice?.quotaExceeded ? "quota" : "fallback"
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
  get speaking() {
    return speaking || Boolean(synth?.speaking);
  },
  get available() {
    return Boolean(synth && typeof SpeechSynthesisUtterance !== "undefined");
  }
};
