# JARVIS · Meteorologia mundial (Fase 4.1)

## Entregue
- Busca mundial de localidades via Open-Meteo Geocoding, com dados de GeoNames e retorno de até oito candidatos selecionáveis.
- Seleção explícita de resultados ambíguos dentro do **Neural Ring**, sem pop-ups nem troca de página.
- Consulta mundial por cidade e país ou ID de localidade validado no serviço de geocodificação; o usuário jamais controla o host ou as coordenadas enviadas ao provedor.
- Previsão de **3, 7 ou 16 dias**, com temperatura, precipitação, chance de chuva, umidade e vento, com fonte, período e identificação de modelo.
- Mapa 2D global baseado em contornos Natural Earth (quando disponíveis), e marcadores no globo 3D no Neural Ring, com linha do tempo de até 17 quadros (estimativa atual + 16 dias).
- Atualização manual e consulta periódica a cada 15 minutos **somente enquanto o painel meteorológico estiver aberto e visível**. A interface não representa monitoramento 24 horas em segundo plano.
- Comando: `JARVIS, mostre a previsão do tempo em Tokyo no globo 3D por 16 dias`. No painel, digite uma cidade e país para escolher entre localidades homônimas.
- Rota pública somente leitura `GET /api/geo/locations?q=Tokyo` e `GET /api/geo/global?city=Tokyo&days=16`, ou `id=<id verificado pela Geocoding API>`.

## Segurança e limites científicos
- URLs de consulta externas estão codificadas no backend; entradas possuem validação de comprimento, caracteres, dias e identificador.
- Os dados são previsões de **modelos meteorológicos**; não são observações instantâneas, imagem de satélite, radar, alerta oficial ou probabilidade de desastre.
- Há tolerância para horário local e offset UTC, rejeição de dados inconsistentes e indisponibilidade explícita se o provedor falhar.
- Previsões de dias distantes são mais incertas. A animação dos quadros não cria simulações físicas.
- O aviso oficial do INMET continua exclusivo do Brasil; alertas de outros países exigem integração adicional de provedores locais.
- Esta integração não implementa ainda **todos** os produtos da Open-Meteo (histórico ERA5, qualidade do ar, marés e oceano, cheias ou ensembles de incerteza), nem cobertura global de radares.
- [Documentação Open-Meteo](https://open-meteo.com/en/docs), [Geocoding](https://open-meteo.com/en/docs/geocoding-api), dados com atribuição CC BY 4.0, localizações GeoNames.
- A API pública gratuita está sujeita às regras de uso não comercial, limites e disponibilidade; para produção comercial/alto volume, revisar condições e licença/plano.

## Validação
```sh
node tests/jarvis-global-weather.mjs
node tests/jarvis-phase4.mjs
node tests/jarvis-phase3-geospatial.mjs
# Browser smoke com servidor local
node tests/neural-answer-smoke.mjs
```

A CI em GitHub Actions valida os testes de modelo, segurança e UI responsiva; o deploy Cloudflare pode ser verificado separadamente em produção.

## Recuperação sem Cloudflare
Se as novas rotas do Worker responderem 404/5xx (por exemplo, falha de deploy de vínculo D1), o módulo cliente usa as mesmas funções de validação para consultar **diretamente** os endpoints públicos `geocoding-api.open-meteo.com` e `api.open-meteo.com`, por CORS. Nenhum token é exposto. Isso só funciona com acesso à rede e com o serviço público da Open-Meteo disponível; não constitui um backend de monitoramento 24 horas. Em uso comercial, migrar para acesso contratado e/ou servidor autorizado, não depender da API pública gratuita.
