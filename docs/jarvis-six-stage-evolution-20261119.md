# J.A.R.V.I.S. — Plano sequencial de seis etapas (19/11/2026)

A ordem é definida pelo operador e deve ser respeitada. As porcentagens são referências estimadas, não resultados medidos por CI ou homologação de dispositivos.

| Etapa | Área | Capacidades | Referência inicial | Critério para encerrar |
| --- | --- | ---: | ---: | --- |
| 1 | Inteligência | 20 | 44% | Memória contextual, interpretação de intenções, planejamento seguro, testes e evidências |
| 2 | Funcionalidades | 17 | 51% | Neural Ring, globo, mapas, notícias, meteorologia, câmeras e controles visuais |
| 3 | Comunicação | 7 | 45% | Comandos por texto, mídia contextual, notificações e roteamento consistente, com áudio desligado |
| 4 | Integridade | 8 | 44% | Permissões, P0 STOP, auditoria, regressões, tratamento de erros e recuperação |
| 5 | Dispositivos | 8 | 33% | Pareamento e execução confirmada em Android, PC e TV após autorização |
| 6 | Inteligência novamente | mesmas 20 | reavaliar | Revalidar inteligência ponta a ponta sobre os módulos estabilizados nas etapas 2 a 5 |

## Etapa 1: incremento inicial

- Planejador multiagente: reconhecer variações de termos em português e não converter ordens negativas em planos afirmativos, como "não mostre notícias".
- Memória contextual: havendo memórias que correspondem ao tema atual, colocá-las antes de lembranças recentes sem relação; sem correspondências, preservar a classificação anterior.
- Testes de regressão de ambas as mudanças incluídos na CI dos hubs.
- Não há execução autônoma nova de agentes privilegiados. O planejador continua consultivo; a execução supervisionada mantém listas permitidas, limites de concorrência e cancelamento.
- Não há novas permissões, credenciais, ações destrutivas, reativação de microfone nem novo acesso a arquivos.

## Critérios de passagem

1. Testes unitários e checks relevantes da PR passam.
2. Diferenciar claramente IMPLEMENTADO, TESTADO, MERGED, PUBLICADO e VALIDADO NO APARELHO.
3. Nenhuma porcentagem estimada sobe apenas por adicionar código.
4. Falhas de fontes, câmeras, push e dispositivos são mostradas sem simular sucesso.
5. Manter o modo texto do PR #204: voz, Voice Match, escuta local/remota e narração não serão religadas sem solicitação explícita do operador.
