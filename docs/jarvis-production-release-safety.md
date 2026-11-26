# J.A.R.V.I.S. — publicação única e recuperação dos provedores

## Estado comprovado em 26/11/2026
- Worker canônico: `ultron-backend`, caminho `backend/worker.js`.
- O pipeline GitHub Actions `.github/workflows/cloudflare-backend-deploy.yml` gera um manifesto de commit e publica via Wrangler.
- Há outro processo em **Cloudflare Workers Builds**, ligado à branch `main`, que já criou versões concorrentes sem o manifesto gerado no pipeline.
- O usuário configurou manualmente a distribuição para 100% na versão Wrangler `4516c8c1`; **não alterar a alocação por este documento**.

## Configuração externa obrigatória para consolidar a publicação
Abra Cloudflare Dashboard → Workers & Pages → `ultron-backend` → Settings → Builds.
Desative apenas as **implantações automáticas da integração Git** do Worker, mantendo a URL e a base D1.
A documentação oficial da Cloudflare descreve que também é possível alterar o comando de deploy da integração Git para `npx wrangler versions upload`, de modo que a integração faça builds sem promover versões. Preferir desativar o deploy duplicado e manter o workflow GitHub Actions como publicador único. Não desconectar a integração Git de outros sites ou serviços.

**Não** desativar o GitHub Actions Cloudflare Backend Deploy, nem apagar o Worker, nem mudar segredos.

## Validação após a configuração externa
1. Confirme que somente o deploy Wrangler tem tráfego ativo, 100%.
2. Acesse `GET /api/health`, confira `deploymentProvenance.source=github-actions-checkout` e o commit SHA do pipeline; o campo deve ser `unverified` quando a versão não contém manifesto.
3. Envie o comando de auditoria e confira `architectureInspection.github.mode=worker-deployed-source-manifest`, SHA e `d1.ready=true`.
4. Provedores Groq, Cloudflare e Cohere: status **configurado** não equivale a **disponível**. Os testes automáticos de fallback usam falhas simuladas; sondagens reais requerem token do endpoint administrativo e podem consumir créditos.
5. Para verificar disponibilidade real sem expor tokens, usar o endpoint autenticado existente de sondagem `POST /api/provider-probe`, uma chamada por provedor, respeitando cooldown D1 de 15 minutos, e observar `providerDiagnostics` sem interpretar falta de observação como indisponibilidade.
6. Voz e microfone permanecem desativados por política de manutenção.

## Limites
O cooldown do circuit breaker é local à instância do Worker e limitado a 30 segundos; não é um status global entre instâncias. A indisponibilidade HTTP do GitHub no Worker não é contornada com links inventados. O manifesto é o checkout implantado, não o HEAD ao vivo.
