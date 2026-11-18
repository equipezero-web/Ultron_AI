import assert from "node:assert/strict";
import puppeteer from "puppeteer-core";

const chrome=process.env.CHROME_BIN||"/usr/bin/google-chrome";
const browser=await puppeteer.launch({
 executablePath:chrome,headless:true,args:["--no-sandbox","--disable-dev-shm-usage",
 "--use-gl=swiftshader","--enable-webgl","--disable-setuid-sandbox"]
});
try{
 for(const [name,width,height] of [["mobile",390,844],["desktop",1280,800]]){
  const page=await browser.newPage();
  try{
   await page.setViewport({width,height,deviceScaleFactor:1});
   await page.goto("http://127.0.0.1:8772/index.html",
    {waitUntil:"domcontentloaded",timeout:40000});
   await page.waitForFunction(()=>Boolean(window.JARVIS_TREND_INTELLIGENCE?.open),
    {timeout:30000});
   const out=await page.evaluate(async()=>{
    const prior=window.fetch;
    const response={ok:true,region:"all",category:"all",checkedAt:"2026-11-16T16:12:00Z",
     sampleBased:true,exhaustive:false,partial:true,stale:false,
     coverage:{observed:3,expected:44,complete:false},
     interpretation:"Buscas em alta não comprovam a veracidade das notícias.",
     items:[{kind:"search-trend",title:"Termo fictício do teste",source:"Google Trends",
      category:"pesquisas",region:"BR",url:"https://trends.google.com/trending?geo=BR",
      observedAt:"2026-11-16T15:00:00Z",approximateSearches:"10K+",observedCycles:2,
      evidence:"Busca de teste monitorada pelo provedor.",newsReferences:[],stale:false},
     {kind:"news-observation",title:"Manchete fictícia da suíte",
      source:"Agência Teste",category:"moda",region:"br",
      observedAt:"2026-11-16T14:00:00Z",
      url:"https://news.google.com/rss/articles/test",
      evidence:"Manchete de teste não é prova de verdade.",stale:false}]};
    window.fetch=(url,...args)=>String(url).includes("/api/intelligence/trends")?
      Promise.resolve(new Response(JSON.stringify(response),{
        status:200,headers:{"Content-Type":"application/json"}})):prior(url,...args);
    try{
     const called=await window.JARVIS_TREND_INTELLIGENCE.open();
     const panel=document.querySelector("#jarvis-trends-panel");
     const visible=panel&&!panel.hidden&&getComputedStyle(panel).display!=="none";
     const inNeural=Boolean(panel?.closest(".jarvis-cc-center"));
     const links=[...panel.querySelectorAll("a")].map(el=>el.href);
     const controlsVisible=["btn-listen-voice","btn-toggle-speech"].every(id=>{
       const el=document.getElementById(id);
       return !!el&&getComputedStyle(el).display!=="none"&&el.getBoundingClientRect().width>0;
      });
     const text=panel.textContent;
     const closed=window.JARVIS_TREND_INTELLIGENCE.close();
     return {called,visible,inNeural,links,controlsVisible,text,
       closed:closed.ok===true&&panel.hidden,
       overflow:document.documentElement.scrollWidth-innerWidth};
    }finally{window.fetch=prior;}
   });
   assert.equal(out.called.ok,true,name);
   assert.equal(out.visible,true,name+": in-Neural panel visible");
   assert.equal(out.inNeural,true,name+": trend cards in existing stage");
   assert.equal(out.links.length,2,name+": both grounded source links");
   assert.equal(out.controlsVisible,true,name+": speech controls stay available during news view");
   assert.match(out.text,/COBERTURA PARCIAL/);
   assert.match(out.text,/PRESENTE EM 2 COLETAS/);
   assert.match(out.text,/não comprovam a veracidade/);
   assert.equal(out.closed,true,name+": voice-close available");
   assert.ok(out.overflow<=6,name+": no horizontal overflow");
   console.log("JARVIS TREND NEURAL BROWSER PASS:",name);
  }finally{await page.close();}
 }
}finally{await browser.close();}
