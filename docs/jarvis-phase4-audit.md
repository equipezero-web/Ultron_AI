# J.A.R.V.I.S — Fase 4 (etapas 10–12): integração meteorológica, comandos compostos e auditoria

## Etapa 10 — Evidências meteorológicas
- Fonte operacional de **previsão numérica de curto prazo**: [Open-Meteo](https://open-meteo.com/en/docs), com atribuição CC BY 4.0, usando endpoint HTTPS com host fixo e somente cidades previamente definidas.
- O Worker lê estimativas atuais e três dias de previsão (temperatura, umidade, precipitação, chance máxima de chuva), exibindo **cidade, período, horário da consulta e fonte**. Dados atuais do modelo não são medição de estação.
- Camada de dados em `modules/jarvis-weather-model.js`: valida coordenadas fixas, campos numéricos, sequência de datas, intervalo de valores, integridade e atualidade (janela de até 36 horas, levando em conta o fuso local).
- O mapa 2D/globo 3D reutiliza `ULTRON_GEO_VISUAL`, com quadros **separados** de tendências sazonais El Niño. Não há criação de alertas, probabilidades de impacto municipal ou extrapolação indevida de dados.
- O link para [avisos oficiais do INMET](https://avisos.inmet.gov.br/) é apresentado separadamente no painel meteorológico. O monitoramento oficial já existente (INMET + NOAA/CPC) continua no briefing do sistema.

## Etapa 11 — Execução por voz ou texto
Comandos testáveis:
- `Jarvis, mostre a previsão do tempo em Recife no mapa 2D.`
- `Jarvis, mostre a previsão do tempo em São Paulo no globo 3D.`
- `Jarvis, mostre o El Niño no mapa 2D e depois filtre apenas mais chuva.`
- `Jarvis, avance o quadro.` (com uma visualização geográfica já aberta)

Fluxo: a intenção passa pelo catálogo de ações permitido, os dados são consultados no Worker, passam por validação, são transformados em quadros com proveniência, e só então são apresentados no Neural Ring. A ação só informa sucesso após conferir o estado resultante. Comandos compostos explicitamente suportados mantêm ordem estável. A voz continua usando a orquestração já existente.

## Etapa 12 — Verificações e limites
| Risco / requisito | Controle |
| --- | --- |
| URL arbitrária, SSRF | API chama somente `api.open-meteo.com`, com coordenadas internas de 11 capitais configuradas |
| Indicação de previsão inexistente | Resposta incompleta, inválida, antiga ou serviço fora do ar resulta em falha explícita |
| Confundir El Niño com previsão diária | Classes `current-estimate` / `short-term-forecast` separadas de `forecast` sazonal |
| Impactos/alertas inventados | Fonte + texto de limitação; alerta oficial acessível por link próprio |
| Privacidade e credenciais | Nenhuma chave privada nem localização GPS enviada; consulta é somente leitura |
| Falhas de modelo | Testes de fonte, coordenadas, datas, valores, allowlist, timeout e comandos |
| Regressão da interface | Smoke browser existente em celular, notebook e TV estendido para o fluxo meteorológico |

### Limites funcionais
- A previsão é apenas para **11 capitais brasileiras configuradas**, não para qualquer município; não confundir com geolocalização do usuário.
- Não é uma simulação física 2D/3D de circulação atmosférica. O mapa apresenta dados numéricos e quadros temporais; o modelo sazonal do El Niño é distinto.
- A consulta não equivale a monitoramento contínuo de novas observações nem a previsão de desastre. O backend precisa estar publicado, ter conectividade com o provedor e respeitar a licença/condições comerciais de uso da API.
- Os testes usam respostas reproduzíveis; a disponibilização em produção é verificada separadamente pelas Actions de deploy.

### Testes
```sh
node tests/jarvis-phase3.mjs
node tests/jarvis-phase3-geospatial.mjs
node tests/jarvis-phase4.mjs
# Em ambiente com navegador e servidor estático:
node tests/neural-answer-smoke.mjs
```
