# J.A.R.V.I.S. — Comunicação: auditoria das sete capacidades
Atualização: 2026-11-18. Esta matriz distingue implementação, teste automatizado e validação real.
Percentuais do Evolution Control são estimativas, não testes de aceite.

| ID | Capacidade | Código/estado existente | Ação para aceite operacional |
|---|---|---|---|
| CORE-04 | Roteador de linguagem natural | `modules/ultron-orchestrator-v4270.js`, `jarvis-local-commands.js`; comandos tipados e orquestração | Interpretar frases compostas, proteger negações, executar fechar/abrir no painel realmente ativo, não cair na pesquisa genérica |
| VIS-04 | Notícias com imagens e vídeos | `ultron-neural-answer.js`, `jarvis-media-model.js`; cartões e player clicável | Vincular cada mídia a fonte e notícia corretas, validar URLs e compatibilidade mobile, fechar sem áudio residual |
| VIS-05 | Diretor visual e referências contextuais | `jarvis-visual-orchestrator.js`; cenas e comandos de navegação | Testar abrir/fechar/próxima/anterior/mostrar no mapa com todos os overlays; impedir colisões e preservar o ring |
| WORLD-01 | Boletins, notícias e despertar | `ultron-intelligence-briefing.js`; resumo de 24 h, fontes, datas, preferências | Rejeitar manchetes antigas e repetidas, sinalizar falha de fontes, verificar notícias do Brasil e avisos oficiais em produção |
| CAM-03 | Player incorporado e áudio opcional | `jarvis-public-world-cameras.js`; mute inicial, player e fallback de fonte | Testar cada player no navegador; áudio somente por clique; exibir link quando embed proibido; nunca afirmar feed ativo sem confirmação |
| FUT-01 | Push / notificações oficiais fora do navegador | **Código de ponta a ponta implementado, implantação condicionada a credenciais** | Service worker, PushManager, Worker autenticado por Cloudflare Access, VAPID RFC 8291, D1, cron INMET, opt-in/opt-out e deduplicação; falta provisionar VAPID/Access e homologar entrega real |
| FUT-04 | Voz conversacional contínua | `voice-listener-v4290.js`, `voice-runtime-policy.js`; Web Speech API e fallback | Medir latência, interrupção, eco, ruído, permissão e funcionamento em Android/Windows; desligar microfone sem reativação não consentida |

## Correções desta PR
- CORE-04: reconhece enunciados factuais seguidos de comando imperativo de fechamento (ex.: "a previsão do tempo está aberta, feche a previsão") sem acionar IA genérica.
- CORE-04: o fechamento da previsão identifica a segunda superfície meteorológica (cenário `weather-*` do mapa geográfico), além do centro meteorológico, e preserva mapas não meteorológicos.
- VIS-04: vídeos de notícias não iniciam automaticamente nem solicitam áudio ao carregar; reprodução depende de interação.
- Regressões automatizadas: frases compostas, negações, cenário meteorológico e cenário não meteorológico.

## Limites e princípios de segurança
- Sem alteração de banco, sessões, autenticação, permissões de câmera/microfone ou execução em dispositivos.
- O player de terceiros depende das políticas de incorporação e disponibilidade do provedor.
- Web Speech API não é compatível com todos os navegadores e pode usar serviço remoto de reconhecimento; não é um mecanismo garantido de escuta permanente.
- Push fora do navegador exige opt-in e infraestrutura servidor, não apenas uma caixa de diálogo local.
- A aprovação do CI não substitui teste com Android físico, Windows, TV e dados externos reais.

## Referências técnicas
- MDN Web Speech API: https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API
- MDN Push API: https://developer.mozilla.org/en-US/docs/Web/API/Push_API
- YouTube IFrame API: https://developers.google.com/youtube/iframe_api_reference

## Integração concluída no código (sem presumir ativação em produção)

1. **Roteador**: intenções determinísticas para meteorologia, diretor visual, boletim, áudio das câmeras e notificações. Frases negativas e interrogativas não executam ações.
2. **Notícias visuais**: link da fonte original, vídeos acionados por clique e iniciados sem som; o botão X remove iframes.
3. **Diretor visual**: abrir, fechar, avançar, voltar, status e selecionar cenas por texto/voz; cenas exigem fontes verificadas.
4. **Boletim**: fechar/reabrir sem parar a coleta; dados desatualizados são sinalizados; novos links são normalizados e só notícias com publicação recente são notificadas.
5. **Câmeras públicas**: fechar por frases compostas, controle idempotente de áudio de player compatível, som desligado por padrão. **Nenhuma câmera externa é garantida como ao vivo**.
6. **Notificações**: opt-in no painel, notificações de sessão e Web Push com serviço Worker autenticado, VAPID, D1 e service worker. Avisos oficiais vêm do INMET; a localização afetada é informada, sem supor impacto pessoal. O cadastro remoto só é declarado ativo após resposta positiva do Worker.
7. **Voz**: comandos de repouso exatos (nunca uma frase negada), estado real de suporte do navegador, teste físico do microfone disponível mesmo sem Web Speech API.

### Para habilitar Web Push remoto em produção

Provisionar **somente nos secrets/vars do Cloudflare Worker** (nunca em GitHub, HTML ou no navegador):
- `JARVIS_PUSH_VAPID_PRIVATE_JWK`: chave privada EC P-256 no formato JWK JSON, com x, y, d.
- `JARVIS_PUSH_VAPID_PUBLIC_KEY`: chave pública P-256 não comprimida, em base64url, correspondente ao JWK privado.
- `JARVIS_PUSH_SUBJECT`: URI de contato real do administrador, como `mailto:<endereço-administrativo>`.
- `ULTRON_DB`: D1 ativo.
- Autenticação existente: `CF_ACCESS_TEAM_DOMAIN`, `CF_ACCESS_AUD`, `CF_ACCESS_ACCOUNT_EMAILS`, `JARVIS_ACCOUNT_UI_ORIGIN` e políticas do Cloudflare Access para `/api/account/push`.

Após configurar, publicar o Worker, validar `GET /api/account/push` com sessão autenticada e clicar **ATIVAR NOTIFICAÇÕES** no navegador. O usuário pode revogar em qualquer momento. O service worker não intercepta fetch, não cacheia dados e não acessa dispositivos.

**Limitações obrigatórias:** chaves ainda não provisionadas pelo operador; entrega remota e compatibilidade Android/Windows não verificadas em aparelho real; Web Speech API e webcams dependem de permissões, navegador e provedor. A ausência de um aviso no INMET não prova ausência de riscos.
