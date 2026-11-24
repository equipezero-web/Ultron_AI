// Bounded, isolate-local circuit breaker for transient AI provider failures.
// This is not a global health status: Workers isolates are independent.
// No credentials, operator IDs, prompts, or response contents are stored.
const TRANSIENT_HTTP = new Set([408, 425, 429]);
const MAX_COOLDOWN_MS = 30000;

export function isTransientProviderFailure(error) {
  const status = Number(error?.status);
  if (TRANSIENT_HTTP.has(status) || (status >= 500 && status <= 599)) return true;
  if (status >= 400 && status <= 499) return false;
  const name = String(error?.name || "");
  const message = String(error?.message || error || "").toLowerCase();
  return name === "AbortError" || name === "TimeoutError" ||
    /(?:timeout|timed out|excedeu o prazo|network error|failed to fetch|fetch failed|connection reset|econnreset)/i.test(message);
}

export function createProviderCircuitBreaker({threshold = 2, cooldownMs = MAX_COOLDOWN_MS, now = Date.now} = {}) {
  const thresholdValue = Math.max(1, Math.min(5, Number(threshold) || 2));
  const cooldownValue = Math.max(1000, Math.min(MAX_COOLDOWN_MS, Number(cooldownMs) || MAX_COOLDOWN_MS));
  const states = new Map();

  return {
    isCooling(provider) {
      const state = states.get(provider);
      return Boolean(state && state.until > now());
    },
    onSuccess(provider) {
      states.delete(provider);
    },
    onFailure(provider, error) {
      if (!isTransientProviderFailure(error)) {
        states.delete(provider);
        return false;
      }
      const previous = states.get(provider);
      const failures = previous?.until > now() ? thresholdValue : (previous?.failures || 0) + 1;
      const opened = failures >= thresholdValue;
      states.set(provider, {failures, until: opened ? now() + cooldownValue : 0});
      return opened;
    },
    snapshot(provider) {
      const state = states.get(provider);
      return {failures: state?.failures || 0, cooling: this.isCooling(provider)};
    }
  };
}

export const providerCircuitBreaker = createProviderCircuitBreaker();
