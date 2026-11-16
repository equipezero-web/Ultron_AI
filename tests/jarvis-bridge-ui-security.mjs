import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const main = read("android-bridge/app/src/main/java/com/ultron/bridge/MainActivity.java");
const files = read("android-bridge/app/src/main/java/com/ultron/bridge/MobileFilesActivity.java");
const visuals = read("android-bridge/app/src/main/java/com/ultron/bridge/JarvisUi.java");
const manifest = read("android-bridge/app/src/main/AndroidManifest.xml");
const gradle = read("android-bridge/app/build.gradle.kts");
const icon = read("android-bridge/app/src/main/res/drawable/ic_jarvis_bridge.xml");

assert.match(gradle, /versionCode = 9/);
assert.match(gradle, /versionName = "0\.6\.0"/);
assert.match(icon, /<vector/);
assert.match(manifest, /android:icon="@drawable\/ic_jarvis_bridge"/);
assert.match(manifest, /android:allowBackup="false"/);
assert.doesNotMatch(manifest, /MANAGE_EXTERNAL_STORAGE|READ_EXTERNAL_STORAGE|QUERY_ALL_PACKAGES/);

assert.match(visuals, /public static final int GOLD/);
assert.match(visuals, /public static final int BACKGROUND/);
assert.match(visuals, /setMinHeight\(dp\(context, 52\)\)/);
assert.match(main, /BRIDGE  \/\/  CENTRAL DO CELULAR/);
assert.match(main, /NÚCLEO DE CONEXÃO/);
assert.match(main, /CENTRAL DE DISPOSITIVOS/);
assert.match(main, /J\.A\.R\.V\.I\.S\. BRIDGE v0\.6\.0/);
assert.match(main, /serviceStatus\.startsWith\("ONLINE"\)/);
assert.match(main, /tvDetails\.setVisibility\(android\.view\.View\.GONE\)/);

for (const method of ["pairDevice", "startBridge", "checkCloudConnection",
"openRemoteMicrophone", "openNotificationSettings", "diagnoseLgNetwork",
"saveWakeOnLan", "pairLgTv", "testLgTv", "wakeLgTv"]) {
  assert.match(main, new RegExp(method + "\\(\\)"), "Retain existing native action " + method);
}
assert.match(main, /new Intent\(this, MobileFilesActivity\.class\)/);
assert.match(files, /Intent\.ACTION_OPEN_DOCUMENT/);
assert.match(files, /SALVAR COM CONFIRMAÇÃO/);
assert.match(files, /new AlertDialog\.Builder/);
assert.match(files, /original\.equals\(readText\(uri\)\)/);
assert.doesNotMatch(main + files, /WebView|setJavaScriptEnabled|MANAGE_EXTERNAL_STORAGE/);

console.log("JARVIS BRIDGE UI + SCOPED FILE CONTRACT PASS: mobile dashboard, existing actions, version and Android storage boundaries.");
