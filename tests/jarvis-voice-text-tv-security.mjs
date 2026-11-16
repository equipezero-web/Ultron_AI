import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {parseLocalCommand} from "../modules/jarvis-local-commands.js";
import {validateControlCommand} from "../backend/device-control-v2.js";
const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const html=read("index.html"),css=read("modules/jarvis-voice-text-only.css");
const controller=read("modules/jarvis-voice-text-only.js");
const voice=read("modules/voice-listener-v4290.js");
const phone=read("modules/jarvis-phone-files.js");
const app=read("android-bridge/app/src/main/java/com/ultron/bridge/MainActivity.java");
const service=read("android-bridge/app/src/main/java/com/ultron/bridge/BridgeService.java");
const auth=read("android-bridge/app/src/main/java/com/ultron/bridge/TvAuthorization.java");
const manifest=read("android-bridge/app/src/main/AndroidManifest.xml");
const backend=read("backend/device-bridge.js");
const deviceModule=read("modules/device-control-v4260.js");
assert.match(html,/class="jarvis-command-center jarvis-voice-text-only"/);
assert.match(html,/jarvis-voice-text-only\.css\?v=/);
assert.match(html,/jarvis-voice-text-only\.js\?v=/);
assert.doesNotMatch(html,/<body[^>]*jarvis-voice-paused/);
assert.match(controller,/querySelectorAll\('button,/);
assert.match(controller,/setProperty\("display","none","important"\)/);
assert.match(css,/jarvis-voice-text-only button/);
assert.match(css,/#command-input/);
assert.match(voice,/WAKE_ALIASES = \['jarvis'/);
assert.equal(parseLocalCommand("Jarvis, ativar escuta")?.enabled,true);
assert.equal(parseLocalCommand("Jarvis, desativar escuta")?.enabled,false);
assert.equal(parseLocalCommand("Jarvis, parear celular")?.type,"mobile-pairing");
assert.equal(parseLocalCommand("Jarvis, cadastrar minha voz")?.type,"voice-enroll");
assert.equal(parseLocalCommand("Jarvis, abra o arquivo foto.jpg do celular")?.filename,"foto.jpg");
assert.match(phone,/async function openFile/);
assert.match(phone,/function close/);
assert.match(phone,/async function parent/);
assert.doesNotMatch(phone,/const row=make\("button"/);
assert.match(manifest,/<queries>/);
assert.match(manifest,/<package android:name="com.google.android.youtube"/);
assert.doesNotMatch(manifest,/QUERY_ALL_PACKAGES/);
assert.match(service,/case "tv.link":/);
assert.match(service,/case "tv.unlink":/);
assert.match(service,/TvAuthorization\.isAuthorized\(this\)/);
assert.match(service,/requiresUserTap/);
assert.match(app,/REVOGAR VÍNCULO PERMANENTE DA TV/);
assert.match(app,/TvAuthorization\.createCode\(this\)/);
assert.match(auth,/new SecureRandom\(\)/);
assert.match(auth,/CODE_TTL = 10L \* 60_000L/);
assert.match(auth,/attempts>=5/);
assert.match(auth,/MessageDigest\.isEqual/);
assert.match(auth,/SecureStore\.clearLgTv\(context\)/);
assert.match(backend,/command = 'tv.link' THEN '\{\}'/);
assert.equal(validateControlCommand("tv.link",{code:"123456"}).ok,true);
assert.equal(validateControlCommand("tv.unlink",{confirm:false}).ok,false);
assert.equal(validateControlCommand("tv.unlink",{confirm:true}).ok,true);

const start=deviceModule.indexOf("function tvIntent(n) {");
const end=deviceModule.indexOf("export async function startPairing(",start);
assert.ok(start>0&&end>start);
const code=deviceModule.slice(start,end).replace("export function parseDeviceIntent","function parseDeviceIntent");
const normalize=text=>String(text||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/\s+/g," ").trim();
const confirmed=text=>/\b(confirmo|confirmado|confirme)\b/.test(normalize(text));
const parse=new Function("normalizeSpeech","isConfirmed",code+";return parseDeviceIntent;")(normalize,confirmed);
const targetCases=[
  ["Jarvis, abra meu YouTube no celular","mobile","app.open","com.google.android.youtube"],
  ["Jarvis, abra o YouTube na TV","mobile","tv.launch","youtube.leanback.v4"],
  ["Jarvis, vincule minha TV com código 123456","mobile","tv.link","123456"],
  ["Jarvis, revogue a conexão da TV confirmo","mobile","tv.unlink",true]
];
for (const [sentence,type,command,value] of targetCases){
  const intent=parse(sentence);
  assert.equal(intent?.deviceType,type,sentence);
  assert.equal(intent?.command,command,sentence);
  assert.equal(
    command==="tv.link"?intent.payload.code:
    command==="tv.launch"?intent.payload.appId:
    command==="app.open"?intent.payload.packageName:intent.payload.confirm,
    value,sentence);
}
assert.equal(parse("Jarvis, revogue a conexão da TV")?.payload?.confirm,false);
assert.equal(parse("Como abrir Youtube na TV?"),null);
assert.equal(parse("Não abra YouTube no celular"),null);
console.log("JARVIS VOICE/TEXT ONLY + YOUTUBE DEVICE DESTINATION + REVOCABLE TV LINK PASS");
