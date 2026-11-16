import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {parseLocalCommand,runLocalCommand} from "../modules/jarvis-local-commands.js";
const manifest=await readFile("android-bridge/app/src/main/AndroidManifest.xml","utf8");
const main=await readFile("android-bridge/app/src/main/java/com/ultron/bridge/MainActivity.java","utf8");
const native=await readFile("android-bridge/app/src/main/java/com/ultron/bridge/MobileFilesActivity.java","utf8");
const service=await readFile("android-bridge/app/src/main/java/com/ultron/bridge/BridgeService.java","utf8");
const backend=await readFile("backend/device-control-v2.js","utf8");

assert.match(manifest,/android:name="\.MobileFilesActivity"[\s\S]*?android:exported="false"/);
assert.match(manifest,/MANAGE_EXTERNAL_STORAGE/,
 "Explicitly granted shared-storage manager is separate from the existing SAF editor");
assert.match(manifest,/READ_EXTERNAL_STORAGE[^>]*maxSdkVersion="29"/);
assert.match(main,/new Intent\(this, MobileFilesActivity\.class\)/);
assert.match(native,/Intent\.ACTION_OPEN_DOCUMENT\b/);
assert.match(native,/Intent\.CATEGORY_OPENABLE/);
assert.match(native,/MAX_BYTES\s*=\s*512\s*\*\s*1024/);
assert.match(native,/new AlertDialog\.Builder\(this\)/);
assert.match(native,/if \(!original\.equals\(readText\(uri\)\)\)/);
assert.doesNotMatch(native,/ACTION_OPEN_DOCUMENT_TREE|MANAGE_EXTERNAL_STORAGE|Runtime\.getRuntime|exec\(/);
assert.doesNotMatch(native,/BridgeApi|fetch\(|HttpURLConnection|INTERNET|sendEvent|BASE_URL/,
 "Content must never be transmitted from local editor to cloud");
assert.doesNotMatch(service,/case "file\.write"|case "file\.read"|case "file\.delete"/);
assert.doesNotMatch(backend,/["']mobile\.files\.(?:write|delete|read)["']/);
assert.deepEqual(parseLocalCommand("Jarvis, abrir multitarefas"),{type:"safe-multitask"});
assert.deepEqual(parseLocalCommand("Jarvis, abra o editor de arquivos"),{type:"scoped-file-editor"});
assert.deepEqual(parseLocalCommand("Jarvis, mostre meus arquivos"),{type:"scoped-file-editor"});
assert.equal(parseLocalCommand("Como acessar arquivos de outro aparelho?"),null);
let calls=0;
const previous=globalThis.window;
try{
 globalThis.window={
  ULTRON_PARALLEL_TASKS:{open(){calls++;return{ok:true};}},
  ULTRON_SCOPED_FILES:{open(){calls++;return{ok:true};}}
 };
 const parallel=await runLocalCommand("Jarvis, abrir multitarefas");
 assert.equal(parallel.ok,true);
 assert.equal(parallel.route,"local-safe-multitask");
 const files=await runLocalCommand("Jarvis, abra o editor de arquivos");
 assert.equal(files.ok,true);
 assert.equal(files.route,"local-scoped-file-editor");
 assert.match(files.text,/acesso remoto.*não foi concedido/);
 assert.equal(calls,2);
}finally{if(previous===undefined)delete globalThis.window;else globalThis.window=previous;}
console.log("JARVIS ANDROID SAF + VOICE STATUS PASS: isolated local SAF editor, distinct Android storage grant, no remote file-write route.");
