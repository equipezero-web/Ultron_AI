# J.A.R.V.I.S. — Comando de inteligência verificada no Neural Ring

Data: 2026-11-19. Este incremento conecta a execução somente leitura autenticada da PR #208 à interface existente, sem novas páginas e sem habilitar voz.

## Comandos de texto aceitos

- `Jarvis, inteligência verificada: notícias`
- `Jarvis, inteligência verificada: previsão do tempo em Recife`
- `Jarvis, inteligência verificada: previsão do tempo em Tóquio no globo por 16 dias`

A entrada possui prefixo explícito **inteligência verificada:**. Os comandos convencionais de notícias, globo e meteorologia continuam sendo tratados pelos módulos anteriores.

## Fluxo real

1. O roteador recebe o comando escrito e valida o prefixo e os parâmetros.
2. Faz `POST /api/account/intelligence/execute` com `credentials:include` para aproveitar sessão válida do Cloudflare Access (que precisa estar configurado no backend).
3. O Worker valida o JWT e consulta as fontes públicas autorizadas. O navegador **não envia** `memoryKey` como autenticação.
4. Resultados de notícia recentes com fonte são convertidos em cartões no painel de respostas do Neural Ring, com título, data, URL e foto somente se houver foto fornecida pela fonte.
5. A previsão apresenta dados numéricos e atribuição da fonte; **não** chama automaticamente o mapa. Se o operador pediu também globo, indica que o passo de renderização não foi realizado, em vez de simular a operação.
6. Comando P0 após início impede que um resultado de rede tardio atualize o painel.

## Limites e critérios de aceite

- Requer Cloudflare Access configurado e login válido. Sem isso o comando informa indisponibilidade. Não acessar contas ou credenciais de terceiros.
- O backend só executa especialistas `meteorology` e `news` e retorna falha explícita para dispositivos, arquivos, pagamentos, código ou memória privada.
- Sem autorização da interface não reproduz áudio nem acessa microfone; a política global continua texto apenas.
- O painel de status não deve mais rotular a voz como ENABLED enquanto a manutenção está ativa.
- Testes automatizados comprovam parsing, parâmetro de localidade, sessão com cookies, renderização de notícias e o impedimento de falsa renderização do globo.
- A homologação com sessão Cloudflare real, frontend publicado e dispositivos físicos continua necessária para status 100%. Nenhum teste automatizado prova isso sozinho.
