# J.A.R.V.I.S. — Fase VIII: continuidade operacional

## Objetivo
Apresentar um panorama verificável dos monitores agendados que já operam fora do navegador. A Fase VIII **não** cria novas ordens físicas, monitora celulares/câmeras, antecipa desastres nem substitui alertas oficiais.

## Componentes
- `GET /api/intelligence/continuity`: consulta somente snapshots previamente armazenados no Cloudflare D1, sem iniciar coleta externa quando a página é ativada. Agrega `latestGlobalIntelligence` (1 hora entre coletas) e `latestWeatherMonitor` (3 horas entre coletas).
- `backend/continuity-status.js`: valida timestamps, URLs de fontes, cobertura parcial, prioridade editorial de eventos **próximos à área geográfica do Brasil** e idade das amostras.
- `modules/jarvis-continuity-client.js`: na inicialização, na ativação por voz e após retornar à aba, consulta o endpoint de leitura. Controle de consultas: compartilhamento de requisição simultânea, 10 minutos entre checagens automáticas e mínimo de 10 segundos entre atualizações manuais.
- Terminal: botão **CONTINUIDADE**, comandos **status da continuidade**, **relatório de continuidade**. Não é uma nova página.
- Neural Ring: estado do mundo e amostragem meteorológica no elemento existente de despertar do módulo Global Intelligence, inclusive no celular.

## Interpretação
- **Atualizada**: dentro da janela de 2 horas para eventos mundiais e 4 horas para amostragem meteorológica, com fontes/6 amostras verificadas.
- **Parcial**: uma ou mais fontes falharam ou uma região do conjunto esperado não possui amostra recente.
- **Desatualizada**: registro antigo. Não são notícias de última hora.
- **Indisponível**: ainda não há coleta utilizável no D1 ou a consulta falhou.
- Ordenação de exibição próxima ao Brasil é apenas uma preferência informativa; não afirma ocorrência ou impacto no Brasil. Informação de clima é previsão numérica, não alerta oficial.
- A coleta agendada já existente continua independente da aba, mas seu sucesso depende das fontes externas, Cloudflare e D1.
- Notícias gerais e detalhes das últimas 24 horas continuam a cargo do módulo independente de boletim de inteligência.

## Validação
```sh
node tests/jarvis-phase8-continuity.mjs
node tests/jarvis-global-intelligence.mjs
node tests/jarvis-weather-monitor.mjs
```

A confirmação de publicação em produção e os testes em Android, PC e LG TV permanecem etapas separadas.
