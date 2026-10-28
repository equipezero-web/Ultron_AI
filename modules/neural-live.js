const stage = document.querySelector(".neural-stage");
const audio = document.getElementById("voice-audio");
const output = document.getElementById("output-box");

if (stage) {
  const cssHref = "modules/neural-live.css?v=4.3.0";
  if (!document.querySelector(`link[href^="modules/neural-live.css"]`)) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = cssHref;
    document.head.appendChild(link);
  }

  const visualLayer = document.createElement("div");
  visualLayer.className = "neural-visual-layer";
  visualLayer.setAttribute("aria-hidden", "true");

  const imageA = document.createElement("img");
  imageA.className = "neural-visual-image";
  imageA.alt = "";

  const imageB = document.createElement("img");
  imageB.className = "neural-visual-image";
  imageB.alt = "";

  const shade = document.createElement("div");
  shade.className = "neural-visual-shade";

  visualLayer.append(imageA, imageB, shade);
  stage.prepend(visualLayer);

  const speakingBadge = document.createElement("div");
  speakingBadge.className = "neural-speaking-badge";
  speakingBadge.innerHTML = "<i></i><span>ULTRON SPEAKING</span>";
  stage.appendChild(speakingBadge);

  const captionWrap = document.createElement("div");
  captionWrap.className = "neural-caption-wrap";
  captionWrap.setAttribute("aria-live", "polite");

  const caption = document.createElement("p");
  caption.className = "neural-caption";
  caption.textContent = "";

  captionWrap.appendChild(caption);
  stage.appendChild(captionWrap);

  const cardsWrap = document.createElement("div");
  cardsWrap.className = "neural-context-cards";
  cardsWrap.setAttribute("aria-label", "Contexto visual da resposta");
  stage.appendChild(cardsWrap);

  let visualItems = [];
  let visualIndex = 0;
  let activeImage = 0;
  let visualTimer = null;
  let captionTimers = [];
  let manualCaptionText = "";

  function clearCaptionTimers() {
    captionTimers.forEach((timer) => clearTimeout(timer));
    captionTimers = [];
  }

  function normalizeVisualItems(items = []) {
    return items
      .map((item) => {
        if (typeof item === "string") {
          return { src: item, alt: "" };
        }

        if (item && typeof item === "object" && item.src) {
          return {
            src: String(item.src),
            alt: String(item.alt || item.title || "")
          };
        }

        return null;
      })
      .filter(Boolean)
      .slice(0, 12);
  }

  function swapVisual() {
    if (!visualItems.length) return;

    const item = visualItems[visualIndex % visualItems.length];
    const next = activeImage === 0 ? imageB : imageA;
    const current = activeImage === 0 ? imageA : imageB;

    next.onload = () => {
      current.classList.remove("active");
      next.classList.add("active");
      activeImage = activeImage === 0 ? 1 : 0;
    };

    next.onerror = () => {
      visualIndex += 1;
    };

    next.src = item.src;
    next.alt = item.alt;
    visualIndex += 1;
  }

  function setVisuals(items = [], { intervalMs = 6500 } = {}) {
    clearInterval(visualTimer);
    visualTimer = null;

    visualItems = normalizeVisualItems(items);
    visualIndex = 0;

    if (!visualItems.length) {
      stage.classList.remove("has-visual");
      imageA.classList.remove("active");
      imageB.classList.remove("active");
      imageA.removeAttribute("src");
      imageB.removeAttribute("src");
      return;
    }

    stage.classList.add("has-visual");
    swapVisual();

    if (visualItems.length > 1) {
      visualTimer = setInterval(swapVisual, Math.max(3200, intervalMs));
    }
  }

  function formatContextTime(value) {
    if (!value) return "AGORA";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "RECENTE";

    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    }).format(date);
  }

  function renderCards(cards = [], mode = "context") {
    cardsWrap.innerHTML = "";
    const safeCards = Array.isArray(cards) ? cards.slice(0, 4) : [];

    if (!safeCards.length) {
      cardsWrap.classList.remove("visible");
      stage.classList.remove("has-context-cards");
      return;
    }

    safeCards.forEach((item, index) => {
      const card = document.createElement(item?.url ? "a" : "article");
      card.className = "neural-context-card";

      if (item?.url) {
        card.href = String(item.url);
        card.target = "_blank";
        card.rel = "noopener noreferrer";
      }

      const indexNode = document.createElement("span");
      indexNode.className = "context-card-index";
      indexNode.textContent = String(index + 1).padStart(2, "0");

      const body = document.createElement("div");
      body.className = "context-card-body";

      const title = document.createElement("strong");
      title.textContent = String(item?.title || "Contexto");

      const meta = document.createElement("small");
      const source = String(item?.source || mode || "ULTRON").toUpperCase();
      meta.textContent = `${source} // ${formatContextTime(item?.publishedAt)}`;

      body.append(title, meta);
      card.append(indexNode, body);
      cardsWrap.appendChild(card);
    });

    stage.dataset.visualMode = String(mode || "context");
    stage.classList.add("has-context-cards");
    requestAnimationFrame(() => cardsWrap.classList.add("visible"));
  }

  function cleanAssistantText(raw) {
    let text = String(raw || "").trim();
    text = text.replace(/^>\s*/, "");
    text = text.replace(/^\[[0-9:]+\]\s*/, "");
    text = text.replace(/^(GEMINI|ULTRON(?:\s*\[[^\]]+\])?|AI|ASSISTANT)\s*:\s*/i, "");
    return text.trim();
  }

  function latestAssistantText() {
    if (manualCaptionText.trim()) return manualCaptionText.trim();
    if (!output) return "";

    const paragraphs = [...output.querySelectorAll("p")].reverse();

    for (const paragraph of paragraphs) {
      const raw = String(paragraph.textContent || "").trim();
      if (!raw) continue;

      const normalized = raw
        .replace(/^>\s*/, "")
        .replace(/^\[[0-9:]+\]\s*/, "")
        .trim();

      if (/^(GEMINI|ULTRON(?:\s*\[[^\]]+\])?|AI|ASSISTANT)\s*:/i.test(normalized)) {
        return cleanAssistantText(normalized);
      }
    }

    return "";
  }

  function splitCaption(text) {
    const clean = String(text || "").replace(/\s+/g, " ").trim();
    if (!clean) return [];

    const sentences = clean.match(/[^.!?]+[.!?]?/g) || [clean];
    const chunks = [];

    for (const sentence of sentences) {
      const words = sentence.trim().split(/\s+/).filter(Boolean);
      let current = [];

      for (const word of words) {
        const candidate = [...current, word].join(" ");
        if ((candidate.length > 78 || current.length >= 13) && current.length) {
          chunks.push(current.join(" "));
          current = [word];
        } else {
          current.push(word);
        }
      }

      if (current.length) chunks.push(current.join(" "));
    }

    return chunks.filter(Boolean);
  }

  function showCaptionChunk(text) {
    caption.textContent = String(text || "").trim();
    captionWrap.classList.toggle("visible", Boolean(caption.textContent));
  }

  function hideCaption() {
    captionWrap.classList.remove("visible");
    window.setTimeout(() => {
      if (!captionWrap.classList.contains("visible")) {
        caption.textContent = "";
      }
    }, 280);
  }

  function syncCaptionToSpeech(text = latestAssistantText()) {
    clearCaptionTimers();

    const chunks = splitCaption(text);
    if (!chunks.length) {
      hideCaption();
      return;
    }

    const fallbackSeconds = Math.max(4.2, text.split(/\s+/).length * 0.34);
    const duration = Number.isFinite(audio?.duration) && audio.duration > 1
      ? audio.duration
      : fallbackSeconds;

    const usableMs = Math.max(2500, duration * 1000 - 450);
    const segmentMs = Math.max(900, usableMs / chunks.length);

    showCaptionChunk(chunks[0]);

    chunks.slice(1).forEach((chunk, index) => {
      captionTimers.push(
        setTimeout(() => showCaptionChunk(chunk), segmentMs * (index + 1))
      );
    });
  }

  function startSpeaking() {
    stage.classList.add("is-speaking");
    syncCaptionToSpeech();
  }

  function stopSpeaking() {
    stage.classList.remove("is-speaking");
    clearCaptionTimers();
    captionTimers.push(setTimeout(hideCaption, 520));
    manualCaptionText = "";
  }

  if (audio) {
    audio.addEventListener("play", startSpeaking);
    audio.addEventListener("playing", startSpeaking);
    audio.addEventListener("ended", stopSpeaking);
    audio.addEventListener("error", stopSpeaking);
    audio.addEventListener("pause", () => {
      if (audio.ended || audio.currentTime > 0) stopSpeaking();
    });
  }

  window.addEventListener("ultron:visual-context", (event) => {
    const detail = event?.detail || {};
    if (Array.isArray(detail.images)) setVisuals(detail.images, detail);
    renderCards(detail.cards || [], detail.mode || "context");
    if (detail.caption || detail.text) {
      manualCaptionText = String(detail.caption || detail.text || "").trim();
      if (stage.classList.contains("is-speaking")) {
        syncCaptionToSpeech(manualCaptionText);
      }
    }
  });

  window.ULTRON_VISUAL_PANEL = {
    setImages: setVisuals,
    clearImages: () => setVisuals([]),
    setCards(cards, mode = "context") {
      renderCards(cards, mode);
    },
    clearCards() {
      renderCards([]);
    },
    setCaption(text) {
      manualCaptionText = String(text || "").trim();
      if (manualCaptionText) showCaptionChunk(manualCaptionText);
      else hideCaption();
    },
    syncCaption(text) {
      manualCaptionText = String(text || "").trim();
      syncCaptionToSpeech(manualCaptionText || latestAssistantText());
    },
    showContext({
      images = [],
      cards = [],
      mode = "context",
      text = "",
      caption: captionText = "",
      intervalMs
    } = {}) {
      setVisuals(images, { intervalMs });
      renderCards(cards, mode);
      manualCaptionText = String(captionText || text || "").trim();
      if (manualCaptionText && stage.classList.contains("is-speaking")) {
        syncCaptionToSpeech(manualCaptionText);
      }
    },
    speaking: startSpeaking,
    idle: stopSpeaking,
    get isSpeaking() {
      return stage.classList.contains("is-speaking");
    }
  };
}
