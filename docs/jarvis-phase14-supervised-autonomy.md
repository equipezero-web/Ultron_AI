# J.A.R.V.I.S. — Fase XIV: Autonomia Contextual Supervisionada

Autonomia limitada a duas sequências **visuais, somente leitura**, executadas no Neural Ring existente. Não há controle autônomo de arquivos, câmeras, dispositivos, contas ou publicações.

## Comandos
- `Jarvis, planeje uma análise das notícias`: propõe apresentar prioridades e notícias verificadas.
- `Jarvis, planeje uma exploração do evento selecionado`: exige um evento geolocalizado e explicitamente selecionado na Fase XIII; propõe 2D e 3D.
- `Jarvis, autorizar plano`: inicia o plano pendente dentro de 2 minutos.
- `Jarvis, cancelar plano` / `Jarvis, status do plano`.

## Proteções
- Não executa nada ao planejar, acordar ou decorrido um tempo: aprovação explícita é obrigatória.
- Planos são fixos (máximo 2 etapas), expiram em 2 minutos e nunca interpretam texto livre como código.
- Cada etapa recebe confirmação do Diretor Visual. Falha interrompe a sequência e aparece no terminal.
- Exploração exige que a fonte e o evento ainda sejam os mesmos antes de cada etapa.
- STOP/P0 invalida autorizações e resultados pendentes; a visualização externa iniciada pode precisar concluir por conta própria.
- Não registra áudio nem dados privados. Ações possíveis limitadas a cenas já existentes no Ring.

## Validação
`node tests/jarvis-phase14-supervised-model.mjs`

Testes do navegador e publicação real precisam ser conferidos separadamente. A implementação não garante execução com a aba fechada.
