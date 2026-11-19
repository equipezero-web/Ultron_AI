import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {accountAccessConfig,accountAccessHeaders} from "../backend/jarvis-account-access.js";

const origin="https://equipezero-web.github.io";
const config={
  CF_ACCESS_TEAM_DOMAIN:"demo-team.cloudflareaccess.com",
  CF_ACCESS_AUD:"test-audience-only",
  CF_ACCESS_ACCOUNT_EMAILS:"account@example.invalid",
  JARVIS_ACCOUNT_UI_ORIGIN:origin
};
assert.equal(accountAccessConfig(config).enabled,true);
assert.ok(accountAccessConfig(config).origins.includes(origin));
const allowed=accountAccessHeaders(new Request("https://example.invalid/api/account/session/verify",{
  headers:{Origin:origin}
}),config);
assert.equal(allowed["Access-Control-Allow-Origin"],origin);
assert.equal(allowed["Access-Control-Allow-Credentials"],"true");
assert.match(allowed["Access-Control-Allow-Methods"],/GET/);
assert.match(allowed["Access-Control-Allow-Methods"],/OPTIONS/);
assert.match(allowed["Access-Control-Allow-Headers"],/Content-Type/);
assert.equal(allowed.Vary,"Origin");
const forbidden=accountAccessHeaders(new Request("https://example.invalid/api/account/session/verify",{
  headers:{Origin:"https://attacker.invalid"}
}),config);
assert.equal(forbidden["Access-Control-Allow-Origin"],undefined);
assert.equal(forbidden["Access-Control-Allow-Credentials"],undefined);
assert.equal(accountAccessConfig({...config,JARVIS_ACCOUNT_UI_ORIGIN:"https://wrong.example"}).origins.includes(origin),false);
const worker=readFileSync(new URL("../backend/worker.js",import.meta.url),"utf8");
assert.match(worker,/uiOriginAllowed:accountAccessConfig\(env\)\.origins\.includes\("https:\/\/equipezero-web\.github\.io"\)/);
assert.match(worker,/if\(path\.startsWith\("\/api\/account\/"\)\)/);
assert.match(worker,/authorizeJarvisAccount\(request,env\)/);
assert.match(worker,/if\(path==="\u002Fapi\u002Faccount\u002Fsession\u002Fverify"\)return handleAccountSessionVerify/);
assert.doesNotMatch(worker,/Cf-Access-Jwt-Assertion"\),\s*["']bypass/);
console.log("JARVIS ACCESS ORIGIN DIAGNOSTIC PASS: allowlisted CORS, no wildcard credentials or spoofed Access acceptance");
