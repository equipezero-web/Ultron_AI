import API_CONFIG from "../config.js";

const BACKEND=String(API_CONFIG?.backendUrl||"").replace(/\/+$/,"");
const ENDPOINT="/api/account/session/verify";
const safeError=(v,max=100)=>String(v??"")
  .replace(/[^a-zA-Z0-9_.:-]/g," ").trim().slice(0,max);

/**
 * HTTPS top-level navigation endpoint for a user-initiated Access sign-in.
 * No session data or JWT is ever read, stored or added to query parameters.
 */
export function jarvisAccessLoginUrl(backendUrl=BACKEND){
  try{
    const base=new URL(backendUrl);
    if(base.protocol!=="https:"||
       base.hostname!=="ultron-backend.lucaalves17-20.workers.dev"||
       base.username||base.password||base.search||base.hash||
       base.pathname!=="/"||base.port)return null;
    return new URL(ENDPOINT,base.origin).href;
  }catch{return null;}
}

export function parseJarvisOperationalSelfTest(message){
  if(typeof message!=="string"||message.length>170)return null;
  const normalized=message.normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .toLowerCase().replace(/^(?:jarvis|ultron)[, :]+/,"")
    .replace(/[.!?]+$/,"").trim().replace(/\s+/g," ");
  return /^(?:testar|teste|verificar|verifique)\s+(?:(?:o|meu)\s+)?globo\s+e\s+(?:(?:o|meu)\s+)?(?:acesso|cloudflare access)$/.test(normalized)
    ?{kind:"globe-and-access-selftest"}:null;
}
function globeReady(state){
  return state?.ready===true&&state.visible===true&&
    ["globe-3d","mapbox-globe"].includes(state.mode)&&
    Number.isFinite(state.view?.lat)&&Number.isFinite(state.view?.lng)&&
    Number.isFinite(state.view?.altitude);
}
export async function testJarvisGlobe({browser=globalThis.window,isCancelled=()=>false}={}){
  const earth=browser?.ULTRON_EARTH;
  if(typeof earth?.open!=="function"||!earth.state?.available)
    return {ok:false,status:"unavailable",detail:"Motor do globo não registrado nesta sessão"};
  const alreadyVisible=earth.state.visible===true;
  let result;
  try{result=await earth.open();}
  catch{return {ok:false,status:"failed",detail:"Falha ao abrir o globo"};}
  if(isCancelled()){
    if(!alreadyVisible)earth.close?.();
    return {ok:false,status:"cancelled",detail:"Teste do globo interrompido"};
  }
  const state=earth.state;
  if(result?.ok!==true||!globeReady(state))
    return {ok:false,status:"failed",detail:"O globo não confirmou abertura e câmera pronta"};
  const canvas=browser?.document?.querySelector?.(
    state.mode==="mapbox-globe"?
      ".jarvis-earth-reference-map .mapboxgl-canvas":
      ".jarvis-earth-renderer canvas"
  );
  const box=canvas?.getBoundingClientRect?.();
  const visibleCanvas=Boolean(canvas?.isConnected&&canvas.width>0&&canvas.height>0&&
    box?.width>=90&&box?.height>=90);
  if(!visibleCanvas)
    return {ok:false,status:"partial",
      detail:"Motor e câmera prontos, mas canvas visível não foi confirmado"};
  return {ok:true,status:"observed",mode:state.mode,
    detail:"Globo aberto; câmera e canvas visível confirmados nesta sessão. Pixels e interação por toque ainda não homologados"};
}
/**
 * After a failed credentialed request, verify only the public health endpoint.
 * This diagnoses policy deployment without reading cookies, JWTs or identity.
 * It cannot observe the actual edge login response hidden by browser CORS.
 */
export async function diagnoseJarvisAccessTransport({
  fetchImpl=globalThis.fetch,backendUrl=BACKEND,isCancelled=()=>false
}={}){
  if(isCancelled())return {status:"cancelled",detail:"Teste interrompido"};
  let health;
  try{
    const url=new URL(backendUrl+"/api/health");
    if(url.protocol!=="https:"||url.hostname!=="ultron-backend.lucaalves17-20.workers.dev")
      return {status:"not-confirmed",detail:"Origem do backend não autorizada"};
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),4500);
    try{
      const response=await fetchImpl(url.href,{
        method:"GET",credentials:"omit",mode:"cors",redirect:"error",cache:"no-store",
        headers:{"Accept":"application/json"},signal:controller.signal
      });
      if(isCancelled())return {status:"cancelled",detail:"Teste interrompido"};
      if(response.status!==200)
        return {status:"not-confirmed",
          detail:"A rota pública do Worker não respondeu normalmente nesta sessão"};
      const raw=await response.text();
      if(raw.length>65536)return {status:"not-confirmed",
        detail:"Resposta pública do Worker fora do limite"};
      health=JSON.parse(raw);
    }finally{clearTimeout(timer);}
  }catch{
    return {status:"not-confirmed",
      detail:"Também não foi possível consultar a saúde pública do Worker; rede ou CORS não confirmados"};
  }
  if(health?.status!=="online"||health?.workerEntrypoint!=="worker.js")
    return {status:"not-confirmed",detail:"Contrato de saúde do Worker não confirmado"};
  if(health?.accountPlugins?.configured!==true)
    return {status:"access-not-configured",
      detail:"Worker público está ativo, mas a configuração de Cloudflare Access está incompleta"};
  if(health.accountPlugins.uiOriginAllowed===false)
    return {status:"origin-not-allowed",
      detail:"Worker está ativo, mas JARVIS_ACCOUNT_UI_ORIGIN não autoriza https://equipezero-web.github.io"};
  if(health.accountPlugins.uiOriginAllowed===true)
    return {status:"access-or-cookie-blocked",
      detail:"Worker responde e origem está autorizada no backend; verificar login no domínio protegido, configuração CORS do Access e cookies entre github.io e workers.dev"};
  return {status:"access-configuration-unverified",
    detail:"Worker está ativo, mas a versão publicada não informa se a origem do GitHub Pages está autorizada"};
}

export async function testJarvisAccess({
  fetchImpl=globalThis.fetch,backendUrl=BACKEND,isCancelled=()=>false
}={}){
  let url;
  try{
    url=new URL(backendUrl+ENDPOINT);
    if(url.protocol!=="https:"||url.hostname!=="ultron-backend.lucaalves17-20.workers.dev")
      throw Error("host-not-allowed");
  }catch{return {ok:false,status:"not-confirmed",detail:"Origem do backend não autorizada"};}
  if(typeof fetchImpl!=="function")return {ok:false,status:"not-confirmed",detail:"Rede indisponível"};
  if(isCancelled())return {ok:false,status:"cancelled",detail:"Teste interrompido"};
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),8000);
  try{
    // Cookies stay in the browser's network layer and are never read by JS.
    // Only Cloudflare Access can inject a signed Cf-Access-Jwt-Assertion to Worker.
    const res=await fetchImpl(url.href,{
      method:"GET",credentials:"include",mode:"cors",cache:"no-store",
      redirect:"error",headers:{"Accept":"application/json"},signal:controller.signal
    });
    if(isCancelled())return {ok:false,status:"cancelled",detail:"Teste interrompido"};
    if(res.status===401)return {ok:false,status:"login-required",
      detail:"JWT de sessão não recebido ou não autorizado. É necessário entrar pelo Cloudflare Access"};
    if(res.status===503)return {ok:false,status:"unavailable",
      detail:"Cloudflare Access ou verificação de assinatura não disponível"};
    if(res.status===403)return {ok:false,status:"forbidden",
      detail:"Origem ou conta não autorizada pela configuração do Access"};
    if(res.status!==200)return {ok:false,status:"not-confirmed",
      detail:"Verificação de sessão não confirmada (HTTP "+Number(res.status)+")"};
    const raw=await res.text();
    if(raw.length>2000)return {ok:false,status:"not-confirmed",
      detail:"Resposta de autenticação com tamanho inválido"};
    let body;
    try{body=JSON.parse(raw);}catch{return {ok:false,status:"not-confirmed",detail:"Resposta de autenticação inválida"};}
    const accepted=body?.ok===true&&body.authenticated===true&&
      body.verifiedBy==="cloudflare-access-jwt"&&
      body.sessionScope==="read-only"&&body.voiceEnabled===false;
    return accepted?{ok:true,status:"observed",
      detail:"JWT Cloudflare Access validado pelo Worker, sem divulgar credenciais ou dados da conta"}:
      {ok:false,status:"not-confirmed",detail:"Contrato da sessão não validado"};
  }catch(error){
    if(isCancelled())return {ok:false,status:"cancelled",detail:"Teste interrompido"};
    const transport=await diagnoseJarvisAccessTransport({fetchImpl,backendUrl,isCancelled});
    if(transport.status==="cancelled")
      return {ok:false,status:"cancelled",detail:"Teste interrompido"};
    return {ok:false,status:transport.status,
      detail:(error?.name==="AbortError"?"A rota privada excedeu o tempo limite. ":"")+
        transport.detail};
  }finally{clearTimeout(timer);}
}
export async function runJarvisOperationalSelfTest({
  browser=globalThis.window,fetchImpl=globalThis.fetch,
  showAnswer,isCancelled=()=>false,backendUrl=BACKEND
}={}){
  if(isCancelled())return {ok:false,status:"cancelled",route:"operational-selftest"};
  // The operator explicitly requested to open the globe and test session.
  const [globe,access]=await Promise.all([
    testJarvisGlobe({browser,isCancelled}),
    testJarvisAccess({fetchImpl,backendUrl,isCancelled})
  ]);
  if(isCancelled())return {ok:false,status:"cancelled",route:"operational-selftest"};
  const text="J.A.R.V.I.S. // TESTE OPERACIONAL SOLICITADO\n"+
    (globe.ok?"CONFIRMADO":"NÃO CONFIRMADO")+" · Globo: "+globe.detail+"\n"+
    (access.ok?"CONFIRMADO":"NÃO CONFIRMADO")+" · Cloudflare Access: "+access.detail+"\n"+
    "Resultado: "+(Number(globe.ok)+Number(access.ok))+"/2 testes pontuais confirmados.\n"+
    "Isto NÃO concede homologação das 60 capacidades. "+
    "Globo com interação real, D1, telefone/TV e execução do agente autenticado ainda exigem testes próprios.\n"+
    "Voz, escuta e Voice Match permanecem desligados.";
  // A CORS/Access failure requires a login *navigation*, not an automated
  // credential bypass. Only emit a UI action; never open another tab here.
  const signinSuggested=!access.ok&&
    ["login-required","access-or-cookie-blocked",
      "access-configuration-unverified"].includes(access.status);
  if(signinSuggested&&!isCancelled()&&jarvisAccessLoginUrl(backendUrl)&&
     typeof globalThis.CustomEvent==="function"){
    try{
      browser?.dispatchEvent?.(new CustomEvent("jarvis:access-signin-required",{
        detail:{status:access.status}
      }));
    }catch{/* An unavailable UI must not change the result of the test. */}
  }
  let displayed=false;
  // Avoid closing/replacing the globe merely to show a text message.
  if(!globe.ok){
    try{
      const fn=showAnswer||browser?.ULTRON_NEURAL_ANSWER?.show;
      if(typeof fn==="function"){fn(text);displayed=true;}
    }catch{}
  }
  return {ok:globe.ok&&access.ok,partial:globe.ok!==access.ok,
    route:"operational-selftest",globe,access,text,displayed,
    certifiedCapabilitiesIncrement:0,voiceEnabled:false};
}
