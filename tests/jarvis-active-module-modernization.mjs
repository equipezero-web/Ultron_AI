import assert from "node:assert/strict";
import {existsSync,readFileSync,readdirSync} from "node:fs";
import {resolve,join} from "node:path";
import {fileURLToPath} from "node:url";

const root=fileURLToPath(new URL("../",import.meta.url));
const read=name=>readFileSync(resolve(root,name),"utf8");
const index=read("index.html");
const scriptTags=[...index.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/gi)].map(m=>m[1]);
const cssTags=[...index.matchAll(/<link\b[^>]*\brel=["']stylesheet["'][^>]*\bhref=["']([^"']+)["']/gi)].map(m=>m[1]);
const local=url=>String(url).split(/[?#]/)[0].replace(/^\.\//,"");
for(const [group,refs] of [["scripts",scriptTags],["styles",cssTags]]){
 const paths=refs.map(local).filter(x=>x&&!/^https?:/i.test(x));
 assert.equal(new Set(paths).size,paths.length,"Duplicated "+group+" in the current entrypoint");
 for(const path of paths)assert.ok(existsSync(resolve(root,path)),"Missing active "+group+" asset: "+path);
}
const activeScript=path=>scriptTags.filter(url=>local(url)===path).length;
assert.equal(activeScript("modules/jarvis-mobile-pairing.js"),1);
assert.equal(activeScript("modules/jarvis-command-center-v4330.js"),1);
assert.equal(activeScript("modules/jarvis-public-world-cameras.js"),1);
assert.equal(activeScript("modules/device-control-v4260.js"),1);
assert.equal(activeScript("modules/stark-bootstrap.js"),1);

const pairing=read("modules/jarvis-mobile-pairing.js");
const center=read("modules/jarvis-command-center-v4330.js");
const link=read("modules/mobile-link-simple-v4250.js");
const devices=read("modules/device-control-v4260.js");
assert.match(pairing,/jarvis:command-center-ready/,"Modern pairing must also initialize after command-center mount");
assert.match(center,/jarvis:command-center-ready/,"Command center must announce its mount");
assert.match(pairing,/btn-jarvis-pair-mobile/,"Current visible pairing UI is authoritative");
assert.match(pairing,/btn-pair-mobile/,"Existing button must be forwarded to the current pairing UI");
assert.doesNotMatch(link,/lastMobilePointerAt|button\?\.addEventListener\(['"](?:click|pointerdown)/,
 "Old Mobile Link must not install competing button handlers");
assert.doesNotMatch(devices,/mobilePairButton\?\.addEventListener|lastDirectMobilePointerAt/,
 "Old device controller must not install competing button handlers");
assert.ok(!existsSync(resolve(root,"modules/device-client.js")),
 "Orphan historical device-client.js must not be reintroduced");
assert.ok(!index.includes("device-client.js"));
const bootstrap=read("modules/stark-bootstrap.js");
for(const match of bootstrap.matchAll(/await import\(['"]\.\/([^'"]+)['"]\)/g)){
 const file=local(match[1]);assert.ok(existsSync(resolve(root,"modules",file)),"Missing bootstrap dependency: "+file);
}
const totalModules=readdirSync(join(root,"modules")).filter(x=>/\.(?:js|css)$/.test(x)).length;
console.log("JARVIS ACTIVE MODULE AUDIT PASS: "+totalModules+
 " module assets inventoried; "+scriptTags.length+" current script entrypoints; "+
 cssTags.length+" current styles; one visible pairing owner; no orphan device client.");
