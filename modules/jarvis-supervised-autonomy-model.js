// Phase XIV: fixed, read-only action sequences. Free-form prompts never become executable plans.
const norm=s=>String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/^(?:jarvis|ultron)[, :.-]+/,"").replace(/[.!?]+$/,"").trim();
export function parseSupervisedCommand(raw){
 const s=norm(raw);
 if(/^(?:planeje|planejar|prepare|preparar) (?:uma |um )?(?:analise|resumo|apresentacao) (?:das |de |dos )?(?:noticias|acontecimentos|destaques)(?: do mundo)?$/.test(s))
  return {type:"plan",kind:"briefing"};
 if(/^(?:planeje|planejar|prepare|preparar) (?:uma |um )?(?:exploracao|analise|apresentacao) (?:do |de |dos )?(?:evento selecionado|evento atual|destaque selecionado)(?: no mapa)?$/.test(s))
  return {type:"plan",kind:"event"};
 if(/^(?:autorizar plano|autorize o plano|executar plano|execute o plano|confirmar plano)$/.test(s))return {type:"approve"};
 if(/^(?:cancelar plano|cancele o plano|descartar plano|descarte o plano)$/.test(s))return {type:"cancel"};
 if(/^(?:status do plano|estado do plano|status da autonomia supervisionada)$/.test(s))return {type:"status"};
 return null;
}
export function buildSupervisedPlan(kind,{current=null,now=Date.now()}={}){
 if(!Number.isFinite(now))return {ok:false,reason:"INVALID_CLOCK"};
 const base={createdAt:new Date(now).toISOString(),expiresAt:new Date(now+120000).toISOString()};
 if(kind==="briefing")return {ok:true,...base,kind,label:"Panorama visual de notícias",
  steps:[{id:"priorities",scene:"priorities",label:"Exibir prioridades verificadas"},
   {id:"news",scene:"news",label:"Apresentar notícias e imagens disponíveis"}]};
 if(kind==="event"){
  if(current?.ok!==true||!current.eventKey||!/^([a-z]:)[a-zA-Z0-9_.:-]{1,180}$/.test(current.eventKey))
   return {ok:false,reason:"NO_VERIFIED_SELECTED_EVENT"};
  return {ok:true,...base,kind,eventKey:current.eventKey,
   sourceUrl:current.url||null,label:"Exploração do evento selecionado",
   steps:[{id:"map",scene:"map",label:"Exibir ponto comprovado em 2D"},
    {id:"tour",scene:"tour",label:"Explorar o mesmo evento em 3D, se disponível"}]};
 }
 return {ok:false,reason:"UNSUPPORTED_PLAN"};
}
export function checkSupervisedPlan(plan,{now=Date.now(),current=null}={}){
 if(!plan?.ok||!Array.isArray(plan.steps)||plan.steps.length<1||plan.steps.length>3)return {ok:false,reason:"INVALID_PLAN"};
 if(!Number.isFinite(now)||Date.parse(plan.expiresAt)<=now)return {ok:false,reason:"PLAN_EXPIRED"};
 if(plan.kind==="event"&&(current?.ok!==true||current.eventKey!==plan.eventKey||current.url!==plan.sourceUrl))
  return {ok:false,reason:"EVENT_CHANGED"};
 return {ok:true};
}
