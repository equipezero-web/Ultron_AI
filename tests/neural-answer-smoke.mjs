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
    await page.goto('http://127.0.0.1:8766/',{waitUntil:'domcontentloaded'});
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
    assert.equal(answered.anchored.inside,true,'Answers must belong to 3D neural stage');
    assert.equal(answered.anchored.position,'absolute','Never flow to the page bottom');
    assert.equal(answered.anchored.horizontal,true,JSON.stringify(answered.anchored));
    assert.equal(answered.anchored.vertical,true,JSON.stringify(answered.anchored));
    assert.ok(answered.source.includes('example.org/report'));
    assert.ok(answered.overflow<=3,'Response must not overflow viewport');
    await page.evaluate(()=>window.dispatchEvent(new CustomEvent('ultron:speech-start',{detail:{source:'intelligence-wake',text:'Resumo de notícias falado'}})));
    assert.equal(await page.$eval('.ultron-neural-answer-text',el=>el.textContent),'Resumo de notícias falado','Voice text must appear within ring');
    await page.click('.ultron-neural-answer-close');
    assert.equal(await page.$eval('.ultron-neural-answer',el=>el.hidden),true);
    await page.close();
  }
  console.log('NEURAL ANSWER PASS: ring only at boot; on-demand text, image, sources; mobile laptop TV');
}finally{await browser.close();}
