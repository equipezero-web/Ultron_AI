import API_CONFIG from "../config.js";
import {selectWakeIntelligence,HISTORY_WINDOW_MS} from "../backend/world-intelligence-history.js";

// Intelligent, read-only daily situation digest: official weather + sourced news.
const BACKEND=String(API_CONFIG?.backendUrl||"").replace(/\/+$/,"");
const REFRESH_MS=10*60*1000;
const FALLBACK_URL="https://raw.githubusercontent.com/equipezero-web/Ultron_AI/main/data/world-briefing.json";
const HISTORY_URL="https://raw.githubusercontent.com/equipezero-web/Ultron_AI/main/data/world-intelligence-history.json";
const LAST_WAKE_KEY="ultron_intelligence_last_wake_at_v1";
const HISTORY_STALE_MS=2*60*60*1000;
const MAX_SNAPSHOT_AGE=2*60*60*1000;
const VOICE_PREF="ultron_world_briefing_auto_voice_v1";
const summaryLimit=5;
const root=document.querySelector(".jarvis-cc-console-terminal");
const output=document.getElementById("output-box");
let current=null,pending=null,lastRendered="",lastAwake=false;
let history=null,historyPending=null,historyLoadedAt=0,wakeBusy=false;
let wakeSummary=null,lastWakeAt=null;
try{lastWakeAt=localStorage.getItem(LAST_WAKE_KEY)||null;}catch{}
let lastWakeReadAt=0;
let autoVoice=true; // Default to a narrated wake briefing if browser audio is permitted.
try {autoVoice=localStorage.getItem(VOICE_PREF)!=="off";}catch{}
const fmtTime=new Intl.DateTimeFormat("pt-BR",{
  dateStyle:"short",timeStyle:"short",timeZone:"America/Recife"
});
const safeUrl=value=>{
  try {
    const url=new URL(value);
    return /^https?:$/.test(url.protocol)?url.href:null;
  }catch{return null;}
};
const formatDate=value=>{
  if(!value)return "horário não informado";
  const date=new Date(value);
  return Number.isFinite(date.getTime())?fmtTime.format(date):"horário não informado";
};
const short=text=>String(text??"").replace(/\s+/g," ").trim();
function elem(tag,cls,text){
  const node=document.createElement(tag);
  if(cls)node.className=cls;
  if(text!==undefined)node.textContent=text;
  return node;
}
function appendLink(parent,text,url){
  const safe=safeUrl(url);
  if(!safe){parent.append(elem("span","",text));return;}
  const anchor=elem("a","jarvis-intel-link",text);
  anchor.href=safe;anchor.target="_blank";anchor.rel="noopener noreferrer";
  parent.append(anchor);
}
function log(text){
  if(!output)return;
  const p=elem("p","jarvis-intel-terminal-line","> [INTEL] "+text);
  output.append(p);
  while(output.children.length>90)output.firstElementChild?.remove();
  output.scrollTop=output.scrollHeight;
}
function bulletinText(data){
  if(!data?.ok)return "Não foi possível confirmar o noticiário atualizado.";
  const lines=["Boletim de inteligência do Ultron. Dados consultados em "+formatDate(data.fetchedAt)+"."];
  for(const topic of data.topics||[]){
    const fresh=(topic.articles||[]).slice(0,topic.id==="brasil"?2:1);
    if(!fresh.length)continue;
    for(const story of fresh)lines.push("Título: "+story.title+". Descrição: "+(story.description||"A fonte confirmou esta manchete; resumo detalhado indisponível.")+".");
  }
  if(data.alerts?.checked && data.alerts.warnings?.length){
    const warning=data.alerts.warnings[0];
    lines.push("INMET: "+warning.title+", nível "+warning.severity+". Verifique a área e a validade do aviso no portal oficial.");
  }
  if(data.enso?.bulletin){
    const bulletin=data.enso.bulletin;
    lines.push("Boletim climático da NOAA: "+bulletin.status+
      (bulletin.issued?" publicado em "+bulletin.issued:"")+".");
  }
  if(!data.hasNews)lines.push("As fontes não confirmaram manchetes recentes nesta tentativa.");
  return lines.join(" ").slice(0,1150);
}
function speak(text,{automatic=false}={}){
  if(!text||!window.speechSynthesis||typeof window.SpeechSynthesisUtterance!=="function"){
    state.textContent="Narração indisponível neste navegador.";
    return false;
  }
  if(automatic&&!autoVoice)return false;
  if(automatic && document.body.classList.contains("jarvis-voice-paused"))return false;
  if(automatic && window.ULTRON_VOICE_OUTPUT?.speaking)return false;
  if(automatic && window.ULTRON_VOICE_INPUT?.state?.speaking)return false;
  try{
    window.speechSynthesis.cancel();
    const utterance=new SpeechSynthesisUtterance(text);
    utterance.lang="pt-BR";utterance.rate=1;utterance.pitch=.96;
    // Speech callbacks may arrive after a newer news refresh has started or
    // failed; they must never hide the more important data-fetch status.
    const preserveNewsStatus=()=>/^(Buscando notícias|Última consulta preservada)/.test(state.textContent||"");
    utterance.onstart=()=>{
      if(!preserveNewsStatus())state.textContent="Lendo relatório de inteligência em voz alta...";
      window.dispatchEvent(new CustomEvent("ultron:speech-start",{detail:{source:"intelligence-wake",text}}));
    };
    const speechEnded=()=>window.dispatchEvent(
      new CustomEvent("ultron:speech-end",{detail:{source:"intelligence-wake",text}})
    );
    utterance.onend=()=>{
      if(!preserveNewsStatus())state.textContent="Narração concluída";
      speechEnded();
    };
    utterance.onerror=()=>{
      if(!preserveNewsStatus())state.textContent="Áudio bloqueado. Use Ouvir para tentar novamente.";
      speechEnded();
    };
    window.speechSynthesis.speak(utterance);
    return true;
  }catch{
    state.textContent="Não foi possível iniciar a narração.";
    return false;
  }
}
const panel=elem("section","jarvis-intel-panel");
panel.setAttribute("aria-label","Boletim de inteligência automática Brasil e Mundo");
const heading=elem("div","jarvis-intel-heading");
const title=elem("strong","","◈ J.A.R.V.I.S // INTELIGÊNCIA EM TEMPO REAL");
const status=elem("span","jarvis-intel-status","AGUARDANDO FONTES");
heading.append(title,status);
const controls=elem("div","jarvis-intel-controls");
const updateButton=elem("button","","Atualizar");
updateButton.type="button";updateButton.title="Consultar notícias novamente";
const voiceButton=elem("button","","Ouvir");
voiceButton.type="button";voiceButton.title="Ouvir o resumo das fontes verificadas";
const autoButton=elem("button","",autoVoice?"Voz automática: ativada":"Voz automática: desligada");
autoButton.type="button";autoButton.setAttribute("aria-pressed",String(autoVoice));
controls.append(updateButton,voiceButton,autoButton);
const state=elem("div","jarvis-intel-message","Consultando Brasil, Santa Catarina, clima e mundo...");
const historyArea=elem("section","jarvis-intel-history");
historyArea.setAttribute("aria-label","Monitoramento contínuo das últimas 24 horas");
const historyTitle=elem("strong","jarvis-intel-history-title","MONITOR 24H · PREPARANDO HISTÓRICO");
const historyMeta=elem("p","jarvis-intel-history-meta",
  "Coleta agendada independente do navegador; aguardando registro das fontes.");
const historyList=elem("ul","jarvis-intel-history-list");
historyArea.append(historyTitle,historyMeta,historyList);
const storyArea=elem("div","jarvis-intel-topics");
const officialArea=elem("div","jarvis-intel-official");
const footer=elem("div","jarvis-intel-footer");
panel.append(heading,controls,state,historyArea,storyArea,officialArea,footer);
if(root)root.append(panel);
function render(data,{announce=false}={}){
  if(!root)return;
  storyArea.replaceChildren();officialArea.replaceChildren();footer.replaceChildren();
  if(!data?.ok){
    status.textContent="FONTES INDISPONÍVEIS";
    state.textContent="Não foi possível validar notícias agora. Nenhuma informação será inventada.";
    return;
  }
  const stamp=Date.parse(data.fetchedAt);
  const isOld=!Number.isFinite(stamp)||Date.now()-stamp>40*60*1000;
  status.textContent=(isOld?"DADOS ANTIGOS":data.delivery==="github-scheduled-snapshot"?"COLETA VERIFICADA":"CONSULTA CONCLUÍDA")+" · "+formatDate(data.fetchedAt);
  const count=(data.topics||[]).reduce((sum,t)=>sum+(t.articles?.length||0),0);
  state.textContent=count
    ? count+" notícias recentes com links e datas; fontes oficiais de clima abaixo."
    : "Nenhuma manchete recente confirmada nesta consulta.";
  for(const group of data.topics||[]){
    const section=elem("section","jarvis-intel-topic");
    section.append(elem("h4","",group.label||"Notícias"));
    const stories=group.articles||[];
    if(!stories.length)section.append(elem("p","jarvis-intel-empty","Sem notícia recente confirmada nesta categoria."));
    const list=elem("ul");
    for(const story of stories.slice(0,group.id==="brasil"?4:3)){
      const li=elem("li");
      appendLink(li,short(story.title),story.url);
      li.append(elem("span","jarvis-intel-meta"," — "+short(story.source)+" · "+formatDate(story.publishedAt)));
      list.append(li);
    }
    section.append(list);
    storyArea.append(section);
  }
  const officialTitle=elem("h4","","METEOROLOGIA E ALERTAS OFICIAIS");
  officialArea.append(officialTitle);
  if(data.alerts?.checked){
    if(data.alerts.warnings?.length){
      for(const alert of data.alerts.warnings.slice(0,4)){
        const line=elem("p");
        line.append(elem("span","jarvis-intel-weather","INMET · "+alert.severity+" · "+
          (alert.phase==="previsto"?"previsto":"aviso")+" — "+alert.title+
          (alert.regions?.length?" · UFs informadas: "+alert.regions.join(", "):" · confira a área afetada")+" "));
        appendLink(line,"Ver aviso",alert.url);
        officialArea.append(line);
      }
    }else{
      officialArea.append(elem("p","jarvis-intel-empty","INMET consultado; nenhum aviso exibido nesta resposta. Confira sempre o portal oficial."));
    }
  }else{
    officialArea.append(elem("p","jarvis-intel-empty","Não foi possível consultar os avisos do INMET nesta tentativa."));
  }
  if(data.enso?.bulletin){
    const ens=data.enso.bulletin;
    const p=elem("p");
    p.append(elem("span","","NOAA / ENOS: "+ens.status+
      (ens.issued?" · boletim de "+ens.issued:"")+" · "));
    appendLink(p,"Abrir diagnóstico oficial",ens.url);
    officialArea.append(p);
  }else{
    officialArea.append(elem("p","jarvis-intel-empty","Diagnóstico da NOAA indisponível nesta consulta."));
  }
  for(const entry of data.officialLinks||[]){
    const span=elem("span","jarvis-intel-official-link");
    appendLink(span,entry.label,entry.url);
    footer.append(span);
  }
  footer.append(elem("small","",
    "As informações dependem da atualização das fontes; não são uma cobertura contínua nem substituem avisos da Defesa Civil."));
  if(announce)log(count
    ? count+" manchetes recentes recuperadas. Prioridades: Brasil, Santa Catarina, clima e mundo."
    : "Consulta concluída, mas sem manchetes atuais confirmadas.");
  window.dispatchEvent(new CustomEvent("ultron:intelligence-visual-update",{
    detail:{briefing:data,history,waking:false}
  }));
}

function renderMonitor(summary,{waking=false,archiveValid=true}={}){
  historyList.replaceChildren();
  if(!summary){
    historyTitle.textContent="MONITOR 24H · SEM COLETA CONFIRMADA";
    historyMeta.textContent="O histórico do monitor não está acessível. O boletim ao vivo continuará disponível, quando possível.";
    return;
  }
  const lastCheck=summary.lastCheckAt?formatDate(summary.lastCheckAt):"indisponível";
  const fresh=archiveValid?"COLETAS RECENTES":"ÚLTIMA COLETA ANTIGA";
  historyTitle.textContent=(waking?"RELATÓRIO AO ACORDAR":"MONITOR 24H")+" · "+fresh;
  const period=summary.lastWakeAt
    ?"Desde sua última ativação ("+formatDate(summary.sinceAt)+")"
    :"Resumo da janela de 24 horas";
  historyMeta.textContent=period+" · "+summary.total24h+
    " notícias publicadas na janela · "+summary.unseenCount+
    " identificadas desde a última ativação · "+summary.checks24h+
    " consultas registradas · última: "+lastCheck+".";
  const stories=(summary.highlights||[]).length?
    summary.highlights:(summary.recentHighlights||[]);
  for(const item of stories.slice(0,10)){
    const li=elem("li");
    li.append(elem("span","jarvis-intel-category",
      ((item.category||"mundo").replaceAll("-"," ")).toUpperCase()+" · "));
    appendLink(li,short(item.title),item.url);
    li.append(elem("span","jarvis-intel-meta",
      " — "+short(item.source)+" · "+formatDate(item.publishedAt)));
    historyList.append(li);
  }
  if(!stories.length){
    historyList.append(elem("li","jarvis-intel-empty",
      "Ainda não há notícias publicadas nas últimas 24 horas confirmadas pelas fontes coletadas."));
  }
  if(summary.alertStatus==="recently-checked" && summary.alerts?.length){
    const relevant=summary.alerts[0],li=elem("li","jarvis-intel-history-alert");
    li.append(elem("strong","","INMET · "+relevant.severity+": "));
    li.append(elem("span","",relevant.title+" · "));
    appendLink(li,"ver regiões afetadas",relevant.url);
    historyList.prepend(li);
  }
  if(summary.enso?.status){
    const li=elem("li");
    li.append(elem("span","",
      "NOAA / ENSO: "+summary.enso.status+
      (summary.enso.issued?" · boletim publicado em "+summary.enso.issued:"")+" · "));
    appendLink(li,"diagnóstico oficial",summary.enso.url);
    historyList.append(li);
  }
  window.dispatchEvent(new CustomEvent("ultron:intelligence-visual-update",{
    detail:{briefing:current,history,summary,waking,archiveValid}
  }));
}
function wakingSpeech(summary,{archiveValid=true}={}){
  const lines=[
    "Ultron ativado. Este é o relatório das últimas vinte e quatro horas.",
    "Última coleta: "+formatDate(summary.lastCheckAt)+"."
  ];
  if(!archiveValid){
    lines.push("A coleta está desatualizada. Não posso garantir que os acontecimentos estejam atualizados.");
  }
  if(summary.unseenCount){
    lines.push("Identifiquei "+summary.unseenCount+" notícia ou notícias desde sua última ativação.");
  }else if(summary.lastWakeAt){
    lines.push("Não há novas manchetes confirmadas desde o seu último despertar. Estes são os destaques das últimas vinte e quatro horas.");
  }else{
    lines.push("Há "+summary.total24h+" notícias verificadas na janela das últimas vinte e quatro horas.");
  }
  const stories=(summary.highlights||[]).length?
    summary.highlights:(summary.recentHighlights||[]);
  for(const item of stories.slice(0,6)){
    lines.push("Título: "+item.title+". Descrição: "+((item.description||"A fonte confirmou esta manchete; resumo detalhado indisponível.").slice(0,500))+".");
  }
  if(summary.alertStatus==="recently-checked" && summary.alerts?.length){
    lines.push("Aviso do INMET: "+summary.alerts[0].title+"; severidade "+
      summary.alerts[0].severity+". Confira a área afetada no portal oficial.");
  }
  if(summary.enso?.status){
    lines.push("O último boletim encontrado da NOAA registra "+
      summary.enso.status+
      (summary.enso.issued?", publicação de "+summary.enso.issued:"")+".");
  }
  if(!stories.length)lines.push("Ainda não tenho manchetes recentes confirmadas para informar.");
  return lines.join(" ").slice(0,4400);
}
async function loadHistory({force=false}={}){
  if(historyPending)return historyPending;
  if(!force&&history&&Date.now()-historyLoadedAt<REFRESH_MS)return history;
  historyPending=(async()=>{
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),7000);
    try{
      const response=await fetch(HISTORY_URL+"?v="+Math.floor(Date.now()/60000),{
        cache:"no-store",signal:controller.signal,headers:{"Accept":"application/json"}
      });
      if(!response.ok)throw Error("Histórico HTTP "+response.status);
      const data=await response.json();
      if(data?.ok!==true||!Array.isArray(data.events)||!Array.isArray(data.checks))
        throw Error("Histórico inválido");
      history=data;
      historyLoadedAt=Date.now();
      const summary=selectWakeIntelligence(history,{lastWakeAt,now:Date.now(),limit:8});
      wakeSummary=summary;
      const age=Date.now()-Date.parse(history.updatedAt);
      renderMonitor(summary,{archiveValid:Number.isFinite(age)&&age<=HISTORY_STALE_MS});
      return history;
    }catch(error){
      if(!history)renderMonitor(null);
      log("Monitor 24h: "+short(error.message).slice(0,105));
      return history;
    }finally{
      clearTimeout(timer);
      historyPending=null;
    }
  })();
  return historyPending;
}
async function deepenWakeSummary(summary){
  const list=summary?.highlights?.length?summary.highlights:summary?.recentHighlights;
  if(!BACKEND||!Array.isArray(list)||!list.length)return summary;
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),6500);
  try{
    const selected=list.slice(0,6);
    const response=await fetch(BACKEND+"/api/news-details",{
      method:"POST",headers:{"Content-Type":"application/json"},cache:"no-store",signal:controller.signal,
      body:JSON.stringify({stories:selected.map(s=>({title:s.title,description:s.description||""}))})
    });
    if(!response.ok)return summary;
    const data=await response.json();
    if(!data?.ok||!Array.isArray(data.details))return summary;
    for(const detail of data.details){
      const item=selected[detail.index];
      if(!item||detail.title!==item.title.slice(0,240)||detail.status!=="detailed")continue;
      if(detail.description?.length>(item.description||"").length)item.description=detail.description;
      item.detailSources=detail.sources||[];
    }
  }catch{}finally{clearTimeout(timer);}
  return summary;
}
async function deliverWakeReport(){
  if(wakeBusy)return;
  wakeBusy=true;
  const priorWakeAt=lastWakeAt;
  const requestedAt=Date.now();
  try{
    const archive=await loadHistory({force:true});
    if(!archive){
      if(!current)await refresh({reason:"voice-wake"});
      historyTitle.textContent="RELATÓRIO AO ACORDAR · MONITOR INDISPONÍVEL";
      log("Ativado. Não foi possível consultar o histórico de 24 horas.");
      if(current)speak("Ultron ativado. O histórico das últimas vinte e quatro horas está indisponível. "+
        bulletinText(current),{automatic:true});
      return;
    }
    const age=Date.now()-Date.parse(archive.updatedAt);
    const valid=Number.isFinite(age)&&age>=-300000&&age<=HISTORY_STALE_MS;
    const summary=selectWakeIntelligence(archive,{
      lastWakeAt:priorWakeAt,now:Date.now(),limit:10
    });
    wakeSummary=summary;
    renderMonitor(summary,{waking:true,archiveValid:valid});
    log("ATIVADO · MONITOR 24H: "+summary.total24h+
      " acontecimentos arquivados, "+summary.unseenCount+
      " notícias desde o último despertar. Fontes até "+formatDate(archive.updatedAt)+".");
    // Show the initial verified headlines immediately; add source details
    // without requiring another question. Do not interrupt a newer command.
    const questionSequence=window.__ultronQuestionSequence||0;
    await deepenWakeSummary(summary);
    if((window.__ultronQuestionSequence||0)===questionSequence){
      wakeSummary=summary;
      renderMonitor(summary,{waking:true,archiveValid:valid});
      const narration=wakingSpeech(summary,{archiveValid:valid});
      speak(narration,{automatic:true});
    }
    if(valid){
      lastWakeAt=new Date(requestedAt).toISOString();
      try{localStorage.setItem(LAST_WAKE_KEY,lastWakeAt);}catch{}
    }else{
      log("Monitor 24h desatualizado; o marcador de última ativação foi preservado.");
    }
  }finally{
    wakeBusy=false;
  }
}

async function refresh({reason="manual",narrate=false}={}){
  if(pending)return pending;
  if(!BACKEND){
    render({ok:false});return null;
  }
  updateButton.disabled=true;
  state.textContent="Buscando notícias e avisos oficiais...";
  pending=(async()=>{
    try{
      let result;
      try {
        const controller=new AbortController();
        const timer=setTimeout(()=>controller.abort(),8500);
        try{
          const response=await fetch(BACKEND+"/api/briefing",{
            method:"GET",cache:"no-store",signal:controller.signal,headers:{"Accept":"application/json"}
          });
          if(!response.ok)throw new Error("Serviço HTTP "+response.status);
          result=await response.json();
          if(!result?.ok||!Array.isArray(result?.topics))throw new Error("Boletim inválido");
        }finally{clearTimeout(timer);}
      }catch(backendError){
        // Independent verified snapshot; keep news usable during Cloudflare API outages.
        const response=await fetch(FALLBACK_URL+"?v="+Math.floor(Date.now()/600000),{
          method:"GET",cache:"no-store",headers:{"Accept":"application/json"}
        });
        if(!response.ok)throw new Error("Backend indisponível e espelho HTTP "+response.status);
        result=await response.json();
        if(!result?.ok||result.delivery!=="github-scheduled-snapshot"||!Array.isArray(result.topics))
          throw new Error("Espelho de notícias ainda não foi atualizado.");
        const age=Date.now()-Date.parse(result.fetchedAt);
        if(!Number.isFinite(age)||age< -600000||age>MAX_SNAPSHOT_AGE)
          throw new Error("Espelho de notícias desatualizado; sem confirmação recente.");
        log("Backend temporariamente indisponível; usando coleta verificada do GitHub ("+formatDate(result.fetchedAt)+").");
      }
      const old=current;
      current=result;
      render(result,{announce:reason!=="periodic"});
      const before=new Set((old?.topics||[]).flatMap(t=>t.articles||[]).map(a=>a.url));
      const newly=(result.topics||[]).flatMap(t=>t.articles||[]).filter(a=>!before.has(a.url));
      lastRendered=result.fetchedAt;
      window.dispatchEvent(new CustomEvent("ultron:intelligence-update",{detail:{
        fetchedAt:result.fetchedAt,newStories:old?newly.length:0,
        urgentAlerts:result.alerts?.warnings?.length||0,partial:Boolean(result.partial)
      }}));
      if(reason==="periodic"&&old&&newly.length)log(newly.length+" nova(s) manchete(s) desde o último boletim.");
      if(narrate)speak(bulletinText(result),{automatic:true});
      return result;
    } catch(error){
      if(!current)render({ok:false});
      else state.textContent="Última consulta preservada; atualização falhou: "+short(error.message).slice(0,110);
      log("Falha na atualização: "+short(error.message).slice(0,110));
      return null;
    } finally{
      // Clear in-flight state before re-enabling the next manual refresh.
      // Otherwise a fast second click can reuse the completed promise.
      pending=null;
      updateButton.disabled=false;
    }
  })();
  return pending;
}
updateButton.addEventListener("click",()=>void refresh({reason:"manual"}));
voiceButton.addEventListener("click",()=>{
  if(wakeSummary) {
    const age=history?Date.now()-Date.parse(history.updatedAt):Infinity;
    speak(wakingSpeech(wakeSummary,{archiveValid:age<=HISTORY_STALE_MS}));
    return;
  }
  if(!current){state.textContent="Aguarde a consulta de fontes.";return;}
  speak(bulletinText(current));
});
autoButton.addEventListener("click",()=>{
  autoVoice=!autoVoice;
  try {localStorage.setItem(VOICE_PREF,autoVoice?"on":"off");}catch{}
  autoButton.textContent=autoVoice?"Voz automática: ativada":"Voz automática: desligada";
  autoButton.setAttribute("aria-pressed",String(autoVoice));
  state.textContent=autoVoice
    ? "O Ultron tentará narrar após ser ativado por voz. O navegador pode exigir liberação de áudio."
    : "O boletim continuará aparecendo automaticamente em texto.";
});
window.addEventListener("ultron:wake-state",event=>{
  const awake=Boolean(event?.detail?.awake);
  if(awake&&!lastAwake&&Date.now()-lastWakeReadAt>12000){
    lastWakeReadAt=Date.now();
    // The 24h collector kept working while the phone was asleep.
    // Summarize facts confirmed since the last wake instead of repeating today's snapshot.
    void deliverWakeReport();
  }
  lastAwake=awake;
});
document.addEventListener("visibilitychange",()=>{
  if(document.hidden)return;
  if(!current||Date.now()-Date.parse(current.fetchedAt)>REFRESH_MS)void refresh({reason:"periodic"});
  void loadHistory();
});
window.setInterval(()=>{
  if(document.hidden||navigator.onLine===false)return;
  if(!current||Date.now()-Date.parse(current.fetchedAt)>=REFRESH_MS)void refresh({reason:"periodic"});
  void loadHistory();
},REFRESH_MS);
window.ULTRON_INTELLIGENCE={
  refresh,
  loadHistory,
  deliverWakeReport,
  get visualData(){return {
    briefing:current,history,summary:wakeSummary,
    archiveValid:history ? (Date.now()-Date.parse(history.updatedAt)<HISTORY_STALE_MS) : false
  };},
  get state(){return {
    active:true,loading:Boolean(pending),updatedAt:current?.fetchedAt||null,
    totalStories:(current?.topics||[]).reduce((n,t)=>n+(t.articles?.length||0),0),
    autoVoice,lastRendered,
    monitor24h:{available:Boolean(history),lastCheckAt:history?.updatedAt||null,
      checks:history?.checks?.length||0,events:history?.events?.length||0,
      lastWakeAt,unseen:wakeSummary?.unseenCount||0,wakeBusy}
  };}
};
if(root){
  log("Monitor de 24 horas conectado. Carregando o histórico e o boletim atual...");
  void loadHistory();
  void refresh({reason:"startup"});
}
