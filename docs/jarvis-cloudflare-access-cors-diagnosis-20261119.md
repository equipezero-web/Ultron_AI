# J.A.R.V.I.S. — Diagnóstico de login Cloudflare Access (GitHub Pages → Worker)

Data: 2026-11-19. Sintoma observado: no comando `Jarvis, testar globo e acesso`, o globo passa, mas a rota protegida produz erro de rede/CORS no navegador. O backend `GET /api/health` respondeu normalmente. O relatório de 0/60 **não** deve ser alterado por essa falha.

## O que foi confirmado no código

- Frontend: `https://equipezero-web.github.io/Ultron_AI/`
- Backend: `https://ultron-backend.lucaalves17-20.workers.dev`
- `GET /api/account/session/verify` exige a validação server-side do JWT emitido pelo Cloudflare Access (`Cf-Access-Jwt-Assertion`).
- `credentials:include` **não gera** um JWT e não autentica automaticamente o usuário. O navegador pode bloquear cookies de terceiros.
- `accountAccessConfig(env).enabled` confirma apenas que o Worker possui parâmetros de configuração; **não** comprova que a aplicação/política Access protege essa rota no edge.
- Mesmo com CORS correto no Worker, o Cloudflare Access pode interceptar requisições antes de enviá-las ao backend. Um `fetch()` iniciado sem sessão no domínio protegido pode falhar por redirecionamento/CORS.

Documentação oficial: [Cloudflare Access — CORS](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/cors/) e [Access para Workers](https://developers.cloudflare.com/workers/configuration/cloudflare-access/).

## Diagnóstico seguro acrescentado

Quando a rota privada falhar, o navegador consulta `GET /api/health`, sem cookies e sem JWT. O Worker passa a informar somente o booleano `accountPlugins.uiOriginAllowed` para indicar se `JARVIS_ACCOUNT_UI_ORIGIN` autoriza exatamente `https://equipezero-web.github.io`. Não divulga e-mail, identidade, URL do emissor, token nem lista de contas.

Resultados possíveis:

| Código | Interpretação | Ação |
| --- | --- | --- |
| `origin-not-allowed` | Configuração backend não autoriza a origem do GitHub Pages | Ajustar `JARVIS_ACCOUNT_UI_ORIGIN` |
| `access-not-configured` | Parâmetros de Access ausentes/incompletos no Worker | Verificar variáveis de ambiente do Worker |
| `access-or-cookie-blocked` | Worker público responde, origem permitida, mas requisição privada falhou antes de uma resposta legível | Conferir política Access que protege a rota, login no domínio da API, CORS do Access, cookies e redirecionamento |
| `access-configuration-unverified` | Worker publicado ainda não informa o novo booleano de origem | Confirmar deploy/versão em produção |
| `not-confirmed` | A rede ou o contrato público não permitiu diagnosticar | Conferir rede e Worker; não inferir causa |
| `login-required` / `forbidden` / `unavailable` | O próprio Worker respondeu 401 / 403 / 503 de modo legível | Conferir respectivamente login, autorização e configuração/provedor |

## Passos de configuração administrativa no Cloudflare

1. Verificar que o **Worker de produção realmente está protegido por uma aplicação Cloudflare Access**, preferencialmente com regra específica para `/api/account/*`, preservando a saúde pública `/api/health`. A existência de variáveis `CF_ACCESS_*` sozinha não instala proteção no edge.
2. Confirmar `CF_ACCESS_TEAM_DOMAIN`, `CF_ACCESS_AUD`, `CF_ACCESS_ACCOUNT_EMAILS` e `JARVIS_ACCOUNT_UI_ORIGIN=https://equipezero-web.github.io` no ambiente do Worker. Não copiar valores secretos para a interface, GitHub ou conversa.
3. Nas configurações CORS da aplicação Access, restringir a origem a `https://equipezero-web.github.io`, permitir credenciais e somente os métodos/cabeçalhos necessários. Se as requisições `OPTIONS` forem interceptadas no edge, configurar o tratamento do preflight pelo Cloudflare conforme a documentação oficial — sem remover os checks de origem e autenticação do Worker.
4. Acessar **manualmente**, em uma navegação iniciada pelo usuário, a aplicação/domínio protegido pelo Access e concluir o login. Atualizar o J.A.R.V.I.S. e refazer `Jarvis, testar globo e acesso`.
5. Se o navegador bloquear o cookie `CF_Authorization` entre `github.io` e `workers.dev`, considerar hospedar UI e API sob **mesma origem** ou domínio próprio de mesmo site. Não contornar a proteção passando JWT em parâmetros de URL, `localStorage` ou `memoryKey`.

**Importante:** não fazer login no lugar do operador, não abrir uma janela de autenticação automaticamente, não expor cabeçalhos de autenticação, não reduzir a política Access para `bypass` como tentativa de correção.

## Critério de sucesso

O teste pontual de Access só será **CONFIRMADO** quando `GET /api/account/session/verify` retornar 200, com `authenticated:true` e `verifiedBy:"cloudflare-access-jwt"`, após o Worker validar a assinatura e os atributos do JWT. Essa prova ainda não homologa as 60 capacidades, nem a execução do agente autenticado, D1 ou dispositivos físicos.

Voz, Voice Match, microfone e escuta permanecem **desativados**.
