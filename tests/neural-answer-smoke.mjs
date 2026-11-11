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
    let weatherProxyOffline=false;
    let weatherCityBackendOffline=false;
    let watchSaved=false;
    page.on('request',req=>{
      if(weatherProxyOffline&&(/\/api\/geo\/(global|locations)/.test(req.url()))){
        return req.respond({status:404,headers:{'access-control-allow-origin':'*'},contentType:'application/json',
          body:JSON.stringify({error:'Rota não encontrada'})});
      }
      if(req.url().includes('geocoding-api.open-meteo.com/v1/search')){
        return req.respond({status:200,headers:{'access-control-allow-origin':'*'},contentType:'application/json',
          body:JSON.stringify({results:[{id:1850147,name:'Tokyo',latitude:35.6895,longitude:139.6917,
            country:'Japan',country_code:'JP',admin1:'Tokyo',timezone:'Asia/Tokyo'}]})});
      }
      if(req.url().includes('api.open-meteo.com/v1/forecast')&&
         new URL(req.url()).searchParams.get('latitude')==='-8.0476'){
        const offset=-3*60*60*1000,local=new Date(Date.now()+offset);
        const midnight=Date.UTC(local.getUTCFullYear(),local.getUTCMonth(),local.getUTCDate());
        const dates=Array.from({length:3},(_,i)=>new Date(midnight+i*86400000).toISOString().slice(0,10));
        const payload={
          current:{time:local.toISOString().slice(0,16),temperature_2m:29,
            relative_humidity_2m:72,precipitation:0},
          daily:{time:dates,temperature_2m_min:[23,24,23],
            temperature_2m_max:[31,32,30],precipitation_sum:[2,5,1],
            precipitation_probability_max:[40,65,20]}
        };
        return req.respond({status:200,headers:{'access-control-allow-origin':'*'},
          contentType:'application/json',body:JSON.stringify(payload)});
      }
      if(req.url().includes('api.open-meteo.com/v1/forecast')){
        const offset=9*3600000,local=new Date(Date.now()+offset);
        const midnight=Date.UTC(local.getUTCFullYear(),local.getUTCMonth(),local.getUTCDate());
        const dates=Array.from({length:16},(_,i)=>new Date(midnight+i*86400000).toISOString().slice(0,10));
        const payload={utc_offset_seconds:32400,
          current:{time:local.toISOString().slice(0,16),temperature_2m:18.2,relative_humidity_2m:64,
            precipitation:0,wind_speed_10m:10},
          daily:{time:dates,temperature_2m_min:Array(16).fill(12),temperature_2m_max:Array(16).fill(23),
            precipitation_sum:Array(16).fill(2.5),precipitation_probability_max:Array(16).fill(40)}};
        return req.respond({status:200,headers:{'access-control-allow-origin':'*'},contentType:'application/json',
          body:JSON.stringify(payload)});
      }

      if(req.url().includes('youtube-nocookie.com/embed/'))return req.respond({status:200,contentType:'text/html',body:'<html><body>Test video player</body></html>'});
      if(req.url().includes('/api/orchestrator/')){
        const headers={'access-control-allow-origin':'*','access-control-allow-methods':'POST, OPTIONS','access-control-allow-headers':'content-type, authorization'};
        if(req.method()==='OPTIONS')return req.respond({status:204,headers});
        return req.respond({status:200,headers,contentType:'application/json',body:JSON.stringify({ok:true,runId:'test-run',plan:{complex:false},runs:[]})});
      }
      if(req.url().includes('/api/geo/insight')){
        const p=new URL(req.url()),type=p.searchParams.get('type');
        const location={id:1850147,key:'global-1850147',name:'Tokyo',country:'Japan',countryCode:'JP',
         region:'Tokyo',lat:35.6895,lng:139.6917,label:'Tokyo, Tokyo, Japan'};
        const response={ok:true,type,location,fetchedAt:'2026-11-11T12:00:00Z',
         source:{name:'Open-Meteo / CAMS',url:'https://open-meteo.com/en/docs/air-quality-api',
          kind:'air-quality-model',disclaimer:'Previsão de modelo não é um sensor oficial'},
         metrics:[{label:'PM2.5',value:12,unit:'µg/m³'}],series:[],bulletins:[]};
        if(type==='alerts'){response.coverage='not-integrated';response.metrics=[];response.source={
          name:'Nenhuma fonte oficial integrada',url:null,disclaimer:'Não significa ausência de avisos.'};}
        return req.respond({status:200,headers:{'access-control-allow-origin':'*'},contentType:'application/json',
         body:JSON.stringify(response)});
      }
      if(req.url().includes('/api/geo/watchlist/configure')){
        const headers={'access-control-allow-origin':'*','access-control-allow-methods':'POST, OPTIONS','access-control-allow-headers':'content-type'};
        if(req.method()==='OPTIONS')return req.respond({status:204,headers});
        const body=JSON.parse(req.postData()||'{}');
        assert.ok(typeof body.memoryKey==='string'&&body.memoryKey.length>=32);
        assert.equal(body.id,1850147);
        watchSaved=body.action==='add';
        return req.respond({status:200,headers:{'access-control-allow-origin':'*'},
         contentType:'application/json',body:JSON.stringify({ok:true,action:body.action})});
      }
      if(req.url().endsWith('/api/geo/watchlist')){
        const headers={'access-control-allow-origin':'*','access-control-allow-methods':'POST, OPTIONS','access-control-allow-headers':'content-type'};
        if(req.method()==='OPTIONS')return req.respond({status:204,headers});
        const body=JSON.parse(req.postData()||'{}');
        assert.ok(body.memoryKey?.length>=32);
        return req.respond({status:200,headers:{'access-control-allow-origin':'*'},
         contentType:'application/json',
         body:JSON.stringify({ok:true,cadenceHours:3,
           watches:watchSaved?[{location_id:1850147,name:'Tokyo',country:'Japan',last_checked_at:null}]:[],
           history:[]})});
      }
      if(req.url().includes('/api/geo/monitor')){
        return req.respond({status:200,headers:{'access-control-allow-origin':'*'},contentType:'application/json',
         body:JSON.stringify({ok:true,checkedAt:'2026-11-11T12:00:00Z',cadenceHours:3,
           regions:[{name:'Recife',temperatureC:29,rainMm:5,rainChancePercent:80}],
           disclaimer:'Amostras de localidades, não do planeta inteiro'})});
      }
      if(req.url().includes('/api/geo/locations')){
        return req.respond({status:200,headers:{'access-control-allow-origin':'*'},
         contentType:'application/json',body:JSON.stringify({ok:true,query:'Tokyo',
           locations:[{id:1850147,key:'global-1850147',name:'Tokyo',country:'Japan',region:'Tokyo',
             countryCode:'JP',lat:35.6895,lng:139.6917,label:'Tokyo, Tokyo, Japan'}]})});
      }
      if(req.url().includes('/api/geo/global')){
        const location={id:1850147,key:'global-1850147',name:'Tokyo',country:'Japan',countryCode:'JP',
          region:'Tokyo',lat:35.6895,lng:139.6917,label:'Tokyo, Tokyo, Japan',timezone:'Asia/Tokyo'};
        const payload={
          ok:true,kind:'global-short-term-forecast',location,fetchedAt:'2026-11-11T12:00:00.000Z',
          current:{time:'2026-11-11T21:00',temperatureC:18.2,humidityPercent:64,precipitationMm:0,windKmh:10},
          days:Array.from({length:16},(_,i)=>({date:'2026-11-'+String(i+11).padStart(2,'0'),
            minC:12,maxC:23,rainMm:2.5,rainChancePercent:40})),
          source:{name:'Open-Meteo.com e GeoNames',url:'https://open-meteo.com/en/docs',
            basePeriod:'test',disclaimer:'Previsão de modelo, não é alerta oficial.'}
        };
        return req.respond({status:200,headers:{'access-control-allow-origin':'*'},
         contentType:'application/json',body:JSON.stringify(payload)});
      }
      if(req.url().includes('raw.githubusercontent.com/nvkelso/natural-earth-vector')){
        return req.respond({status:200,headers:{'access-control-allow-origin':'*'},
         contentType:'application/geo+json',
         body:JSON.stringify({type:'FeatureCollection',features:[{type:'Feature',
           geometry:{type:'Polygon',coordinates:[[[-122,48],[-66,48],[-66,24],[-122,24],[-122,48]]]}}]})});
      }
      if(req.url().includes('/api/geo/intensity')){
        const u=new URL(req.url()),layer=u.searchParams.get('layer')||'rain';
        const region=u.searchParams.get('region')||'brazil',day=Number(u.searchParams.get('day')||'0');
        const samples=region==='world'?40:35,cols=region==='world'?8:7,rows=5,
         west=region==='world'?-180:-74,east=region==='world'?180:-34,
         north=region==='world'?60:6,south=region==='world'?-60:-34;
        const values=Array.from({length:samples},(_,i)=>{
          const row=Math.floor(i/cols),col=i%cols,dx=(east-west)/cols,dy=(north-south)/rows;
          const bounds=[west+dx*col,north-dy*(row+1),west+dx*(col+1),north-dy*row];
          const lat=(bounds[1]+bounds[3])/2,lng=(bounds[0]+bounds[2])/2;
          return {id:region+'-'+row+'-'+col,lat,lng,bounds,
            value:day*8+i*2,color:i%2?'#3276f1':'#e24b9b',
            label:i%2?'2,5–10 mm':'>50 mm',time:'2026-11-'+String(11+day).padStart(2,'0'),unit:'mm/dia'};
        });
        const legend=[{color:'#3c5571',label:'Sem chuva'},{color:'#3276f1',label:'Moderada'},
          {color:'#e24b9b',label:'Intensa'}];
        return req.respond({status:200,headers:{'access-control-allow-origin':'*'},
          contentType:'application/json',body:JSON.stringify({ok:true,layer,region,day,
            label:layer==='rain'?'Chuva prevista':'Intensidade do modelo',unit:'mm/dia',
            dataTime:'2026-11-'+String(11+day).padStart(2,'0'),
            sampledCount:samples,totalSamples:samples,cells:values,legend,
            source:{name:'Open-Meteo — previsão numérica',url:'https://open-meteo.com/en/docs'},
            disclaimer:'Valores em pontos fixos, não radar.'})});
      }
      if(req.url().includes('/api/geo/weather')){
        if(weatherCityBackendOffline)return req.respond({status:503,headers:{'access-control-allow-origin':'*'},
          contentType:'application/json',body:JSON.stringify({ok:false,error:'Não foi possível consultar o provedor meteorológico.'})});

        const payload={
          ok:true,city:{key:'recife',name:'Recife',lat:-8.0476,lng:-34.877},
          fetchedAt:'2026-11-11T12:00:00.000Z',
          current:{time:'2026-11-11T09:00',temperatureC:29,humidityPercent:75,precipitationMm:0},
          days:[
            {date:'2026-11-11',minC:24,maxC:31,rainMm:1.1,rainChancePercent:30},
            {date:'2026-11-12',minC:23,maxC:30,rainMm:12,rainChancePercent:85},
            {date:'2026-11-13',minC:24,maxC:32,rainMm:0,rainChancePercent:10}
          ],source:{name:'Open-Meteo',url:'https://open-meteo.com/en/docs'},kind:'short-term-numeric-forecast'
        };
        return req.respond({status:200,headers:{'access-control-allow-origin':'*'},
          contentType:'application/json',body:JSON.stringify(payload)});
      }
      if(req.url().includes('/api/ai')){
        const headers={'access-control-allow-origin':'*','access-control-allow-methods':'POST, OPTIONS','access-control-allow-headers':'content-type, authorization'};
        if(req.method()==='OPTIONS')return req.respond({status:204,headers});
        return req.respond({status:200,headers,contentType:'application/json',body:JSON.stringify({text:'Resposta real do fluxo de comando: China',provider:'mock',visualContext:{images:[{src:'https://example.org/picture.jpg',alt:'China'}],videos:[{id:'dQw4w9WgXcQ',title:'Vídeo de teste',thumbnail:'https://example.org/picture.jpg',url:'https://www.youtube.com/watch?v=dQw4w9WgXcQ'}],cards:[{title:'China',url:'https://example.org/report'}]}})});
      }
      if(/^https:\/\/example\.org\/(picture|news)\.jpg$/.test(req.url()))
        return req.respond({status:200,contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="420" height="280"><rect width="420" height="280" fill="#406b92"/></svg>'});
      if(req.url().includes('servicodados.ibge.gov.br/api/v3/malhas/paises/BR')){
        return req.respond({status:200,headers:{'access-control-allow-origin':'*'},contentType:'application/geo+json',
          body:JSON.stringify({type:'FeatureCollection',features:[{type:'Feature',geometry:{type:'Polygon',coordinates:[
            [[-72,3],[-52,5],[-36,-5],[-40,-23],[-50,-34],[-57,-30],[-67,-9],[-72,3]]
          ]}}]})});
      }
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
    const presentation=await page.$eval('.ultron-neural-answer',el=>({
      layout:el.dataset.layout,columns:getComputedStyle(el).gridTemplateColumns.split(' ').filter(Boolean).length
    }));
    if(viewport.width<=820){
      assert.equal(presentation.layout,'compact','Phone must use an accessible stacked response');
      assert.equal(presentation.columns,1,'Phone text and visual lanes must stack instead of squeezing');
    }else assert.ok(presentation.columns>=2,'Laptop/TV text and visual lanes must occupy separate columns');
    const compactPhoto=await page.$eval('.ultron-image-card > img',el=>({
      width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height,
      parent:el.parentElement.className
    }));
    assert.ok(Math.abs(compactPhoto.width-compactPhoto.height)<=2,JSON.stringify(compactPhoto));
    assert.ok(compactPhoto.width<=185,'Images must stay compact and square, never cover the stage');
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
    assert.equal(await page.$eval('.ultron-image-card figcaption strong',el=>el.textContent),'Boletim verificado');
    assert.match(await page.$eval('.ultron-image-card figcaption',el=>el.textContent),/Agência pública/);
    assert.equal(newsPicture,'https://example.org/news.jpg','Wake news must mount publisher image inside ring');
    await page.evaluate(()=>window.dispatchEvent(new CustomEvent('ultron:speech-start',{detail:{source:'intelligence-wake',text:'Resumo de notícias falado'}})));
    assert.equal(await page.$eval('.ultron-news-story h3',el=>el.textContent),'Boletim verificado','Narration must preserve the structured report');
    await page.click('.ultron-neural-answer-close');
    const closed=await page.evaluate(()=>{
      const box=document.querySelector('.ultron-neural-answer'),button=document.querySelector('.ultron-neural-answer-close');
      const rect=button.getBoundingClientRect();
      const at=document.elementFromPoint(rect.x+rect.width/2,rect.y+rect.height/2);
      return {hidden:box.hidden,layout:box.dataset.layout,at:at?.className||at?.tagName,buttonRect:{x:rect.x,y:rect.y,width:rect.width,height:rect.height},
      style:{display:getComputedStyle(button).display,pointer:getComputedStyle(button).pointerEvents,z:getComputedStyle(button).zIndex}};
    });
    assert.equal(closed.hidden,true,JSON.stringify(closed));
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
    const mediaLayout=await page.evaluate(()=>{
      const images=document.querySelector('.ultron-media-images');
      const videos=document.querySelector('.ultron-media-videos');
      const image=images?.querySelector('.ultron-image-card > img');
      const player=videos?.querySelector('.ultron-media-play > img');
      const info=images?.querySelector('.ultron-image-card figcaption');
      const videoInfo=videos?.querySelector('.ultron-video-info strong');
      const pi=image?.getBoundingClientRect(),pv=player?.getBoundingClientRect();
      return {imageSection:!!images,videoSection:!!videos,distinct:images?.parentElement===videos?.parentElement&&images!==videos,
       imageSquare:Math.abs(pi?.width-pi?.height)<=2,imageWidth:pi?.width,videoRatio:pv?.width/pv?.height,
       videoBelow:images?.getBoundingClientRect().bottom<=videos?.getBoundingClientRect().top+2,
       imageInfo:info?.textContent,videoInfo:videoInfo?.textContent,
       overflow:document.documentElement.scrollWidth-innerWidth};
    });
    assert.ok(mediaLayout.imageSection&&mediaLayout.videoSection&&mediaLayout.distinct,JSON.stringify(mediaLayout));
    assert.ok(mediaLayout.imageSquare&&mediaLayout.imageWidth<=185,JSON.stringify(mediaLayout));
    assert.ok(Math.abs(mediaLayout.videoRatio-16/9)<0.08,JSON.stringify(mediaLayout));
    assert.ok(mediaLayout.videoBelow,'Video must occupy its own lane BELOW the photos');
    assert.match(mediaLayout.imageInfo,/China/);
    assert.match(mediaLayout.videoInfo,/Vídeo de teste/);
    assert.ok(mediaLayout.overflow<=3,'Media layout must not widen the viewport');
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
      window.ULTRON_EARTH={state,async open(){state.visible=true;return {ok:true}},async locate(place){state.selectedPlace=place;return {ok:true}}};
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

    // Phase 3: a normal spoken-style command must render a real 2D map
    // within the Neural Ring and never claim numeric risk predictions.
    const geography=await page.evaluate(async()=>{
      const earth=window.ULTRON_EARTH;
      const state={visible:false,layerCount:0,playing:false,focused:null};
      window.ULTRON_EARTH={
        state,async open(){state.visible=true;return {ok:true}},
        setThematicLayer(points,{playing=false}={}){state.layerCount=points.length;state.playing=playing;return {ok:true,count:points.length};},
        clearThematicLayer(){state.layerCount=0;return {ok:true}},focus(lat,lng){state.focused=[lat,lng];return {ok:true}}
      };
      const result=await window.ULTRON_ORCHESTRATOR.execute('JARVIS, crie uma simulação 2D do El Niño','phase3-test');
      const snapshot={result,geo:window.ULTRON_GEO_VISUAL?.state,theme:{...state}};
      window.__phase3EarthRestore=()=>{window.ULTRON_EARTH=earth;};
      window.__phase3MockState=state;
      return snapshot;
    });
    assert.equal(geography.result.ok,true,JSON.stringify(geography));
    assert.equal(geography.geo.mode,'2d');
    assert.equal(geography.geo.scenario,'enso');
    await page.waitForFunction(()=>document.querySelector('.jarvis-geo-2d svg path'),{timeout:9000});
    const mapped=await page.evaluate(()=>{
      const geo=document.querySelector('.jarvis-geo-visual'),stage=document.querySelector('.jarvis-cc-center');
      const panel=geo.getBoundingClientRect(),parent=stage.getBoundingClientRect();
      return {visible:!geo.hidden,markerCount:geo.querySelectorAll('.jarvis-geo-marker').length,
        paths:geo.querySelectorAll('.jarvis-geo-2d svg path').length,source:geo.querySelector('.jarvis-geo-footer a')?.href,
        warning:geo.querySelector('.jarvis-geo-footer small')?.textContent,
        inside:panel.left>=parent.left-3&&panel.right<=parent.right+3,
        overflow:document.documentElement.scrollWidth-innerWidth};
    });
    assert.equal(mapped.visible,true);
    assert.ok(mapped.markerCount>=5&&mapped.paths>=1,JSON.stringify(mapped));
    assert.ok(mapped.source.includes('gov.br/cemaden'));
    assert.match(mapped.warning,/Não são limites de desastre/);
    assert.ok(mapped.inside&&mapped.overflow<=3,JSON.stringify(mapped));
    await page.$eval('.jarvis-geo-region',el=>el.scrollIntoView({block:'center',inline:'nearest'}));
    const hitRegion=await page.evaluate(()=>{
      const button=document.querySelector('.jarvis-geo-region'),r=button.getBoundingClientRect();
      const el=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);
      return {rect:{left:r.left,top:r.top,width:r.width,height:r.height},
        tag:el?.tagName,className:String(el?.className||''),inside:button===el||button.contains(el),
        buttonPointer:getComputedStyle(button).pointerEvents,
        panelPointer:getComputedStyle(document.querySelector('.jarvis-geo-visual')).pointerEvents,
        panelZ:getComputedStyle(document.querySelector('.jarvis-geo-visual')).zIndex,
        scrollY:window.scrollY};
    });
    assert.ok(hitRegion.inside,'Regional button must remain clickable after internal scrolling: '+JSON.stringify(hitRegion));
    await page.click('.jarvis-geo-region');
    const regionDetail=await page.$eval('.jarvis-geo-detail',el=>({
      text:el.textContent,link:el.querySelector('a')?.href||null,
      selected:document.querySelector('.jarvis-geo-region[aria-pressed=true]')?.dataset.id||null
    }));
    assert.ok(regionDetail.link?.includes('gov.br/cemaden'),JSON.stringify(regionDetail));
    await page.select('.jarvis-geo-filter','wet');
    assert.ok((await page.$eval('.jarvis-geo-visual',el=>el.querySelectorAll('.jarvis-geo-marker').length))>=1);
    await page.click('.jarvis-geo-modes [data-mode="3d"]');
    await page.waitForFunction(()=>window.ULTRON_GEO_VISUAL?.state?.mode==='3d',{timeout:7000});
    assert.ok(await page.evaluate(()=>window.__phase3MockState.layerCount)>=1,'Globe must receive filtered thematic markers');
    await page.click('.jarvis-geo-timeline button');
    assert.equal(await page.evaluate(()=>window.ULTRON_GEO_VISUAL.state.playing),true);
    assert.equal(await page.evaluate(()=>window.__phase3MockState.playing),true);
    await page.click('.jarvis-geo-timeline button');
    assert.equal(await page.evaluate(()=>window.ULTRON_GEO_VISUAL.state.playing),false);
    await page.click('.jarvis-geo-close');
    assert.equal(await page.evaluate(()=>window.ULTRON_GEO_VISUAL.state.visible),false);
    assert.equal(await page.evaluate(()=>window.__phase3MockState.layerCount),0);
    // Phase 4: a real action chain must fetch a weather payload and render
    // distinct numeric forecast days inside the same Neural Ring (all viewports).
    const weather=await page.evaluate(async()=>{
      const result=await window.ULTRON_ORCHESTRATOR.execute('JARVIS, mostre a previsão do tempo em Recife no mapa 2D','phase4-test');
      const state=window.ULTRON_GEO_VISUAL.state;
      return {result,state,
        description:document.querySelector('.jarvis-geo-evidence')?.textContent,
        source:document.querySelector('.jarvis-geo-footer a')?.href};
    });
    assert.equal(weather.result.ok,true,JSON.stringify(weather));
    assert.equal(weather.state.scenario,'weather-recife');
    assert.equal(weather.state.mode,'2d');

    await page.waitForFunction(()=>document.querySelectorAll('.jarvis-geo-intensity-cell').length>=30,{timeout:7000});
    const painted=await page.evaluate(()=>({
      layer:window.ULTRON_GEO_VISUAL.state.layer,
      count:window.ULTRON_GEO_VISUAL.state.gridCount,
      shaded:document.querySelectorAll('.jarvis-geo-intensity-cell').length,
      countryClip:!!document.getElementById('jarvis-geo-brazil-mask'),
      legend:document.querySelector('.jarvis-geo-intensity-legend')?.textContent,
      note:document.querySelector('.jarvis-geo-intensity-status')?.textContent
    }));
    assert.equal(painted.layer,'rain');
    assert.equal(painted.count,35);
    assert.ok(painted.shaded>=30);
    assert.equal(painted.countryClip,true);
    assert.match(painted.legend,/Chuva prevista/);
    assert.match(painted.note,/CÉLULAS|células/);
    await page.evaluate(()=>{
      const layer=document.querySelector('.jarvis-geo-intensity-choice');
      layer.value='drought';layer.dispatchEvent(new Event('change',{bubbles:true}));
    });
    await page.waitForFunction(()=>document.querySelector('.jarvis-geo-intensity-status')?.textContent?.includes('ANA'),{timeout:3500});
    assert.equal(await page.$$eval('.jarvis-geo-intensity-cell',els=>els.length),0,
      'Never invent drought S0–S4 polygons from forecast data');
    await page.evaluate(()=>{
      const layer=document.querySelector('.jarvis-geo-intensity-choice');
      layer.value='soil';layer.dispatchEvent(new Event('change',{bubbles:true}));
    });
    await page.waitForFunction(()=>window.ULTRON_GEO_VISUAL.state.layer==='soil'&&window.ULTRON_GEO_VISUAL.state.gridCount>0,{timeout:7000});
    assert.equal(await page.$$eval('.jarvis-geo-intensity-cell',els=>els.length),35);
    await page.evaluate(()=>{
      const layer=document.querySelector('.jarvis-geo-intensity-choice');
      layer.value='rain';layer.dispatchEvent(new Event('change',{bubbles:true}));
    });
    await page.waitForFunction(()=>window.ULTRON_GEO_VISUAL.state.layer==='rain'&&window.ULTRON_GEO_VISUAL.state.gridCount>0,{timeout:7000});


    // Screenshot regression: the 2D map owns the entire Neural Ring stage.
    // It must no longer be a narrow floating pane in front of the large globe.
    const mapLayout=await page.evaluate(()=>{
      const stage=document.querySelector('.jarvis-cc-center').getBoundingClientRect();
      const panel=document.querySelector('.jarvis-geo-visual');
      const overlay=panel.getBoundingClientRect();
      const map=document.querySelector('.jarvis-geo-2d').getBoundingClientRect();
      const workspace=document.querySelector('.jarvis-geo-workspace').getBoundingClientRect();
      const metrics=document.querySelector('.jarvis-geo-metrics').getBoundingClientRect();
      return {stage:{x:stage.x,y:stage.y,w:stage.width,h:stage.height},
        overlay:{x:overlay.x,y:overlay.y,w:overlay.width,h:overlay.height},
        workspace:{w:workspace.width,h:workspace.height},
        metrics:{w:metrics.width,h:metrics.height},
        map:{w:map.width,h:map.height},mode:panel.dataset.mode,
        screen:panel.dataset.screen,
        columns:getComputedStyle(document.querySelector('.jarvis-geo-workspace')).gridTemplateColumns,
        innerWidth:window.innerWidth,
        scroll:getComputedStyle(panel).overflowY,
        hidden:panel.hidden};
    });
    assert.equal(mapLayout.mode,'2d');
    assert.equal(mapLayout.hidden,false);
    assert.ok(Math.abs(mapLayout.overlay.x-mapLayout.stage.x)<5,JSON.stringify(mapLayout));
    // Neural Ring can retain a small internal scroll offset on touch devices.
    assert.ok(Math.abs(mapLayout.overlay.y-mapLayout.stage.y)<20,JSON.stringify(mapLayout));
    assert.ok(mapLayout.overlay.w>mapLayout.stage.w*.95,JSON.stringify(mapLayout));
    assert.ok(mapLayout.overlay.h>mapLayout.stage.h*.95,JSON.stringify(mapLayout));
    assert.ok(mapLayout.workspace.w>mapLayout.stage.w*.86,JSON.stringify(mapLayout));
    if(mapLayout.stage.w<660)assert.equal(mapLayout.columns.split(/\\s+/).length,1,'Compact Neural Ring must stack map and metrics');
    assert.ok(mapLayout.map.w>mapLayout.stage.w*(viewport.width<=980?.76:.42),JSON.stringify(mapLayout));
    assert.ok(mapLayout.metrics.w>130,JSON.stringify(mapLayout));
    assert.equal(mapLayout.scroll,'auto');
    const forecastCards=await page.$eval('.jarvis-geo-metrics',el=>el.textContent);
    assert.match(forecastCards,/MÍNIMA PREVISTA/);
    assert.match(forecastCards,/CHUVA PREVISTA/);
    assert.match(forecastCards,/1,1 mm/);
    assert.match(forecastCards,/CHUVA PREVISTA · PRÓXIMOS DIAS/);
    assert.equal(await page.$eval('.jarvis-geo-rain-row[data-active="true"] small',el=>el.textContent),'2026-11-11');
    // Map camera controls must change the REAL SVG viewbox, not its container.
    const defaultBox=await page.$eval('.jarvis-geo-2d svg',el=>el.getAttribute('viewBox'));
    await page.evaluate(()=>document.querySelector('[aria-label="Aproximar mapa 2D"]').click());
    const zoomBox=await page.$eval('.jarvis-geo-2d svg',el=>el.getAttribute('viewBox'));
    assert.notEqual(zoomBox,defaultBox,'Zoom must change geographic camera');
    assert.equal(await page.$eval('.jarvis-geo-map-zoom',el=>el.textContent),'155%');
    await page.evaluate(()=>document.querySelector('[aria-label="Centralizar mapa no local indicado"]').click());
    assert.equal(await page.$eval('.jarvis-geo-map-zoom',el=>el.textContent),'270%');
    await page.evaluate(()=>document.querySelector('[aria-label="Restaurar extensão completa do mapa"]').click());
    assert.equal(await page.$eval('.jarvis-geo-2d svg',el=>el.getAttribute('viewBox')),defaultBox);
    await page.evaluate(()=>window.ULTRON_GEO_VISUAL.setFrame(0));
    const currentCards=await page.$eval('.jarvis-geo-metrics',el=>el.textContent);
    assert.match(currentCards,/TEMPERATURA ESTIMADA/);
    assert.match(currentCards,/29 °C/);
    assert.match(currentCards,/UMIDADE/);
    await page.evaluate(()=>window.ULTRON_GEO_VISUAL.setFrame(2));
    assert.match(await page.$eval('.jarvis-geo-metric-card[data-metric="rainMm"] strong',el=>el.textContent),/12 mm/);
    await page.evaluate(()=>window.ULTRON_GEO_VISUAL.setFrame(1));

    assert.equal(weather.state.frameCount,4,'Current estimate plus 3 forecast days');
    assert.ok(weather.description?.includes('mm'),'Must display sourced precipitation values');
    assert.match(weather.source,/open-meteo/);
    assert.equal(await page.$eval('.jarvis-geo-2d',el=>el.hidden),false);
    await page.evaluate(()=>window.ULTRON_GEO_VISUAL.setFrame(3));
    assert.equal(await page.evaluate(()=>window.ULTRON_GEO_VISUAL.state.frame),3);
    await page.evaluate(()=>window.ULTRON_GEO_VISUAL.setMode('3d'));
    assert.equal(await page.evaluate(()=>window.ULTRON_GEO_VISUAL.state.mode),'3d');
    if(viewport.width>1000){
      const stageWidth=await page.$eval('.jarvis-cc-center',el=>el.getBoundingClientRect().width);
      const hudWidth=await page.$eval('.jarvis-geo-visual',el=>el.getBoundingClientRect().width);
      assert.ok(hudWidth<stageWidth*.8,'3D mode should recover the compact HUD instead of hiding the globe');
    }

    assert.ok(await page.evaluate(()=>window.__phase3MockState.layerCount)>0,'Forecast marker must be sent to globe');
    await page.evaluate(()=>window.ULTRON_GEO_VISUAL.close());
    // A Cloudflare 503 for the 11-capital route must recover via Open-Meteo
    // without inferring or inventing measurements.
    weatherCityBackendOffline=true;
    const cityRecovery=await page.evaluate(async()=>{
      const result=await window.ULTRON_ORCHESTRATOR.execute(
        'JARVIS, mostre a previsão do tempo em Recife no mapa 2D','phase4-city-recovery');
      return {result,state:window.ULTRON_GEO_VISUAL?.state,
        evidence:document.querySelector('.jarvis-geo-evidence')?.textContent};
    });
    assert.equal(cityRecovery.result.ok,true,'City forecast must recover from a Worker 503: '+JSON.stringify(cityRecovery));
    assert.equal(cityRecovery.state.scenario,'weather-recife');
    assert.equal(cityRecovery.state.frameCount,4);
    assert.match(cityRecovery.evidence,/mm/);
    await page.evaluate(()=>window.ULTRON_GEO_VISUAL.close());
    weatherCityBackendOffline=false;
    // Global geography must use real world coordinates, never the Brazil-only projection.
    const worldwide=await page.evaluate(async()=>{
      const result=await window.ULTRON_ORCHESTRATOR.execute(
       'Jarvis, mostre a previsão do tempo em Tokyo no mapa 2D por 16 dias','worldwide-test');
      const state=window.ULTRON_GEO_VISUAL.state;
      return {result,state,
        note:document.querySelector('.jarvis-geo-map-note')?.textContent,
        source:document.querySelector('.jarvis-geo-footer a')?.href,
        marker:document.querySelector('.jarvis-geo-marker > circle')?.getAttribute('cx')};
    });
    assert.equal(worldwide.result.ok,true,JSON.stringify(worldwide));
    assert.equal(worldwide.state.scenario,'weather-global-1850147',JSON.stringify(worldwide));
    assert.equal(worldwide.state.mode,'2d');
    assert.equal(worldwide.state.frameCount,17);
    assert.ok(worldwide.marker>650,'Tokyo marker must appear on the world projection');
    assert.match(worldwide.note,/Natural Earth/);
    assert.match(worldwide.source,/open-meteo/);
    assert.equal(await page.$eval('.jarvis-geo-place-bar',el=>el.hidden),false);
    // Explicit personal opt-in from the same ring; no implicit monitoring.
    await page.evaluate(()=>{
      const old=window.ULTRON_MEMORY||{};
      window.ULTRON_MEMORY={...old,getMemoryKey:()=>('test-memory-key-'+('z'.repeat(44)))};
    });
    await page.click('.jarvis-geo-place-bar button[title^="Acompanhar"]');
    await page.waitForFunction(()=>document.querySelector('.jarvis-geo-watch-panel')?.textContent?.includes('Tokyo'),{timeout:7000});
    assert.ok(watchSaved,'User explicitly opted into watchlist');
    assert.ok((await page.$eval('.jarvis-geo-watch-panel',el=>el.textContent)).includes('3 EM 3 HORAS'));
    await page.click('.jarvis-geo-watch-row button');
    await page.waitForFunction(()=>document.querySelector('.jarvis-geo-watch-panel')?.textContent?.includes('Nenhuma cidade'),{timeout:7000});
    assert.equal(watchSaved,false,'Stopping monitoring removes the sample');

    await page.evaluate(()=>{
      document.querySelector('.jarvis-geo-place-bar input').value='Tokyo';
      document.querySelector('.jarvis-geo-place-bar').requestSubmit();
    });
    await new Promise(resolve=>setTimeout(resolve,1350));
    const searchDebug=await page.evaluate(()=>({
      result:document.querySelector('.jarvis-geo-place-results')?.textContent,
      hidden:document.querySelector('.jarvis-geo-place-results')?.hidden,
      buttonCount:document.querySelectorAll('.jarvis-geo-place-results button').length,
      query:document.querySelector('.jarvis-geo-place-bar input')?.value,
      panelHidden:document.querySelector('.jarvis-geo-visual')?.hidden
    }));
    console.log('PHASE5 SEARCH DEBUG',JSON.stringify(searchDebug));
    await page.waitForFunction(()=>{
      const root=document.querySelector('.jarvis-geo-place-results');
      return root?.querySelectorAll('button').length||/não encontrada|Erro|indisponível/.test(root?.textContent||'');
    },{timeout:12000});
    const geoSearchState=await page.$eval('.jarvis-geo-place-results',el=>({
      text:el.textContent,buttons:el.querySelectorAll('button').length
    }));
    assert.equal(geoSearchState.buttons,1,JSON.stringify(geoSearchState));
    await page.evaluate(()=>document.querySelector('.jarvis-geo-place-results button')?.click());
    await page.waitForFunction(()=>document.querySelector('.jarvis-geo-place-results')?.textContent?.includes('atualizada'),{timeout:6000});
    assert.equal(await page.$eval('.jarvis-geo-place-bar input',el=>el.value),'Tokyo, Tokyo, Japan');
    await page.evaluate(()=>window.ULTRON_GEO_VISUAL.setFrame(16));
    assert.equal(await page.evaluate(()=>window.ULTRON_GEO_VISUAL.state.frame),16);
    assert.equal(await page.$eval('.jarvis-geo-insight-bar',el=>el.hidden),false);
    const air=await page.evaluate(async()=>{
      return await window.ULTRON_ORCHESTRATOR.execute(
        'Jarvis, mostre a qualidade do ar em Tokyo no mapa 2D','world-insight-browser');
    });
    assert.equal(air.ok,true,JSON.stringify(air));
    assert.equal(await page.evaluate(()=>window.ULTRON_GEO_VISUAL.state.scenario),'insight-air-global-1850147');
    assert.match(await page.$eval('.jarvis-geo-evidence',el=>el.textContent),/PM2.5/);
    await page.select('.jarvis-geo-insight-bar select','alerts');
    await page.evaluate(()=>document.querySelector('.jarvis-geo-insight-bar').requestSubmit());
    await page.waitForFunction(()=>document.querySelector('.jarvis-geo-place-results')?.textContent?.includes('Sem fonte oficial integrada'),
      {timeout:5000});
    await page.evaluate(()=>document.querySelector('.jarvis-geo-insight-bar button[type=button]').click());
    await page.waitForFunction(()=>document.querySelector('.jarvis-geo-place-results')?.textContent?.includes('Recife'),
      {timeout:5000});

    await page.evaluate(()=>window.ULTRON_GEO_VISUAL.close());
    // Cloudflare D1 deploy outage must not disable public worldwide forecast.
    weatherProxyOffline=true;
    const recovered=await page.evaluate(async()=>{
      const result=await window.ULTRON_ORCHESTRATOR.execute(
        'Jarvis, mostre a previsão do tempo em Tokyo no globo 3D por 16 dias','global-provider-fallback');
      return {result,state:window.ULTRON_GEO_VISUAL?.state};
    });
    assert.equal(recovered.result.ok,true,'Direct Open-Meteo recovery must work: '+JSON.stringify(recovered));
    assert.equal(recovered.state.mode,'3d');
    assert.equal(recovered.state.frameCount,17);
    assert.equal(recovered.state.scenario,'weather-global-1850147');
    await page.evaluate(()=>window.ULTRON_GEO_VISUAL.setMode('2d'));
    await page.evaluate(()=>{
      document.querySelector('.jarvis-geo-place-bar input').value='Tokyo';
      document.querySelector('.jarvis-geo-place-bar').requestSubmit();
    });
    await page.waitForFunction(()=>document.querySelectorAll('.jarvis-geo-place-results button').length===1,{timeout:7000});
    await page.evaluate(()=>document.querySelector('.jarvis-geo-place-results button').click());
    await page.waitForFunction(()=>document.querySelector('.jarvis-geo-place-results')?.textContent?.includes('atualizada'),{timeout:7000});
    await page.evaluate(()=>window.ULTRON_GEO_VISUAL.close());
    weatherProxyOffline=false;
    await page.evaluate(()=>window.__phase3EarthRestore());
    await page.close();
  }
  console.log('NEURAL ANSWER PASS: ring-only boot; responsive stacked/split layout; compact square image cards; distinct inline video lane; mobile/laptop/TV');
}finally{await browser.close();}
