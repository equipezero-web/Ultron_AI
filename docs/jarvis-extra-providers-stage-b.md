# J.A.R.V.I.S. — expansão opt-in de provedores (Etapa B)

Os provedores existentes Groq, Cloudflare Workers AI e Cohere continuam sendo as opções iniciais. Gemini e OpenRouter continuam desativados via `AI_DISABLED_PROVIDERS=gemini,openrouter`.

Foram adicionados três **adaptadores de código**, sem credenciais e sem ativação automática:

| Provedor | Secret exclusivo do Worker | Modelo padrão | API |
| --- | --- | --- | --- |
| Mistral AI | `MISTRAL_API_KEY` | `mistral-small-latest` | `https://api.mistral.ai/v1/chat/completions` |
| DeepSeek | `DEEPSEEK_API_KEY` | `deepseek-chat` | `https://api.deepseek.com/chat/completions` |
| Cerebras | `CEREBRAS_API_KEY` | `llama3.1-8b` | `https://api.cerebras.ai/v1/chat/completions` |

## Ativação controlada

1. Confirmar limites/custos da conta. Esses serviços **não são garantidamente gratuitos**. Configurar orçamento e limites no provedor.
2. Cadastrar cada chave como **Secret** somente no Cloudflare Worker (não no GitHub Pages nem em `vars` versionadas).
3. Com a chave presente, `getProviderStatus` passa a marcar `configured=true`; o gateway poderá usá-la somente depois dos provedores preferidos da classe, ou em caso de fallback.
4. Fazer uma sondagem autenticada `POST /api/provider-probe` para o provedor desejado respeitando 15 min de D1 por provedor. Uma sondagem pode consumir créditos.
5. Validar registro no D1 e desempenho real antes de promover um provedor na ordem de prioridade.

## Segurança e disponibilidade

Sem chaves, os novos provedores são pulados e **não geram requisições**. A implementação só aceita três endpoints fixos, inclui timeout e registra apenas eventos de duração/sucesso/falha sem mensagens, credenciais ou resposta do modelo. O diagnóstico local e D1 inclui os novos nomes. Falhas provocam o mesmo circuit breaker e fallback existente. Nenhum modelo recebeu acesso adicional a dispositivos, voz ou ferramentas.

A publicação do Worker segue o workflow `.github/workflows/cloudflare-backend-deploy.yml` em `main` (push com mudanças em `backend/**`). Depois do merge, conferir a conclusão do workflow de deploy e a saúde real do Worker; aprovação de testes em PR **não significa deploy confirmado**.
