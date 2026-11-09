import API_CONFIG from "../config.js";

// Intelligent, read-only daily situation digest: official weather + sourced news.
const BACKEND=String(API_CONFIG?.backendUrl||"").replace(/\/+$/,"");
const REFRESH_MS=10*60*1000;
const FALLBACK_URL="https://raw.githubusercontent.com/equipezero-web/Ultron_AI/main/data/world-briefing.json";
const MAX_SNAPSHOT_AGE=2*60*60*1000;
const VOICE_PREF="ultron_world_briefing_auto_voice_v1";
const summaryLimit=5;
const root=document.querySelector(".jarvis-cc-console-terminal");
const output=document.getElementById("output-box");
let current=null,pending=null,lastRendered="",lastAwake=false;
let lastWakeReadAt=0;
let autoVoice=false;
try {autoVoice=localStorage.getItem(VOICE_PREF)==="on";}catch{}
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
    lines.push(topic.label+": "+fresh.map(story=>story.title).join(". ")+".");
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
    utterance.onstart=()=>{state.textContent="Lendo boletim em voz alta...";};
    utterance.onend=()=>{state.textContent="Narração concluída";};
    utterance.onerror=()=>{state.textContent="Áudio bloqueado ou indisponível. Use o botão Ouvir novamente.";};
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
const storyArea=elem("div","jarvis-intel-topics");
const officialArea=elem("div","jarvis-intel-official");
const footer=elem("div","jarvis-intel-footer");
panel.append(heading,controls,state,storyArea,officialArea,footer);
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
      updateButton.disabled=false;
      pending=null;
    }
  })();
  return pending;
}
updateButton.addEventListener("click",()=>void refresh({reason:"manual"}));
voiceButton.addEventListener("click",()=>{
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
    // The user explicitly activated the assistant. Use cached results if already fresh.
    const oldEnough=!current||Date.now()-Date.parse(current.fetchedAt)>REFRESH_MS;
    if(oldEnough){
      void refresh({reason:"voice-wake",narrate:true});
    } else {
      log("Ativado. Boletim de Brasil e mundo disponível; fontes consultadas em "+formatDate(current.fetchedAt)+".");
      speak(bulletinText(current),{automatic:true});
    }
  }
  lastAwake=awake;
});
document.addEventListener("visibilitychange",()=>{
  if(document.hidden)return;
  if(!current||Date.now()-Date.parse(current.fetchedAt)>REFRESH_MS)void refresh({reason:"periodic"});
});
window.setInterval(()=>{
  if(document.hidden||navigator.onLine===false)return;
  if(!current||Date.now()-Date.parse(current.fetchedAt)>=REFRESH_MS)void refresh({reason:"periodic"});
},REFRESH_MS);
window.ULTRON_INTELLIGENCE={
  refresh,
  get state(){return {
    active:true,loading:Boolean(pending),updatedAt:current?.fetchedAt||null,
    totalStories:(current?.topics||[]).reduce((n,t)=>n+(t.articles?.length||0),0),
    autoVoice,lastRendered
  };}
};
if(root){log("Inicialização concluída. Buscando boletim de Brasil e mundo...");void refresh({reason:"startup"});}
