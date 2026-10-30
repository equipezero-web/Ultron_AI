const DEFAULT_STUN = [
  { urls: ['stun:stun.cloudflare.com:3478'] },
  { urls: ['stun:stun.l.google.com:19302'] }
];

function turnConfig(env) {
  const keyId = String(env?.CLOUDFLARE_TURN_KEY_ID || env?.TURN_KEY_ID || '').trim();
  const apiToken = String(env?.CLOUDFLARE_TURN_API_TOKEN || env?.TURN_KEY_API_TOKEN || '').trim();
  return { keyId, apiToken, configured: Boolean(keyId && apiToken) };
}

function sanitizeIceServers(servers = []) {
  return (Array.isArray(servers) ? servers : [])
    .map((server) => {
      if (!server?.urls) return null;
      const urls = Array.isArray(server.urls) ? server.urls.map(String).filter(Boolean) : [String(server.urls)];
      if (!urls.length) return null;
      const safe = { urls };
      if (server.username) safe.username = String(server.username);
      if (server.credential) safe.credential = String(server.credential);
      return safe;
    })
    .filter(Boolean);
}

export async function getWebRtcIceServers(env, { ttlSeconds = 3600 } = {}) {
  const config = turnConfig(env);
  if (!config.configured) {
    return {
      ok: true,
      turnConfigured: false,
      source: 'stun-fallback',
      ttlSeconds: 0,
      iceServers: DEFAULT_STUN
    };
  }

  const ttl = Math.max(600, Math.min(43200, Number(ttlSeconds || 3600)));
  try {
    const response = await fetch(
      `https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(config.keyId)}/credentials/generate-ice-servers`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.apiToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ ttl })
      }
    );

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: true,
        turnConfigured: false,
        source: 'stun-fallback',
        ttlSeconds: 0,
        iceServers: DEFAULT_STUN,
        warning: `TURN credential service returned HTTP ${response.status}`
      };
    }

    const iceServers = sanitizeIceServers(data?.iceServers);
    const hasTurn = iceServers.some((server) => server.urls.some((url) => /^turns?:/i.test(url)));
    return {
      ok: true,
      turnConfigured: hasTurn,
      source: hasTurn ? 'cloudflare-turn' : 'stun-fallback',
      ttlSeconds: hasTurn ? ttl : 0,
      iceServers: hasTurn ? iceServers : DEFAULT_STUN
    };
  } catch (error) {
    return {
      ok: true,
      turnConfigured: false,
      source: 'stun-fallback',
      ttlSeconds: 0,
      iceServers: DEFAULT_STUN,
      warning: error?.message || String(error)
    };
  }
}

export function webRtcIceHealth(env) {
  const config = turnConfig(env);
  return {
    ready: true,
    cloudflareStun: true,
    turnConfigured: config.configured
  };
}
