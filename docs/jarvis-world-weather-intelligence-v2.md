# J.A.R.V.I.S. — Meteorologia mundial avançada, uso pessoal

## Arquitetura existente aproveitada
- GitHub Pages: J.A.R.V.I.S. Neural Ring 2D/3D, sem nova página/popup.
- Cloudflare Worker: endpoints de consulta por cidade/ponto previamente resolvido pela geocodificação, com hosts de provedores fixos.
- Cloudflare D1: retenção de amostras de monitoramento operacional, sem armazenar histórico de localização pessoal.
- Cloudflare Cron: execução periódica em servidor, mesmo com a interface fechada.

## Módulos novos e como usar

| Tipo | API de referência | Conteúdo | Limite |
| --- | --- | --- | --- |
| history | https://open-meteo.com/en/docs/historical-weather-api | Um mês do ano selecionado (1940 até o ano anterior): temperatura mínima/máxima e chuva diária; ERA5 | Reanálise, não registros exatos de estação |
| air | https://open-meteo.com/en/docs/air-quality-api | PM2.5, PM10, ozônio, AQI modelado | CAMS global/europeu; não equivale a sensor na rua |
| marine | https://open-meteo.com/en/docs/marine-weather-api | Ondas, SST, velocidade de correntes | Pontos próximos à costa ou oceano; não usar para navegação |
| flood | https://open-meteo.com/en/docs/flood-api | Vazão simulada dos rios GloFAS, até 7 dias | Não é mapa de inundação nem risco de cheia por município |
| ensemble | https://open-meteo.com/en/docs/ensemble-api | Faixa entre membros disponíveis do GFS Ensemble, amostras de previsão de temperatura | Não é probabilidade de impacto nem intervalo estatístico de confiança |
| alerts | https://avisos.inmet.gov.br/ e https://www.weather.gov/alerts | Avisos oficiais brasileiros (escopo nacional/UF) e avisos dos EUA por ponto | Outros países ainda não possuem fonte oficial conectada; ausência de resposta não implica ausência de risco |

Atribuição: dados fornecidos por Open-Meteo.com sob CC BY 4.0, respeitando as fontes meteorológicas originais. A API pública gratuita é destinada ao **uso não comercial** e sujeita a limites e uso justo. Não incluir API keys no frontend.

Exemplos de comandos:
- "JARVIS, mostre a qualidade do ar em Tóquio no mapa 2D"
- "JARVIS, mostre os oceanos em Sydney no globo 3D"
- "JARVIS, mostre a vazão dos rios em Recife"
- "JARVIS, mostre a incerteza dos modelos em Londres"
- "JARVIS, mostre alertas oficiais em Miami"
- "JARVIS, mostre o histórico climático em Recife"
- "JARVIS, mostre o monitoramento mundial"

A seleção avançada por tipos, mês e ano está dentro do painel mundial do Neural Ring.
A linha do tempo do Ring mostra até 16 quadros amostrados do histórico ou série, com período e proveniência.

## Monitoramento persistente — limites
- O Cloudflare Cron já presente no backend aciona coleta meteorológica a cada **3 horas**, quando os eventos agendados são executados.
- Amostragem fixa: Recife, Florianópolis, Miami, Londres, Tóquio e Sydney. Cada ciclo faz no máximo **seis requisições** ao provedor; nominalmente 48 consultas por dia.
- Usa D1 e retém dados de até sete dias, com deduplicação de ciclo. A interface fechada não interfere na coleta; o servidor e as credenciais Cloudflare precisam continuar ativos.
- Não há geolocalização pessoal, notificações externas automáticas, monitoramento de todos os pontos da Terra, varredura por satélite em tempo real nem cálculo de riscos por IA.
- Boletins sobre a coleta exibem explicitamente a data, a fonte e o fato de serem **amostras**, não avisos oficiais.
- O sistema é informativo; para emergências, consultar a autoridade oficial do local e serviços de proteção civil.

## Endpoints
- GET /api/geo/insight?type=air&city=Tokyo
- GET /api/geo/insight?type=history&city=Recife&year=2020&month=1
- GET /api/geo/insight?type=marine&city=Sydney
- GET /api/geo/insight?type=flood&city=Recife
- GET /api/geo/insight?type=ensemble&city=London
- GET /api/geo/insight?type=alerts&city=Miami
- GET /api/geo/monitor

Cada consulta limita tipos, nomes, datas e origem; provedores externos usam endereços permitidos e não recebem URL arbitrária do usuário.

## Verificações
\`\`\`sh
node tests/jarvis-weather-intelligence.mjs
node tests/jarvis-weather-monitor.mjs
node tests/jarvis-phase4.mjs
node tests/jarvis-global-weather.mjs
node tests/neural-answer-smoke.mjs
\`\`\`
Os testes unitários usam respostas fixas e verificam não inventar dados em falhas. A aprovação da CI não substitui verificação do Worker em produção nem teste com telefone físico.

## Melhorias futuras opcionais
- Alertas oficiais por país adicionais, respeitando licenças, formatos CAP e regiões de abrangência.
- Configuração autenticada de localidades monitoradas pelo proprietário, com consentimento explícito para notificações externas.
- Comparações climáticas de longos períodos com normalização de modelos, séries históricas e escalas geográficas.
- Rastreio de cheias por bacia e localização de rios, não apenas latitude da localidade.
- Monitoramento de fontes de satélite/radar, com rastreabilidade e custos adequados.
