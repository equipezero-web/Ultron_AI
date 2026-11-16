# J.A.R.V.I.S. — Inteligência de dados rastreáveis (fase inicial)

## O que foi implementado
O relatório do J.A.R.V.I.S. passa a distinguir três conceitos:
- **Dado externo**: observação de pluviômetro APAC ou resultado de modelo Open-Meteo; a fonte permanece expressamente identificada.
- **Validação estrutural**: checagem de campos, números, limites, períodos e datas da coleta. Isso **não confirma** a precisão física, a autenticidade criptográfica da fonte nem a validade de um alerta.
- **Resultado derivado**: cálculo determinístico do J.A.R.V.I.S. a partir dos dados recebidos, com fórmula e origem preservadas.

Nos resultados Open-Meteo, calcula: soma da chuva prevista no horizonte selecionado, dia com maior precipitação prevista, maior temperatura máxima prevista e menor mínima prevista. A soma é de valores de previsão, **não** de medições observadas.

Nas leituras das estações APAC, calcula: contagem de registros válidos, contagem dos que registraram chuva e maior chuva acumulada **entre as estações retornadas**. Uma leitura pode estar atrasada. A hora de consulta não comprova a hora em que uma estação mediu. Não deduz risco de inundação nem cria alertas.

## Interface e integração
A seção recolhível "J.A.R.V.I.S. · ORIGEM E CÁLCULOS" aparece dentro do painel já existente:
- Meteorologia > APAC: detalhamento das medições e dos cálculos próprios.
- Mapa meteorológico mundial: após selecionar e carregar uma localidade, detalhamento da previsão e dos cálculos próprios.
- Comando local de voz/texto: "Jarvis, mostre a origem dos dados" e "Jarvis, quais as fontes dos dados". Retorna apenas o último relatório efetivamente calculado; se não houver dados, informa ausência.

O relatório inclui links para documentação da fonte e exportação JSON sob clique do usuário. O histórico usa armazenamento **local deste navegador**, limitado a 18 relatórios e 180 KB; se localStorage falhar, a visualização atual continua disponível. Não existe sincronização entre dispositivos, autenticação externa, banco central de relatórios nem API pública nova nesta fase.

## Contrato de qualidade
Os campos verification.independentCorroboration e verification.sensorCalibration são sempre "not-performed" e "not-checked", respectivamente. Nenhum percentual de precisão/confiabilidade é inventado.

Só dados válidos e efetivamente recebidos geram relatórios. Não se criam leituras durante falta de rede. Dados do histórico não são exibidos como se fossem dados recém-consultados. Fontes técnicas, hora, período, local e limitações são exibidos; o campo de origem é uma declaração do provedor e não prova criptográfica.

Os dois serviços atualmente integrados são um único modelo numérico meteorológico mundial (Open-Meteo) e um conjunto de estações pluviométricas observadas em Pernambuco (APAC). **Eles medem coisas diferentes**, portanto não são tratados como confirmação cruzada. Para verificação independente real serão necessárias fontes adicionais comparáveis no tempo, espaço e grandeza, verificações de disponibilidade e, eventualmente, sensores próprios calibrados.

## Arquivos
- modules/jarvis-data-intelligence-model.js: modelo puro, sem acesso a rede ou navegador
- modules/jarvis-data-intelligence.js: ponte de interface, histórico local e exportação
- modules/jarvis-data-intelligence.css: estilo metálico dourado
- tests/jarvis-data-intelligence-model.mjs: regras de origem, cálculo, limites e comando
- tests/jarvis-data-intelligence-browser.mjs: interface APAC, exportação e mobile/desktop

## Limitações honestas
Esta fase torna o J.A.R.V.I.S. uma **fonte secundária de análises próprias rastreáveis**. Não o torna proprietário das medições originais; não implementa uma rede física de sensores; não fornece confirmação independente nem garante uptime em todas as redes. Uma API externa auditável e histórico persistente centralizado exigem serviço backend e políticas de publicação/segurança específicos.
