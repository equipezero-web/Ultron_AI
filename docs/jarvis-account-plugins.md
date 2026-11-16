# J.A.R.V.I.S. — Plugins permanentes por conta (Fase 1)

## Modelo de segurança e sincronização

Os plugins instalados ficam em `ULTRON_DB.jarvis_account_plugins` (Cloudflare D1), indexados pelo **identificador verificado da conta**; por isso aparecem em qualquer navegador/dispositivo autenticado na mesma conta. Instalar um plugin **não instala um aplicativo Android**: habilita uma integração permanente no J.A.R.V.I.S. Cada ação remota exige dispositivo **pareado e online**, com permissão anunciada pelo Bridge.

**Não** existem plugins JavaScript arbitrários, acesso irrestrito a senhas, sessões, cookies, fotos, mensagens privadas nem execução de scripts da internet. Plugins novos precisarão de revisão do catálogo, escopos e testes antes de receber permissões. Cada nova conta recebe o mesmo **catálogo de capacidades**, mas mantém instalações, histórico e dispositivos **separados**.

## Configuração que o proprietário precisa concluir

1. Configure o Cloudflare Access para proteger a rota `/api/account/*` no domínio `ultron-backend`, liberando contas autorizadas. A política Cloudflare precisa autenticar cada chamada, e a preflight CORS para o frontend deve ser permitida. O Worker valida criptograficamente o token `Cf-Access-Jwt-Assertion` (assinatura, emissor, AUD, prazo, e-mail permitido) e falha fechado.
2. Configure no **ambiente do Cloudflare Worker** as variáveis `CF_ACCESS_TEAM_DOMAIN`, `CF_ACCESS_AUD`, `CF_ACCESS_ACCOUNT_EMAILS` (lista de e-mails autorizados, separados por vírgula) e `JARVIS_ACCOUNT_UI_ORIGIN=https://equipezero-web.github.io` (somente origem, sem barra final). Não coloque credenciais no `config.js`, no HTML ou em arquivos públicos.
3. Novas contas: o administrador adiciona o e-mail na política do Access **e** em `CF_ACCESS_ACCOUNT_EMAILS`. O login da nova pessoa produz um identificador diferente no Worker. A nova pessoa pareia apenas os próprios dispositivos pelo código emitido na sessão autenticada; contas não herdam dispositivos de outras.
4. Instale a **versão nova do J.A.R.V.I.S. Bridge Android** e vincule a partir de `Jarvis, adicione meu celular à conta`. O código expira em dez minutos. Celulares pareados antes da atualização precisam ser vinculados novamente para anunciar `calendar.open`, `calendar.create` e `storage.diagnostics`. Um dispositivo offline não executa comandos retroativos sem validação.
5. Use o J.A.R.V.I.S. via HTTPS no PC, celular ou TV. O frontend utiliza a sessão Access do navegador; ao trocar de conta, a lista de plugins/dispositivos muda automaticamente no servidor.

## Catálogo inicial de plugins revisados

| Plugin | Comandos nativos | Resultado real |
|---|---|---|
| YouTube | `youtube.open` | Android: solicita a abertura do app YouTube na sessão já existente. PC: abre `https://www.youtube.com` pelo navegador padrão do Desktop Bridge. Não controla nem lê cookies, e não garante qual conta Google está ativa. |
| Agenda | `calendar.open`, `calendar.create` | Abre o calendário Android ou Google Calendar no PC. Para criar evento Android, o J.A.R.V.I.S. preenche um rascunho e o usuário confirma/salva no app; nenhum evento é gravado silenciosamente. |
| Armazenamento | `storage.diagnostics` | Android: capacidade total/usada/livre no armazenamento interno, **sem acesso ao conteúdo** dos arquivos, Google Drive ou dados de outras contas. |

**Abertura em segundo plano:** o Android pode bloquear a abertura automática de aplicativos e oferecer uma notificação tocável. O recibo da execução distingue `queued`, `completed` e `failed`; o J.A.R.V.I.S. não pode relatar um agendamento como salvo sem confirmação.

## Comandos no terminal Neural Ring

- `Jarvis liste meus plugins`
- `Jarvis instale plugin youtube`
- `Jarvis instale plugin agenda`
- `Jarvis instale plugin armazenamento`
- `Jarvis adicione meu celular à conta`
- `Jarvis abra YouTube no meu celular` ou `Jarvis abra YouTube no computador`
- `Jarvis abra agenda no celular` ou `Jarvis abra agenda no computador`
- `Jarvis faça diagnóstico do armazenamento no meu celular`
- `Jarvis selecione dispositivo Android pessoal` (quando mais de um dispositivo estiver disponível)
- `Jarvis crie evento na agenda do celular: Reunião | 2026-11-19T10:00:00-03:00 | 2026-11-19T11:00:00-03:00 | confirmo` (use horários futuros com fuso explícito, e confirme novamente no aplicativo)
- `Jarvis adicione nova conta` (mostra instruções de cadastro autorizado)

## Limites da fase

As capacidades são persistentes **na conta**, mas o Android Bridge, Desktop Bridge e TV precisam de instalações reais/pareamentos e permissão do próprio sistema operacional. TV e outros dispositivos terão plugins adicionais apenas quando houver adaptadores específicos, revisão de permissões e testes. O navegador não consegue obter todas as informações de contas Google/Apple/YouTube sem a autorização OAuth de cada serviço.
