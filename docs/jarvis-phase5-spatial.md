# JARVIS — Fase 5: camadas espaciais meteorológicas com cores

## Implementado
Seletor de camada no Neural Ring em Mapa 2D e Globo 3D, escala de cores, unidade, período da previsão, fonte e opacidade no mapa.
- Chuva prevista (mm/dia) e temperatura máxima (°C), três dias; umidade superficial do solo (m³/m³), ar US AQI, ondas (m) e vazão simulada (m³/s).
- Grade fixa Brasil (35 amostras) ou mundo (40 amostras). Oceano: 16 pontos separados; rios: 15 pontos. Valores ausentes ficam em branco e não são inventados.
- Células coloridas recortadas pelo contorno oficial IBGE no Brasil; globo 3D com polígonos translúcidos e fontes numéricas verificadas.
- Até 40 centros geográficos por consulta, hosts e coordenadas fechados em allowlist, cache 30 minutos no Cloudflare.

## Limitações científicas
Cada célula informa o valor em um centro de grade do modelo. Não é radar, medição em todos os pontos do polígono, dado por bairro nem um aviso oficial.
A umidade do solo NÃO é diagnóstico de seca S0–S4. A ANA divulga mapas oficiais mensais e as classes S0, S1, S2, S3, S4. O seletor Seca oficial mostra as legendas e a fonte oficial, sem preencher polígonos falsos.
A opção Alertas oficiais aponta para o INMET. Não inventa as áreas e períodos de validade dos avisos.
As cores de vazão indicam descarga modelada do rio mais próximo e NÃO são mapas de risco de inundação.
Camadas marinhas NÃO substituem avisos de navegação. API Open-Meteo gratuita exige uso não comercial.
Para pintar as classes oficiais da ANA no globo ainda falta integrar shapefiles/GeoJSON com data de referência publicada e verificável; o site oficial já pode ser acessado pelo seletor.

## Fontes
Open-Meteo: https://open-meteo.com/en/docs
Open-Meteo Air: https://open-meteo.com/en/docs/air-quality-api
Open-Meteo Marine: https://open-meteo.com/en/docs/marine-weather-api
Open-Meteo Flood: https://open-meteo.com/en/docs/flood-api
ANA: https://monitordesecas.ana.gov.br/
IBGE: https://servicodados.ibge.gov.br/api/v3/malhas/paises/BR?formato=application/vnd.geo+json

## Testes
node tests/jarvis-spatial-intensity.mjs
node tests/neural-answer-smoke.mjs
node tests/neural-mobile-smoke.mjs
GitHub Actions verifica os provedores reais e a publicação do Worker e GitHub Pages. Publicação final deve ser comprovada à parte.