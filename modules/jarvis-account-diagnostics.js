/**
 * Read-only diagnostics. Cloudflare Access credentials, email lists and
 * tokens must never appear in public browser messages or health checks.
 */
export function explainAccountPluginFailure(value){
 const code=String(value?.message??value??"").trim().slice(0,160);
 if(code==="account-login-not-configured"||code==="account-auth-disabled")
   return "A autenticação dos plugins ainda não foi configurada no Worker Cloudflare. "+
     "O administrador precisa configurar a aplicação Cloudflare Access, os identificadores "+
     "CF_ACCESS_TEAM_DOMAIN e CF_ACCESS_AUD, a origem JARVIS_ACCOUNT_UI_ORIGIN e "+
     "CF_ACCESS_ACCOUNT_EMAILS. Nenhuma ação foi executada.";
 if(code==="account-login-required")
   return "O Cloudflare Access não identificou uma sessão autenticada neste dispositivo. "+
     "Abra o login pelo botão da central e entre com a conta autorizada. Nenhuma ação foi executada.";
 if(code==="account-token-invalid")
   return "A sessão do Cloudflare Access não passou na verificação criptográfica "+
     "(pode estar expirada ou pertencer a outra aplicação). Refaça o login; nenhuma ação foi executada.";
 if(code==="account-not-allowed")
   return "O e-mail desta sessão ainda não está autorizado para os plugins. "+
     "O administrador precisa permiti-lo na política Cloudflare Access e em "+
     "CF_ACCESS_ACCOUNT_EMAILS. Nenhuma ação foi executada.";
 if(code==="origin-not-allowed")
   return "O endereço deste painel não foi autorizado como origem da integração. "+
     "O administrador deve validar JARVIS_ACCOUNT_UI_ORIGIN e a política CORS. Nenhuma ação foi executada.";
 if(code==="access-keys-unavailable")
   return "Não foi possível verificar as chaves públicas do Cloudflare Access. "+
     "Revise o endereço da equipe, o certificado e a conectividade do backend. Nenhuma ação foi executada.";
 if(code==="plugin-database-unavailable")
   return "A conta pode ter sido validada, mas o banco D1 dos plugins não está disponível. "+
     "Verifique o binding ULTRON_DB e a migração do catálogo. Nenhuma ação foi executada.";
 if(["account-auth-request-blocked","account-auth-non-json","Failed to fetch","NetworkError"].includes(code)||
    /^(?:HTTP [0-9]{3}|account-auth-non-json-[0-9]{3})$/.test(code))
   return "A chamada de autenticação não chegou à API como JSON verificável. "+
     "Pode haver bloqueio de cookies entre domínios, sessão Cloudflare Access não iniciada, "+
     "redirecionamento de login ou erro de rede/CORS. Nenhuma ação foi executada.";
 return "A operação de plugin não foi confirmada. Código de diagnóstico: "+
   (code||"resposta indisponível")+". Nenhuma ação foi executada.";
}
export function memoryReplyDiagnosis(data){
 if(data?.memory&&typeof data.memory==="object")return "memory-present";
 if(data?.accountPluginOperation||data?.provider==="JARVIS_ACCOUNT_PLUGINS"||
    data?.model==="account-bound-v1"||data?.githubInspection?.private===true)
   return "local-or-private-operation";
 if(data?.error)return "api-error-without-memory";
 return "telemetry-not-in-response";
}
