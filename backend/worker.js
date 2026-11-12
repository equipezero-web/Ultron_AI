import {vetClientTaskContext,contextSearchQuery} from "./task-context.js";
import {loadLiveWeather} from "./weather-live.js";
import {loadSpatialIntensity} from "../modules/jarvis-spatial-intensity.js";
import {loadWorldGeo} from "../modules/jarvis-world-geodata.js";
import {searchGlobalLocations,loadGlobalWeather} from "./weather-global.js";
import {loadWeatherInsight} from "./weather-intelligence.js";
import {pollWeatherMonitor,latestWeatherMonitor} from "./weather-monitor.js";
import {configureWeatherWatch,listWeatherWatches,pollPersonalWeatherWatches} from "./weather-watchlist.js";
import {ACTIONS,parsePlanText,isActionRequest} from "./action-catalog.js";
import {capabilityAnswer} from "./jarvis-capabilities.js";
import { deepenNews } from "./news-details.js";
import { loadResearchContext } from "./research-context.js";
import {
  ProviderGatewayError,
  generateWithProviders,
  getProviderStatus
} from "./providers.js";
import {
  deriveOperatorId,
  loadMemoryContext,
  memoryHealth,
  normalizeConversationId,
  saveExchange
} from "./memory.js";
import {
  bridgeHealth,
  claimPairing,
  completeCommand,
  enqueueCommand,
  listDevices,
  pollCommands,
  startPairing
} from "./device-bridge.js";
import {
  pollOperatorCameraEvents,
  pollOperatorEvents,
  submitDeviceEvent
} from "./microphone-bridge.js";
import {
  generateCloudVoice,
  generateXttsAudio,
  getVoiceRouterStatus
} from "./voice-router.js";
import {
  getLatestTelemetry,
  ingestTelemetry,
  telemetryHealth
} from "./telemetry.js";
import {
  chooseProviderOrder,
  withSmartProviderOrder
} from "./smart-router.js";
import { buildOperationalPlan } from "./planner.js";
import { analyzeVisualFrame } from "./vision-analysis.js";
import { getWebRtcIceServers, webRtcIceHealth } from "./webrtc-ice.js";
import { loadLiveNewsContext, isGeneralNewsIntent, isLiveNewsIntent } from "./news-context.js";
import { createWorldBriefing } from "./world-briefing.js";
import {
  answerLooksUncertain,
  researchVisualContext,
  searchGoogle,
  needsVisualResearch,
  isSelfCapabilityQuestion,
  mediaPolicy,
  normalizeResearchQuestion,
  isResearchFollowUp,
  resolveResearchQuery,
  shouldResearchBeforeAnswer
} from "./web-research.js";
import {
  loadResearchCache,
  saveResearchMemory
} from "./research-memory.js";
import {
  commandHistory,
  deviceControlHealth,
  enqueueControlCommand,
  getCommandStatus
} from "./device-control-v2.js";
import {
  automationHealth,
  createAutomation,
  deleteAutomation,
  listAutomations,
  processDueAutomations,
  runAutomationNow,
  setAutomationEnabled
} from "./automation-engine.js";
import {
  finishOrchestration,
  orchestrationHealth,
  orchestrationRunDetail,
  recentOrchestrations,
  recordOrchestrationStep,
  startOrchestration
} from "./orchestration-engine.js";

const BACKEND_VERSION = "4.30.1";
const WORKER_ENTRYPOINT = "worker.js";

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json; charset=utf-8"
  };
}

function json(data, status = 200) {
  return Response.json(data, { status, headers: corsHeaders() });
}

function jsonResult(result, failureStatus = 400) {
  return json(result, result?.ok === false ? failureStatus : 200);
}

async function bodyOf(request) {
  try { return await request.json(); } catch { return {}; }
}

async function operatorFrom(body) {
  return deriveOperatorId(body?.memoryKey);
}

function missingOperator() {
  return json({ ok: false, error: "Identidade do operador ausente." }, 401);
}

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function isNewsIntent(message) {
  const text = normalize(message);
  return /\b(noticia|noticias|news|manchete|manchetes|acontecendo|destaque|destaques)\b/.test(text) &&
    /\b(hoje|agora|atual|atuais|recente|recentes|ultima|ultimas|noticia|noticias)\b/.test(text);
}

function sourceSummary(research) {
  return (Array.isArray(research?.results) ? research.results : [])
    .slice(0, 8)
    .map((item) => ({
      title: item.title,
      url: item.url,
      source: item.source,
      date: item.date || null,
      score: Number.isFinite(Number(item.score)) ? Number(item.score) : null
    }));
}

function newsSourceSummary(newsState) {
  return (Array.isArray(newsState?.articles) ? newsState.articles : [])
    .slice(0, 8)
    .map((item) => ({
      title: item.title,
      url: item.url,
      source: item.source,
      date: item.publishedAt || null,
      score: null
    }));
}

function canonicalUrl(value) {
  try {
    const url = new URL(String(value || ""));
    url.hash = "";
    return url.toString().replace(/\/$/, "").toLowerCase();
  } catch {
    return String(value || "").toLowerCase();
  }
}

function dedupeSources(items, limit = 10) {
  const seenUrls = new Set();
  const seenTitles = new Set();
  const output = [];
  for (const item of Array.isArray(items) ? items : []) {
    const url = String(item?.url || "").trim();
    const title = String(item?.title || item?.source || "").replace(/\s+/g, " ").trim();
    if (!url || !title) continue;
    const urlKey = canonicalUrl(url);
    const titleKey = normalize(title);
    if (seenUrls.has(urlKey) || seenTitles.has(titleKey)) continue;
    seenUrls.add(urlKey);
    seenTitles.add(titleKey);
    output.push({
      title,
      url,
      source: String(item?.source || "fonte").trim(),
      date: item?.date || item?.publishedAt || null,
      score: Number.isFinite(Number(item?.score)) ? Number(item.score) : null
    });
    if (output.length >= limit) break;
  }
  return output;
}

function cacheContext(cache) {
  const sources = (Array.isArray(cache?.sources) ? cache.sources : [])
    .slice(0, 8)
    .map((item, index) => {
      const title = String(item?.title || item?.source || `Fonte ${index + 1}`).trim();
      const source = String(item?.source || "fonte").trim();
      const url = String(item?.url || "").trim();
      const date = String(item?.date || "").trim();
      return `${index + 1}. ${title}\nFonte: ${source}${date ? `\nData: ${date}` : ""}\nLink: ${url}`;
    })
    .join("\n\n");

  return [
    "PESQUISA WEB RECENTE RECUPERADA DA MEMÓRIA TEMPORÁRIA DO ULTRON:",
    `Consulta original: ${cache?.query || ""}`,
    `Verificada em: ${cache?.fetchedAt || "data não informada"}`,
    `Válida até: ${cache?.expiresAt || "prazo não informado"}`,
    "Use esta pesquisa somente enquanto ela estiver válida.",
    "Se houver conflito com a mensagem atual do operador, priorize a mensagem atual.",
    "",
    `Resumo verificado: ${cache?.answer || ""}`,
    sources ? `\nFontes:\n${sources}` : ""
  ].filter(Boolean).join("\n");
}

function visualHasContent(visual) {
  return Boolean(
    visual &&
    ((Array.isArray(visual.images) && visual.images.length) || (Array.isArray(visual.videos) && visual.videos.length) ||
      (Array.isArray(visual.cards) && visual.cards.length))
  );
}

function researchVisualFromSources(sources, searchedAt, text, fromCache, research) {
  if (!fromCache) {
    const visual = researchVisualContext(research);
    if (visual) return { ...visual, caption: text || "" };
  }
  if(!sources.length)return null;
  return {
    mode: "web-research",
    label: fromCache ? "RESEARCH MEMORY" : "WEB RESEARCH",
    images: [],
    cards: sources.slice(0, 4).map((item) => ({
      title: item.title,
      source: item.source,
      publishedAt: item.date || searchedAt || null,
      url: item.url,
      image: null
    })),
    caption: text || "",
    fetchedAt: searchedAt || null
  };
}

function emptyNewsState() {
  return {
    active: false,
    articles: [],
    contextText: "",
    visualContext: null,
    error: null,
    attempts: [],
    research: { active: false, query: "", resultCount: 0 }
  };
}

function buildMemoryAwareMessage(
  message,
  memoryContext,
  liveContext = "",
  webResearchContext = "",
  localFilesContext = "",
  laTeamContext = ""
) {
  const blocks = [];
  if (memoryContext) {
    blocks.push(
      "CONTEXTO INTERNO DE MEMÓRIA DO ULTRON:",
      "Use este contexto apenas para compreender referências, preferências e continuidade da conversa.",
      "Não diga que recebeu um bloco de memória e não invente informações ausentes.",
      "", memoryContext, ""
    );
  }
  if (localFilesContext) {
    blocks.push(
      "CONTEXTO LOCAL DA ULTRON_DATA:",
      "Este conteúdo foi recuperado pelo RAG local do operador.",
      "Use-o somente para responder sobre arquivos locais; não invente trechos ausentes e não trate caminhos locais como fontes públicas.",
      "", localFilesContext, ""
    );
  }
  if (laTeamContext) {
    blocks.push(
      "CONTEXTO INTERNO AUTENTICADO DA L&A ADVISORY TEAM:",
      "Estes dados vêm do sistema interno autorizado da equipe e não são pesquisa pública.",
      "Use-os apenas quando a pergunta do operador for sobre L&A Team, CRM, financeiro, FlowBoost, TikTok, equipe, relatórios ou código relacionado.",
      "Respeite as restrições de função/RLS já aplicadas pela origem. Não invente registros ausentes e não exponha informação além do necessário para responder.",
      "", laTeamContext, ""
    );
  }
  if (liveContext) blocks.push("CONTEXTO EXTERNO EM TEMPO REAL:", liveContext, "");
  if (webResearchContext) {
    blocks.push(
      "PESQUISA WEB VERIFICADA PARA ESTA RESPOSTA:",
      "As fontes abaixo já foram recuperadas. Não faça alegações externas além do que elas sustentam.",
      webResearchContext,
      ""
    );
  }
  blocks.push(
    "REGRAS DE RESPOSTA DO JARVIS:",
    "Se houver histórico de conversa, não reinicie com Olá ou outra saudação.",
    "Nunca repita o comando do operador como se fosse uma pergunta. Responda de forma objetiva.",
    "Se o operador disser sim, quero, pode ou não, interprete a resposta à luz da última pergunta do assistente.",
    "Não diga que executou uma ação de interface, câmera, dispositivo ou globo se o sistema não confirmou a execução.",
    "Se uma ação depende do aplicativo, explique brevemente que precisa ser executada pelo módulo correspondente; não ofereça executar repetidamente."
  );
  blocks.push("MENSAGEM ATUAL DO OPERADOR:", message);
  return blocks.join("\n");
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

async function generateElevenLabsAudio(env, text) {
  const voiceId = env.ELEVENLABS_VOICE_ID;
  const modelId = env.ELEVENLABS_MODEL || "eleven_flash_v2_5";
  const outputFormat = env.ELEVENLABS_OUTPUT_FORMAT || "mp3_22050_32";
  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=${encodeURIComponent(outputFormat)}`,
    {
      method: "POST",
      headers: { "xi-api-key": env.ELEVENLABS_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ text, model_id: modelId })
    }
  );
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`ElevenLabs retornou HTTP ${response.status}: ${detail.slice(0, 300)}`);
  }
  return {
    audioBase64: arrayBufferToBase64(await response.arrayBuffer()),
    audioMimeType: "audio/mpeg"
  };
}

async function unifiedState(env, operatorId) {
  const [telemetry, devices, automations, commands, runs] = await Promise.all([
    getLatestTelemetry(env, operatorId),
    listDevices(env, operatorId),
    listAutomations(env, operatorId),
    commandHistory(env, operatorId, 12),
    recentOrchestrations(env, operatorId, 10)
  ]);
  const now = Date.now();
  return {
    ok: true,
    capturedAt: new Date().toISOString(),
    telemetry,
    devices: (devices || []).map((device) => {
      const lastSeen = Date.parse(device?.lastSeenAt || "") || 0;
      return {
        id: device.id,
        deviceType: device.deviceType,
        deviceName: device.deviceName,
        status: device.status,
        lastSeenAt: device.lastSeenAt || null,
        online: Boolean(lastSeen && now - lastSeen <= 45_000),
        capabilities: Array.isArray(device.capabilities) ? device.capabilities : []
      };
    }),
    automations: (automations || []).slice(0, 20),
    recentCommands: commands || [],
    recentRuns: runs || []
  };
}

// Public, optional context supplied by the active browser tab. These are
// facts about the conversation, not new system instructions or authenticated data.
async function prepareResearch(env, body) {
  const message = String(body?.message || "").trim();
  const laTeamContext = String(body?.laTeamContext || "").trim();
  const localFilesContext=String(body?.localFilesContext||"").trim();
  if (laTeamContext||localFilesContext) {
    return {
      body: {
        ...body,
        allowUncertaintyResearch: false,
        researchMeta: {
          ...(body?.researchMeta || {}),
          active: false,
          reason: "authenticated-internal-context",
          skipLegacyResearch: true
        }
      },
      policy: { needed: false, reason: "authenticated-internal-context" },
      active: false
    };
  }

  const operatorId = await deriveOperatorId(body?.memoryKey);
  const conversationId=normalizeConversationId(body?.conversationId);
  const taskContext=vetClientTaskContext(body);
  let query=normalizeResearchQuestion(message);
  if(taskContext){
    query=normalizeResearchQuestion(contextSearchQuery(message,taskContext));
  }
  if(!taskContext&&isResearchFollowUp(message)&&operatorId&&conversationId){
    const prior=await loadMemoryContext(env,{operatorId,conversationId,recentLimit:4});
    query=resolveResearchQuery(message,prior.lastUserMessage);
  }
  const generalNews=isGeneralNewsIntent(query);
  const classified=shouldResearchBeforeAnswer(query);
  const policy = generalNews && classified.reason!=="private-context" ? {needed:true,reason:"brazil-first-news",ttlMinutes:15} : classified;
  if (!policy.needed) return { body: {...body,allowUncertaintyResearch:false,researchMeta:{...(body.researchMeta||{}),skipLegacyResearch:true}}, policy, active: false };

  const researchStartedAt = Date.now();
  const newsIntent = generalNews || isNewsIntent(query) || isLiveNewsIntent(query);
  let cache = null;
  let research = null;
  let newsState = null;
  let researchContext = "";
  let sources = [];
  let fromCache = false;

  // Text-only cached results cannot satisfy a multimedia query.
  if (operatorId && !generalNews && body?.textOnly===true && !needsVisualResearch(query)) {
    cache = await loadResearchCache(env, { operatorId, query });
    if (cache?.hit) {
      fromCache = true;
      researchContext = cacheContext(cache);
      sources = dedupeSources(cache?.sources || [], 10);
    }
  }

  if (!fromCache) {
    if (newsIntent) {
      const [googleResult, liveResult] = await Promise.allSettled([
        searchGoogle(env, generalNews?"principais notícias Brasil hoje":query, { limit: 6 }),
        loadLiveNewsContext(query, { limit: 6 })
      ]);
      research = googleResult.status === "fulfilled" ? googleResult.value : null;
      newsState = liveResult.status === "fulfilled" ? liveResult.value : null;
      researchContext = [research?.contextText, newsState?.contextText]
        .filter(Boolean)
        .join("\n\n--- FONTES DE NOTÍCIAS COMPLEMENTARES ---\n\n");
      sources = dedupeSources([
        ...newsSourceSummary(newsState),
        ...sourceSummary(research)
      ], 10);
    } else {
      research = await searchGoogle(env, query, { limit: 6 });
      if (research?.results?.length) {
        researchContext = research.contextText;
        sources = dedupeSources(sourceSummary(research), 8);
      }
    }
  }

  // A direct news question also needs details about each reported event.
  // Keep the original article order and images; enrich only matching headlines.
  if(newsIntent&&!fromCache&&newsState?.visualContext?.cards?.length){
    const cards=newsState.visualContext.cards.slice(0,4);
    const details=await deepenNews(env,cards);
    const sections=[];
    for(const item of details){
      const card=cards[item.index];
      if(!card||item.status!=="detailed")continue;
      card.description=item.description;
      card.detailSources=item.sources;
      sections.push("MANCHETE: "+card.title+"\nDETALHES CONFIRMADOS NAS FONTES: "+item.description+"\nFONTES COMPLEMENTARES: "+item.sources.map(x=>x.source+" — "+x.url).join("; "));
    }
    if(sections.length)researchContext+=(researchContext?"\n\n":"")+sections.join("\n\n");
  }

  // When Google returns no pictures, use actual encyclopedia images for
  // non-breaking factual topics. Never treat encyclopedia text as live news.
  let fallbackVisual=null;
  if(!fromCache&&!newsIntent&&mediaPolicy(query).images&&!research?.images?.length&&policy.reason!=="freshness"&&policy.reason!=="factual-current"){
    try{
      const fallback=await loadResearchContext(query,{limit:3,force:true});
      fallbackVisual=fallback?.visualContext||null;
      if(!sources.length&&fallback?.items?.length){
        researchContext=fallback.contextText;
        sources=dedupeSources(fallback.items.map(i=>({title:i.title,source:i.source,url:i.url,date:null})),8);
      }
    }catch{}
  }
  const researchMs = Date.now() - researchStartedAt;
  const usable = Boolean(researchContext && sources.length);
  return {
    active: true,
    policy,
    query,
    newsIntent,
    operatorId,
    cache,
    research,
    fallbackVisual,
    newsState,
    researchContext,
    sources,
    fromCache,
    researchMs,
    body: usable
      ? {
          ...body,
          webResearchContext: researchContext,
          allowUncertaintyResearch: false,
          researchMeta: {
            active: true,
            reason: policy.reason,
            provider: fromCache ? "research-cache" : (newsIntent ? "multi-source-live-news" : research?.provider),
            fromCache,
            newsIntent,
            skipLegacyResearch: true
          }
        }
      : { ...body, allowUncertaintyResearch: false,
          ...((newsIntent||policy.reason==="freshness"||policy.reason==="factual-current") ? {webResearchContext:"Não foram obtidas fontes recentes verificáveis nesta consulta. Não apresente números, acontecimentos ou dados atuais como fatos confirmados. Informe a indisponibilidade de confirmação.",researchMeta:{active:true,reason:policy.reason,newsIntent,skipLegacyResearch:true}} : {allowUncertaintyResearch:true}) }
  };
}

async function executeAiCore(env, body) {
  const requestStartedAt = Date.now();
  const message = String(body?.message || "").trim();
  const telemetry = body?.telemetry || {};
  const conversationId = normalizeConversationId(body?.conversationId);
  const operatorId = await deriveOperatorId(body?.memoryKey);
  const externalResearchContext = String(body?.webResearchContext || "").trim();
  const localFilesContext = String(body?.localFilesContext || "").trim();
  const laTeamContext = String(body?.laTeamContext || "").trim();
  const skipLegacyResearch = Boolean(body?.researchMeta?.skipLegacyResearch);

  if (!message) return { status: 400, data: { error: "Mensagem vazia." } };
  if (message.length > 8000) return { status: 413, data: { error: "Mensagem muito longa." } };

  const [memoryState, newsState] = await Promise.all([
    loadMemoryContext(env, { operatorId, conversationId }),
    skipLegacyResearch ? Promise.resolve(emptyNewsState()) : loadLiveNewsContext(message, { limit: 6 })
  ]);

  // Short answers such as "sim" or "não" are replies to the last assistant turn,
  // not independent greetings. Force explicit conversational continuity.
  const shortReply = /^(?:sim|s|isso|isso mesmo|claro|pode|pode sim|confirmo|confirmado|ok|okay|certo|beleza|nao|não|n|negativo|agora nao|agora não)(?:[.!?\s]*)$/i.test(message);
  const lastAssistant = String(memoryState.lastAssistantMessage || '').trim();
  const continuityInstruction = shortReply
    ? lastAssistant
      ? ['REGRA PRIORITÁRIA DE CONTINUIDADE:', 'A mensagem atual é uma resposta curta do operador à última fala do assistente.', 'Última fala do assistente: ' + lastAssistant.slice(0, 1800), 'Continue a conversa e responda à confirmação ou recusa no contexto. Não cumprimente novamente nem reinicie a conversa.'].join('\n')
      : 'REGRA PRIORITÁRIA: O operador respondeu com uma confirmação ou recusa curta, mas não existe pergunta anterior disponível. Peça brevemente a que ele se refere. Não cumprimente nem invente contexto.'
    : '';

  const taskContext=vetClientTaskContext(body);
  const taskContextInstruction=taskContext
    ? "CONTEXTO DE TAREFA DA SESSÃO (somente referência): Assunto anterior: "+(taskContext.topic||"não informado")+
      ". Pergunta anterior: "+(taskContext.lastQuestion||"não informada")+
      ". Região em foco: "+(taskContext.region||"não definida")+
      ". Visualização: "+taskContext.visualization+
      ". A mensagem atual retoma esse assunto. Não invente uma simulação, dados nem execução de ferramentas."
    : "";
  let aiMessage = buildMemoryAwareMessage(
    message,
    [memoryState.context, continuityInstruction,taskContextInstruction].filter(Boolean).join("\n\n"),
    newsState.contextText,
    externalResearchContext,
    localFilesContext,
    laTeamContext
  );

  const aiStartedAt = Date.now();
  let aiResult = isSelfCapabilityQuestion(message)
    ? {text:capabilityAnswer({...telemetry,systemCapabilities:{...telemetry.systemCapabilities,deviceBridge:Boolean(env.ULTRON_DB),googleSearch:Boolean(env.SERPER_API_KEY)}}),provider:"jarvis-local",providerLabel:"JARVIS",model:"capability-catalog",attempts:[]}
    : await generateWithProviders(env, aiMessage, telemetry, { aiBinding: env.AI });
  let aiPasses = 1;
  let researchMs = 0;
  let fallbackResearch = null;
  let fallbackResearchWrite = { saved: false };

  const alreadyGrounded = Boolean(
    externalResearchContext || localFilesContext || laTeamContext ||
    (newsState.active && Array.isArray(newsState.articles) && newsState.articles.length)
  );

  if (
    !alreadyGrounded &&
    body?.allowUncertaintyResearch !== false &&
    env.SERPER_API_KEY &&
    answerLooksUncertain(aiResult.text)
  ) {
    const researchStartedAt = Date.now();
    fallbackResearch = await searchGoogle(env, resolveResearchQuery(message,memoryState.lastUserMessage), { limit: 6 });
    researchMs = Date.now() - researchStartedAt;
    if (fallbackResearch?.results?.length && fallbackResearch?.contextText) {
      aiMessage = buildMemoryAwareMessage(
        message,
        [memoryState.context, continuityInstruction,taskContextInstruction].filter(Boolean).join("\n\n"),
        newsState.contextText,
        fallbackResearch.contextText,
        localFilesContext,
        laTeamContext
      );
      aiResult = await generateWithProviders(env, aiMessage, telemetry, { aiBinding: env.AI });
      aiPasses = 2;
      if (operatorId && aiResult?.text) {
        fallbackResearchWrite = await saveResearchMemory(env, {
          operatorId,
          query: message,
          answer: aiResult.text,
          sources: sourceSummary(fallbackResearch),
          provider: fallbackResearch.provider || "serper-google",
          ttlMinutes: 1440
        });
      }
    }
  }

  const aiMs = Date.now() - aiStartedAt;
  const memoryPromise = memoryState.active && operatorId && conversationId
    ? saveExchange(env, {
        operatorId,
        conversationId,
        userMessage: message,
        assistantMessage: aiResult.text,
        provider: aiResult.provider,
        model: aiResult.model
      })
    : Promise.resolve({ saved: false, explicitMemorySaved: false });

  const autoSpeakEnabled = false; // Voz pausada: nenhuma chamada automática ao ElevenLabs.
  const voiceStartedAt = Date.now();
  const voicePromise = autoSpeakEnabled && env.ELEVENLABS_API_KEY && env.ELEVENLABS_VOICE_ID
    ? generateElevenLabsAudio(env, aiResult.text)
        .then((audio) => ({ audio, voiceMs: Date.now() - voiceStartedAt }))
        .catch((error) => {
          console.error("[ULTRON AI] ElevenLabs falhou:", error?.message || error);
          return { audio: null, voiceMs: Date.now() - voiceStartedAt };
        })
    : Promise.resolve({ audio: null, voiceMs: 0 });

  const [memoryWrite, voiceResult] = await Promise.all([memoryPromise, voicePromise]);
  const fallbackVisual = fallbackResearch?.results?.length ? researchVisualContext(fallbackResearch) : null;
  const visualContext = (fallbackVisual || newsState.visualContext)
    ? { ...(fallbackVisual || newsState.visualContext), caption: aiResult.text }
    : null;
  const fallbackSources = sourceSummary(fallbackResearch);

  return {
    status: 200,
    data: {
      text: aiResult.text,
      provider: aiResult.provider,
      providerLabel: aiResult.providerLabel,
      model: aiResult.model,
      attempts: aiResult.attempts,
      memory: {
        active: memoryState.active,
        identityReceived: Boolean(operatorId && conversationId),
        recalledMessages: memoryState.recalledMessages || 0,
        recalledMemories: memoryState.recalledMemories || 0,
        saved: Boolean(memoryWrite?.saved),
        explicitMemorySaved: Boolean(memoryWrite?.explicitMemorySaved),
        error: memoryState.error || memoryWrite?.error || null
      },
      localFiles: localFilesContext
        ? {
            active: true,
            messageSafe: true,
            searchMode: body?.localFilesMeta?.searchMode || "hybrid",
            targetFile: body?.localFilesMeta?.targetFile || null,
            targetFileId: body?.localFilesMeta?.targetFileId || null,
            componentId: body?.localFilesMeta?.componentId || null,
            topScore: Number(body?.localFilesMeta?.topScore || 0),
            matchCount: Array.isArray(body?.localFilesMeta?.matches) ? body.localFilesMeta.matches.length : 0
          }
        : { active: false },
      laTeam: laTeamContext
        ? {
            active: true,
            authorized: Boolean(body?.laTeamMeta?.authorized),
            source: body?.laTeamMeta?.source || "la-advisory-team",
            areas: Array.isArray(body?.laTeamMeta?.areas) ? body.laTeamMeta.areas : [],
            memberRole: body?.laTeamMeta?.memberRole || null,
            fetchedAt: body?.laTeamMeta?.fetchedAt || null,
            messageSafe: true
          }
        : { active: false },
      liveData: {
        news: newsState.active,
        resultCount: newsState.articles?.length || 0,
        error: newsState.error || null,
        attempts: newsState.attempts || [],
        fetchedAt: newsState.visualContext?.fetchedAt || null
      },
      visualContext,
      webResearch: fallbackResearch
        ? {
            requested: true,
            used: Boolean(fallbackSources.length),
            reason: "uncertainty-retry",
            automaticFallback: true,
            provider: fallbackResearch.providerLabel || "Google Search via Serper",
            configured: fallbackResearch.configured !== false,
            query: message,
            sourceCount: fallbackSources.length,
            sources: fallbackSources,
            searchedAt: fallbackResearch.searchedAt || null,
            fromCache: false,
            savedToMemory: Boolean(fallbackResearchWrite?.saved),
            memoryExpiresAt: fallbackResearchWrite?.expiresAt || null,
            quality: fallbackResearch.quality || null,
            error: fallbackResearch.error || fallbackResearchWrite?.error || null
          }
        : undefined,
      performance: {
        aiMs,
        researchMs,
        aiPasses,
        voiceMs: voiceResult.voiceMs,
        totalMs: Date.now() - requestStartedAt,
        parallelPostProcessing: true
      },
      audioBase64: voiceResult.audio?.audioBase64 || null,
      audioMimeType: voiceResult.audio?.audioMimeType || null
    }
  };
}

async function handleAi(request, env) {
  const startedAt = Date.now();
  let originalBody;
  try { originalBody = await request.json(); }
  catch { return json({ error: "JSON inválido." }, 400); }

  const prepared = await prepareResearch(env, originalBody);
  const body = prepared.body;
  const operatorId = await deriveOperatorId(body?.memoryKey);
  let telemetry = body?.telemetry || {};

  if (operatorId) {
    const latest = await getLatestTelemetry(env, operatorId);
    if (latest?.snapshot) {
      telemetry = { ...telemetry, central: latest.snapshot, centralCapturedAt: latest.createdAt || null };
    }
  }

  const operationalPlan = buildOperationalPlan(body?.message, telemetry);
  telemetry = { ...telemetry, operationalPlan };
  const routing = chooseProviderOrder(env, body?.message, telemetry);
  const routedEnv = withSmartProviderOrder(env, routing);

  let core;
  try {
    core = await executeAiCore(routedEnv, { ...body, telemetry });
  } catch (error) {
    console.error("[ULTRON AI] Gateway falhou:", error);
    return json({
      error: "Nenhum provedor de IA conseguiu responder.",
      details: error?.message || String(error),
      attempts: error instanceof ProviderGatewayError ? error.attempts : [],
      smartRouting: routing,
      operationalPlan,
      backendVersion: BACKEND_VERSION
    }, 503);
  }

  if (core.status !== 200) return json({ ...core.data, smartRouting: routing, operationalPlan, backendVersion: BACKEND_VERSION }, core.status);
  let data = { ...core.data, smartRouting: routing, operationalPlan, backendVersion: BACKEND_VERSION };

  if (data.text) {
    if (originalBody?.clientOwnsSpeech===true && originalBody?.preferFastResponse===true && !data.audioBase64) {
      data.voice={provider:null,providerLabel:null,nextFallback:'browser-tts',deferred:true};
    } else if (data.audioBase64) {
      data.voice = {
        provider: "elevenlabs",
        providerLabel: "ElevenLabs",
        source: "worker.js",
        nextFallback: null
      };
    } else {
      const voiceStartedAt = Date.now();
      const voice = await generateCloudVoice(env, data.text, { skipEleven: true });
      if (voice.audioBase64) {
        data.audioBase64 = voice.audioBase64;
        data.audioMimeType = voice.audioMimeType;
        data.voice = {
          provider: voice.provider,
          providerLabel: voice.providerLabel,
          voice: voice.voice,
          attempts: voice.attempts,
          nextFallback: null
        };
      } else {
        data.voice = {
          provider: null,
          providerLabel: null,
          attempts: voice.attempts,
          nextFallback: "browser-tts"
        };
      }
      data.performance = {
        ...(data.performance || {}),
        fallbackVoiceMs: Date.now() - voiceStartedAt
      };
    }
  }

  if (prepared.active) {
    const {
      policy, query, newsIntent, operatorId: researchOperatorId, cache, research, fallbackVisual,
      newsState, sources, fromCache, researchMs, researchContext
    } = prepared;

    if (!researchContext || !sources.length) {
      const mediaOnly=researchVisualContext(research)||fallbackVisual;
      if(visualHasContent(mediaOnly))data.visualContext={...mediaOnly,caption:data.text||""};
      data.webResearch = {
        requested: true,
        used: false,
        reason: policy.reason,
        provider: research?.providerLabel || (newsIntent ? "Google News + GDELT" : null),
        configured: research?.configured ?? Boolean(env.SERPER_API_KEY),
        error: research?.error || newsState?.error || cache?.error ||
          (env.SERPER_API_KEY ? "Nenhuma fonte confiável foi retornada." : "SERPER_API_KEY não configurada."),
        sourceCount: 0,
        fromCache: false,
        searchMs: researchMs
      };
    } else {
      const searchedAt = fromCache
        ? cache?.fetchedAt
        : (research?.searchedAt || newsState?.visualContext?.fetchedAt || new Date().toISOString());
      let memoryWrite = { saved: false };
      if (!fromCache && researchOperatorId && data?.text && sources.length) {
        memoryWrite = await saveResearchMemory(env, {
          operatorId: researchOperatorId,
          query: query || String(originalBody?.message || "").trim(),
          answer: data.text,
          sources,
          provider: newsIntent ? "multi-source-live-news" : (research?.provider || "serper-google"),
          ttlMinutes: newsIntent ? Math.min(policy.ttlMinutes || 45, 45) : policy.ttlMinutes
        });
      }
      const researchVisual = researchVisualFromSources(sources, searchedAt, data?.text, fromCache, research);
      const newsVisual = newsState?.visualContext || null;
      const baseVisual = data?.visualContext || null;
      const preferredVisual = {
        ...(baseVisual||{}),...(fallbackVisual||{}),...(researchVisual||{}),...(newsVisual||{}),
        images:[...(newsVisual?.images||[]),...(researchVisual?.images||[]),...(fallbackVisual?.images||[]),...(baseVisual?.images||[])].slice(0,6),
        videos:[...(researchVisual?.videos||[]),...(baseVisual?.videos||[])].slice(0,3),
        cards:[...(newsVisual?.cards||[]),...(researchVisual?.cards||[]),...(fallbackVisual?.cards||[]),...(baseVisual?.cards||[])].slice(0,8)
      };
      if (newsIntent && sources.length) {
        data.liveData = {
          ...(data?.liveData || {}),
          news: true,
          resultCount: sources.length,
          error: null,
          source: fromCache ? "research-memory" : "google-search+google-news+gdelt",
          attempts: newsState?.attempts || [],
          fetchedAt: searchedAt || null
        };
      }
      data.visualContext = preferredVisual
        ? { ...preferredVisual, caption: data?.text || preferredVisual.caption || "" }
        : null;
      data.webResearch = {
        requested: true,
        used: true,
        reason: policy.reason,
        provider: fromCache
          ? "Research Memory"
          : (newsIntent ? "Google Search + Google News + GDELT" : (research?.providerLabel || "Google Search via Serper")),
        configured: true,
        query: query || String(originalBody?.message || "").trim(),
        sourceCount: sources.length,
        sources,
        searchedAt: searchedAt || null,
        searchMs: researchMs,
        fromCache,
        savedToMemory: Boolean(memoryWrite?.saved),
        memoryStorage: memoryWrite?.storage || (fromCache ? "research_cache" : null),
        memoryExpiresAt: memoryWrite?.expiresAt || cache?.expiresAt || null,
        quality: newsIntent
          ? {
              diverseDomains: new Set(sources.map((item) => item.source)).size,
              engines: fromCache ? ["research-cache"] : ["google-search", "google-news", "gdelt"]
            }
          : (research?.quality || null),
        error: memoryWrite?.error || null
      };
    }
  }

  if(prepared.active){
    data.mediaStatus={
      automatic:true,
      configured:Boolean(env.SERPER_API_KEY),
      imageCount:data.visualContext?.images?.length||0,
      videoCount:data.visualContext?.videos?.length||0,
      imageError:prepared.research?.mediaStatus?.imageError||null,
      videoError:prepared.research?.mediaStatus?.videoError||null
    };
  }
  data.performance = {
    ...(data.performance || {}),
    totalMs: Date.now() - startedAt
  };
  return json(data);
}

async function health(env) {
  const providers = getProviderStatus(env, env.AI);
  const [memory, bridge, telemetry] = await Promise.all([
    memoryHealth(env),
    bridgeHealth(env),
    telemetryHealth(env)
  ]);
  return json({
    status: "online",
    service: "ultron-ai-cloudflare-worker",
    backendVersion: BACKEND_VERSION,
    workerEntrypoint: WORKER_ENTRYPOINT,
    singleEntrypoint: true,
    legacyWorkerChain: false,
    aiGateway: true,
    providers,
    providerOrder: String(env.AI_PROVIDER_ORDER || "groq,gemini,cloudflare,openrouter,cohere")
      .split(",").map((item) => item.trim()).filter(Boolean),
    elevenlabs: Boolean(env.ELEVENLABS_API_KEY && env.ELEVENLABS_VOICE_ID),
    memory,
    memoryVersion: "1.2",
    deviceBridge: Boolean(bridge?.ready),
    bridge,
    telemetry,
    proactiveEngine: Boolean(telemetry?.ready),
    smartRouting: true,
    operationalPlanner: true,
    permissionPolicy: "auto/confirm/blocked",
    visualAnalysis: Boolean(env.GEMINI_API_KEY),
    webRtcIce: webRtcIceHealth(env),
    voiceRouter: getVoiceRouterStatus(env),
    voiceOrder: ["ElevenLabs", "Google Neural2", "Google WaveNet", "Browser TTS", "XTTS v2"],
    liveNews: true,
    automaticWorldBriefing: true,
    briefingPath: "/api/briefing",
    briefingRefreshMinutes: 10,
    liveNewsEngine: "google-search+google-news+gdelt-parallel",
    visualContext: true,
    localFileContextBridge: true,
    laTeamContextBridge: true,
    uncertaintyResearchRetry: Boolean(env.SERPER_API_KEY),
    internalSystems: {
      laTeamContextBridge: true,
      internalContextPriority: true,
      webResearchBypassWhenGrounded: true
    },
    webResearch: {
      enabled: true,
      googleSearch: Boolean(env.SERPER_API_KEY),
      automaticMedia: true,
      googleImagesConfigured: Boolean(env.SERPER_API_KEY),
      googleVideosConfigured: Boolean(env.SERPER_API_KEY),
      mediaMode:"automatic-google-youtube-v2",
      provider: env.SERPER_API_KEY ? "Google Search via Serper" : null,
      memoryCache: Boolean(env.ULTRON_DB),
      expiringResearchCache: Boolean(env.ULTRON_DB),
      sourceRanking: true,
      uncertaintyRetry: Boolean(env.SERPER_API_KEY),
      conversationMemorySafe: true,
      mode: "research-gate-v3"
    },
    deviceControl: deviceControlHealth(),
    automations: automationHealth(),
    totalIntegration: true,
    orchestration: orchestrationHealth(),
    proactiveMode: {
      enabled: true,
      safeSelfHeal: true,
      activeDeviceActionsRequireIntent: true,
      destructiveActionsBlockedWithoutPolicy: true
    },
    message: "ULTRON Worker consolidado: gateway multi-IA, memória, pesquisa, voz, visão, dispositivos, automações e orquestração em um único entrypoint."
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders() });
    if (path === "/api/health" && request.method === "GET") return health(env);
    if(path==="/api/geo/insight"&&request.method==="GET"){
      const result=await loadWeatherInsight({
       type:url.searchParams.get("type"),city:url.searchParams.get("city"),id:url.searchParams.get("id"),
       year:url.searchParams.get("year"),month:url.searchParams.get("month")
      });
      return new Response(JSON.stringify(result),{status:result.ok?200:result.status||503,
       headers:{...corsHeaders(),"Cache-Control":result.ok?"public, max-age=900":"no-store",
        "X-Content-Type-Options":"nosniff"}});
    }
    // Watchlists are private, unlike public forecast and sample-monitor routes.
    if(path==="/api/geo/watchlist"&&request.method==="POST"){
      const body=await bodyOf(request);
      const operatorId=await operatorFrom(body);
      if(!operatorId)return missingOperator();
      const result=await listWeatherWatches(env,operatorId);
      return json(result,result.ok?200:result.status||503);
    }
    if(path==="/api/geo/watchlist/configure"&&request.method==="POST"){
      const body=await bodyOf(request);
      const operatorId=await operatorFrom(body);
      if(!operatorId)return missingOperator();
      const result=await configureWeatherWatch(env,operatorId,{action:body.action,id:body.id});
      return json(result,result.ok?200:result.status||503);
    }
    if(path==="/api/geo/monitor"&&request.method==="GET"){
      const result=await latestWeatherMonitor(env);
      return new Response(JSON.stringify(result),{status:result.ok?200:result.status||503,
       headers:{...corsHeaders(),"Cache-Control":result.ok?"public, max-age=300":"no-store",
        "X-Content-Type-Options":"nosniff"}});
    }
    if(path==="/api/geo/locations"&&request.method==="GET"){
      const result=await searchGlobalLocations(url.searchParams.get("q"));
      return new Response(JSON.stringify(result),{status:result.ok?200:result.status||503,headers:{
       ...corsHeaders(),"Cache-Control":result.ok?"public, max-age=3600":"no-store","X-Content-Type-Options":"nosniff"}});
    }
    if(path==="/api/geo/world"&&request.method==="GET"){
      const topic=url.searchParams.get("topic"),region=url.searchParams.get("region")||"world";
      const cache=typeof caches==="object"?caches.default:null;
      const cacheKey=new Request(url.toString(),{method:"GET"});
      try{const hit=await cache?.match(cacheKey);if(hit)return hit;}catch{}
      const data=await loadWorldGeo({topic,region});
      const response=new Response(JSON.stringify(data),{status:data.ok?200:data.status||503,headers:{
        ...corsHeaders(),"Content-Type":"application/json; charset=utf-8",
        "Cache-Control":data.ok?(["population","gdp","co2"].includes(topic)?
          "public, max-age=86400":"public, max-age=900"):"no-store",
        "X-Content-Type-Options":"nosniff"}});
      if(data.ok&&cache&&ctx?.waitUntil)ctx.waitUntil(cache.put(cacheKey,response.clone()).catch(()=>{}));
      return response;
    }
    if(path==="/api/geo/intensity"&&request.method==="GET"){
      const layer=url.searchParams.get("layer")||"rain",region=url.searchParams.get("region")||"brazil",
       day=url.searchParams.get("day")||"0";
      // Provider requests are bounded to 40 fixed coordinates, one layer and
      // one date at a time. Cache per full URL for 30 min to respect free use.
      const cache=typeof caches!=="undefined"?caches.default:null;
      const cacheKey=new Request(url.toString(),{method:"GET"});
      try{
        const cached=await cache?.match(cacheKey);
        if(cached)return cached;
      }catch{}
      const result=await loadSpatialIntensity({layer,region,day});
      const response=new Response(JSON.stringify(result),{status:result.ok?200:result.status||503,headers:{
        ...corsHeaders(),"Cache-Control":result.ok?"public, max-age=1800":"no-store",
        "Content-Type":"application/json; charset=utf-8",
        "X-Content-Type-Options":"nosniff"}});
      if(result.ok&&cache&&ctx?.waitUntil)ctx.waitUntil(cache.put(cacheKey,response.clone()).catch(()=>{}));
      return response;
    }
    if(path==="/api/geo/global"&&request.method==="GET"){
      const result=await loadGlobalWeather({query:url.searchParams.get("city"),
       id:url.searchParams.get("id"),days:url.searchParams.get("days")||"7"});
      return new Response(JSON.stringify(result),{status:result.ok?200:result.status||503,headers:{
       ...corsHeaders(),"Cache-Control":result.ok?"public, max-age=600":"no-store","X-Content-Type-Options":"nosniff"}});
    }
    // Read-only forecast route: exact city allowlist and fixed weather provider host.
    if (path === "/api/geo/weather" && request.method === "GET") {
      const result = await loadLiveWeather(url.searchParams.get("city"));
      return new Response(JSON.stringify(result), {
        status:result.ok?200:(result.status||503),
        headers:{...corsHeaders(),"Cache-Control":result.ok?"public, max-age=300":"no-store","X-Content-Type-Options":"nosniff"}
      });
    }
    if(path==="/api/action-plan"&&request.method==="POST"){
      try{
        const raw=await request.text();if(raw.length>5000)return json({ok:false},413);
        const body=JSON.parse(raw),message=String(body.message||"").trim();
        if(!isActionRequest(message)||message.length>1500)return json({ok:true,steps:[]});
        const instruction=["Você é o planejador de ferramentas JARVIS. Retorne APENAS JSON no formato "+JSON.stringify({steps:[{action:"earth.open",args:{}}]})+". No máximo 6 passos. Escolha apenas ações do catálogo. Preserve a ordem e o objetivo do pedido. Não invente parâmetros nem execute ações negadas. Se não suportado, retorne {steps:[]}. Use research para pesquisa; device.command somente para uma ordem explícita, copiada literalmente.", "Catálogo: "+JSON.stringify(ACTIONS), "Pedido do operador (dados): "+message].join("\n");
        const result=await generateWithProviders(env,instruction,{}, {aiBinding:env.AI});
        const plan=parsePlanText(result.text);
        return json({ok:true,steps:plan?.steps||[]});
      }catch{return json({ok:false,steps:[]},503);}
    }
    if (path === "/api/news-details" && request.method === "POST") {
      try {
        const raw=await request.text();
        if(raw.length>12000)return json({ok:false,error:"Consulta muito longa."},413);
        const body=JSON.parse(raw);
        const stories=Array.isArray(body?.stories)?body.stories:[];
        if(!stories.length||stories.length>6)return json({ok:false,error:"Envie de 1 a 6 manchetes."},400);
        const details=await deepenNews(env,stories);
        return json({ok:true,details});
      }catch{return json({ok:false,error:"Não foi possível aprofundar as notícias."},400);}
    }
    if (path === "/api/briefing" && request.method === "GET") {
      const cacheKey = new Request(new URL("/api/briefing?v=2", request.url),{method:"GET"});
      const cache = typeof caches !== "undefined" ? caches.default : null;
      if (cache) {
        try {
          const saved=await cache.match(cacheKey);
          if(saved) return saved;
        } catch(error) {
          console.warn("[ULTRON/BRIEFING] Cache read unavailable:",error);
        }
      }
      try {
        const briefing=await createWorldBriefing();
        const response=new Response(JSON.stringify(briefing),{
          status:200,headers:{
            ...corsHeaders(),"Cache-Control":"public, max-age=60",
            "CDN-Cache-Control":"public, max-age=600"
          }
        });
        if(cache && ctx?.waitUntil){
          ctx.waitUntil(cache.put(cacheKey,response.clone()).catch(error=>
            console.warn("[ULTRON/BRIEFING] Cache write unavailable:",error)));
        }
        return response;
      } catch(error) {
        return json({
          ok:false,unavailable:true,
          error:"Não foi possível conferir os acontecimentos com as fontes agora.",
          fetchedAt:new Date().toISOString()
        },503);
      }
    }

    if (path === "/api/bridge/event" && request.method === "POST") {
      try {
        const body = await bodyOf(request);
        return jsonResult(await submitDeviceEvent(env, {
          deviceId: body?.deviceId,
          deviceSecret: body?.deviceSecret,
          eventType: body?.eventType,
          payload: body?.payload || {}
        }), 401);
      } catch (error) {
        return json({ ok: false, error: error?.message || String(error) }, 500);
      }
    }

    if (path === "/api/devices/events/poll" && request.method === "POST") {
      try {
        const body = await bodyOf(request);
        const operatorId = await operatorFrom(body);
        if (!operatorId) return missingOperator();
        const channel = String(body?.channel || "microphone").trim().toLowerCase();
        const result = channel === "camera"
          ? await pollOperatorCameraEvents(env, { operatorId, limit: body?.limit })
          : await pollOperatorEvents(env, { operatorId, limit: body?.limit });
        return jsonResult(result);
      } catch (error) {
        return json({ ok: false, error: error?.message || String(error) }, 500);
      }
    }

    if (path === "/api/webrtc/ice" && request.method === "POST") {
      const body = await bodyOf(request);
      if (!await operatorFrom(body)) return missingOperator();
      return json(await getWebRtcIceServers(env, { ttlSeconds: 3600 }));
    }

    if (path === "/api/telemetry/ingest" && request.method === "POST") {
      const body = await bodyOf(request);
      const operatorId = await operatorFrom(body);
      const result = await ingestTelemetry(env, {
        operatorId,
        source: body?.source || "web",
        snapshot: body?.snapshot || {}
      });
      return json(result, result?.ok === false ? 400 : 200);
    }

    if (path === "/api/telemetry/latest" && request.method === "POST") {
      const body = await bodyOf(request);
      const operatorId = await operatorFrom(body);
      if (!operatorId) return missingOperator();
      return json({ ok: true, latest: await getLatestTelemetry(env, operatorId) });
    }

    if (path === "/api/vision/analyze" && request.method === "POST") {
      const body = await bodyOf(request);
      const result = await analyzeVisualFrame(env, {
        imageBase64: body?.imageBase64,
        mimeType: body?.mimeType,
        prompt: body?.prompt
      });
      return json(result, result?.ok === false ? 400 : 200);
    }

    if (path === "/api/voice" && request.method === "POST") {
      return json({ error: "Voz temporariamente desativada para evitar consumo de créditos." }, 503);
      const body = await bodyOf(request);
      const text = String(body?.text || "").replace(/\s+/g, " ").trim();
      if (!text) return json({ error: "Texto vazio." }, 400);
      if (text.length > 3000) return json({ error: "Texto muito longo para gerar voz." }, 413);
      const startedAt = Date.now();
      const result = await generateCloudVoice(env, text);
      if (result.audioBase64) {
        return json({
          audioBase64: result.audioBase64,
          audioMimeType: result.audioMimeType,
          voice: {
            provider: result.provider,
            providerLabel: result.providerLabel,
            voice: result.voice,
            attempts: result.attempts,
            elapsedMs: Date.now() - startedAt
          }
        });
      }
      return json({
        error: "Nenhum provedor de voz em nuvem conseguiu gerar áudio.",
        voice: { provider: null, attempts: result.attempts, nextFallback: "browser-tts", elapsedMs: Date.now() - startedAt }
      }, 503);
    }

    if (path === "/api/voice/xtts" && request.method === "POST") {
      return json({ error: "Voz temporariamente desativada." }, 503);
      const body = await bodyOf(request);
      const text = String(body?.text || "").replace(/\s+/g, " ").trim();
      if (!text) return json({ error: "Texto vazio." }, 400);
      if (text.length > 3000) return json({ error: "Texto muito longo para XTTS v2." }, 413);
      try {
        const result = await generateXttsAudio(env, text);
        return json({
          audioBase64: result.audioBase64,
          audioMimeType: result.audioMimeType,
          voice: { provider: result.provider, providerLabel: result.providerLabel }
        });
      } catch (error) {
        return json({ error: "XTTS v2 indisponível.", details: error?.message || String(error) }, 503);
      }
    }

    if (path === "/api/devices/pair/start" && request.method === "POST") {
      try {
        const body = await bodyOf(request);
        const result = await startPairing(env, {
          operatorId: await operatorFrom(body),
          deviceType: body?.deviceType,
          deviceName: body?.deviceName
        });
        return jsonResult(result);
      } catch (error) { return json({ ok: false, error: error?.message || String(error) }, 500); }
    }

    if (path === "/api/devices/pair/claim" && request.method === "POST") {
      try { return jsonResult(await claimPairing(env, await bodyOf(request))); }
      catch (error) { return json({ ok: false, error: error?.message || String(error) }, 500); }
    }

    if (path === "/api/devices/list" && request.method === "POST") {
      try {
        const body = await bodyOf(request);
        const operatorId = await operatorFrom(body);
        if (!operatorId) return missingOperator();
        return json({ ok: true, devices: await listDevices(env, operatorId) });
      } catch (error) { return json({ ok: false, error: error?.message || String(error) }, 500); }
    }

    if (path === "/api/devices/command" && request.method === "POST") {
      try {
        const body = await bodyOf(request);
        return jsonResult(await enqueueCommand(env, {
          operatorId: await operatorFrom(body),
          deviceId: body?.deviceId,
          command: body?.command,
          payload: body?.payload || {}
        }));
      } catch (error) { return json({ ok: false, error: error?.message || String(error) }, 500); }
    }

    if (path === "/api/bridge/poll" && request.method === "POST") {
      try {
        const body = await bodyOf(request);
        return jsonResult(await pollCommands(env, { deviceId: body?.deviceId, deviceSecret: body?.deviceSecret }), 401);
      } catch (error) { return json({ ok: false, error: error?.message || String(error) }, 500); }
    }

    if (path === "/api/bridge/result" && request.method === "POST") {
      try {
        const body = await bodyOf(request);
        return jsonResult(await completeCommand(env, {
          deviceId: body?.deviceId,
          deviceSecret: body?.deviceSecret,
          commandId: body?.commandId,
          status: body?.status,
          result: body?.result || {}
        }), 401);
      } catch (error) { return json({ ok: false, error: error?.message || String(error) }, 500); }
    }

    if (path === "/api/control/command" && request.method === "POST") {
      const body = await bodyOf(request);
      const operatorId = await operatorFrom(body);
      if (!operatorId) return missingOperator();
      const result = await enqueueControlCommand(env, {
        operatorId,
        deviceId: body?.deviceId,
        deviceType: body?.deviceType,
        command: body?.command,
        payload: body?.payload || {}
      });
      return json(result, result?.ok === false ? (result?.needsConfirmation ? 409 : 400) : 200);
    }

    if (path === "/api/control/status" && request.method === "POST") {
      const body = await bodyOf(request);
      const operatorId = await operatorFrom(body);
      if (!operatorId) return missingOperator();
      const result = await getCommandStatus(env, operatorId, body?.commandId);
      return json(result, result?.ok === false ? 404 : 200);
    }

    if (path === "/api/control/history" && request.method === "POST") {
      const body = await bodyOf(request);
      const operatorId = await operatorFrom(body);
      if (!operatorId) return missingOperator();
      return json({ ok: true, history: await commandHistory(env, operatorId, body?.limit) });
    }

    if (path === "/api/automations/create" && request.method === "POST") {
      const body = await bodyOf(request);
      const operatorId = await operatorFrom(body);
      if (!operatorId) return missingOperator();
      const result = await createAutomation(env, {
        operatorId,
        name: body?.name,
        deviceId: body?.deviceId,
        deviceType: body?.deviceType,
        command: body?.command,
        payload: body?.payload || {},
        scheduleKind: body?.scheduleKind,
        schedule: body?.schedule || {},
        enabled: body?.enabled !== false
      });
      return json(result, result?.ok === false ? (result?.needsConfirmation ? 409 : 400) : 200);
    }

    if (path === "/api/automations/list" && request.method === "POST") {
      const body = await bodyOf(request);
      const operatorId = await operatorFrom(body);
      if (!operatorId) return missingOperator();
      return json({ ok: true, automations: await listAutomations(env, operatorId) });
    }

    if (path === "/api/automations/toggle" && request.method === "POST") {
      const body = await bodyOf(request);
      const operatorId = await operatorFrom(body);
      if (!operatorId) return missingOperator();
      const result = await setAutomationEnabled(env, operatorId, body?.id, Boolean(body?.enabled));
      return json(result, result?.ok === false ? 404 : 200);
    }

    if (path === "/api/automations/delete" && request.method === "POST") {
      const body = await bodyOf(request);
      const operatorId = await operatorFrom(body);
      if (!operatorId) return missingOperator();
      const result = await deleteAutomation(env, operatorId, body?.id);
      return json(result, result?.ok === false ? 404 : 200);
    }

    if (path === "/api/automations/run" && request.method === "POST") {
      const body = await bodyOf(request);
      const operatorId = await operatorFrom(body);
      if (!operatorId) return missingOperator();
      const result = await runAutomationNow(env, operatorId, body?.id);
      return json(result, result?.ok === false ? 400 : 200);
    }

    if (path === "/api/orchestrator/start" && request.method === "POST") {
      const body = await bodyOf(request);
      const operatorId = await operatorFrom(body);
      if (!operatorId) return missingOperator();
      let telemetry = body?.telemetry || {};
      const latest = await getLatestTelemetry(env, operatorId);
      if (latest?.snapshot) telemetry = { ...latest.snapshot, ...telemetry, centralCapturedAt: latest.createdAt || null };
      const result = await startOrchestration(env, { operatorId, message: body?.message, telemetry });
      return json(result, result?.ok === false ? 400 : 200);
    }

    if (path === "/api/orchestrator/step" && request.method === "POST") {
      const body = await bodyOf(request);
      const operatorId = await operatorFrom(body);
      if (!operatorId) return missingOperator();
      const result = await recordOrchestrationStep(env, {
        operatorId,
        runId: body?.runId,
        stepKey: body?.stepKey,
        module: body?.module,
        status: body?.status,
        detail: body?.detail || {}
      });
      return json(result, result?.ok === false ? 400 : 200);
    }

    if (path === "/api/orchestrator/finish" && request.method === "POST") {
      const body = await bodyOf(request);
      const operatorId = await operatorFrom(body);
      if (!operatorId) return missingOperator();
      const result = await finishOrchestration(env, {
        operatorId,
        runId: body?.runId,
        status: body?.status,
        route: body?.route,
        result: body?.result || {}
      });
      return json(result, result?.ok === false ? 404 : 200);
    }

    if (path === "/api/orchestrator/history" && request.method === "POST") {
      const body = await bodyOf(request);
      const operatorId = await operatorFrom(body);
      if (!operatorId) return missingOperator();
      return json({ ok: true, runs: await recentOrchestrations(env, operatorId, body?.limit) });
    }

    if (path === "/api/orchestrator/run" && request.method === "POST") {
      const body = await bodyOf(request);
      const operatorId = await operatorFrom(body);
      if (!operatorId) return missingOperator();
      const run = await orchestrationRunDetail(env, operatorId, body?.runId);
      return json(run ? { ok: true, run } : { ok: false, error: "Execução não encontrada." }, run ? 200 : 404);
    }

    if (path === "/api/orchestrator/state" && request.method === "POST") {
      const body = await bodyOf(request);
      const operatorId = await operatorFrom(body);
      if (!operatorId) return missingOperator();
      return json(await unifiedState(env, operatorId));
    }

    if (path === "/api/ai" && request.method === "POST") return handleAi(request, env);

    return json({
      error: "Rota não encontrada.",
      backendVersion: BACKEND_VERSION,
      workerEntrypoint: WORKER_ENTRYPOINT
    }, 404);
  },

  async scheduled(controller, env, ctx) {
    ctx.waitUntil(processDueAutomations(env, { limit: 50 }));
    ctx.waitUntil(pollWeatherMonitor(env).catch(error=>console.warn("JARVIS weather monitor unavailable",String(error?.message||error))));
    ctx.waitUntil(pollPersonalWeatherWatches(env).catch(error=>console.warn("JARVIS personal weather watch failed",String(error?.message||error))));
  }
};
