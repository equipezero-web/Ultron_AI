import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const main = read("android-bridge/app/src/main/java/com/ultron/bridge/MainActivity.java");
const files = read("android-bridge/app/src/main/java/com/ultron/bridge/MobileFilesActivity.java");
const visuals = read("android-bridge/app/src/main/java/com/ultron/bridge/JarvisUi.java");
const manifest = read("android-bridge/app/src/main/AndroidManifest.xml");
const gradle = read("android-bridge/app/build.gradle.kts");
const remote = read("android-bridge/app/src/main/java/com/ultron/bridge/RemoteFiles.java");
const service = read("android-bridge/app/src/main/java/com/ultron/bridge/BridgeService.java");
const icon = read("android-bridge/app/src/main/res/drawable/ic_jarvis_bridge.xml");

assert.match(gradle, /versionCode = 12/);
assert.ok(gradle.includes('versionName = "0.9.0"'));
assert.match(icon, /<vector/);
assert.match(manifest, /android:icon="@drawable\/ic_jarvis_bridge"/);
assert.match(manifest, /android:allowBackup="false"/);
assert.match(manifest, /MANAGE_EXTERNAL_STORAGE/);
assert.match(manifest, /READ_EXTERNAL_STORAGE/);
assert.doesNotMatch(manifest, /QUERY_ALL_PACKAGES/);
assert.match(manifest,/package android:name="com.google.android.youtube"/);
const tvAuth=read("android-bridge/app/src/main/java/com/ultron/bridge/TvAuthorization.java");
assert.match(tvAuth,/SecureRandom/);
assert.match(tvAuth,/CODE_TTL = 10L \* 60_000L/);
assert.match(tvAuth,/attempts>=5/);
assert.match(tvAuth,/MessageDigest\.isEqual/);
assert.match(tvAuth,/clearLgTv\(context\)/);
assert.match(service,/case "tv.link":/);
assert.match(service,/case "tv.unlink":/);
assert.match(service,/TvAuthorization\.isAuthorized\(this\)/);
assert.match(main,/REVOGAR VÍNCULO PERMANENTE DA TV/);

assert.match(visuals, /public static final int GOLD/);
assert.match(visuals, /public static final int BACKGROUND/);
assert.match(visuals, /setMinHeight\(dp\(context, 52\)\)/);
assert.match(main, /BRIDGE  \/\/  CENTRAL DO CELULAR/);
assert.match(main, /NÚCLEO DE CONEXÃO/);
assert.match(main, /CENTRAL DE DISPOSITIVOS/);
assert.ok(main.includes("J.A.R.V.I.S. BRIDGE v0.9.0"));
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
assert.doesNotMatch(main + files + remote, /WebView|setJavaScriptEnabled/);
assert.ok(remote.includes("Environment.isExternalStorageManager()"));
assert.ok(remote.includes("MessageDigest.isEqual"));
assert.ok(remote.includes("SESSION_MS = 10 * 60_000L"));
assert.ok(remote.includes("MAX_REMOTE_TRANSFER_BYTES = 16L"));
assert.ok(remote.includes("protectedPath.startsWith(\"/android/data/\")"));
assert.ok(service.includes("RemoteFiles.execute(this, command, payload)"));
assert.ok(main.includes("REVOGAR ACESSO REMOTO"));
assert.ok(main.includes("MANTER ACESSO ATÉ EU DESATIVAR"));
const secure = read("android-bridge/app/src/main/java/com/ultron/bridge/SecureStore.java");
assert.ok(secure.includes("saveRemoteFilesKey"));
assert.ok(secure.includes("getRemoteFilesKey"));
assert.ok(secure.includes("clearRemoteFilesKey"));
assert.ok(remote.includes("enablePermanent(Context context)"));
assert.ok(remote.includes("isPermanent(Context context)"));
assert.doesNotMatch(remote, /\.delete\(|\.renameTo\(|FileOutputStream|Runtime\.getRuntime\(\)/);

console.log("JARVIS BRIDGE UI + SCOPED FILE CONTRACT PASS: mobile dashboard, existing actions, version and Android storage boundaries.");
