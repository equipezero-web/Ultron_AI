/* One response surface in the Neural Ring, without news or images at boot. */
const center=document.querySelector('.jarvis-cc-center');
if(center){
  const box=document.createElement('section');
  box.className='ultron-neural-answer';
  box.hidden=true;
  box.setAttribute('aria-label','Resposta do Ultron no Neural Ring');
  const head=document.createElement('header');
  head.className='ultron-neural-answer-head';
  const status=document.createElement('span');
  status.textContent='ULTRON // RESPOSTA';
  const close=document.createElement('button');
  close.type='button';close.className='ultron-neural-answer-close';
  close.setAttribute('aria-label','Fechar resposta e mostrar somente o Neural Ring');
  close.textContent='×';
  head.append(status,close);
  const text=document.createElement('p');
  text.className='ultron-neural-answer-text';
  text.setAttribute('aria-live','polite');
  const media=document.createElement('div');
  media.className='ultron-neural-answer-media';
  const sources=document.createElement('nav');
  sources.className='ultron-neural-answer-sources';
  sources.setAttribute('aria-label','Fontes da resposta');
  box.append(head,text,media,sources);center.append(box);
  let requestId=0;
  let pendingAnswer=false;
  const clear=()=>{
    box.hidden=true;text.textContent='';
    media.replaceChildren();sources.replaceChildren();
  };
  close.addEventListener('click',clear);
  // A scroll within the response must not zoom the ring or move the document.
  box.addEventListener('wheel',event=>event.stopPropagation(),{passive:true});
  const url=value=>{
    try{
      const u=new URL(value);
      return ['https:','http:'].includes(u.protocol)&&!u.username&&!u.password?u.href:null;
    }catch{return null;}
  };
  const present=(value,{pending=false,visual=null,webResearch=null}={})=>{
    box.hidden=false;
    status.textContent=pending?'ULTRON // CONSULTANDO FONTES':'ULTRON // RESPOSTA';
    text.textContent=String(value||'').slice(0,6500);
    media.replaceChildren();sources.replaceChildren();
    if(pending)return;
    if(webResearch?.requested&&!visual?.images?.length&&!visual?.videos?.length&&!visual?.cards?.some(c=>c.image||c.imageUrl||c.thumbnail)){
      const note=document.createElement('p');note.className='ultron-media-note';note.textContent='Nenhuma mídia disponível nas fontes consultadas.';media.append(note);
    }
    const images=[
      ...(Array.isArray(visual?.images)?visual.images:[]),
      ...(Array.isArray(visual?.cards)?visual.cards:[]).map(card=>({
        src:card?.image||card?.imageUrl||card?.thumbnail,
        alt:card?.title||'Imagem da fonte'
      }))
    ];
    const seenImages=new Set();
    for(const item of images){
      const src=url(typeof item==='string'?item:item?.src||item?.image||item?.imageUrl);
      if(!src||seenImages.has(src))continue;
      seenImages.add(src);
      const img=document.createElement('img');
      img.loading='eager';img.decoding='async';img.referrerPolicy='no-referrer';
      img.src=src;img.alt=String(item?.alt||item?.title||'Imagem vinculada à fonte');
      const thumbnail=url(item?.thumbnail);
      img.onerror=()=>{
        if(thumbnail&&img.src!==thumbnail){img.src=thumbnail;return;}
        img.remove();
        if(!media.querySelector('img,iframe,.ultron-media-video'))media.textContent='Não foi possível carregar as imagens desta fonte.';
      };
      media.append(img);
      if(seenImages.size>=4)break;
    }
    // Only embed real, validated YouTube video IDs. Never frame arbitrary pages.
    const videos=Array.isArray(visual?.videos)?visual.videos:[];
    const videoIds=new Set();
    for(const item of videos){
      const id=String(item?.id||'');
      if(!/^[A-Za-z0-9_-]{11}$/.test(id)||videoIds.has(id))continue;
      videoIds.add(id);
      const block=document.createElement('section');block.className='ultron-media-video';
      const button=document.createElement('button');button.type='button';button.className='ultron-media-play';
      button.setAttribute('aria-label','Reproduzir '+String(item.title||'vídeo'));
      const poster=document.createElement('img');poster.loading='eager';poster.referrerPolicy='no-referrer';poster.alt=String(item.title||'Vídeo relacionado');
      poster.src=url(item.thumbnail)||'https://i.ytimg.com/vi/'+id+'/hqdefault.jpg';
      const caption=document.createElement('span');caption.textContent='▶ '+String(item.title||'Assistir vídeo no YouTube');
      button.append(poster,caption);block.append(button);media.append(block);
      button.addEventListener('click',()=>{
        const frame=document.createElement('iframe');
        frame.src='https://www.youtube-nocookie.com/embed/'+id+'?playsinline=1&rel=0';
        frame.title=String(item.title||'Vídeo do YouTube');
        frame.allow='encrypted-media; picture-in-picture; fullscreen';
        frame.allowFullscreen=true;frame.referrerPolicy='strict-origin-when-cross-origin';
        const fallback=document.createElement('a');fallback.href='https://www.youtube.com/watch?v='+id;fallback.target='_blank';fallback.rel='noopener noreferrer';fallback.textContent='Se a reprodução for bloqueada, abrir no YouTube';
        block.replaceChildren(frame,fallback);
      });
      if(videoIds.size>=3)break;
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
  };
  window.addEventListener('ultron:question-start',event=>{
    requestId=Number(event.detail?.id||requestId+1);
    pendingAnswer=true;
    present('Consultando informações para responder…',{pending:true});
  });
  window.addEventListener('ultron:answer',event=>{
    if(event.detail?.id&&Number(event.detail.id)!==requestId)return;
    pendingAnswer=false;
    present(event.detail?.text,{visual:event.detail?.visualContext,webResearch:event.detail?.webResearch});
  });
  window.addEventListener('ultron:answer-error',event=>{
    if(event.detail?.id&&Number(event.detail.id)!==requestId)return;
    pendingAnswer=false;
    present('Não consegui confirmar uma resposta agora. '+String(event.detail?.message||'Falha de conexão.').slice(0,200));
  });
  // Voice text appears immediately even when audio playback is unavailable.
  window.addEventListener('ultron:speech-start',event=>{
    const spoken=String(event.detail?.text||'').trim();
    if(!spoken||pendingAnswer)return;
    // Wake is a user activation, not a page-load event. Show its narration
    // over the 3D stage; never create a second response at the page bottom.
    const wake=event.detail?.source==='intelligence-wake';
    if(wake){
      const payload=window.ULTRON_INTELLIGENCE?.visualData||{};
      const stories=(payload?.briefing?.topics||[]).flatMap(group=>(group.articles||[]).map(article=>({
        title:article.title,source:article.source,url:article.url,
        image:article.imageUrl||article.image||null
      }))).slice(0,4);
      present(spoken,{visual:{mode:'news',cards:stories}});
      return;
    }
    if(box.hidden)present(spoken);
    else if(text.textContent!==spoken){text.textContent=spoken.slice(0,6500);}
  });
  window.addEventListener('ultron:intelligence-visual-update',event=>{
    // Background refresh updates stored news, but should not interrupt the
    // Ring. The wake briefing appears in the Ring on explicit activation.
    if(!event.detail?.waking||pendingAnswer)return;
    const stories=(event.detail?.briefing?.topics||[]).flatMap(group=>(group.articles||[]).map(article=>({
      title:article.title,source:article.source,url:article.url,
      image:article.imageUrl||article.image||null
    }))).slice(0,4);
    if(stories.length)present(stories[0].title,{visual:{mode:'news',cards:stories}});
  });
  window.ULTRON_NEURAL_ANSWER={show:present,clear,get visible(){return !box.hidden;}};
}
