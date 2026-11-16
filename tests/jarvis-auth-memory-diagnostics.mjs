import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
  memoryReplyDiagnosis,
  explainAccountPluginFailure
} from "../modules/jarvis-account-diagnostics.js";

const memory={active:true,identityReceived:true,saved:true,recalledMessages:3,recalledMemories:1};
assert.equal(memoryReplyDiagnosis({memory}),"memory-present");
assert.equal(memoryReplyDiagnosis({provider:"JARVIS_ACCOUNT_PLUGINS",accountPluginOperation:{kind:"install"}}),
 "local-or-private-operation");
assert.equal(memoryReplyDiagnosis({provider:"JARVIS_ACCOUNT_PLUGINS"}),"local-or-private-operation");
assert.equal(memoryReplyDiagnosis({githubInspection:{private:true,verified:true}}),"local-or-private-operation");
assert.equal(memoryReplyDiagnosis({error:"ai-provider-unavailable"}),"api-error-without-memory");
assert.equal(memoryReplyDiagnosis({text:"This is a non-AI response"}),"telemetry-not-in-response");
assert.match(explainAccountPluginFailure("account-login-not-configured"),
 /ainda não foi configurada no Worker Cloudflare/);
assert.match(explainAccountPluginFailure("account-login-required"),
 /sessão autenticada neste dispositivo/);
assert.match(explainAccountPluginFailure("account-not-allowed"),
 /administrador precisa permiti-lo/);
assert.match(explainAccountPluginFailure("origin-not-allowed"),/origem da integração/);
assert.match(explainAccountPluginFailure("account-token-invalid"),/verificação criptográfica/);
assert.match(explainAccountPluginFailure("access-keys-unavailable"),/chaves públicas/);
assert.match(explainAccountPluginFailure("plugin-database-unavailable"),/banco D1/);
assert.match(explainAccountPluginFailure("account-auth-request-blocked"),/cookies entre domínios/);
assert.match(explainAccountPluginFailure("account-auth-non-json-302"),/redirecionamento de login/);
assert.doesNotMatch(explainAccountPluginFailure("account-login-required"),/não foi configurada/);
assert.doesNotMatch(explainAccountPluginFailure("account-login-not-configured"),/refaça o login/);
assert.doesNotMatch(explainAccountPluginFailure({message:"account-not-allowed"}),/first@example\.com/);
const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const memoryClient=read("modules/memory-client.js");
const pluginClient=read("modules/jarvis-account-plugins-client.js");
const panel=read("modules/jarvis-account-plugin-panel.js");
const html=read("index.html");
assert.doesNotMatch(memoryClient,/O Worker publicado está desatualizado/);
assert.match(memoryClient,/classification === "local-or-private-operation"/);
assert.match(memoryClient,/isso não comprova Worker desatualizado/);
assert.match(memoryClient,/\/api\/health/);
assert.match(pluginClient,/account-auth-request-blocked/);
assert.match(pluginClient,/async function healthStatus\(\)/);
assert.match(pluginClient,/explainAccountPluginFailure\(code\)/);
assert.match(pluginClient,/accountSettingKnown && !status\?\.accountConfigured/);
assert.match(pluginClient,/openLogin\(\)/);
assert.match(panel,/PLUGINS \/ CONFIGURAÇÃO PENDENTE/);
assert.match(panel,/Entrar pelo Cloudflare Access/);
assert.match(html,/memory-client\.js\?v=4\.69\.1/);
assert.match(html,/jarvis-account-plugins-client\.js\?v=1\.0\.1/);
assert.match(html,/jarvis-account-plugin-panel\.js\?v=1\.0\.1/);
assert.match(read("backend/worker.js"),/accountPlugins: \{configured:accountAccessConfig\(env\)\.enabled/);
assert.match(read("backend/worker.js"),/memory,\n/);
console.log("JARVIS ACCOUNT + MEMORY DIAGNOSTICS PASS: configured vs login vs CORS; synthetic plugin replies do not imply outdated Worker.");
