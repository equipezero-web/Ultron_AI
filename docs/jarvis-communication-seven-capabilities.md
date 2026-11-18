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
| FUT-01 | Push / notificações oficiais fora do navegador | **Não implementado ponta a ponta** | Exige service worker + PushSubscription/VAPID + Worker autenticado, opt-in explícito, fontes oficiais verificadas, deduplicação, opt-out e testes reais |
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
