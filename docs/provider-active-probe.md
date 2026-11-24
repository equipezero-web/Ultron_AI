# J.A.R.V.I.S. — sondagem ativa sob demanda dos provedores

A observação compartilhada do D1 continua passiva por padrão. Este recurso adiciona uma verificação **real e opt-in** de um provedor por chamada, com registro redigido no mesmo histórico D1 de 15 minutos.

## Segurança e custo
- `POST /api/provider-probe` exige `Authorization: Bearer <JARVIS_PROVIDER_PROBE_TOKEN>`, secret **com no mínimo 32 caracteres**, configurado apenas no Cloudflare Worker. Não adicionar esse segredo ao navegador, código, GitHub Pages ou logs.
- Sem secret, provedor configurado ou D1 funcional, não faz chamada externa.
- O D1 reserva atomicamente **uma tentativa por provedor a cada 15 minutos** entre isolados; chamadas em paralelo não multiplicam sondagens.
- A sondagem usa texto fixo de saúde, nunca histórico ou mensagens privadas. Pode consumir créditos e não é automaticamente executada pelo cron ou pelo comando comum de diagnóstico.
- A resposta informa estado, latência e categoria de erro segura, sem retornar corpo da resposta, prompt do usuário nem credenciais.
- Uma sondagem prova apenas o resultado naquele instante. Não comprova disponibilidade global nem altera o circuit breaker do tráfego real.

## Ativar
1. Configurar um segredo de alta entropia `JARVIS_PROVIDER_PROBE_TOKEN` no Cloudflare Workers (não em `vars` versionadas).
2. Publicar o Worker a partir da branch aprovada após CI.
3. De uma sessão administrativa **segura e fora do frontend público**, chamar:
   `POST https://<worker>/api/provider-probe`
   com `Authorization: Bearer <secret>`, `Content-Type: application/json` e corpo `{"provider":"groq"}`.
4. Repetir por provedor conforme a janela de 15 minutos. Confirmar depois o comando normal de diagnóstico e o registro persistente.

## Interpretação
`available_observed`: respondeu ao teste; `failed_observed`: não respondeu ao teste (categoria `authentication`, `rate_limit`, `upstream`, `timeout`, `request_rejected` ou `network_or_unknown`); `not_configured`: não há credencial/binding; `cooldown`: tentativa recente; `d1-unavailable`/`d1-required`: falha fechada, nenhuma chamada ao provedor.

A checagem direta em produção deve ser feita somente após configurar o segredo e aprovar a implantação. Nenhum teste remoto ativo foi executado ao criar este PR.

## Interpretar falhas de Gemini e OpenRouter

A sondagem informa somente metadados seguros: `errorCategory`, `upstreamHttpStatus` (quando o serviço retornou HTTP 400–599) e `retryAfterSeconds` **apenas quando o upstream informou Retry-After válido para um HTTP 429**. Não retorna texto de erro fornecido pelo serviço, prompt, credenciais ou resposta do modelo.

- Gemini `upstream` com HTTP 500/502/503: falha observada do upstream; não concluir que a chave está incorreta. Verificar logs privados do provedor ou aguardar a próxima janela de 15 minutos. Não alternar modelos automaticamente com base apenas nesse sinal.
- Gemini `model_or_endpoint_not_found` com HTTP 404: conferir o valor efetivo de `GEMINI_MODEL` e acesso do projeto ao modelo. `invalid_model_or_request` com 400/422 indica rejeição da requisição ou modelo; exige análise.
- OpenRouter `rate_limit` com HTTP 429: observar `retryAfterSeconds` quando presente. Limites podem vir da conta, da rota gratuita `openrouter/free` ou do modelo. Sem cabeçalho, não presumir duração nem tentar repetidamente.
- Os três provedores com sondagem bem-sucedida (Groq, Cloudflare e Cohere) continuam sem alteração. O circuito de fallback e a sondagem restrita em D1 permanecem independentes.

O diagnóstico é um passo para identificar causas reais; não substitui configuração de quotas ou créditos nas contas externas. A API pode retornar erro genérico sem detalhes. Não compartilhar chaves nem logs que exponham identificadores da conta.
