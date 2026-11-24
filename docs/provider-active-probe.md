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
