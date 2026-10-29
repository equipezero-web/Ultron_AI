const SUPABASE_URL = 'https://fqisewatypluagngmgka.supabase.co';
const SUPABASE_KEY = 'sb_publishable_Etts25r3XRBdDHuUYuUajg_YjXTn_wb';
const SUPABASE_IMPORT = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.118.0/+esm';
const TEAM_APP_URL = 'https://equipezero-web.github.io/LA-Advisory-Team/';
const REPO_RAW = 'https://raw.githubusercontent.com/equipezero-web/LA-Advisory-Team/main/';
const output = document.getElementById('output-box');

const state = {
  db: null,
  session: null,
  member: null,
  ready: false,
  lastOverview: null,
  lastContext: null,
  error: null
};

function log(message, alert = false) {
  if (!output) return;
  const line = document.createElement('p');
  if (alert) line.className = 'alert';
  const time = new Date().toLocaleTimeString('pt-BR', { hour12: false });
  line.textContent = `> [${time}] [L&A TEAM] ${message}`;
  output.appendChild(line);
  output.scrollTop = output.scrollHeight;
}

function norm(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

async function ensureDb() {
  if (state.db) return state.db;
  const mod = await import(SUPABASE_IMPORT);
  state.db = mod.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false
    }
  });
  state.db.auth.onAuthStateChange(() => {
    setTimeout(() => refreshAuth().catch(() => {}), 0);
  });
  return state.db;
}

async function refreshAuth() {
  const db = await ensureDb();
  const { data: { session } } = await db.auth.getSession();
  state.session = session || null;
  state.member = null;
  state.error = null;
  if (!session?.user) return { authenticated: false, authorized: false, member: null };

  const { data, error } = await db
    .from('la_team_members')
    .select('user_id,display_name,role,active,created_at')
    .eq('user_id', session.user.id)
    .maybeSingle();

  if (error || !data?.active) {
    state.error = error?.message || 'Sessão sem acesso ativo à L&A Team.';
    return { authenticated: true, authorized: false, member: null, error: state.error };
  }

  state.member = data;
  return { authenticated: true, authorized: true, member: data };
}

async function init() {
  await ensureDb();
  const auth = await refreshAuth();
  state.ready = true;
  window.dispatchEvent(new CustomEvent('ultron:la-team-ready', {
    detail: { authenticated: auth.authenticated, authorized: auth.authorized, member: auth.member ? { ...auth.member } : null }
  }));
  if (auth.authorized) log(`Sessão L&A Team detectada: ${auth.member?.display_name || 'membro'} // ${auth.member?.role || 'member'}.`);
  return auth;
}

async function authorized() {
  const auth = await refreshAuth();
  return Boolean(auth.authorized && state.member?.active);
}

async function safeQuery(label, task) {
  try {
    const result = await task();
    if (result?.error) return { ok: false, label, error: result.error.message || String(result.error) };
    return { ok: true, label, data: result?.data ?? null, count: result?.count ?? null };
  } catch (error) {
    return { ok: false, label, error: error?.message || String(error) };
  }
}

async function tableCount(table) {
  const db = await ensureDb();
  const result = await db.from(table).select('*', { count: 'exact', head: true });
  if (result.error) return { count: null, error: result.error.message };
  return { count: Number(result.count || 0), error: null };
}

async function overview() {
  if (!(await authorized())) throw new Error('Entre primeiro na L&A Team neste navegador.');
  const db = await ensureDb();
  const role = String(state.member?.role || 'member');
  const canFinance = ['admin', 'finance'].includes(role);

  const countTargets = [
    ['clients', 'la_team_clients'],
    ['flowboostOrders', 'la_team_flowboost_orders'],
    ['messages', 'la_team_messages'],
    ['tiktokMetrics', 'la_team_tiktok_metrics'],
    ['aiReports', 'la_team_ai_reports']
  ];
  if (canFinance) countTargets.push(['financialEntries', 'la_team_financial_entries']);

  const counts = {};
  await Promise.all(countTargets.map(async ([key, table]) => {
    counts[key] = await tableCount(table);
  }));

  const [flowResult, tiktokResult, financeResult] = await Promise.all([
    safeQuery('flowboost', () => db.rpc('la_team_flowboost_analytics')),
    safeQuery('tiktok', () => db.from('la_team_tiktok_metrics')
      .select('metric_date,followers,views,likes,comments,shares,revenue')
      .order('metric_date', { ascending: false }).limit(1).maybeSingle()),
    canFinance
      ? safeQuery('finance', () => db.from('la_team_financial_entries')
        .select('kind,amount,occurred_on').order('occurred_on', { ascending: false }).limit(500))
      : Promise.resolve({ ok: false, label: 'finance', error: 'Restrito ao papel admin/finance.' })
  ]);

  let financeSummary = null;
  if (financeResult.ok && Array.isArray(financeResult.data)) {
    financeSummary = financeResult.data.reduce((acc, item) => {
      const amount = Number(item?.amount || 0);
      const kind = norm(item?.kind);
      if (kind.includes('expense') || kind.includes('despesa') || kind.includes('saida')) acc.expenses += amount;
      else acc.revenue += amount;
      return acc;
    }, { revenue: 0, expenses: 0 });
    financeSummary.balance = financeSummary.revenue - financeSummary.expenses;
  }

  const data = {
    fetchedAt: new Date().toISOString(),
    member: { display_name: state.member.display_name, role: state.member.role, active: state.member.active },
    counts,
    flowboost: flowResult.ok ? flowResult.data : { error: flowResult.error },
    tiktokLatest: tiktokResult.ok ? tiktokResult.data : { error: tiktokResult.error },
    finance: financeSummary || { error: financeResult.error }
  };
  state.lastOverview = data;
  return data;
}

function detectAreas(message) {
  const text = norm(message);
  const anchored = /\b(l&a|la advisory|advisory team|la team|flowboost|tiktok|crm|mensalista|financeiro|faturamento)\b/.test(text);
  if (!anchored) return [];
  const areas = new Set();
  if (/\b(codigo|code|repo|repositorio|arquivo|app\.js|index\.html|service worker|pwa)\b/.test(text)) areas.add('code');
  if (/\b(crm|cliente|clientes|lead|leads|negociacao|desenvolvimento|fechado|fechados|mensalista|mensalistas)\b/.test(text)) areas.add('crm');
  if (/\b(financeiro|faturamento|receita|despesa|lucro|caixa|saldo|finance)\b/.test(text)) areas.add('finance');
  if (/\b(flowboost|seguidor|seguidores|pedido|pedidos|pacote|pacotes)\b/.test(text)) areas.add('flowboost');
  if (/\b(tiktok|video|videos|visualizacao|visualizacoes|views|monetizacao|nicho|nichos)\b/.test(text)) areas.add('tiktok');
  if (/\b(equipe|mensagem|mensagens|chat|membro|membros)\b/.test(text)) areas.add('team');
  if (/\b(relatorio|relatorios|report|reports|agente|agentes)\b/.test(text)) areas.add('reports');
  if (!areas.size || /\b(tudo|todos|completo|completa|geral|panorama|inteiro|inteira)\b/.test(text)) areas.add('overview');
  return [...areas];
}

async function fetchRepoContext() {
  const files = ['README.md', 'index.html', 'assets/js/app.js', 'sw.js'];
  const settled = await Promise.allSettled(files.map(async (path) => {
    const response = await fetch(`${REPO_RAW}${path}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
    const text = await response.text();
    return { path, text: text.slice(0, path.endsWith('app.js') ? 18000 : 9000) };
  }));
  return settled.filter((item) => item.status === 'fulfilled').map((item) => item.value);
}

async function dataForAreas(areas) {
  const db = await ensureDb();
  const result = { fetchedAt: new Date().toISOString(), areas: [...areas] };
  const tasks = [];

  if (areas.includes('overview')) tasks.push((async () => { result.overview = await overview(); })());
  if (areas.includes('crm')) tasks.push((async () => {
    result.crm = await safeQuery('crm', () => db.from('la_team_clients')
      .select('id,name,contact,service,estimated_value,notes,stage,owner_id,created_by,created_at,updated_at')
      .order('updated_at', { ascending: false }).limit(300));
  })());
  if (areas.includes('finance')) tasks.push((async () => {
    result.finance = await safeQuery('finance', () => db.from('la_team_financial_entries')
      .select('id,client_id,kind,source,amount,occurred_on,description,created_by,created_at')
      .order('occurred_on', { ascending: false }).limit(300));
  })());
  if (areas.includes('flowboost')) tasks.push((async () => {
    const [analytics, orders] = await Promise.all([
      safeQuery('flowboost_analytics', () => db.rpc('la_team_flowboost_analytics')),
      safeQuery('flowboost_orders', () => db.from('la_team_flowboost_orders')
        .select('id,external_order_id,customer_name,profile_handle,followers,amount,status,notes,created_at,updated_at')
        .order('created_at', { ascending: false }).limit(250))
    ]);
    result.flowboost = { analytics, orders };
  })());
  if (areas.includes('tiktok')) tasks.push((async () => {
    result.tiktok = await safeQuery('tiktok', () => db.from('la_team_tiktok_metrics')
      .select('id,metric_date,followers,views,likes,comments,shares,revenue,created_at')
      .order('metric_date', { ascending: false }).limit(180));
  })());
  if (areas.includes('team')) tasks.push((async () => {
    result.team = await safeQuery('team_messages', () => db.from('la_team_messages')
      .select('id,channel,author_id,body,created_at')
      .order('created_at', { ascending: false }).limit(250));
  })());
  if (areas.includes('reports')) tasks.push((async () => {
    result.reports = await safeQuery('ai_reports', () => db.from('la_team_ai_reports')
      .select('id,area,agent,title,report,period_start,period_end,metadata,created_by,created_at')
      .order('created_at', { ascending: false }).limit(120));
  })());
  if (areas.includes('code')) tasks.push((async () => { result.code = await fetchRepoContext(); })());

  await Promise.all(tasks);
  return result;
}

function trimContext(value, max = 36000) {
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  return text.length <= max ? text : `${text.slice(0, max)}\n...[contexto truncado pelo conector L&A Team]`;
}

async function contextFor(message) {
  const areas = detectAreas(message);
  if (!areas.length) return null;
  const auth = await refreshAuth();
  if (!auth.authorized) {
    return {
      active: true,
      authorized: false,
      areas,
      contextText: 'CONECTOR L&A TEAM NÃO AUTENTICADO. O operador precisa entrar primeiro no aplicativo L&A Advisory Team neste mesmo navegador e então retornar ao Ultron.'
    };
  }
  const data = await dataForAreas(areas);
  const contextText = [
    'CONTEXTO INTERNO AUTENTICADO DA L&A ADVISORY TEAM.',
    'Fonte: Supabase da L&A Team e/ou repositório oficial LA-Advisory-Team.',
    'Trate estes dados como internos e atuais no momento indicado por fetchedAt.',
    'Não invente registros ausentes. Não exponha dados além do necessário para responder ao operador.',
    `Operador L&A: ${state.member?.display_name || 'membro'} // função: ${state.member?.role || 'member'}.`,
    '',
    trimContext(data)
  ].join('\n');
  state.lastContext = { areas, fetchedAt: data.fetchedAt };
  return {
    active: true,
    authorized: true,
    areas,
    memberRole: state.member?.role || null,
    fetchedAt: data.fetchedAt,
    contextText
  };
}

function makeButton(label, handler, wide = false) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `stark-holo-action${wide ? ' wide' : ''}`;
  button.textContent = label;
  button.addEventListener('click', handler);
  return button;
}

function runCommand(text) {
  const input = document.getElementById('command-input');
  const send = document.getElementById('btn-send');
  if (!input || !send) return false;
  input.value = text;
  send.click();
  return true;
}

function card(label, value) {
  const el = document.createElement('div');
  el.className = 'ultron-la-team-card';
  const small = document.createElement('small');
  small.textContent = label;
  const strong = document.createElement('strong');
  strong.textContent = String(value ?? '—');
  el.append(small, strong);
  return el;
}

async function renderPanel(container) {
  if (!container) return;
  container.replaceChildren();
  const shell = document.createElement('section');
  shell.className = 'ultron-la-team-shell';
  container.appendChild(shell);

  const head = document.createElement('div');
  head.className = 'ultron-la-team-head';
  const copy = document.createElement('div');
  const title = document.createElement('strong');
  title.textContent = 'L&A ADVISORY TEAM // INTERNAL LINK';
  const sub = document.createElement('span');
  sub.textContent = 'CRM · FINANCE · TIKTOK · FLOWBOOST · TEAM · REPORTS · CODE';
  copy.append(title, sub);
  const status = document.createElement('b');
  status.className = 'ultron-la-team-status';
  head.append(copy, status);
  shell.appendChild(head);

  const auth = await refreshAuth();
  status.textContent = auth.authorized ? 'AUTHENTICATED' : 'LOCKED';
  status.classList.toggle('online', Boolean(auth.authorized));

  if (!auth.authorized) {
    const note = document.createElement('div');
    note.className = 'ultron-la-team-note';
    note.textContent = 'Nenhuma sessão L&A Team foi encontrada neste navegador. Faça login no sistema da equipe e volte ao Ultron; a sessão será detectada automaticamente.';
    shell.appendChild(note);
    const actions = document.createElement('div');
    actions.className = 'ultron-la-team-actions';
    actions.append(
      makeButton('ABRIR L&A TEAM PARA CONECTAR', () => window.open(TEAM_APP_URL, '_blank', 'noopener'), true),
      makeButton('VERIFICAR NOVAMENTE', () => renderPanel(container), true)
    );
    shell.appendChild(actions);
    return;
  }

  const note = document.createElement('div');
  note.className = 'ultron-la-team-note';
  note.textContent = `${state.member?.display_name || 'Membro'} // ${String(state.member?.role || 'member').toUpperCase()} // leitura e análise protegidas por RLS.`;
  shell.appendChild(note);

  const grid = document.createElement('div');
  grid.className = 'ultron-la-team-grid';
  grid.append(card('CRM', '...'), card('FLOWBOOST', '...'), card('MESSAGES', '...'), card('TIKTOK', '...'));
  shell.appendChild(grid);

  try {
    const data = await overview();
    const cards = [...grid.children];
    cards[0].querySelector('strong').textContent = data.counts?.clients?.count ?? '—';
    cards[1].querySelector('strong').textContent = data.counts?.flowboostOrders?.count ?? '—';
    cards[2].querySelector('strong').textContent = data.counts?.messages?.count ?? '—';
    cards[3].querySelector('strong').textContent = data.tiktokLatest?.followers != null
      ? `${Number(data.tiktokLatest.followers).toLocaleString('pt-BR')} seguidores`
      : (data.counts?.tiktokMetrics?.count ?? '—');
  } catch (error) {
    note.textContent = `Conectado, mas o resumo falhou: ${error?.message || error}`;
    note.classList.add('ultron-la-team-error');
  }

  const actions = document.createElement('div');
  actions.className = 'ultron-la-team-actions';
  actions.append(
    makeButton('ANALISAR TODA L&A TEAM', () => runCommand('Ultron, analise toda a L&A Team e me dê um panorama executivo completo.'), true),
    makeButton('CRM', () => runCommand('Ultron, analise o CRM da L&A Team agora.')),
    makeButton('FINANCEIRO', () => runCommand('Ultron, analise o financeiro e o faturamento da L&A Team.')),
    makeButton('TIKTOK', () => runCommand('Ultron, analise as métricas do TikTok da L&A Team.')),
    makeButton('FLOWBOOST', () => runCommand('Ultron, analise o FlowBoost da L&A Team e o desempenho dos pedidos.')),
    makeButton('EQUIPE', () => runCommand('Ultron, analise as informações recentes da equipe L&A Team.')),
    makeButton('CÓDIGO', () => runCommand('Ultron, analise o código e a arquitetura do sistema L&A Team.')),
    makeButton('ATUALIZAR MAPA', () => renderPanel(container))
  );
  shell.appendChild(actions);
}

window.ULTRON_LA_TEAM = {
  init,
  refreshAuth,
  overview,
  contextFor,
  renderPanel,
  detectAreas,
  teamAppUrl: TEAM_APP_URL,
  get state() {
    return {
      ready: state.ready,
      authenticated: Boolean(state.session),
      authorized: Boolean(state.member?.active),
      member: state.member ? { ...state.member } : null,
      lastOverview: state.lastOverview,
      lastContext: state.lastContext,
      error: state.error
    };
  }
};

init().catch((error) => {
  state.error = error?.message || String(error);
  log(`Falha ao iniciar o conector: ${state.error}`, true);
});
