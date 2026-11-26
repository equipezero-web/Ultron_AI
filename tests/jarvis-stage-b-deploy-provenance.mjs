import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const worker=readFileSync(new URL("../backend/worker.js",import.meta.url),"utf8");
const workflow=readFileSync(new URL("../.github/workflows/cloudflare-backend-deploy.yml",import.meta.url),"utf8");
const snapshot=readFileSync(new URL("../scripts/architecture-snapshot-to-sql.mjs",import.meta.url),"utf8");

assert.match(worker,/deploymentProvenance: ARCHITECTURE_DEPLOY_MANIFEST/);
assert.match(worker,/source:"github-actions-checkout"/);
assert.match(worker,/source:"unverified",commit:null,syncedAt:null/);
assert.match(workflow,/Embed source provenance from checked-out GitHub commit/);
assert.match(workflow,/node \.\.\/scripts\/architecture-snapshot-to-sql\.mjs --module > architecture-deploy-manifest\.js/);
assert.match(snapshot,/--module/);
console.log("DEPLOY FINGERPRINT CONTRACT PASS: health reports checkout commit or explicitly unverified provenance");
