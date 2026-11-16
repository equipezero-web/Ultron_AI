import assert from "node:assert/strict";
import {mkdtemp,writeFile,rm,readFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import puppeteer from "puppeteer-core";
const base=process.env.JARVIS_TEST_URL||"http://127.0.0.1:8777/";
const folder=await mkdtemp(join(tmpdir(),"jarvis-scoped-"));
const samplePath=join(folder,"example.md");
const original="# Somente autorizado\nEste arquivo permanece no dispositivo.";
await writeFile(samplePath,original);
const browser=await puppeteer.launch({
 executablePath:process.env.CHROME_BIN||"/usr/bin/google-chrome",
 headless:true,args:["--no-sandbox","--disable-dev-shm-usage",
  "--enable-webgl","--enable-unsafe-swiftshader"]
});
try{
 for(const width of [390,1280]){
  const page=await browser.newPage();
  await page.setViewport({width,height:width<600?844:800,isMobile:width<600,
   hasTouch:width<600,deviceScaleFactor:1});
  await page.setRequestInterception(true);
  page.on("request",req=>req.url().startsWith(base)?
   req.continue().catch(()=>{}):req.abort("blockedbyclient").catch(()=>{}));
  await page.goto(base,{waitUntil:"domcontentloaded",timeout:35000});
  await page.waitForFunction(()=>Boolean(window.ULTRON_PARALLEL_TASKS&&
   window.ULTRON_SCOPED_FILES&&window.ULTRON_WORLD_CAMERAS),{timeout:25000});
  assert.ok(await page.$("#btn-jarvis-parallel"));
  assert.ok(await page.$("#btn-jarvis-scoped-files"));
  let result=await page.evaluate(()=>window.ULTRON_PARALLEL_TASKS.open());
  assert.equal(result.ok,true);
  assert.ok(await page.$(".jarvis-parallel-panel:not([hidden])"));
  assert.equal((await page.evaluate(()=>window.ULTRON_PARALLEL_TASKS.state)).readOnly,true);
  const taskResult=await page.evaluate(()=>window.ULTRON_PARALLEL_TASKS.start([
   "world-cameras","data-intelligence"
  ]));
  assert.equal(taskResult.results.length,2);
  assert.equal(taskResult.results[0].status,"completed");
  assert.equal(taskResult.results[1].status,"completed");
  const taskText=await page.$eval(".jarvis-parallel-results",el=>el.textContent);
  assert.match(taskText,/Catálogos mundiais/);
  assert.match(taskText,/Origem dos dados/);
  await page.evaluate(()=>window.ULTRON_PARALLEL_TASKS.close());

  result=await page.evaluate(()=>window.ULTRON_SCOPED_FILES.open());
  assert.equal(result.ok,true);
  assert.equal(result.localOnly,true);
  const picker=await page.$(".jarvis-scoped-files input[type=file]");
  assert.ok(picker);
  await picker.uploadFile(samplePath);
  await page.waitForFunction(()=>window.ULTRON_SCOPED_FILES.state.selected==="example.md");
  let state=await page.evaluate(()=>window.ULTRON_SCOPED_FILES.state);
  assert.equal(state.directWrite,false,"Local fallback picker never grants overwrite rights");
  assert.equal(state.remoteMobileFiles,false);
  assert.equal(state.localOnly,true);
  assert.equal(await page.$eval(".jarvis-scoped-files textarea",n=>n.value),original);
  await page.$eval(".jarvis-scoped-files textarea",n=>{
   n.value=n.value+"\nAlteração proposta por usuário";
   n.dispatchEvent(new Event("input",{bubbles:true}));
  });
  state=await page.evaluate(()=>window.ULTRON_SCOPED_FILES.state);
  assert.equal(state.edited,true);
  const saveButton=await page.$(".jarvis-scoped-file-actions button:nth-child(2)");
  await saveButton.click();
  await page.waitForFunction(()=>document.querySelector(".jarvis-scoped-file-status")?.
   textContent.includes("Gravação direta indisponível"));
  assert.equal(await readFile(samplePath,"utf8"),original,
   "No FileSystemHandle means original must remain unchanged");
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent("ultron:emergency-stop",{
   detail:{epoch:909}
  })));
  const after=await page.evaluate(()=>({
   local:window.ULTRON_SCOPED_FILES.state,
   parallel:window.ULTRON_PARALLEL_TASKS.state,
   filesHidden:document.querySelector(".jarvis-scoped-files").hidden,
   tasksHidden:document.querySelector(".jarvis-parallel-panel").hidden,
   overflow:document.documentElement.scrollWidth-innerWidth
  }));
  assert.equal(after.local.selected,null);
  assert.equal(after.filesHidden,true);
  assert.equal(after.tasksHidden,true);
  assert.ok(after.overflow<=5,"No extra horizontal scroll from workspaces: "+after.overflow);
  console.log("JARVIS SAFE WORKSPACES BROWSER PASS",width,
   "local-only file picker, no overwrite, P0 abort, parallel status and no overflow");
  await page.close();
 }
}finally{await browser.close();await rm(folder,{recursive:true,force:true});}
