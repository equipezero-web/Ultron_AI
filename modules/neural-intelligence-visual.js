/**
 * Neural Ring Intelligence HUD v1.
 * Visual layer over the existing 3D command stage — does not replace,
 * capture, or stop the WebGL/Mapbox engine.
 * Data comes only from validated, source-attributed collector results.
 */
const stage=document.querySelector(".jarvis-cc-center");
const visual=document.querySelector(".jarvis-cc-visual");
const intl=window.ULTRON_INTELLIGENCE;
if(stage&&visual&&intl){
  const CYCLE_MS=12500,MAX_NEWS=8,MAX_AGE=24*60*60*1000;
  let entries=[],selected=0,expanded=false,paused=false,lastRenderAt=0,lastSwitch=Date.now(),waking=false;
  let alert=null,archiveAt=null,valid=false;
  const priority=["brasil","santa-catarina","clima","mundo","america-latina","oriente-medio","europa","asia","africa","oceania"];
  const categoryNames={
    brasil:"BRASIL","santa-catarina":"SANTA CATARINA",clima:"CLIMA",
    mundo:"MUNDO","america-latina":"AMÉRICA LATINA",
    "oriente-medio":"ORIENTE MÉDIO",europa:"EUROPA",asia:"ÁSIA",
    africa:"ÁFRICA",oceania:"OCEANIA"
  };
  const norm=text=>String(text||"").replace(/\s+/g," ").trim();
  const parsedTime=text=>{const t=Date.parse(text||"");return Number.isFinite(t)?t:null;};
  function cleanUrl(value){
    try{
      if(typeof value!=="string"||value.length>1800)return null;
      const url=new URL(value);
      if(!["https:","http:"].includes(url.protocol)||url.username||url.password)return null;
      if(/^(localhost|\d+\.\d+\.\d+\.\d+|\[.+\])$/i.test(url.hostname))return null;
      return url.href;
    }catch{return null;}
  }
  const dateText=value=>{
    const time=parsedTime(value);
    if(time===null)return "horário não confirmado";
    return new Intl.DateTimeFormat("pt-BR",{
      day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit",
      timeZone:"America/Recife"
    }).format(new Date(time));
  };
  const add=(parent,tag,cls,text)=>{
    const element=document.createElement(tag);
    if(cls)element.className=cls;
    if(text!==undefined)element.textContent=text;
    parent.append(element);
    return element;
  };
  function itemFromArticle(article,category){
    if(!article||!cleanUrl(article.url))return null;
    const time=parsedTime(article.publishedAt);
    if(time===null||time>Date.now()+300000||Date.now()-time>MAX_AGE)return null;
    const title=norm(article.title).slice(0,200);
    if(!title)return null;
    return {
      id:article.id||cleanUrl(article.url),category,
      title,source:norm(article.source||"Fonte verificada").slice(0,75),
      url:cleanUrl(article.url),imageUrl:cleanUrl(article.imageUrl||article.image||""),
      publishedAt:article.publishedAt,
      kind:"article"
    };
  }
  function storySet(payload){
    const archive=payload.history||null;
    const summary=payload.summary||null;
    const recent=(summary?.recentHighlights?.length?
      summary.recentHighlights:archive?.events||[]);
    const fromHistory=recent.map(article=>itemFromArticle(article,article.category)).filter(Boolean);
    const fromBriefing=(payload.briefing?.topics||[]).flatMap(
      group=>(group.articles||[]).map(article=>itemFromArticle(article,group.id))
    ).filter(Boolean);
    // During wake, highlight articles first observed after last wake, then recent.
    const wakeSet=(payload.waking&&(summary?.highlights||[]).length)?
      summary.highlights.map(article=>itemFromArticle(article,article.category)).filter(Boolean):[];
    const seen=new Set(),unique=[];
    for(const item of [...wakeSet,...fromHistory,...fromBriefing]){
      const key=item.url.split("?")[0].toLowerCase();
      if(seen.has(key))continue;
      seen.add(key);
      unique.push(item);
    }
    if(wakeSet.length){
      return [...wakeSet,...unique.filter(i=>!wakeSet.some(w=>w.url===i.url))].slice(0,MAX_NEWS);
    }
    // One highlight per category first, avoiding a whole queue of the same source.
    const ranked=[];
    for(const category of priority){
      const one=unique.find(x=>x.category===category&&!ranked.includes(x));
      if(one)ranked.push(one);
    }
    return [...ranked,...unique.filter(x=>!ranked.includes(x))
      .sort((a,b)=>parsedTime(b.publishedAt)-parsedTime(a.publishedAt))].slice(0,MAX_NEWS);
  }
  function currentAlert(payload){
    const source=payload.history?.latest?.alerts;
    const age=Date.now()-parsedTime(source?.checkedAt);
    const canUse=Boolean(source?.checked&&Number.isFinite(age)&&age>=-300000&&age<=2*60*60*1000);
    const raw=canUse?source.warnings||[]:
      payload.briefing?.alerts?.checked?payload.briefing.alerts.warnings||[]:[];
    return raw.find(w=>/perigo/i.test(String(w.severity||""))&&
      (!w.endsAt||parsedTime(w.endsAt)===null||parsedTime(w.endsAt)>Date.now()))||null;
  }
  const panel=add(stage,"section","jarvis-neural-news");
  panel.id="jarvis-neural-news";
  panel.setAttribute("aria-label","Central visual de notícias e imagens do Neural Ring");
  panel.setAttribute("role","region");
  const header=add(panel,"header","jarvis-neural-news-header");
  add(header,"span","jarvis-neural-news-brand","◈ ULTRON / INTELLIGENCE");
  const status=add(header,"span","jarvis-neural-news-status","MONITOR 24H");
  const collapse=add(header,"button","jarvis-neural-news-collapse","−");
  collapse.type="button";collapse.setAttribute("aria-label","Recolher notícias");
  collapse.title="Recolher ou expandir notícias";
  const inside=add(panel,"div","jarvis-neural-news-body");
  const alertLine=add(inside,"div","jarvis-neural-news-alert");
  alertLine.hidden=true;
  const hero=add(inside,"article","jarvis-neural-news-hero");
  const imageBox=add(hero,"div","jarvis-neural-news-art");
  const image=add(imageBox,"img","jarvis-neural-news-photo");
  image.alt="";image.loading="lazy";image.decoding="async";image.referrerPolicy="no-referrer";
  const pictureFallback=add(imageBox,"div","jarvis-neural-news-photo-fallback");
  add(pictureFallback,"span","jarvis-neural-news-photo-symbol","◈");
  const photoText=add(pictureFallback,"span","jarvis-neural-news-photo-label","SEM IMAGEM DA FONTE");
  const articleInfo=add(hero,"div","jarvis-neural-news-content");
  const category=add(articleInfo,"div","jarvis-neural-news-category","BRASIL");
  const headline=add(articleInfo,"h3","jarvis-neural-news-title","Aguardando notícias verificadas...");
  const source=add(articleInfo,"p","jarvis-neural-news-source","");
  const actions=add(articleInfo,"div","jarvis-neural-news-actions");
  const detail=add(actions,"button","jarvis-neural-news-detail","Detalhes");
  detail.type="button";detail.setAttribute("aria-expanded","false");
  const link=add(actions,"a","jarvis-neural-news-link","Fonte original");
  link.target="_blank";link.rel="noopener noreferrer";
  const context=add(inside,"p","jarvis-neural-news-context");
  context.hidden=true;
  const related=add(inside,"div","jarvis-neural-news-related");
  related.setAttribute("aria-label","Outras notícias do monitor 24 horas");
  const footer=add(inside,"footer","jarvis-neural-news-footer");
  const counter=add(footer,"span","jarvis-neural-news-counter","— / —");
  const controls=add(footer,"div","jarvis-neural-news-controls");
  const previous=add(controls,"button","","‹");
  previous.type="button";previous.setAttribute("aria-label","Notícia anterior");
  const next=add(controls,"button","","›");
  next.type="button";next.setAttribute("aria-label","Próxima notícia");
  const timeInfo=add(footer,"span","jarvis-neural-news-updated","Fontes não consultadas");
  const mode=()=>{
    const selectedMode=visual.dataset.mode||"ring";
    panel.dataset.visualMode=selectedMode;
    return selectedMode;
  };
  const imageError=()=>{
    image.hidden=true;imageBox.classList.add("missing-photo");
    photoText.textContent="IMAGEM INDISPONÍVEL";
  };
  image.addEventListener("error",imageError);
  image.addEventListener("load",()=>{
    if(image.naturalWidth<80||image.naturalHeight<60)imageError();
  });
  function setImage(item){
    const url=cleanUrl(item?.imageUrl||"");
    image.removeAttribute("src");
    imageBox.classList.add("missing-photo");
    image.hidden=true;
    photoText.textContent="FONTE SEM IMAGEM";
    pictureFallback.dataset.category=item?.category||"mundo";
    if(url){
      imageBox.classList.remove("missing-photo");
      image.hidden=false;
      image.alt="Imagem fornecida pela notícia: "+item.title;
      image.src=url;
    }
  }
  function updateCard(){
    mode();
    const item=entries[selected];
    const hasItem=Boolean(item);
    category.textContent=hasItem?(categoryNames[item.category]||norm(item.category).toUpperCase()):"MONITOR 24 HORAS";
    headline.textContent=hasItem?item.title:"Aguardando manchetes recentes e verificadas.";
    source.textContent=hasItem?item.source+" · "+dateText(item.publishedAt):
      "O monitor continuará procurando notícias; nenhuma notícia será inventada.";
    setImage(item);
    counter.textContent=hasItem?(selected+1)+" / "+entries.length:"0 / 0";
    link.hidden=!hasItem;
    if(hasItem){link.href=item.url;}else{link.removeAttribute("href");}
    previous.disabled=entries.length<2;
    next.disabled=entries.length<2;
    detail.disabled=!hasItem;
    detail.textContent=expanded?"Fechar detalhes":"Detalhes";
    detail.setAttribute("aria-expanded",String(expanded));
    context.hidden=!expanded||!hasItem;
    if(hasItem&&expanded){
      context.replaceChildren();
      add(context,"strong","","Notícia de "+(categoryNames[item.category]||item.category)+": ");
      add(context,"span","",item.title+". ");
      add(context,"span","","Fonte: "+item.source+". Publicado em "+dateText(item.publishedAt)+". ");
      add(context,"span","",
        "Para consultar a reportagem completa e o contexto, abra a fonte original. Esta interface não inventa resumos.");
    }
    related.replaceChildren();
    for(let i=1;i<=Math.min(3,entries.length-1);i++){
      const index=(selected+i)%entries.length;
      const other=entries[index];
      const button=add(related,"button","jarvis-neural-news-secondary");
      button.type="button";
      button.setAttribute("aria-label","Mostrar notícia: "+other.title);
      const thumb=add(button,"span","jarvis-neural-news-thumbnail");
      if(other.imageUrl){
        const img=add(thumb,"img","");
        img.src=other.imageUrl;img.alt="";img.loading="lazy";img.referrerPolicy="no-referrer";
        img.addEventListener("error",()=>{img.remove();thumb.textContent="◈";},{once:true});
      }else{thumb.textContent="◈";}
      const detailText=add(button,"span","jarvis-neural-news-secondary-text");
      add(detailText,"b","",categoryNames[other.category]||other.category);
      add(detailText,"span","",other.title);
      button.addEventListener("click",()=>{selected=index;expanded=false;lastSwitch=Date.now();updateCard();});
    }
    timeInfo.textContent=archiveAt?"Coleta: "+dateText(archiveAt):"Aguardando coleta";
    status.textContent=valid?"MONITOR 24H":"FONTES / VERIFICAR DATA";
    status.classList.toggle("stale",!valid);
    alertLine.replaceChildren();
    const currentWarning=alert;
    alertLine.hidden=!currentWarning;
    if(currentWarning){
      const label=add(alertLine,"span","","INMET · "+norm(currentWarning.severity).toUpperCase()+": ");
      label.className="jarvis-neural-news-alert-label";
      add(alertLine,"span","",norm(currentWarning.title)+" · confira a área afetada ");
      const alertLink=add(alertLine,"a","","Ver aviso");
      alertLink.href=cleanUrl(currentWarning.url)||"https://avisos.inmet.gov.br/";
      alertLink.target="_blank";alertLink.rel="noopener noreferrer";
    }
    panel.dataset.expanded=String(expanded);
  }
  function consume(payload){
    const data=payload&&typeof payload==="object"?payload:{};
    const chosen=storySet(data);
    const oldUrl=entries[selected]?.url;
    const checkTime=data.history?.updatedAt||data.briefing?.fetchedAt||null;
    archiveAt=checkTime;
    const age=Date.now()-parsedTime(checkTime);
    valid=Boolean(Number.isFinite(age)&&age>=-300000&&age<2*60*60*1000);
    alert=currentAlert(data);
    const newWake=Boolean(data.waking);
    waking=newWake;
    entries=chosen;
    selected=newWake?0:Math.max(0,entries.findIndex(e=>e.url===oldUrl));
    if(selected>=entries.length)selected=0;
    expanded=false;
    lastRenderAt=Date.now();
    lastSwitch=Date.now();
    updateCard();
    if(newWake){
      panel.classList.remove("jarvis-neural-news-awake");
      void panel.offsetWidth;
      panel.classList.add("jarvis-neural-news-awake");
    }
  }
  function navigate(offset){
    if(entries.length<2)return;
    selected=(selected+entries.length+offset)%entries.length;
    expanded=false;lastSwitch=Date.now();
    updateCard();
  }
  previous.addEventListener("click",()=>navigate(-1));
  next.addEventListener("click",()=>navigate(1));
  detail.addEventListener("click",()=>{expanded=!expanded;lastSwitch=Date.now();updateCard();});
  collapse.addEventListener("click",()=>{
    const collapsed=panel.classList.toggle("is-collapsed");
    collapse.textContent=collapsed?"+":"−";
    collapse.setAttribute("aria-label",collapsed?"Expandir notícias":"Recolher notícias");
    collapse.title=collapsed?"Expandir notícias":"Recolher notícias";
  });
  panel.addEventListener("pointerenter",()=>{paused=true;});
  panel.addEventListener("pointerleave",()=>{paused=false;});
  panel.addEventListener("focusin",()=>{paused=true;});
  panel.addEventListener("focusout",()=>{
    if(!panel.contains(document.activeElement))paused=false;
  });
  // Don't turn a news-list wheel into a Neural Ring or Mapbox zoom.
  panel.addEventListener("wheel",event=>{
    if(event.cancelable)event.preventDefault();
    event.stopPropagation();
    if(!expanded&&entries.length>1&&Math.abs(event.deltaY)>12)navigate(event.deltaY>0?1:-1);
  },{passive:false});
  window.addEventListener("ultron:intelligence-visual-update",event=>{
    consume(event.detail);
  });
  const observer=typeof MutationObserver==="function"?
    new MutationObserver(()=>mode()):null;
  observer?.observe(visual,{attributes:true,attributeFilter:["data-mode"]});
  window.setInterval(()=>{
    if(document.hidden||paused||expanded||panel.classList.contains("is-collapsed")||entries.length<2)return;
    if(Date.now()-lastSwitch>=CYCLE_MS)navigate(1);
  },1500);
  window.ULTRON_NEURAL_NEWS={
    get state(){return {
      active:true,mode:mode(),count:entries.length,index:selected,
      headline:entries[selected]?.title||null,
      hasImage:Boolean(entries[selected]?.imageUrl),
      waking,expanded,collapsed:panel.classList.contains("is-collapsed"),
      lastUpdate:archiveAt
    };},
    show:()=>{panel.classList.add("is-requested");panel.classList.remove("is-collapsed");collapse.textContent="−";},
    hide:()=>{panel.classList.remove("is-requested");},
    select:n=>{if(Number.isInteger(n)&&n>=0&&n<entries.length){selected=n;expanded=false;updateCard();}},
    refresh:()=>consume(intl.visualData)
  };
  consume(intl.visualData);
}
