import {buildMediaModel} from "./jarvis-media-model.js?v=4.70.0";
/* One response surface in the Neural Jarvis, without news or images at boot. */
const center=document.querySelector('.jarvis-cc-center');
if(center){
  const box=document.createElement('section');
  box.className='ultron-neural-answer';
  box.hidden=true;
  box.setAttribute('aria-label','Resposta do Ultron no Neural Jarvis');
  const head=document.createElement('header');
  head.className='ultron-neural-answer-head';
  const status=document.createElement('span');
  status.textContent='ULTRON // RESPOSTA';
  const close=document.createElement('button');
  close.type='button';close.className='ultron-neural-answer-close';
  close.setAttribute('aria-label','Fechar resposta e mostrar somente o Neural Jarvis');
  close.textContent='×';
  head.append(status,close);
  const text=document.createElement('div');
  text.className='ultron-neural-answer-text';
  text.setAttribute('aria-live','polite');
  const media=document.createElement('div');
  media.className='ultron-neural-answer-media';
  const sources=document.createElement('nav');
  sources.className='ultron-neural-answer-sources';
  sources.setAttribute('aria-label','Fontes da resposta');
  box.append(head,text,media,sources);center.append(box);
  // Layout is based on usable stage space as well as the screen width.
  const syncLayout=()=>{
    const width=center.getBoundingClientRect().width||window.innerWidth;
    box.dataset.layout=document.body.classList.contains('ultron-tv-display')?'tv':
      width<550||window.matchMedia('(max-width:820px)').matches?'compact':'wide';
  };
  if(typeof ResizeObserver!=='undefined')new ResizeObserver(syncLayout).observe(center);
  window.addEventListener('resize',syncLayout,{passive:true});
  syncLayout();
  let requestId=0;
  let pendingAnswer=false;
  let dismissed=false,awake=false;
  let activeWakeStories=[];
  let textEnabled=true;
  try{textEnabled=localStorage.getItem('ultron-neural-text-enabled')!=='false';}catch{}
  let hasContent=false;
  function syncVisibility(){
    box.classList.toggle('ultron-text-disabled',!textEnabled);
    text.hidden=!textEnabled;
    sources.hidden=!textEnabled;
    const hasMedia=!!media.querySelector('.ultron-image-card img,.ultron-media-video iframe,.ultron-media-video button');
    box.hidden=dismissed||!hasContent||(!textEnabled&&!hasMedia);
  }
  function setTextEnabled(enabled){textEnabled=Boolean(enabled);try{localStorage.setItem('ultron-neural-text-enabled',String(textEnabled));}catch{}syncVisibility();return textEnabled;}
  syncVisibility();
  const clear=()=>{
    dismissed=true;pendingAnswer=false;
    hasContent=false;box.hidden=true;text.textContent='';
    media.replaceChildren();sources.replaceChildren();
  };
  close.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();clear();});
  // Prevent stage gestures from consuming clicks and touch interactions.
  for(const type of ['pointerdown','pointerup','touchstart','touchend','click']){
    box.addEventListener(type,event=>event.stopPropagation(),{passive:true});
  }
  window.addEventListener('ultron:wake-state',event=>{const next=Boolean(event.detail?.awake);if(next&&!awake){dismissed=false;activeWakeStories=[];}awake=next;});
  // A scroll within the response must not zoom the ring or move the document.
  box.addEventListener('wheel',event=>event.stopPropagation(),{passive:true});
  const url=value=>{
    try{
      const u=new URL(value);
      return ['https:','http:'].includes(u.protocol)&&!u.username&&!u.password?u.href:null;
    }catch{return null;}
  };
  const present=(value,{pending=false,visual=null,webResearch=null}={})=>{
    if(dismissed)return;
    syncLayout();
    hasContent=true;box.hidden=false;
    status.textContent=pending?'ULTRON // CONSULTANDO FONTES':'ULTRON // RESPOSTA';
    text.textContent=String(value||'').slice(0,6500);
    media.replaceChildren();sources.replaceChildren();
    if(pending){syncVisibility();return;}
    if(visual?.mode==='news'){
      const stories=(visual.cards||[]).filter(c=>c?.title&&c?.url).slice(0,6);
      const raw=String(value||'');
      const intro=String(visual.introduction||'').trim();
      if(intro&&stories.length){
        const lead=document.createElement('p');lead.className='ultron-news-intro';lead.textContent=intro;
        text.replaceChildren(lead);
        for(const story of stories){
          const article=document.createElement('article');article.className='ultron-news-story';
          const title=document.createElement('h3');title.textContent=story.title;
          const desc=document.createElement('p');desc.textContent=String(story.description||story.summary||'Resumo detalhado não disponível na fonte consultada.').slice(0,1800);
          const meta=document.createElement('small');meta.textContent=String(story.source||'Fonte consultada')+(story.publishedAt?' · '+new Date(story.publishedAt).toLocaleString('pt-BR'):'');
          article.append(title,desc,meta);
          for(const ref of (story.detailSources||[]).slice(0,3)){
            const href=url(ref.url);if(!href)continue;
            const link=document.createElement('a');link.href=href;link.target='_blank';link.rel='noopener noreferrer';link.className='ultron-news-detail-source';link.textContent=ref.source||ref.title||'Fonte';
            article.append(link);
          }
          text.append(article);
        }
      }else{
        // The AI response keeps its own sourced descriptions; format the
        // requested introduction/title/description structure without discarding text.
        const sections=raw.split(/\r?\n/).filter(l=>l.trim());
        text.replaceChildren();
        for(const line of sections){
          const match=line.match(/^\s*(?:\*\*)?(Introdução|Título|Descrição)(?:\*\*)?\s*:\s*(.*)$/i);
          const part=document.createElement(match&&match[1].toLowerCase()==='título'?'h3':'p');
          part.className=match&&match[1].toLowerCase()==='introdução'?'ultron-news-intro':'ultron-news-line';
          part.textContent=match?match[2]:line;text.append(part);
        }
      }
    }
    const collection=buildMediaModel(visual);
    const makeHeading=(name)=>{const h=document.createElement('h3');h.className='ultron-media-heading';h.textContent=name;return h;};
    const makeMeta=(source,date)=>{
      const small=document.createElement('small');small.className='ultron-media-source';
      small.textContent=[source,date].filter(Boolean).join(' · ')||'Imagem relacionada ao assunto';
      return small;
    };
    if(collection.images.length){
      const imageSection=document.createElement('section');
      imageSection.className='ultron-media-images';
      imageSection.setAttribute('aria-label','Imagens relacionadas à resposta');
      imageSection.append(makeHeading('IMAGENS'));
      const grid=document.createElement('div');grid.className='ultron-image-grid';
      for(const item of collection.images){
        const figure=document.createElement('figure');figure.className='ultron-image-card';
        const img=document.createElement('img');img.loading='lazy';img.decoding='async';img.referrerPolicy='no-referrer';
        img.alt=item.alt;img.src=item.src;img.width=160;img.height=160;
        const caption=document.createElement('figcaption');
        const title=document.createElement('strong');title.textContent=item.title;caption.append(title);
        caption.append(makeMeta(item.source,item.date));
        if(item.description){const details=document.createElement('p');details.textContent=item.description;caption.append(details);}
        if(item.sourceUrl){
          const a=document.createElement('a');a.href=item.sourceUrl;a.target='_blank';a.rel='noopener noreferrer';
          a.textContent='Fonte da imagem';caption.append(a);
        }
        img.onerror=()=>{
          if(!img.isConnected)return;
          if(item.thumbnail&&img.src!==item.thumbnail){img.src=item.thumbnail;return;}
          figure.remove();
          if(!grid.children.length)imageSection.remove();
          syncVisibility();
        };
        figure.append(img,caption);grid.append(figure);
      }
      imageSection.append(grid);media.append(imageSection);
    }
    if(collection.videos.length){
      const videoSection=document.createElement('section');
      videoSection.className='ultron-media-videos';
      videoSection.setAttribute('aria-label','Vídeos relacionados à resposta');
      videoSection.append(makeHeading('VÍDEOS'));
      const videoGrid=document.createElement('div');videoGrid.className='ultron-video-grid';
      for(const item of collection.videos){
        const block=document.createElement('article');block.className='ultron-media-video';
        const button=document.createElement('button');button.type='button';button.className='ultron-media-play';
        button.setAttribute('aria-label','Reproduzir '+item.title);
        const poster=document.createElement('img');poster.loading='lazy';poster.decoding='async';
        poster.referrerPolicy='no-referrer';poster.alt='Prévia do vídeo: '+item.title;poster.src=item.poster;
        const playLabel=document.createElement('span');playLabel.className='ultron-video-play-label';playLabel.textContent='▶ Reproduzir vídeo';
        button.append(poster,playLabel);
        const info=document.createElement('div');info.className='ultron-video-info';
        const title=document.createElement('strong');title.textContent=item.title;info.append(title);
        info.append(makeMeta(item.source,item.date));
        if(item.description){const details=document.createElement('p');details.textContent=item.description;info.append(details);}
        block.append(button,info);videoGrid.append(block);
        button.addEventListener('click',event=>{
          event.preventDefault();event.stopPropagation();
          if(block.querySelector('iframe'))return;
          const frame=document.createElement('iframe');
          frame.src='https://www.youtube-nocookie.com/embed/'+item.id+'?playsinline=1&rel=0&autoplay=1';
          frame.title=item.title;frame.allow='autoplay; encrypted-media; picture-in-picture; fullscreen';
          frame.allowFullscreen=true;frame.loading='eager';frame.referrerPolicy='strict-origin-when-cross-origin';
          const player=document.createElement('div');player.className='ultron-video-player';player.append(frame);
          const fallback=document.createElement('a');fallback.href=item.sourceUrl;fallback.target='_blank';
          fallback.rel='noopener noreferrer';fallback.className='ultron-video-fallback';
          fallback.textContent='Caso o vídeo não permita reprodução incorporada, abrir no YouTube';
          button.replaceWith(player);info.append(fallback);
          syncVisibility();
        });
      }
      videoSection.append(videoGrid);media.append(videoSection);
    }
    if(!collection.images.length&&!collection.videos.length&&webResearch?.requested){
      const note=document.createElement('p');note.className='ultron-media-note';
      note.textContent='Nenhuma imagem ou vídeo relevante disponível nas fontes consultadas.';
      media.append(note);
    }
    const cards=[...(Array.isArray(visual?.videos)?visual.videos:[]).map(v=>({url:v.url,title:v.title})),...(Array.isArray(visual?.images)?visual.images:[]).filter(i=>i?.sourceUrl).map(i=>({url:i.sourceUrl,title:i.alt||'Fonte da imagem'})),...(Array.isArray(visual?.cards)?visual.cards:[]),...(Array.isArray(webResearch?.sources)?webResearch.sources:[])];
    const seen=new Set();
    for(const item of cards){
      const href=url(item?.url);if(!href||seen.has(href))continue;
      seen.add(href);
      const a=document.createElement('a');
      a.href=href;a.target='_blank';a.rel='noopener noreferrer';
      a.textContent=String(item.source||item.title||new URL(href).hostname).slice(0,50);
      sources.append(a);
      if(seen.size>=4)break;
    }
    syncVisibility();
  };
  window.addEventListener('ultron:question-start',event=>{
    dismissed=false;activeWakeStories=[];
    requestId=Number(event.detail?.id||requestId+1);
    pendingAnswer=true;
    present('Consultando informações para responder…',{pending:true});
  });
  window.addEventListener('ultron:answer',event=>{
    if(dismissed||(event.detail?.id&&Number(event.detail.id)!==requestId))return;
    pendingAnswer=false;
    present(event.detail?.text,{visual:event.detail?.visualContext,webResearch:event.detail?.webResearch});
  });
  window.addEventListener('ultron:answer-error',event=>{
    if(dismissed||(event.detail?.id&&Number(event.detail.id)!==requestId))return;
    pendingAnswer=false;
    present('Não consegui confirmar uma resposta agora. '+String(event.detail?.message||'Falha de conexão.').slice(0,200));
  });
  // Voice text appears immediately even when audio playback is unavailable.
  window.addEventListener('ultron:speech-start',event=>{
    const spoken=String(event.detail?.text||'').trim();
    if(!spoken||pendingAnswer||dismissed)return;
    // Wake is a user activation, not a page-load event. Show its narration
    // over the 3D stage; never create a second response at the page bottom.
    const wake=event.detail?.source==='intelligence-wake';
    if(wake){
      const payload=window.ULTRON_INTELLIGENCE?.visualData||{};
      if(activeWakeStories.length)return; // Keep the visual report and its matching descriptions.
      const stories=wakeStories(payload);
      present(spoken,{visual:{mode:'news',cards:stories,introduction:wakeIntro(payload.summary)}});
      return;
    }
    if(box.hidden&&textEnabled&&!hasContent)present(spoken);
    // Preserve the full sourced answer and its visuals when narration is abbreviated.
  });
  function wakeStories(payload){
    const summary=payload?.summary;
    const archive=summary?.highlights?.length?summary.highlights:summary?.recentHighlights;
    const items=Array.isArray(archive)&&archive.length?archive:(payload?.briefing?.topics||[]).flatMap(g=>g.articles||[]);
    return items.filter(a=>a?.title&&a?.url).slice(0,6).map(a=>({title:a.title,description:a.description||a.summary,detailSources:a.detailSources||[],source:a.source,url:a.url,publishedAt:a.publishedAt,image:a.imageUrl||a.image||null}));
  }
  function wakeIntro(summary){
    return 'JARVIS ativado. Confira os principais acontecimentos das últimas 24 horas, começando pelo Brasil.'+(summary?.lastCheckAt?' Última coleta: '+new Date(summary.lastCheckAt).toLocaleString('pt-BR')+'.':'');
  }
  window.addEventListener('ultron:intelligence-visual-update',event=>{
    if(!event.detail?.waking||pendingAnswer||dismissed)return;
    const stories=wakeStories(event.detail);
    if(stories.length){
      activeWakeStories=stories;
      present('',{visual:{mode:'news',cards:stories,introduction:wakeIntro(event.detail.summary)}});
    }
  });
  window.ULTRON_NEURAL_ANSWER={show:(value,options)=>{dismissed=false;present(value,options);},clear,setTextEnabled,get textEnabled(){return textEnabled;},get visible(){return !box.hidden;}};
}
