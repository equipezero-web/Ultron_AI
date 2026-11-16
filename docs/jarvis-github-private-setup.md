## GitHub privado autorizado (J.A.R.V.I.S.)

O J.A.R.V.I.S. tem uma rota **separada, somente leitura**, `POST /api/github/private/ai`. A rota pública `/api/ai` **não recebe tokens privados**, e nenhuma resposta privada é gravada deliberadamente na memória de conversas públicas. O frontend só tenta a rota privada depois de uma falha verificável da inspeção pública.

### Configuração obrigatória pelo proprietário da infraestrutura

1. Proteja `/api/github/private/*` com **Cloudflare Access** (aplicação auto-hospedada no domínio do Worker), exigindo login; não adicione Cloudflare Access ao domínio público todo sem revisar os demais caminhos. Configure `CF_ACCESS_TEAM_DOMAIN` (ex.: `https://sua-equipe.cloudflareaccess.com`), `CF_ACCESS_AUD` (AUD do aplicativo), `CF_ACCESS_ALLOWED_EMAILS` (endereços do operador permitidos, separados por vírgulas) e `GITHUB_PRIVATE_UI_ORIGIN` (ex.: `https://equipezero-web.github.io`).
2. Crie uma credencial **GitHub fine-grained** (ou token de instalação com escopo equivalente) exclusiva para a integração, com permissão **Contents: read-only** apenas nos repositórios desejados. Armazene-a exclusivamente como segredo do Cloudflare Worker `GITHUB_PRIVATE_TOKEN` por `wrangler secret put GITHUB_PRIVATE_TOKEN`. Não coloque o token no GitHub, HTML, JavaScript ou conversa.
3. Configure `GITHUB_PRIVATE_REPOS` com uma lista explícita de `owner/repo` autorizados. Este valor e os identificadores do Access podem ser variáveis do ambiente Worker, nunca valores escolhidos pelo navegador. O servidor nega qualquer repositório fora dessa lista.
4. Valide primeiro uma sessão Cloudflare Access efetiva no navegador e os endpoints de estado. A implantação do código não provisiona permissões: sem o token e Access configurados, a rota falha **fechada** com `private-access-not-configured`.

A sessão Access deve ser específica do operador e as credenciais da conta GitHub permanecem privadas. GitHub Apps com instalação restrita, expiração de tokens e rotação são preferíveis para uso prolongado. A autorização é somente leitura; escrever commits, excluir arquivos e implantar projetos exige outra integração e aprovações explícitas.

Se a API pública falhar, o módulo tenta ler somente o `README.md` público nas branches `main`/`master` via `raw.githubusercontent.com`. Se o README for encontrado, classifica o resultado como **evidência parcial**, nunca como repositório privado verificado ou auditoria completa.
