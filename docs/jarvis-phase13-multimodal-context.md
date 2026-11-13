# J.A.R.V.I.S. — Fase XIII: Orquestração Multimodal e Controle Contextual

## Escopo
A Fase XIII faz a ligação entre **comandos por voz/texto** e as cenas verificadas do Diretor Visual (Fase XII), a central de notícias/imagens e a exploração 2D/3D (Fases X e XI).

O novo módulo interpreta referências como "este evento", "isso", "esta notícia" **somente** quando o registro está explicitamente selecionado e continua disponível na fonte. Não invoca inteligência generativa para inventar contexto, imagens ou coordenadas.

## Comandos oferecidos
- "Jarvis, o que estou vendo?" e "Jarvis, explique este evento"
- "Jarvis, qual é a fonte deste evento?"
- "Jarvis, mostre a imagem desta notícia" (apenas se a imagem original existir e a manchete corresponder)
- "Jarvis, mostre isso no globo 3D" / "Jarvis, mostre isso em 2D"
- "Jarvis, próximo item" / "Jarvis, destaque anterior"
- "Jarvis, voltar para notícias"
- "Jarvis, status do controle contextual"

## Contratos de execução
1. **Referência:** primeira validação consulta o registro atualmente destacado no painel do Diretor Visual, na exploração imersiva aberta ou na notícia solicitada. Um painel oculto não fornece um referente implícito.
2. **Fonte:** notícias precisam de origem HTTPS, publicação com menos de 24 h e arquivo de coleta confirmada recente. Prioridades usam a lista verificada e sua idade de coleta. Mapas exigem URL oficial e coordenadas da fonte.
3. **Imagem:** foto de outra notícia não serve como imagem da manchete selecionada. Ausência de imagem real é apresentada como indisponibilidade, sem geração de conteúdo artificial.
4. **Mudança de modalidade:** o controller só informa "mapa aberto" quando a cena existente ou o motor de mapas retorna confirmação positiva e modo real ("2d"/"3d"). Fallback 3D→2D é identificado explicitamente.
5. **Concorrência:** não executa duas mudanças contextuais simultaneamente. Recebimento de uma segunda instrução informa que a transição anterior está em andamento.
6. **Parada P0:** invalida o recibo pendente e fecha os painéis de apresentação; não afirma que uma renderização externa já iniciada foi interrompida fisicamente.
7. **Privacidade:** o pequeno relatório de estado contém somente tipo de comando, cena e resultado. Não armazena áudio, dados de contas ou coordenadas privadas.

## Interface
- Seleção explícita de um registro nas prioridades do Diretor Visual (botão **SELECIONAR**), com destaque do registro escolhido.
- Explicações e link para a fonte aparecem **dentro do painel existente do Neural Ring**. A exploração standalone utiliza o painel já presente; a central de notícias mantém seus próprios links e imagens.
- As informações não criam uma página separada nem cobrem automaticamente o globo ao ativar o assistente.

## Testes
- `node tests/jarvis-phase13-context-model.mjs`
- `node tests/jarvis-phase13-context-browser.mjs`
- Regressões das Fases VIII–XII e parada P0.

## Limitações
A integração com voz usa a transcrição já fornecida pelo módulo de reconhecimento; **não garante captação contínua ou leitura em voz alta** caso microfone, permissões e TTS estejam indisponíveis. Publicação no GitHub não comprova que o site está atualizado nem que o WebGL/Mapbox funcionará em todos os smartphones físicos.
