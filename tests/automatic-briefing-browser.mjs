import assert from "node:assert/strict";
import puppeteer from "puppeteer-core";

const browser=await puppeteer.launch({
  executablePath:process.env.CHROME_BIN||"/usr/bin/google-chrome",
  headless:true,
  args:["--no-sandbox","--disable-dev-shm-usage","--enable-webgl","--enable-unsafe-swiftshader"]
});
let page;
try {
  page=await browser.newPage();
  await page.setViewport({width:390,height:844,isMobile:true,hasTouch:true,deviceScaleFactor:1});
  await page.setRequestInterception(true);
  let calls=0,breakFetch=false,fallbackOn=false,fallbackCalls=0,historyCalls=0;
  page.on("request",request=>{
    if(request.url().includes("/data/world-intelligence-history.json")){
      historyCalls++;
      const now=Date.now(),at=minutes=>new Date(now-minutes*60000).toISOString();
      const events=[
        {id:"br1",category:"brasil",title:"Notícia confirmada no Brasil",url:"https://agenciabrasil.ebc.com.br/",
         source:"Agência Brasil",publishedAt:at(20),firstSeenAt:at(10),lastSeenAt:at(5)},
        {id:"sc1",category:"santa-catarina",title:"Tempestade monitorada em SC",
         url:"https://www.defesacivil.sc.gov.br/alerta/",source:"Defesa Civil SC",
         publishedAt:at(30),firstSeenAt:at(25),lastSeenAt:at(5)},
        {id:"world1",category:"mundo",title:"Atualização internacional confirmada",
         url:"https://www.bbc.com/portuguese",source:"BBC",
         publishedAt:at(45),firstSeenAt:at(40),lastSeenAt:at(5)}
      ];
      const archive={ok:true,version:"2.0",windowHours:24,updatedAt:at(2),
        monitoredBy:"github-actions-scheduled",targetIntervalMinutes:15,
        events,checks:[{at:at(17),ok:true},{at:at(2),ok:true}],
        lastSuccessfulAt:at(2),
        latest:{
          alerts:{checked:true,checkedAt:at(2),warnings:[
            {title:"Chuva intensa",severity:"Perigo",endsAt:new Date(now+3600000).toISOString(),
             url:"https://avisos.inmet.gov.br/"}]},
          enso:{checked:true,checkedAt:at(2),bulletin:{
            status:"El Niño Advisory",issued:"8 October 2026",
            url:"https://www.cpc.ncep.noaa.gov/products/analysis_monitoring/enso_advisory/ensodisc.html"}}
        }};
      request.respond({status:200,contentType:"application/json",
        headers:{"access-control-allow-origin":"*"},body:JSON.stringify(archive)});
      return;
    }
    if(request.url().includes("/data/world-briefing.json")){
      fallbackCalls++;
      if(!fallbackOn){
        request.respond({status:503,contentType:"application/json",headers:{"access-control-allow-origin":"*"},body:'{"ok":false}'});
      }else{
        const payload={ok:true,delivery:"github-scheduled-snapshot",fetchedAt:new Date().toISOString(),
          topics:[{id:"brasil",label:"Brasil",articles:[{title:"Boletim confirmado do espelho",url:"https://agenciabrasil.ebc.com.br/",source:"Agência Brasil",publishedAt:new Date().toISOString()}]}],
          alerts:{checked:false,warnings:[]},enso:{checked:false,bulletin:null},hasNews:true,
          officialLinks:[{label:"INMET",url:"https://avisos.inmet.gov.br/"}]};
        request.respond({status:200,contentType:"application/json",headers:{"access-control-allow-origin":"*"},body:JSON.stringify(payload)});
      }
      return;
    }
    if(!request.url().includes("/api/briefing")){request.continue();return;}
    calls+=1;
    if(breakFetch){
      request.respond({status:503,contentType:"application/json",headers:{"access-control-allow-origin":"*"},body:'{"ok":false,"unavailable":true}'});
      return;
    }
    const now=new Date().toISOString();
    const topics=[
      {id:"brasil",label:"Brasil",articles:[{title:"Notícia de teste Brasil & economia",url:"https://agenciabrasil.ebc.com.br/",source:"Agência Brasil",publishedAt:now}]},
      {id:"santa-catarina",label:"Santa Catarina",articles:[{title:"Informações da Defesa Civil SC",url:"https://www.defesacivil.sc.gov.br/alerta/",source:"Defesa Civil SC",publishedAt:now}]},
      {id:"clima",label:"Clima e El Niño",articles:[{title:"Boletim de clima e ENSO",url:"https://www.cpc.ncep.noaa.gov/",source:"NOAA",publishedAt:now}]},
      {id:"mundo",label:"Mundo",articles:[{title:"Últimas notícias internacionais",url:"https://www.bbc.com/portuguese",source:"BBC News",publishedAt:now}]}
    ];
    const body=JSON.stringify({
      ok:true,version:"1.0",fetchedAt:now,refreshAfterMinutes:10,
      priority:["Brasil","Santa Catarina","Clima e El Niño","Mundo"],
      topics,
      alerts:{checked:true,warnings:[{id:"1",title:"Chuva intensa",severity:"Perigo",phase:"vigente",regions:["SC"],source:"INMET",url:"https://avisos.inmet.gov.br/"}]},
      enso:{checked:true,bulletin:{status:"El Niño Advisory",issued:"8 October 2026",source:"NOAA / Climate Prediction Center",url:"https://www.cpc.ncep.noaa.gov/products/analysis_monitoring/enso_advisory/ensodisc.html"}},
      officialLinks:[{label:"Avisos INMET",url:"https://avisos.inmet.gov.br/"},{label:"Defesa Civil SC",url:"https://www.defesacivil.sc.gov.br/alerta/"}],
      hasNews:true,partial:false
    });
    request.respond({
      status:200,
      contentType:"application/json; charset=utf-8",
      headers:{"access-control-allow-origin":"*"},
      body
    });
  });
  await page.goto(process.env.JARVIS_TEST_URL||"http://127.0.0.1:8766/",{
    waitUntil:"domcontentloaded",timeout:35000
  });
  await page.waitForFunction(()=>window.ULTRON_INTELLIGENCE?.state?.totalStories===4,{timeout:18000});
  const audit=await page.evaluate(()=>{
    const all=[...document.querySelectorAll(".jarvis-intel-topic")];
    const links=[...document.querySelectorAll(".jarvis-intel-panel a")];
    return {
      hasPanel:Boolean(document.querySelector(".jarvis-intel-panel")),
      integrated:document.querySelector(".jarvis-cc-console-terminal")?.contains(document.querySelector(".jarvis-intel-panel")),
      categories:all.map(x=>x.querySelector("h4")?.textContent),
      links:links.map(x=>x.href),
      status:document.querySelector(".jarvis-intel-status")?.textContent,
      weather:document.querySelector(".jarvis-intel-official")?.textContent,
      terminal:document.getElementById("output-box")?.textContent,
      overflow:document.documentElement.scrollWidth-innerWidth,
      buttons:[...document.querySelectorAll(".jarvis-intel-controls button")].map(x=>x.getBoundingClientRect().height)
    };
  });
  assert.equal(audit.hasPanel,true);
  assert.equal(audit.integrated,true,"Boletim must be embedded in existing command terminal");
  assert.deepEqual(audit.categories,["Brasil","Santa Catarina","Clima e El Niño","Mundo"]);
  assert.ok(audit.links.every(url=>url.startsWith("https://")),"Only safe source links allowed");
  assert.ok(audit.status.includes("CONSULTA CONCLUÍDA"));
  assert.ok(audit.weather.includes("INMET") && audit.weather.includes("NOAA"));
  assert.ok(audit.terminal.includes("[INTEL]"));
  assert.ok(audit.overflow<=3);
  assert.ok(audit.buttons.every(height=>height>=40),"Mobile touch targets must be usable");
  assert.ok(calls>=1,"The briefing must automatically fetch news at startup");

  await page.waitForFunction(()=>window.ULTRON_INTELLIGENCE?.state?.monitor24h?.events===3,{
    timeout:10000
  });
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent("ultron:wake-state",{detail:{awake:true,detail:"manual"}})));
  await page.waitForFunction(()=>window.ULTRON_INTELLIGENCE?.state?.monitor24h?.lastWakeAt,{
    timeout:10000
  });
  assert.ok(historyCalls>=2,"The history is consulted on startup and refreshed at wake");
  const afterWake=await page.$eval("#output-box",el=>el.textContent);
  assert.ok(afterWake.includes("MONITOR 24H"),"Voice activation must proactively present a 24h summary");
  const wakeInfo=await page.evaluate(()=>({
    heading:document.querySelector(".jarvis-intel-history-title")?.textContent,
    stories:[...document.querySelectorAll(".jarvis-intel-history-list li")].map(x=>x.textContent),
    wake:window.ULTRON_INTELLIGENCE?.state?.monitor24h?.lastWakeAt,
    stored:localStorage.getItem("ultron_intelligence_last_wake_at_v1"),
    voice:window.ULTRON_INTELLIGENCE?.state?.autoVoice
  }));
  assert.ok(wakeInfo.heading.includes("RELATÓRIO AO ACORDAR"));
  assert.ok(wakeInfo.stories.some(x=>x.includes("Notícia confirmada no Brasil")));
  assert.ok(wakeInfo.stories.some(x=>x.includes("Tempestade monitorada em SC")));
  assert.ok(wakeInfo.wake && wakeInfo.wake===wakeInfo.stored);
  assert.equal(wakeInfo.voice,true,"Auto narration should be on by default, subject to browser audio policy");
  const initialCalls=calls;
  await page.click(".jarvis-intel-controls button:first-child");
  await page.waitForFunction(()=>window.ULTRON_INTELLIGENCE?.state?.loading===false,{timeout:6000});
  assert.ok(calls>initialCalls,"Manual refresh must call the live backend again");
  await page.click(".jarvis-intel-controls button:nth-child(3)");
  assert.equal(await page.$eval(".jarvis-intel-controls button:nth-child(3)",el=>el.getAttribute("aria-pressed")),"false");
  breakFetch=true;fallbackOn=true;
  await page.click(".jarvis-intel-controls button:first-child");
  await page.waitForFunction(()=>window.ULTRON_INTELLIGENCE.state.totalStories===1,{timeout:6500});
  assert.ok(fallbackCalls>=1,"GitHub snapshot must provide offline-backend failover");
  assert.ok((await page.$eval(".jarvis-intel-status",el=>el.textContent)).includes("COLETA VERIFICADA"));
  assert.ok((await page.$eval(".jarvis-intel-topic",el=>el.textContent)).includes("Boletim confirmado do espelho"));
  fallbackOn=false;
  // Wait for the previous asynchronous refresh to release its disabled button.
  // Story count can update before refresh() reaches its finally block.
  await page.waitForFunction(()=>!document.querySelector(".jarvis-intel-controls button:first-child")?.disabled,{timeout:6500});
  const callsBeforeFailure=calls, fallbackBeforeFailure=fallbackCalls;
  // The prior CSS transforms can move the button while Puppeteer clicks its
  // old center. Dispatch a real DOM click to validate the refresh handler.
  await page.$eval(".jarvis-intel-controls button:first-child",button=>button.click());
  await page.waitForFunction(()=>window.ULTRON_INTELLIGENCE.state.loading===false,{timeout:6500});
  assert.ok(calls>callsBeforeFailure,"The failed refresh must contact the backend");
  assert.ok(fallbackCalls>fallbackBeforeFailure,"A backend error must attempt the fallback");
  assert.ok((await page.$eval(".jarvis-intel-message",el=>el.textContent)).includes("Última consulta preservada"),
    "The previous verified bulletin must remain visible after all sources fail");
  assert.equal(await page.evaluate(()=>window.ULTRON_INTELLIGENCE.state.totalStories),1,"Past verified content remains after all sources fail");
  console.log("AUTO BRIEFING BROWSER PASS: startup, Brazil/SC/world, 24h archive/wake delta, voice toggle, fallback and network resilience");
} catch(error){
  console.error("AUTO BRIEFING BROWSER FAILED:",error);
  await page?.screenshot({path:"automatic-briefing-failure.png",fullPage:false}).catch(()=>{});
  throw error;
} finally {await browser.close();}
