import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';

const browser=await puppeteer.launch({
  executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',
  headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--enable-webgl','--enable-unsafe-swiftshader']
});
try {
  for(const viewport of [
    {width:390,height:844,isMobile:true,hasTouch:true},
    {width:1366,height:768},
    {width:1920,height:1080}
  ]){
    const page=await browser.newPage();
    await page.setViewport(viewport);
    // Use a deterministic local response for test pictures rather than
    // depending on example.org or the external network.
    await page.setRequestInterception(true);
    page.on('request',req=>{
      if(req.url().includes('youtube-nocookie.com/embed/'))return req.respond({status:200,contentType:'text/html',body:'<html><body>Test video player</body></html>'});
      if(req.url().includes('/api/orchestrator/')){
        const headers={'access-control-allow-origin':'*','access-control-allow-methods':'POST, OPTIONS','access-control-allow-headers':'content-type, authorization'};
        if(req.method()==='OPTIONS')return req.respond({status:204,headers});
        return req.respond({status:200,headers,contentType:'application/json',body:JSON.stringify({ok:true,runId:'test-run',plan:{complex:false},runs:[]})});
      }
      if(req.url().includes('/api/ai')){
        const headers={'access-control-allow-origin':'*','access-control-allow-methods':'POST, OPTIONS','access-control-allow-headers':'content-type, authorization'};
        if(req.method()==='OPTIONS')return req.respond({status:204,headers});
        return req.respond({status:200,headers,contentType:'application/json',body:JSON.stringify({text:'Resposta real do fluxo de comando: China',provider:'mock',visualContext:{images:[{src:'https://example.org/picture.jpg',alt:'China'}],videos:[{id:'dQw4w9WgXcQ',title:'Vídeo de teste',thumbnail:'https://example.org/picture.jpg',url:'https://www.youtube.com/watch?v=dQw4w9WgXcQ'}],cards:[{title:'China',url:'https://example.org/report'}]}})});
      }
      if(/^https:\/\/example\.org\/(picture|news)\.jpg$/.test(req.url()))
        return req.respond({status:200,contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="420" height="280"><rect width="420" height="280" fill="#406b92"/></svg>'});
      return req.continue();
    });
    await page.goto('http://127.0.0.1:8766/'+(viewport.width===1920?'?display=tv':''),{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>Boolean(window.ULTRON_NEURAL_ANSWER),{timeout:12000});
    const initial=await page.evaluate(()=>({
      hidden:document.querySelector('.ultron-neural-answer').hidden,
      newsHidden:getComputedStyle(document.querySelector('.jarvis-neural-news')).display==='none',
      ring:!!document.querySelector('#jarvis-cc-canvas')
    }));
    assert.equal(initial.hidden,true,'Response starts hidden');
    assert.equal(initial.newsHidden,true,'News overlay must be absent at startup');
    assert.ok(initial.ring,'Neural Ring remains mounted');
    await page.evaluate(()=>{
      window.dispatchEvent(new CustomEvent('ultron:question-start',{detail:{id:10,question:'Qual o clima?'}}));
      window.dispatchEvent(new CustomEvent('ultron:answer',{detail:{
        id:10,text:'Resposta confirmada',webResearch:{sources:[{source:'Fonte oficial',url:'https://example.org/report'}]},
        visualContext:{images:[{src:'https://example.org/picture.jpg',alt:'Foto da fonte'}]}
      }}));
    });
    const answered=await page.evaluate(()=>({
      hidden:document.querySelector('.ultron-neural-answer').hidden,
      text:document.querySelector('.ultron-neural-answer-text').textContent,
      image:document.querySelectorAll('.ultron-neural-answer-media img').length,
      source:document.querySelector('.ultron-neural-answer-sources a')?.href,
      overflow:document.documentElement.scrollWidth-innerWidth,
      anchored:(()=>{
        const panel=document.querySelector('.ultron-neural-answer');
        const ring=document.querySelector('.jarvis-cc-center');
        const p=panel.getBoundingClientRect(),c=ring.getBoundingClientRect();
        return {
          inside:panel.parentElement===ring,
          position:getComputedStyle(panel).position,
          centerTop:c.top,panelTop:p.top,
          panelBottom:p.bottom,centerBottom:c.bottom,
          horizontal:p.left>=c.left-3&&p.right<=c.right+3,
          vertical:p.top>=c.top-3&&p.bottom<=c.bottom+3
        };
      })()
    }));
    assert.equal(answered.hidden,false);
    assert.equal(answered.text,'Resposta confirmada');
    assert.equal(answered.image,1);
    await page.waitForFunction(()=>document.querySelector('.ultron-neural-answer-media img')?.naturalWidth===420,{timeout:6000});
    const columns=await page.$eval('.ultron-neural-answer',el=>getComputedStyle(el).gridTemplateColumns);
    assert.ok(columns.split(' ').length>=2,'Text and image must occupy separate columns');
    assert.equal(answered.anchored.inside,true,'Answers must belong to 3D neural stage');
    assert.equal(answered.anchored.position,'absolute','Never flow to the page bottom');
    assert.equal(answered.anchored.horizontal,true,JSON.stringify(answered.anchored));
    assert.equal(answered.anchored.vertical,true,JSON.stringify(answered.anchored));
    assert.ok(answered.source.includes('example.org/report'));
    assert.ok(answered.overflow<=3,'Response must not overflow viewport');
    const newsPicture=await page.evaluate(()=>{
      window.dispatchEvent(new CustomEvent('ultron:intelligence-visual-update',{
        detail:{waking:true,briefing:{topics:[{id:'brasil',articles:[{
          title:'Boletim verificado',description:'Descrição confirmada da notícia',source:'Agência pública',
          url:'https://example.org/news',imageUrl:'https://example.org/news.jpg'
        }]}]}}
      }));
      return document.querySelector('.ultron-neural-answer-media img')?.getAttribute('src');
    });
    assert.ok(await page.$eval('.ultron-news-intro',el=>el.textContent.includes('JARVIS ativado')));
    assert.equal(await page.$eval('.ultron-news-story h3',el=>el.textContent),'Boletim verificado');
    assert.equal(await page.$eval('.ultron-news-story p',el=>el.textContent),'Descrição confirmada da notícia');
    assert.equal(newsPicture,'https://example.org/news.jpg','Wake news must mount publisher image inside ring');
    await page.evaluate(()=>window.dispatchEvent(new CustomEvent('ultron:speech-start',{detail:{source:'intelligence-wake',text:'Resumo de notícias falado'}})));
    assert.equal(await page.$eval('.ultron-news-story h3',el=>el.textContent),'Boletim verificado','Narration must preserve the structured report');
    await page.click('.ultron-neural-answer-close');
    assert.equal(await page.$eval('.ultron-neural-answer',el=>el.hidden),true);
    await page.evaluate(()=>{window.dispatchEvent(new CustomEvent('ultron:speech-start',{detail:{source:'intelligence-wake',text:'Narração atrasada'}}));window.dispatchEvent(new CustomEvent('ultron:answer',{detail:{id:10,text:'Resposta atrasada'}}));});
    assert.equal(await page.$eval('.ultron-neural-answer',el=>el.hidden),true,'Closing must suppress late speech and answers');
    // Exercise the real command path (not just synthetic answer events).
    await page.evaluate(()=>{
      const input=document.querySelector('#command-input');
      input.value='Como anda o governo da China atualmente?';
      document.querySelector('#btn-send').click();
    });
    try{
      await page.waitForFunction(()=>document.querySelector('.ultron-neural-answer-text')?.textContent==='Resposta real do fluxo de comando: China',{timeout:12000});
    }catch(error){
      console.error('COMMAND FLOW DIAGNOSTICS',JSON.stringify(await page.evaluate(()=>({
        text:document.querySelector('.ultron-neural-answer-text')?.textContent,
        terminal:document.querySelector('#output-box')?.textContent?.slice(-1800),
        route:window.ULTRON_ORCHESTRATOR?.state?.lastRoute,
        busy:window.ULTRON_ORCHESTRATOR?.state?.busy,
        core:!!window.ULTRON_CORE
      }))));
      throw error;
    }
    const ctx=await page.evaluate(()=>window.ULTRON_TASK_CONTEXT?.snapshot());
    assert.ok(ctx?.lastPublicQuestion?.includes('governo da China'),JSON.stringify(ctx));
    const followupRequest=page.waitForRequest(req=>req.url().includes('/api/ai')&&req.method()==='POST'&&req.postData()?.includes('"message":"E no Japão?"'),{timeout:12000});
    await page.evaluate(()=>{document.querySelector('#command-input').value='E no Japão?';document.querySelector('#btn-send').click();});
    const followupBody=JSON.parse((await followupRequest).postData());
    assert.equal(followupBody.taskContext?.followup,true);
    assert.ok(followupBody.taskContext?.lastQuestion?.includes('governo da China'));
    assert.equal(followupBody.taskContext?.region,'japao');
    await page.waitForFunction(()=>!window.ULTRON_ORCHESTRATOR?.state?.busy,{timeout:12000});
    assert.ok(await page.$eval('.ultron-neural-answer-media img',el=>el.src.includes('example.org/picture.jpg')));
    await page.click('.ultron-media-play');
    await page.waitForSelector('.ultron-media-video iframe',{timeout:5000});
    const player=await page.$eval('.ultron-media-video iframe',el=>({src:el.src,width:el.getBoundingClientRect().width}));
    assert.ok(player.src.includes('youtube-nocookie.com/embed/dQw4w9WgXcQ')&&player.width>0,'Inline player must be mounted in Ring');
    const separate=await page.evaluate(()=>{const t=document.querySelector('.ultron-neural-answer-text').getBoundingClientRect(),m=document.querySelector('.ultron-neural-answer-media').getBoundingClientRect();return t.right<=m.left+2||t.bottom<=m.top+2;});
    assert.ok(separate,'Media must never overlap answer text');
    // Use the real typed command route; local UI actions must not rely on AI.
    const aiBefore=await page.evaluate(()=>window.__ultronQuestionSequence||0);
    await page.evaluate(()=>{document.querySelector('#command-input').value='JARVIS, desative os textos do Neural Ring';document.querySelector('#btn-send').click();});
    await page.waitForFunction(()=>window.ULTRON_NEURAL_ANSWER?.textEnabled===false,{timeout:6000});
    assert.equal(await page.$eval('.ultron-neural-answer-text',el=>getComputedStyle(el).display),'none');
    assert.ok(await page.$('.ultron-media-video iframe'),'Video remains mounted when texts are disabled');
    await page.evaluate(()=>{document.querySelector('#command-input').value='Ative os textos do Neural Ring';document.querySelector('#btn-send').click();});
    await page.waitForFunction(()=>window.ULTRON_NEURAL_ANSWER?.textEnabled===true,{timeout:6000});
    assert.equal(await page.$eval('.ultron-neural-answer-text',el=>el.textContent),'Resposta real do fluxo de comando: China');
    assert.equal(await page.evaluate(()=>window.__ultronQuestionSequence||0),aiBefore,'Interface commands must not start an AI request');
    await page.evaluate(()=>{document.querySelector('#command-input').value='JARVIS, o que você pode fazer?';document.querySelector('#btn-send').click();});
    await page.waitForFunction(()=>document.querySelector('.ultron-neural-answer-text')?.textContent.includes('Controle da interface'),{timeout:6000});
    assert.equal(await page.$eval('.ultron-neural-answer-media',el=>el.children.length),0,'Self-knowledge must not display unrelated media');
    assert.equal(await page.$eval('.ultron-neural-answer-sources',el=>el.children.length),0,'Self-knowledge must not display Google links');
    await page.waitForFunction(()=>!!window.ULTRON_NEURAL_PARITY&&window.ULTRON_NEURAL_PARITY.report().starkCore&&window.ULTRON_NEURAL_PARITY.report().innerMesh,{timeout:15000});
    const parity=await page.evaluate(()=>{
      const core=window.ULTRON_STARK_CORE,mesh=window.ULTRON_STARK_MESH;
      const focused=core.focus('COMANDOS');
      const marked=document.querySelector('#command-input').dataset.starkFocused==='true';
      core.processing(true);
      const processing=document.querySelector('#jarvis-cc-state').textContent==='PROCESSANDO';
      core.processing(false);
      mesh.clearFocus();
      return {focused,marked,processing,cleared:!document.querySelector('#command-input').hasAttribute('data-stark-focused'),nodes:mesh.nodes.length,mode:core.mode,legacy:!!document.querySelector('.stark-vortex'),parity:window.ULTRON_NEURAL_PARITY.report()};
    });
    assert.ok(parity.focused&&parity.marked&&parity.processing&&parity.cleared&&parity.nodes>0,JSON.stringify(parity));
    assert.equal(parity.mode,'command-center');
    assert.equal(parity.legacy,false,'Do not restore legacy vortex over Neural Ring');
    assert.equal(parity.parity.starkCore,true);
    assert.equal(parity.parity.innerMesh,true);
    assert.equal(parity.parity.palmMatrix,false,'PalmMatrix remains untouched in current layout');
    const operation=await page.evaluate(async()=>await window.ULTRON_ORCHESTRATOR.execute('Verifique o parity check, depois feche a resposta','test'));
    assert.equal(operation.ok,true);
    assert.equal(operation.results.length,2);
    assert.equal(operation.results[0].result.steps[0].action,'parity.check');
    assert.equal(operation.results[1].result.steps[0].action,'answer.close');
    assert.equal(await page.$eval('.ultron-neural-answer',el=>el.hidden),true,'Compound plan must close the actual panel after diagnosis');
    // A contextual command selects the live globo tool instead of inventing an AI answer.
    const contextual=await page.evaluate(async()=>{
      const original=window.ULTRON_EARTH;
      const state={visible:true,selectedPlace:''};
      window.ULTRON_EARTH={state,async locate(place){state.selectedPlace=place;return {ok:true}}};
      window.ULTRON_TASK_CONTEXT.captureQuestion('Analise os impactos do El Niño no Brasil');
      window.ULTRON_TASK_CONTEXT.recordAction({action:'earth.open'},{ok:true});
      const before=window.ULTRON_TASK_CONTEXT.snapshot();
      const decision=window.ULTRON_TASK_CONTEXT.resolve('Agora foque no Nordeste');
      const result=await window.ULTRON_ORCHESTRATOR.execute('Agora foque no Nordeste','test-context');
      window.ULTRON_EARTH=original;
      return {result,before,decision,context:window.ULTRON_TASK_CONTEXT.snapshot(),selected:state.selectedPlace};
    });
    assert.equal(contextual.result.ok,true);
    assert.equal(contextual.selected,'nordeste',JSON.stringify(contextual));
    assert.equal(contextual.context.region,'nordeste');
    assert.equal(contextual.context.topic,'El Niño');
    await page.close();
  }
  console.log('NEURAL ANSWER PASS: ring only at boot; on-demand text, image, sources; mobile laptop TV');
}finally{await browser.close();}
