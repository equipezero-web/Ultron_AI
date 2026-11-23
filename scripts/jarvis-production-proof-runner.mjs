import {mkdirSync,writeFileSync,appendFileSync} from "node:fs";
import {checkJarvisProduction} from "./jarvis-production-proof.mjs";
const report=await checkJarvisProduction();
mkdirSync("artifacts",{recursive:true});
writeFileSync("artifacts/jarvis-production-proof.json",JSON.stringify(report,null,2)+"\n");
const lines=[
  "## J.A.R.V.I.S. — Observação de produção",
  "",
  "**Fonte:** inspeção HTTP pública feita neste workflow, não homologação integral do aparelho.",
  "",
  "| Verificação | Estado |",
  "|---|---|",
  ...Object.entries(report.checks).map(([name,entry])=>
    "| "+name+" | "+(entry.status==="verified"?"Confirmado":"Não confirmado")+
    " ("+entry.reason+") |"),
  "",
  "**Resultado:** "+report.verified+"/"+report.total+" verificações públicas confirmadas.",
  "",
  "**Negação anônima:** um 302 apontando estritamente para o login Cloudflare Access comprova bloqueio de acesso, NÃO uma sessão autenticada.",
  "",
  "**Ainda não comprovado:** login autenticado real, cena WebGL no navegador, dispositivos físicos, outras capacidades do inventário.",
  ""
];
if(process.env.GITHUB_STEP_SUMMARY)appendFileSync(process.env.GITHUB_STEP_SUMMARY,lines.join("\n"));
console.log(JSON.stringify({verified:report.verified,total:report.total,passed:report.passed,
  failed:Object.keys(report.checks).filter(k=>report.checks[k].status!=="verified")}));
if(!report.passed)process.exitCode=1;
