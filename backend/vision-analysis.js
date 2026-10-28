function compact(value, max = 500) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function normalizeBase64(value) {
  return String(value || "")
    .replace(/^data:[^;]+;base64,/i, "")
    .replace(/\s+/g, "")
    .trim();
}

export async function analyzeVisualFrame(env, { imageBase64, mimeType = "image/jpeg", prompt = "" } = {}) {
  if (!env.GEMINI_API_KEY) {
    return { ok: false, error: "Gemini não configurado para análise visual." };
  }

  const image = normalizeBase64(imageBase64);
  if (!image) return { ok: false, error: "Imagem ausente." };
  if (image.length > 4_500_000) {
    return { ok: false, error: "Imagem excede o limite de análise visual." };
  }

  const safeMime = ["image/jpeg", "image/png", "image/webp"].includes(mimeType)
    ? mimeType
    : "image/jpeg";

  const model = env.GEMINI_VISION_MODEL || env.GEMINI_MODEL || "gemini-3.8-flash";
  const instruction = compact(prompt, 1200) ||
    "Descreva objetivamente o que está visível nesta imagem. Identifique objetos, textos legíveis e elementos relevantes. Não tente identificar pessoas nem inferir atributos sensíveis. Responda em português do Brasil.";

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": env.GEMINI_API_KEY
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{
            text: "Você é o módulo de visão do ULTRON. Analise somente o conteúdo visual fornecido. Não faça reconhecimento facial, identificação de pessoas nem inferências sensíveis. Se algo não estiver visível, diga que não é possível confirmar."
          }]
        },
        contents: [{
          role: "user",
          parts: [
            { text: instruction },
            { inlineData: { mimeType: safeMime, data: image } }
          ]
        }],
        generationConfig: {
          temperature: 0.25,
          maxOutputTokens: 500
        }
      })
    }
  );

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    return {
      ok: false,
      error: `Gemini Vision HTTP ${response.status}: ${compact(data?.error?.message || JSON.stringify(data), 300)}`
    };
  }

  const text = (data?.candidates?.[0]?.content?.parts || [])
    .map((part) => part?.text || "")
    .join(" ")
    .trim();

  if (!text) return { ok: false, error: "O módulo visual não retornou uma descrição." };

  return {
    ok: true,
    text,
    provider: "gemini",
    providerLabel: "Gemini Vision",
    model
  };
}
