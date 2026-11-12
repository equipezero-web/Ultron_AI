# J.A.R.V.I.S. — motor geográfico mundial extensível (Fase 6)

## Objetivo
Separar o comando 'mostrar no mapa 2D/3D' da resposta textual. O JARVIS escolhe um adaptador geográfico fonte-verificada por tema e renderiza no próprio Neural Ring, com legenda, período, unidade, evento/ponto/país e link de fonte.

## Fontes instaladas
- USGS: terremotos de magnitude M4,5+ nos últimos sete dias, cor por magnitude (NÃO intensidade Mercalli, danos ou risco). [Feed](https://earthquake.usgs.gov/earthquakes/feed/v1.0/geojson.php).
- NASA EONET: eventos naturais catalogados — queimadas, vulcões, tempestades severas, enchentes, deslizamentos. Cores por CATEGORIA; EONET não garante grau de severidade comparável. [API v3](https://eonet.gsfc.nasa.gov/docs/v3).
- Banco Mundial: população total, PIB nominal e emissões de CO₂ por habitante por país. Cor por faixa de valor anual publicado, cada país identificado pelo seu ano; sem sugerir que são observações em tempo real. [API v2](https://datahelpdesk.worldbank.org/knowledgebase/articles/889392).
- Open-Meteo: chuva prevista, temperatura máxima, umidade do solo, qualidade do ar, ondas e vazão em pontos de amostragem fixos pelo mundo ou no Brasil. Células grandes NÃO são radar nem medição de cada lugar.

## Comandos de exemplo
1. `Jarvis, mostre os terremotos do mundo no mapa 2D`.
2. `Jarvis, mostre as queimadas do mundo no globo 3D`.
3. `Jarvis, mostre a população dos países no mapa 2D`.
4. `Jarvis, mostre o PIB mundial no globo 3D`.
5. `Jarvis, mostre as áreas de enchentes catalogadas no Brasil no mapa 2D`.
6. `Jarvis, mostre a intensidade de chuva do mundo no mapa 2D`.
7. `Jarvis, mostre a qualidade do ar no mundo no mapa 2D`.

## Contratos e arquitetura
- `worldGeoIntent` permite apenas pedidos explícitos de mapa/visualização, sem inferir que qualquer pergunta é ordem de abrir globo.
- Catálogo de ações tipadas: `geo.global` e `geo.spatial`, somente allowlists de temas, regiões `world|brazil` e vista `2d|3d`.
- Rota do Worker `/api/geo/world?topic=...&region=...`; URLs de USGS/NASA/Banco Mundial fixas, timeout, respostas numéricas e coordenadas validadas, cache e ausência explícita de dados.
- `geo.global` converte as fontes em dados com IDs, latitude/longitude, eventuais cores e valores, períodos, fonte e legenda. Não converte livremente textos de pesquisa em áreas coloridas.
- World Bank: contornos reais Natural Earth 110m identificados pelo código ISO-3 e coloridos no mapa 2D e globo 3D. Países sem correspondência ou sem valor ficam sem pintura; a localização dos pontos é capital/centro geocodificado.
- USGS: marcadores com cores por magnitude no epicentro. EONET: marcadores por categoria; não descrevem limites espaciais do evento, embora uma fonte possa oferecer geometria mais detalhada.
- Para Brasil, eventos de fonte mundial usam a caixa geográfica aproximada (pode incluir pontos em países vizinhos próximos). Não há fronteira jurídica exata para seleção de eventos nesta primeira integração.
- A exibição 3D preserva o mesmo painel Neural Ring sem pop-up. Ao fechar, remove overlays da visualização.

## Segurança científica, licenças e limites
Não é possível mapear literalmente qualquer assunto sem dados geográficos públicos e fonte/licença adequadas. Temas não reconhecidos NÃO podem usar um mapa inventado. População e PIB anuais não são indicadores em tempo real. Magnitude de terremoto não equivale à intensidade ou aos danos no local. Cores da NASA para incêndio/vulcão/enchente não denotam severidade, apenas categoria do evento. Camadas de seca oficial, risco de inundação e alertas nacionais só devem ser desenhadas com polígonos oficiais e datas verificadas.
Os dados USGS e NASA EONET incluem atribuição, e para Banco Mundial e Natural Earth devem ser respeitados os respectivos termos. O serviço é utilizado pessoalmente; taxas e limites de API continuam sujeitos aos provedores.

## Testes
- `node tests/jarvis-world-geodata.mjs`: intent, dados simulados USGS/NASA/Banco Mundial, cores, anos, safety e fontes.
- `node tests/neural-answer-smoke.mjs`: executa comandos no navegador em mobile, notebook e TV; verifica mapa 2D, país colorido, globo 3D e grade mundial.
- `Total Orchestration Check`: testes e sondagem externa dos provedores; `Cloudflare Backend Deploy` após merge na main.
- Para declarar ativo em produção, comprovar via HTTP o endpoint, os módulos no GitHub Pages e navegador público separadamente.