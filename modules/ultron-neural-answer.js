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
  const clear=()=>{
    box.hidden=true;text.textContent='';
    media.replaceChildren();sources.replaceChildren();
  };
  close.addEventListener('click',clear);
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
    const images=Array.isArray(visual?.images)?visual.images:[];
    for(const item of images.slice(0,4)){
      const src=url(typeof item==='string'?item:item?.src||item?.url);
      if(!src)continue;
      const img=document.createElement('img');
      img.loading='lazy';img.decoding='async';
      img.src=src;img.alt=String(item?.alt||item?.title||'Imagem vinculada à fonte');
      img.onerror=()=>img.remove();
      media.append(img);
    }
    const cards=[...(Array.isArray(visual?.cards)?visual.cards:[]),...(Array.isArray(webResearch?.sources)?webResearch.sources:[])];
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
    present('Consultando informações para responder…',{pending:true});
  });
  window.addEventListener('ultron:answer',event=>{
    if(event.detail?.id&&Number(event.detail.id)!==requestId)return;
    present(event.detail?.text,{visual:event.detail?.visualContext,webResearch:event.detail?.webResearch});
  });
  window.addEventListener('ultron:answer-error',event=>{
    if(event.detail?.id&&Number(event.detail.id)!==requestId)return;
    present('Não consegui confirmar uma resposta agora. '+String(event.detail?.message||'Falha de conexão.').slice(0,200));
  });
  // Voice text appears immediately even when audio playback is unavailable.
  window.addEventListener('ultron:speech-start',event=>{
    if(box.hidden&&event.detail?.text)present(event.detail.text);
  });
  window.ULTRON_NEURAL_ANSWER={show:present,clear,get visible(){return !box.hidden;}};
}
