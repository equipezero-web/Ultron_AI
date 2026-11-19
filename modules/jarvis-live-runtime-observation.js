import API_CONFIG from "../config.js";

const BACKEND=String(API_CONFIG?.backendUrl||"").replace(/\/+$/,"");
const SITE="https://equipezero-web.github.io";
const clamp=(value,max=140)=>String(value??"").replace(/[\r\n<>]/g," ").trim().slice(0,max);
function status(label,state,description) {
  return {label,state,description:clamp(description,180)};
}

/**
 * Read-only live indicators from the operator's current browser session.
 *
 * These checks are NOT certification of one of the 60 capabilities. In
 * particular, an initialized map module does not prove a rendered WebGL
 * scene; a healthy Worker does not prove authenticated Cloudflare Access.
 */
export async function observeJarvisRuntime({
  fetchImpl=globalThis.fetch,
  browser=globalThis.window,
  backendUrl=BACKEND,
  timeoutMs=5000,
  now=()=>new Date().toISOString()
}={}) {
  const observedAt=now();
  const origin=browser?.location?.origin||"";
  const pathname=browser?.location?.pathname||"";
  const officialSite=origin===SITE&&pathname.startsWith("/Ultron_AI/");
  const checks=[
    status("Site publicado",officialSite?"observed":"not-confirmed",
      officialSite?"Página carregada no endereço oficial do GitHub Pages":
        "Sessão local, prévia ou origem não confirmada; publicação não certificada"),
    status("Neural Ring",typeof browser?.ULTRON_NEURAL_ANSWER?.show==="function"?
      "observed":"not-confirmed",
      typeof browser?.ULTRON_NEURAL_ANSWER?.show==="function"?
        "API de respostas disponível nesta sessão; exibição real não testada":
        "API de respostas ainda não identificada nesta sessão"),
    status("Globo 3D",browser?.ULTRON_EARTH?.state?.ready===true?
      "observed":"not-confirmed",
      browser?.ULTRON_EARTH?.state?.ready===true?
        "Motor inicializado; interação e renderização física não homologadas":
        "Motor do globo não confirmado nesta sessão"),
    status("Voz e escuta",browser?.JARVIS_AUDIO_POLICY?.enabled===false&&
      browser?.JARVIS_AUDIO_POLICY?.mode==="text-only"?"observed":"not-confirmed",
      browser?.JARVIS_AUDIO_POLICY?.enabled===false&&
      browser?.JARVIS_AUDIO_POLICY?.mode==="text-only"?
        "Política de manutenção em texto confirmada no navegador":
        "Política de manutenção não confirmada no navegador")
  ];
  let worker=status("Backend Cloudflare","not-confirmed","Nenhuma resposta verificável recebida");
  let access=status("Cloudflare Access","not-tested","Login autenticado não testado");
  // Public health only. Never send tokens, cookies, account IDs or device keys.
  try {
    const url=new URL(backendUrl+"/api/health");
    if(url.protocol!=="https:"||url.hostname!=="ultron-backend.lucaalves17-20.workers.dev")
      throw Error("backend-url-untrusted");
    if(typeof fetchImpl!=="function")throw Error("fetch-unavailable");
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),Math.max(1000,Math.min(8000,Number(timeoutMs)||5000)));
    try {
      const response=await fetchImpl(url.href,{
        method:"GET",mode:"cors",credentials:"omit",redirect:"error",cache:"no-store",
        headers:{"Accept":"application/json"},signal:controller.signal
      });
      if(response.status!==200)throw Error("http-"+response.status);
      const raw=await response.text();
      if(raw.length>65536)throw Error("health-payload-too-large");
      const data=JSON.parse(raw);
      const healthy=data.status==="online"&&
        data.workerEntrypoint==="worker.js"&&data.singleEntrypoint===true&&
        data.legacyWorkerChain===false&&data.voiceOutputEnabled===false&&
        data.voiceMaintenance?.mode==="text-only"&&
        data.voiceMaintenance?.inputEnabled===false&&
        data.voiceMaintenance?.remoteMicEnabled===false;
      worker=status("Backend Cloudflare",healthy?"observed":"not-confirmed",
        healthy?"Saúde e modo sem voz confirmados por resposta pública do Worker":
          "Resposta recebida, mas contrato do backend ou manutenção divergente");
      access=status("Cloudflare Access",data.accountPlugins?.configured===true?
        "configured-unverified":"not-confirmed",
        data.accountPlugins?.configured===true?
          "Configuração anunciada pelo Worker; login e comando autenticado não testados":
          "Configuração não anunciada ou indisponível; login não testado");
    } finally { clearTimeout(timeout); }
  } catch(error) {
    const name=error?.name==="AbortError"?"tempo excedido":"rede, CORS ou serviço indisponível";
    worker=status("Backend Cloudflare","not-confirmed",
      "Não foi possível verificar o serviço público ("+name+")");
    access=status("Cloudflare Access","not-tested","Login autenticado não testado");
  }
  checks.push(worker,access);
  // Explicitly excluded: D1 data, credentials, physical Android, TV, webcam,
  // microphone, actual 2D/3D rendering, and private actions.
  const observed=checks.filter(c=>c.state==="observed").length;
  const lines=[
    "DIAGNÓSTICO OPERACIONAL DESTA SESSÃO // NÃO É HOMOLOGAÇÃO",
    ...checks.map(c=>(c.state==="observed"?"CONFIRMADO":
      c.state==="configured-unverified"?"CONFIGURADO, NÃO TESTADO":"NÃO CONFIRMADO")+
      " · "+c.label+": "+c.description),
    "Comprovados nesta sessão: "+observed+"/"+checks.length+" sinais básicos, NÃO capacidades homologadas.",
    "Não testados: autenticação real, comandos privados, mapa renderizado, D1, Android, PC e TV físicos.",
    "A classificação de 60 capacidades só muda após evidências auditadas no inventário."
  ];
  return {observedAt,checks,observed,total:checks.length,
    certificationCountIncrement:0,text:lines.join("\n")};
}
