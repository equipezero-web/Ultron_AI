# J.A.R.V.I.S. — Fase XII: Orquestração Visual Inteligente

## Entrega
A Fase XII introduz o **DIRETOR VISUAL**, um painel compacto dentro do Neural Ring existente que coordena:
1. **Notícias e imagens de origem:** reutiliza a central de notícias de 24 horas e mostra imagens apenas quando elas são fornecidas pela fonte. Não cria imagens fictícias nem reutiliza fotos de outros assuntos.
2. **Prioridades verificadas:** mostra títulos, datas, categorias e links HTTPS dos registros das Fases VIII/IX com fonte atual.
3. **Mapa 2D contextual:** abre o mapa geográfico da Fase X apenas quando há eventos catalogados com coordenadas oficiais verificadas.
4. **Exploração 3D:** inicia a experiência da Fase XI com o globo e explicações editoriais, com confirmação do modo real usado. Se o 3D falhar, relata o fallback para 2D.

O sistema não supõe que todas as cenas estão disponíveis. O modelo de planejamento seleciona apenas as que passam pelos controles de datas e fontes. O operador inicia a apresentação; cada mudança de cena é acionada por um botão, tecla ou comando de voz/texto. **Não há rotação automática do globo ou narração alucinada de acontecimentos.**

## Comandos
- "Jarvis, diretor visual" / "Jarvis, iniciar apresentação visual"
- "Jarvis, próxima cena" / "Jarvis, cena anterior"
- "Jarvis, mostre notícias e imagens"
- "Jarvis, mostre fontes verificadas"
- "Jarvis, mostre mapa contextual 2D"
- "Jarvis, mostre globo contextual 3D"
- "Jarvis, status do diretor visual"
- "Jarvis, fechar apresentação visual"

O **P0 STOP** também encerra a direção de cenas, descarta a transição em andamento na interface e impede reportar sucesso após cancelamento. Uma renderização já iniciada por motor gráfico externo pode terminar fisicamente depois do STOP; não é prometido cancelamento no driver/WebGL.

## Organização e experiência móvel
- O diretor permanece no painel Neural Ring, sem nova página ou popup.
- No celular, a direção e a visualização de notícias são colocadas em regiões distintas da tela; a central do globo mantém gesto de zoom e rotação.
- Ao trocar de cena, oculta outros painéis visualmente concorrentes na medida em que as APIs existentes permitem. A cena só é marcada como apresentada após o módulo confirmar sucesso.
- Fontes, timestamps e estado de coleta ficam visíveis; uma fonte desatualizada ou ausente não vira visualização de emergência.
- O diretor não interfere na câmera, microfone, arquivos, TV, PC, pagamentos, contas ou operações externas.

## Testes
- `node tests/jarvis-phase12-visual-orchestration.mjs`
- `node tests/jarvis-phase12-visual-browser.mjs`
- Regressões das Fases VIII, IX, X, XI e parada P0

## Limitações
As notícias e os mapas são visualizações dos dados públicos já coletados, **não uma IA que renderiza vídeos sintéticos**. Os testes automatizados não substituem a homologação em smartphone físico, verificação de WebGL/Mapbox nem a confirmação de atualização do site em produção.
