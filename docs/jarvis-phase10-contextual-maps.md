# J.A.R.V.I.S. — Fase X: Visualização Contextual 2D e 3D

## Objetivo
Transformar eventos geográficos publicados pelas fontes oficiais em visualização interativa dentro do Neural Ring já existente. Não são gerados mapas de impacto a partir de notícias, manchetes, siglas de estado ou texto de IA.

## Funcionalidade entregue
- Coordenadas geográficas originais (latitude/longitude) e sinalizador de ponto representativo são preservados no endpoint de continuidade e encaminhados às prioridades da Fase IX.
- Somente eventos catalogados nas fontes USGS, NASA EONET e GDACS, com URL oficial, idade de coleta válida e coordenadas numéricas legítimas, geram pontos de mapa.
- Notícias genéricas e avisos do INMET sem coordenadas não recebem pinos. Mantêm os seus links de fonte para consulta.
- Botões MAPA 2D e GLOBO 3D ao lado de cada evento georreferenciado no painel compacto de prioridades. O controle MAPA CONTEXTUAL abre o mapa de eventos presentes na coleta válida.
- O mapa 2D usa a visualização SVG e o contorno mundial Natural Earth já existentes, com zoom e foco; o globo 3D usa a câmera ULTRON_EARTH.focus. Ambos verificam se o cenário e a centralização efetivamente responderam.
- Quando o globo falha na abertura, o sistema tenta o mapa 2D e informa que houve fallback, sem inventar sucesso 3D.
- Comandos de texto/voz para mostrar prioridades no mapa 2D e mostrar prioridades no globo 3D.
- Camadas automáticas de intensidade meteorológica não são misturadas ao mapa de acontecimentos catalogados. Pinos sinalizam registro, não intensidade calculada, área afetada, risco ou simulação preditiva.
- Cache invalidado para mobile e desktop. Não abre página/modal externo.

## Verificação
Execute os testes com Node 22:
- node tests/jarvis-phase10-contextual-map.mjs
- node tests/jarvis-phase9-priorities.mjs
- node tests/jarvis-phase8-continuity.mjs
- node tests/jarvis-phase3-geospatial.mjs

## Limitações
- Somente os eventos incluídos no resumo de prioridades (até seis) podem aparecer no mapa contextual; para um conjunto maior, use o módulo Global Intelligence existente.
- Registros USGS/NASA/GDACS são informativos. Não equivalem a alertas oficiais da Defesa Civil nem previsões de desastres. Um ponto representativo não define as fronteiras da ocorrência.
- O contexto é obtido das coletas já realizadas; a disponibilidade do Worker/Cloudflare e dos provedores afeta o acesso. Testes automatizados não substituem validação em dispositivos reais nem garantem implantação em produção.
