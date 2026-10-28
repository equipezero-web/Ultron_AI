const GOOGLE_TTS_SCOPE = "https://www.googleapis.com/auth/cloud-platform";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_TTS_URL = "https://texttospeech.googleapis.com/v1/text:synthesize";

let googleTokenCache = null;

function compactError(error) {
  return String(error?.message || error || "erro desconhecido")
    .replace(/\s+/g, " ")
    .slice(0, 500);
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 8192;
  let binary = "";
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

function bytesToBase64Url(bytes) {
  let binary = "";
  const chunkSize = 8192;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary)
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function stringToBase64Url(value) {
  return bytesToBase64Url(new TextEncoder().encode(value));
}

function pemToArrayBuffer(pem) {
  const base64 = String(pem || "")
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s+/g, "");

  if (!base64) throw new Error("Chave privada da conta de serviço Google ausente.");

  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function getGoogleCredentials(env) {
  if (env.GOOGLE_TTS_SERVICE_ACCOUNT_JSON) {
    try {
      const parsed = JSON.parse(env.GOOGLE_TTS_SERVICE_ACCOUNT_JSON);
      if (parsed?.client_email && parsed?.private_key) return parsed;
    } catch (error) {
      throw new Error(`GOOGLE_TTS_SERVICE_ACCOUNT_JSON inválido: ${compactError(error)}`);
    }
  }

  if (env.GOOGLE_TTS_CLIENT_EMAIL && env.GOOGLE_TTS_PRIVATE_KEY) {
    return {
      client_email: env.GOOGLE_TTS_CLIENT_EMAIL,
      private_key: String(env.GOOGLE_TTS_PRIVATE_KEY).replace(/\\n/g, "\n"),
      project_id: env.GOOGLE_TTS_PROJECT_ID || null
    };
  }

  return null;
}

async function getGoogleAccessToken(env) {
  const credentials = getGoogleCredentials(env);
  if (!credentials) throw new Error("Google Cloud TTS não configurado.");

  const now = Math.floor(Date.now() / 1000);
  if (
    googleTokenCache?.token &&
    googleTokenCache?.clientEmail === credentials.client_email &&
    googleTokenCache?.expiresAt > now + 90
  ) {
    return googleTokenCache.token;
  }

  const header = stringToBase64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = stringToBase64Url(JSON.stringify({
    iss: credentials.client_email,
    scope: GOOGLE_TTS_SCOPE,
    aud: GOOGLE_TOKEN_URL,
    iat: now,
    exp: now + 3600
  }));
  const signingInput = `${header}.${claims}`;

  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(credentials.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(signingInput)
  );

  const assertion = `${signingInput}.${bytesToBase64Url(new Uint8Array(signature))}`;
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion
    }).toString()
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.access_token) {
    throw new Error(
      `Google OAuth retornou HTTP ${response.status}: ${JSON.stringify(data).slice(0, 350)}`
    );
  }

  googleTokenCache = {
    token: data.access_token,
    clientEmail: credentials.client_email,
    expiresAt: now + Math.max(300, Number(data.expires_in || 3600))
  };

  return data.access_token;
}

async function generateElevenLabsAudio(env, text) {
  if (!env.ELEVENLABS_API_KEY || !env.ELEVENLABS_VOICE_ID) {
    throw new Error("ElevenLabs não configurado.");
  }

  const voiceId = env.ELEVENLABS_VOICE_ID;
  const modelId = env.ELEVENLABS_MODEL || "eleven_flash_v2_5";
  const outputFormat = env.ELEVENLABS_OUTPUT_FORMAT || "mp3_22050_32";

  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=${encodeURIComponent(outputFormat)}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": env.ELEVENLABS_API_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ text, model_id: modelId })
    }
  );

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`ElevenLabs HTTP ${response.status}: ${detail.slice(0, 350)}`);
  }

  return {
    audioBase64: arrayBufferToBase64(await response.arrayBuffer()),
    audioMimeType: "audio/mpeg",
    provider: "elevenlabs",
    providerLabel: "ElevenLabs",
    voice: voiceId
  };
}

async function generateGoogleAudio(env, text, tier) {
  const credentials = getGoogleCredentials(env);
  if (!credentials) throw new Error("Google Cloud TTS não configurado.");

  const neural2 = tier === "neural2";
  const voiceName = neural2
    ? (env.GOOGLE_TTS_NEURAL2_VOICE || "pt-BR-Neural2-B")
    : (env.GOOGLE_TTS_WAVENET_VOICE || "pt-BR-Wavenet-B");

  const accessToken = await getGoogleAccessToken(env);
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json"
  };
  if (credentials.project_id) headers["x-goog-user-project"] = credentials.project_id;

  const response = await fetch(GOOGLE_TTS_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({
      input: { text },
      voice: {
        languageCode: "pt-BR",
        name: voiceName
      },
      audioConfig: {
        audioEncoding: "MP3",
        speakingRate: Number(env.GOOGLE_TTS_SPEAKING_RATE || 0.96)
      }
    })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.audioContent) {
    throw new Error(
      `Google ${neural2 ? "Neural2" : "WaveNet"} HTTP ${response.status}: ${JSON.stringify(data).slice(0, 350)}`
    );
  }

  return {
    audioBase64: data.audioContent,
    audioMimeType: "audio/mpeg",
    provider: neural2 ? "google-neural2" : "google-wavenet",
    providerLabel: neural2 ? "Google Neural2" : "Google WaveNet",
    voice: voiceName
  };
}

export function getVoiceRouterStatus(env) {
  const googleConfigured = Boolean(
    env.GOOGLE_TTS_SERVICE_ACCOUNT_JSON ||
    (env.GOOGLE_TTS_CLIENT_EMAIL && env.GOOGLE_TTS_PRIVATE_KEY)
  );

  return {
    order: [
      "ElevenLabs",
      "Google Neural2",
      "Google WaveNet",
      "Browser TTS",
      "XTTS v2"
    ],
    elevenlabs: {
      configured: Boolean(env.ELEVENLABS_API_KEY && env.ELEVENLABS_VOICE_ID)
    },
    googleNeural2: {
      configured: googleConfigured,
      voice: env.GOOGLE_TTS_NEURAL2_VOICE || "pt-BR-Neural2-B"
    },
    googleWaveNet: {
      configured: googleConfigured,
      voice: env.GOOGLE_TTS_WAVENET_VOICE || "pt-BR-Wavenet-B"
    },
    browserTts: {
      configured: true,
      execution: "client"
    },
    xttsV2: {
      configured: Boolean(env.XTTS_ENDPOINT),
      execution: "external-endpoint"
    }
  };
}

export async function generateCloudVoice(env, text, options = {}) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (!clean) throw new Error("Texto vazio para síntese de voz.");

  const attempts = [];
  const providers = options.skipEleven
    ? ["google-neural2", "google-wavenet"]
    : ["elevenlabs", "google-neural2", "google-wavenet"];

  for (const provider of providers) {
    try {
      let result;
      if (provider === "elevenlabs") {
        if (!env.ELEVENLABS_API_KEY || !env.ELEVENLABS_VOICE_ID) {
          attempts.push({ provider, status: "skipped", reason: "não configurado" });
          continue;
        }
        result = await generateElevenLabsAudio(env, clean);
      } else if (provider === "google-neural2") {
        if (!getGoogleCredentials(env)) {
          attempts.push({ provider, status: "skipped", reason: "não configurado" });
          continue;
        }
        result = await generateGoogleAudio(env, clean, "neural2");
      } else {
        if (!getGoogleCredentials(env)) {
          attempts.push({ provider, status: "skipped", reason: "não configurado" });
          continue;
        }
        result = await generateGoogleAudio(env, clean, "wavenet");
      }

      attempts.push({ provider, status: "success", voice: result.voice });
      return { ...result, attempts };
    } catch (error) {
      attempts.push({ provider, status: "failed", error: compactError(error) });
      console.error(`[ULTRON VOICE] ${provider} falhou:`, compactError(error));
    }
  }

  return {
    audioBase64: null,
    audioMimeType: null,
    provider: null,
    providerLabel: null,
    voice: null,
    attempts,
    nextFallback: "browser-tts"
  };
}

export async function generateXttsAudio(env, text) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (!clean) throw new Error("Texto vazio para XTTS v2.");
  if (!env.XTTS_ENDPOINT) throw new Error("XTTS v2 ainda não possui endpoint configurado.");

  const headers = { "Content-Type": "application/json" };
  if (env.XTTS_API_KEY) headers.Authorization = `Bearer ${env.XTTS_API_KEY}`;

  const response = await fetch(env.XTTS_ENDPOINT, {
    method: "POST",
    headers,
    body: JSON.stringify({
      text: clean,
      language: env.XTTS_LANGUAGE || "pt",
      speaker: env.XTTS_SPEAKER || "ultron"
    })
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`XTTS v2 HTTP ${response.status}: ${detail.slice(0, 350)}`);
  }

  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const data = await response.json();
    const audioBase64 = data?.audioBase64 || data?.audioContent || data?.audio;
    if (!audioBase64) throw new Error("XTTS v2 respondeu sem áudio.");
    return {
      audioBase64,
      audioMimeType: data?.audioMimeType || data?.mimeType || "audio/wav",
      provider: "xtts-v2",
      providerLabel: "XTTS v2"
    };
  }

  return {
    audioBase64: arrayBufferToBase64(await response.arrayBuffer()),
    audioMimeType: contentType || "audio/wav",
    provider: "xtts-v2",
    providerLabel: "XTTS v2"
  };
}
