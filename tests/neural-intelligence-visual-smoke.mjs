import assert from "node:assert/strict";
import puppeteer from "puppeteer-core";

const browser=await puppeteer.launch({
  executablePath:process.env.CHROME_BIN||"/usr/bin/google-chrome",
  headless:true,args:["--no-sandbox","--disable-dev-shm-usage","--enable-webgl","--enable-unsafe-swiftshader"]
});
let page;
try{
  page=await browser.newPage();
  await page.setViewport({width:1440,height:900,deviceScaleFactor:1});
  const seen={image:0,history:0,brief:0};
  await page.setRequestInterception(true);
  page.on("request",request=>{
    const url=request.url();
    if(url.includes("cdn.example.org")){
      seen.image++;
      request.respond({
        status:200,contentType:"image/svg+xml",
        body:'<svg xmlns="http://www.w3.org/2000/svg" width="420" height="230"><rect width="420" height="230" fill="#123c5a"/><circle cx="215" cy="115" r="80" fill="#6bd6f4"/></svg>'
      });
      return;
    }
    if(url.includes("/data/world-intelligence-history.json")){
      seen.history++;
      const now=Date.now(),iso=min=>new Date(now-min*60000).toISOString();
      const events=[
        {id:"br",title:"Brasil confirma novo relatório ambiental",category:"brasil",
          url:"https://agenciabrasil.ebc.com.br/brasil-noticia",imageUrl:"https://cdn.example.org/br-news.jpg",
          source:"Agência Brasil",publishedAt:iso(25),firstSeenAt:iso(20),lastSeenAt:iso(8)},
        {id:"sc",title:"Defesa Civil monitora temporais em Santa Catarina",
          category:"santa-catarina",url:"https://www.defesacivil.sc.gov.br/alerta/",
          imageUrl:null,source:"Defesa Civil SC",publishedAt:iso(44),firstSeenAt:iso(32),lastSeenAt:iso(8)},
        {id:"world",title:"Notícias internacionais verificadas",category:"mundo",
          url:"https://bbc.com/portuguese/briefing",imageUrl:"https://cdn.example.org/world.jpg",
          source:"BBC",publishedAt:iso(50),firstSeenAt:iso(41),lastSeenAt:iso(8)}
      ];
      const payload={ok:true,version:"2.0",windowHours:24,updatedAt:iso(2),
        monitoredBy:"github-actions-scheduled",events,checks:[
          {at:iso(17),ok:true},{at:iso(2),ok:true}
        ],latest:{
          alerts:{checked:true,checkedAt:iso(2),warnings:[{
            title:"Chuvas intensas",severity:"Perigo",phase:"vigente",
            endsAt:new Date(now+90*60000).toISOString(),url:"https://avisos.inmet.gov.br/"
          }]},
          enso:{checked:true,checkedAt:iso(2),bulletin:{
            status:"El Niño Advisory",issued:"8 October 2026",
            url:"https://www.cpc.ncep.noaa.gov/products/analysis_monitoring/enso_advisory/ensodisc.html"
          }}
        }};
      request.respond({status:200,contentType:"application/json",
        headers:{"access-control-allow-origin":"*"},body:JSON.stringify(payload)});
      return;
    }
    if(url.includes("/api/briefing")){
      seen.brief++;
      const iso=new Date().toISOString();
      const topics=[
        {id:"brasil",label:"Brasil",articles:[{
          title:"Brasil confirma novo relatório ambiental",
          url:"https://agenciabrasil.ebc.com.br/brasil-noticia",
          source:"Agência Brasil",publishedAt:iso,
          imageUrl:"https://cdn.example.org/br-news.jpg"
        }]},
        {id:"mundo",label:"Mundo",articles:[{
          title:"Notícias internacionais verificadas",
          url:"https://bbc.com/portuguese/briefing",
          source:"BBC",publishedAt:iso,imageUrl:"https://cdn.example.org/world.jpg"
        }]}
      ];
      request.respond({status:200,contentType:"application/json",
        headers:{"access-control-allow-origin":"*"},
        body:JSON.stringify({
          ok:true,fetchedAt:iso,hasNews:true,partial:false,topics,
          alerts:{checked:true,warnings:[]},enso:{checked:false,bulletin:null},officialLinks:[]
        })});
      return;
    }
    if(url.includes("/data/world-briefing.json")){
      request.respond({status:503,contentType:"application/json",body:'{"ok":false}'});
      return;
    }
    request.continue();
  });
  await page.goto(process.env.JARVIS_TEST_URL||"http://127.0.0.1:8766/",{
    waitUntil:"domcontentloaded",timeout:35000
  });
  await page.waitForFunction(()=>window.ULTRON_NEURAL_NEWS?.state?.count>=3,{timeout:18000});
  const initial=await page.evaluate(()=>({
    integrated:document.querySelector(".jarvis-cc-center")?.contains(document.querySelector("#jarvis-neural-news")),
    visual:document.querySelector(".jarvis-cc-visual").dataset.mode,
    heading:document.querySelector(".jarvis-neural-news-brand")?.textContent,
    title:document.querySelector(".jarvis-neural-news-title")?.textContent,
    image:document.querySelector(".jarvis-neural-news-photo")?.src,
    imageVisible:!document.querySelector(".jarvis-neural-news-photo")?.hidden,
    photoLabel:document.querySelector(".jarvis-neural-news-photo-label")?.textContent,
    origin:document.querySelector(".jarvis-neural-news-source")?.textContent,
    alert:document.querySelector(".jarvis-neural-news-alert")?.textContent,
    anchor:document.querySelector(".jarvis-neural-news-link")?.href,
    other:[...document.querySelectorAll(".jarvis-neural-news-secondary")].map(n=>n.textContent),
    count:window.ULTRON_NEURAL_NEWS.state.count,
    ring:window.ULTRON_NEURAL_RING_3D?.active
  }));
  assert.equal(initial.integrated,true,"News must be inside the original Neural Ring stage");
  assert.equal(initial.visual,"ring");
  assert.equal(initial.ring,true,"3D neural engine should remain animated and active");
  console.log("NEURAL NEWS DEBUG heading =",JSON.stringify(initial.heading),"title =",JSON.stringify(initial.title));
  assert.ok(initial.heading.includes("ULTRON / INTELLIGENCE"));
  assert.equal(initial.title,"Brasil confirma novo relatório ambiental");
  assert.ok(initial.image.includes("/br-news.jpg"),"Main photo must be the publisher's verified image URL");
  assert.equal(initial.imageVisible,true,"Valid publisher image should be shown");
  assert.ok(initial.origin.includes("Agência Brasil"));
  assert.ok(initial.alert.includes("INMET")&&initial.alert.includes("Chuvas intensas"));
  assert.ok(initial.anchor.includes("/brasil-noticia"));
  assert.ok(initial.other.length>=2);
  await page.waitForFunction(()=>document.querySelector(".jarvis-neural-news-photo")?.naturalWidth===420,{timeout:6000});
  assert.ok(seen.image>=1);

  const before=await page.evaluate(()=>window.ULTRON_NEURAL_NEWS.state.headline);
  await page.click(".jarvis-neural-news-controls button:last-child");
  const after=await page.evaluate(()=>window.ULTRON_NEURAL_NEWS.state.headline);
  assert.notEqual(after,before,"Carousel navigation must select next source-verified article");
  await page.click(".jarvis-neural-news-detail");
  const detail=await page.evaluate(()=>({
    expanded:document.querySelector(".jarvis-neural-news-detail").getAttribute("aria-expanded"),
    context:document.querySelector(".jarvis-neural-news-context").textContent
  }));
  assert.equal(detail.expanded,"true");
  assert.ok(detail.context.includes("não inventa resumos"),"Expanded view must not fabricate a news summary");
  await page.click(".jarvis-neural-news-detail");

  await page.evaluate(()=>window.dispatchEvent(new CustomEvent("ultron:wake-state",{
    detail:{awake:true,detail:"manual"}
  })));
  await page.waitForFunction(()=>document.querySelector("#jarvis-neural-news")
    ?.classList.contains("jarvis-neural-news-awake"),{timeout:10000});
  assert.ok(seen.history>=2,"On wake, load the 24h source archive");
  const wake=await page.evaluate(()=>window.ULTRON_NEURAL_NEWS.state);
  assert.equal(wake.waking,true,"Wake action activates a visual intelligence report");
  assert.ok(wake.count>=3);

  await page.evaluate(()=>document.querySelector('[data-visual="globe"]').click());
  await page.waitForFunction(()=>window.ULTRON_EARTH?.state?.visible===true,{timeout:18000});
  await page.waitForFunction(()=>window.ULTRON_NEURAL_NEWS?.state?.mode==="globe",{timeout:5000});
  const map=await page.evaluate(()=>({
    news:document.querySelector("#jarvis-neural-news").getBoundingClientRect().width,
    globe:window.ULTRON_EARTH?.state?.visible,
    over:document.querySelector("#jarvis-neural-news").parentElement.classList.contains("jarvis-cc-center")
  }));
  assert.equal(map.globe,true);
  assert.equal(map.over,true);
  assert.ok(map.news>=245);

  await page.setViewport({width:390,height:844,isMobile:true,hasTouch:true,deviceScaleFactor:1});
  await page.evaluate(()=>window.ULTRON_EARTH?.close());
  const mobile=await page.evaluate(()=>{
    const panel=document.querySelector("#jarvis-neural-news");
    const rect=panel.getBoundingClientRect();
    const stage=document.querySelector(".jarvis-cc-center").getBoundingClientRect();
    const img=document.querySelector(".jarvis-neural-news-art").getBoundingClientRect();
    return {
      width:rect.width,height:rect.height,stageHeight:stage.height,
      imgHeight:img.height,
      overflow:document.documentElement.scrollWidth-innerWidth,
      sourceVisible:!!document.querySelector(".jarvis-neural-news-source"),
      controls:[...document.querySelectorAll(".jarvis-neural-news-controls button")].map(el=>el.getBoundingClientRect().height)
    };
  });
  assert.ok(mobile.width<=175&&mobile.width>=115,"Mobile news rail must leave the Ring center clear for pinch gestures");
  assert.ok(mobile.height<Math.max(290,mobile.stageHeight*.7),"Visual HUD should not cover the entire 3D stage");
  assert.ok(mobile.imgHeight>=75,"Publisher image must remain useful on phone");
  assert.ok(mobile.overflow<=3,"No horizontal mobile overflow");
  assert.ok(mobile.controls.every(x=>x>=35),"Touch controls must remain usable");
  await page.click(".jarvis-neural-news-collapse");
  assert.equal(await page.evaluate(()=>window.ULTRON_NEURAL_NEWS.state.collapsed),true);
  await page.click(".jarvis-neural-news-collapse");
  assert.equal(await page.evaluate(()=>window.ULTRON_NEURAL_NEWS.state.collapsed),false);
  console.log("NEURAL INTELLIGENCE VISUAL PASS: verified images, 24h sources, alert, voice wake, carousel, inline details, globe and mobile");
}catch(error){
  console.error("NEURAL INTELLIGENCE VISUAL FAILED:",error);
  await page?.screenshot({path:"neural-intelligence-visual-failure.png",fullPage:false}).catch(()=>{});
  throw error;
}finally{
  await browser.close();
}
