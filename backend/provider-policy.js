// Operational provider switch. A configured API key never overrides disablement.
// Values are set by trusted Cloudflare Worker environment configuration.
const KNOWN = new Set(["gemini","groq","openrouter","cloudflare","cohere","mistral","deepseek","cerebras"]);
export function isProviderDisabled(env, provider) {
  if (!KNOWN.has(provider)) return false;
  const disabled = String(env?.AI_DISABLED_PROVIDERS || "").toLowerCase()
    .split(",").map(name=>name.trim());
  return disabled.includes(provider);
}
