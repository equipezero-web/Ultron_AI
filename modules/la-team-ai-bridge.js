const output = document.getElementById('output-box');
const previousFetch = window.fetch.bind(window);

function requestUrl(input) {
  return typeof input === 'string' ? input : input?.url || '';
}

function requestMethod(input, init = {}) {
  return String(init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
}

function isAiRequest(input, init = {}) {
  return requestMethod(input, init) === 'POST' && /\/api\/ai(?:\?|$)/.test(requestUrl(input));
}

function parseBody(init) {
  if (!init?.body || typeof init.body !== 'string') return null;
  try {
    const value = JSON.parse(init.body);
    return value && typeof value === 'object' ? value : null;
  } catch {
    return null;
  }
}

function log(message, alert = false) {
  if (!output) return;
  const line = document.createElement('p');
  if (alert) line.className = 'alert';
  const time = new Date().toLocaleTimeString('pt-BR', { hour12: false });
  line.textContent = `> [${time}] [L&A CONTEXT] ${message}`;
  output.appendChild(line);
  output.scrollTop = output.scrollHeight;
}

window.fetch = async function ultronLaTeamFetch(input, init = {}) {
  if (!isAiRequest(input, init) || !window.ULTRON_LA_TEAM) {
    return previousFetch(input, init);
  }

  const body = parseBody(init);
  const originalMessage = String(body?.message || '').trim();
  if (!body || !originalMessage || body?.laTeamMeta?.active) {
    return previousFetch(input, init);
  }

  try {
    const context = await window.ULTRON_LA_TEAM.contextFor(originalMessage);
    if (!context?.active || !context?.contextText) {
      return previousFetch(input, init);
    }

    body.laTeamContext = context.contextText;
    body.laTeamMeta = {
      active: true,
      authorized: Boolean(context.authorized),
      areas: Array.isArray(context.areas) ? context.areas : [],
      memberRole: context.memberRole || null,
      fetchedAt: context.fetchedAt || null,
      source: 'la-advisory-team'
    };
    body.allowUncertaintyResearch = false;

    log(context.authorized
      ? `Contexto interno anexado // ${body.laTeamMeta.areas.join(', ') || 'overview'} // RLS autorizado.`
      : 'Consulta L&A Team detectada, mas a sessão interna ainda não está conectada.');

    window.dispatchEvent(new CustomEvent('ultron:la-team-context', {
      detail: body.laTeamMeta
    }));

    return previousFetch(input, { ...init, body: JSON.stringify(body) });
  } catch (error) {
    console.warn('ULTRON L&A Team bridge:', error);
    log(`Falha ao montar contexto interno: ${error?.message || error}`, true);
    return previousFetch(input, init);
  }
};

window.ULTRON_LA_TEAM_BRIDGE = { active: true };
