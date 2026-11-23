# J.A.R.V.I.S. — Proteção do consumo de IA no Cloudflare Worker

Revisão de 23/11/2026. O endpoint público `POST /api/ai` chamava os provedores e a pesquisa antes de impor limites no próprio Worker.

## Mudança implementada

- O `backend/worker.js` passa a consultar a binding nativa `AI_RATE_LIMITER` antes de invocar `handleAi`, `prepareResearch` ou `generateWithProviders`.
- Os dois arquivos de configuração Wrangler (`backend/wrangler.jsonc` usado no deploy canônico e `wrangler.jsonc` da raiz) registram a mesma binding com namespace `61232817`, limite de **60 chamadas por minuto por chave e localização Cloudflare**.
- Uma solicitação excedente recebe JSON `AI_RATE_LIMIT_EXCEEDED`, HTTP **429** e `Retry-After: 60`.
- Se a binding existir e retornar uma resposta inesperada ou falhar, a rota devolve **503**, sem enviar chamada ao provedor.
- Se uma implantação manual antiga estiver sem essa binding, a rota continua funcionando para não causar indisponibilidade imediata, mas `GET /api/health` sinaliza `aiRateLimit.configured=false`. Isso não deve ser interpretado como proteção ativa.
- Identificadores de IP são utilizados somente como chaves de limite na API Cloudflare, sem retorno ao frontend ou registro nos logs. O fallback para ausência do cabeçalho `CF-Connecting-IP` compartilha uma única chave `unknown`.

## Limitações e próximos testes

A API nativa de rate limiting do Cloudflare é **aproximada e por localização (colo)**. Pessoas em uma mesma rede/IP podem compartilhar a cota. Não é autenticação, não é bloqueio global exato contra abuso distribuído e não substitui proteção de conta/serviço ou WAF.

A verificação automatizada comprova o contrato e a presença do binding no código/config. A ativação efetiva em produção deve ser validada depois do deploy (sem bombardear a rota nem consumir cotas reais). A cobrança/uso dos provedores deve ser monitorada no painel Cloudflare e nas APIs de terceiros.

Documentação oficial: https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/

**Não foi alterada a autenticação Cloudflare Access.** Seu erro de 302 continua dependendo da configuração externa de login e cookies. Voz/escuta/Voice Match continuam desativados.
