import assert from "node:assert/strict";
import puppeteer from "puppeteer-core";
const base=process.env.JARVIS_TEST_URL||"http://127.0.0.1:8776/";
const browser=await puppeteer.launch({
 executablePath:process.env.CHROME_BIN||"/usr/bin/google-chrome",
 headless:true,args:["--no-sandbox","--disable-dev-shm-usage",
 "--enable-webgl","--enable-unsafe-swiftshader"]
});
try{
 for(const width of [390,1366]){
  const page=await browser.newPage();
  const pageErrors=[];
  page.on("pageerror",error=>{pageErrors.push(error.message);console.log("EVIDENCE PAGE ERROR",error.message);});
  page.on("console",message=>{
   if(message.type()==="error")console.log("EVIDENCE BROWSER CONSOLE",message.text().slice(0,220));
  });
  await page.setViewport({width,height:width<600?844:768,
   isMobile:width<600,hasTouch:width<600,deviceScaleFactor:1});
  await page.setRequestInterception(true);
  const sample={features:[
   {attributes:{objectid:1,nome:"Estação A",municipio:"Recife",
    latitude:-8.04,longitude:-34.88,horas_24:21.5,
    ultima_leitura_data_hora:"horário informado pela APAC"}},
   {attributes:{objectid:2,nome:"Estação B",municipio:"Olinda",
    latitude:-8.01,longitude:-34.85,horas_24:0}}
  ]};
  page.on("request",req=>{
   const url=req.url();
   if(url.includes("geoportal.apac.pe.gov.br/")&&url.includes("/4/query")){
    req.respond({status:200,contentType:"application/json",
     body:JSON.stringify(sample)}).catch(()=>{});
   }else if(url.startsWith(base))req.continue().catch(()=>{});
   else req.abort("blockedbyclient").catch(()=>{});
  });
  await page.goto(base,{waitUntil:"domcontentloaded",timeout:35000});
  try{
   await page.waitForFunction(()=>Boolean(
    window.ULTRON_METEO_CENTER?.open&&window.ULTRON_GEO_VISUAL?.open&&
    window.ULTRON_DATA_INTELLIGENCE?.state),{timeout:25000});
  }catch(error){
   const diag=await page.evaluate(()=>({
    dom:document.readyState,meteo:!!window.ULTRON_METEO_CENTER,
    geo:!!window.ULTRON_GEO_VISUAL,
    evidence:!!window.ULTRON_DATA_INTELLIGENCE,
    center:!!window.JARVIS_COMMAND_CENTER,
    main:!!document.querySelector(".jarvis-cc-center"),
    modules:[...document.querySelectorAll('script[src]')].slice(-15).map(e=>e.src)
   }));
   throw Error("Evidence browser bootstrap missing "+JSON.stringify({diag,pageErrors})+
    " / "+error.message);
  }
  const result=await page.evaluate(()=>window.ULTRON_METEO_CENTER.open({
   tab:"apac",view:"2d",refresh:true
  }));
  assert.equal(result.ok,true);
  await page.waitForSelector(".jarvis-meteo-center .jarvis-data-evidence",
   {visible:true,timeout:12000});
  const proof=await page.evaluate(()=>{
   const el=document.querySelector(".jarvis-meteo-center .jarvis-data-evidence");
   const head=el?.querySelector("summary");
   const src=el?.querySelector(".jarvis-data-evidence-links a");
   const info=window.ULTRON_DATA_INTELLIGENCE;
   const record=info.latest;
   return {
    source:src?.href,
    title:head?.textContent,
    panelVisible:!document.querySelector(".jarvis-meteo-center").hidden,
    report:record,
    json:JSON.parse(info.exportJSON()),
    count:info.state.historyCount,
    overflow:document.documentElement.scrollWidth-innerWidth
   };
  });
  assert.equal(proof.source,
   "https://geoportal.apac.pe.gov.br/server/rest/services/met_monitoramento_chuvas_pe/MapServer");
  assert.match(proof.title,/ORIGEM E CÁLCULOS/);
  assert.equal(proof.panelVisible,true);
  assert.equal(proof.report.kind,"station-observation");
  assert.equal(proof.report.derived[0].value,2);
  assert.equal(proof.report.derived[1].value,1);
  assert.equal(proof.report.derived[2].value,21.5);
  assert.equal(proof.report.verification.independentCorroboration,"not-performed");
  assert.equal(proof.json.reports.length,proof.count);
  assert.equal(proof.json.scope,"public-browser-local");
  assert.equal(proof.overflow<=5,true);
  const derived=await page.evaluate(async()=>{
   const mod=await import("./modules/jarvis-data-intelligence.js?v=5.36.0");
   const now=new Date().toISOString(),date=now.slice(0,10);
   const record=mod.registerForecast({
    ok:true,kind:"global-short-term-forecast",fetchedAt:now,
    location:{key:"global-1",label:"Recife, Pernambuco, Brazil",
     lat:-8.05,lng:-34.88},
    current:{time:date+"T08:00",temperatureC:28},
    days:[{date,minC:22,maxC:30,rainMm:5,rainChancePercent:50}],
    requestedDays:1
   });
   const box=mod.renderEvidenceDetails(record);
   document.querySelector(".jarvis-cc-center").append(box);
   const result={
    kind:record.kind,derived:record.derived[0].value,
    source:box.querySelector(".jarvis-data-evidence-links a").href,
    text:box.textContent,
    state:window.ULTRON_DATA_INTELLIGENCE.state,
    json:JSON.parse(mod.exportEvidenceJSON())
   };
   box.remove();
   return result;
  });
  assert.equal(derived.kind,"numerical-forecast");
  assert.equal(derived.derived,5);
  assert.equal(derived.source,"https://open-meteo.com/en/docs");
  assert.match(derived.text,/NÃO é|NÃO corroborad|Não há confirmação/i);
  assert.equal(derived.state.ownSensorsConnected,false);
  assert.equal(derived.state.backendVerified,false);
  assert.equal(derived.json.reports.length,2);
  await page.reload({waitUntil:"domcontentloaded"});
  await page.waitForFunction(()=>window.ULTRON_DATA_INTELLIGENCE?.state);
  assert.equal(await page.evaluate(()=>window.ULTRON_DATA_INTELLIGENCE.history().length),2);
  assert.equal(await page.evaluate(()=>window.ULTRON_DATA_INTELLIGENCE.latest.kind),"numerical-forecast");
  assert.equal(await page.evaluate(()=>document.querySelector(".jarvis-data-evidence")?.isConnected||false),false,
   "Prior report must not appear as live data on a fresh page");
  console.log("JARVIS DATA EVIDENCE BROWSER PASS",width,
   "APAC source, derived analysis, no fake confidence, local export/history, page scroll, reload");
  await page.close();
 }
}finally{await browser.close();}
