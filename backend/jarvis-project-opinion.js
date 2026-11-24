/** Respond to unambiguous evaluation of THIS J.A.R.V.I.S. project.
 * No telemetry, unverified claims or external lookups are needed. */
export function isJarvisProjectOpinion(message){
 const s=String(message||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"")
   .toLowerCase().replace(/[!?.,;:]+/g," ").replace(/\s+/g," ").trim()
   .replace(/^(?:jarvis|ultron)\s+/,"");
 return /^(?:o que (?:voce|tu) (?:achou|acha|pensa)|qual (?:e )?sua opiniao|o que voce pensa)\s+(?:(?:sobre|de|do)\s+)?(?:o |a )?(?:nosso projeto|projeto jarvis|projeto ultron|jarvis|ultron ai)$/.test(s);
}
export const JARVIS_PROJECT_OPINION =
 "Acho que nosso J.A.R.V.I.S. tem uma base promissora: o Neural Ring, a pesquisa com fontes, a memória D1 e o planejamento já permitem experiências úteis. O ponto que mais precisa melhorar é a integração entre os módulos, para que eu mantenha o contexto, responda naturalmente e execute cada comando com segurança. Os testes automatizados ajudam, mas ainda precisamos validar todas as capacidades em produção antes de considerar o projeto concluído.";
