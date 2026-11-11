# J.A.R.V.I.S. — inteligência meteorológica mundial pessoal

## Situação da integração

O repositório já tem recursos de meteorologia mundial em `backend/weather-intelligence.js`: histórico ERA5, qualidade do ar CAMS, oceano, vazão GloFAS, ensemble de temperatura e avisos oficiais do INMET (Brasil) e NWS (Estados Unidos). Não são redes de sensores em tempo real e não autorizam afirmar que todos os países possuem alertas oficiais integrados.

O monitoramento amostral anterior, em `backend/weather-monitor.js`, coleta seis regiões globais a cada três horas. A evolução pessoal desta entrega adiciona **acompanhamento por localidade escolhida**:

- Botão **+ Acompanhar** na previsão mundial do Neural Ring, após selecionar uma cidade. Sem ativação silenciosa.
- **Acompanhamentos** lista cidades e suas últimas amostras, com a ação **Parar** que exclui também os registros dessa cidade.
- Máximo de **6 localidades por operador** e **24 coletas por janela de 3 horas** no conjunto dos operadores, evitando excesso de uso da API pública.
- Armazenamento de resultados resumidos em tabelas próprias do Cloudflare D1, com exclusão de histórico superior a sete dias.
- Execução pelo Cron Trigger já presente no Worker (`* * * * *`), que realiza coletas somente na janela das horas UTC divisíveis por três. Este recurso depende da publicação e da disponibilidade do Cloudflare Worker e D1.
- Identidade da sessão do operador validada por chave de memória; acesso por POST privado, com consultas delimitadas pelo hash dessa identidade. **Não** é um serviço de autenticação por usuário independente e não substitui um login forte caso o projeto seja distribuído.

## Como usar

1. Acesse o J.A.R.V.I.S. e abra uma previsão mundial. Exemplo: **“Jarvis, mostre a previsão do tempo em Tóquio no mapa 2D por 16 dias.”**
2. Na barra de cidades do mapa, clique em **+ Acompanhar**. O painel confirma a cidade selecionada.
3. Em **Acompanhamentos**, consulte o último horário, temperatura e chuva da amostra. Use **Parar** para retirar a cidade.
4. Para análises históricas, oceânicas ou de qualidade do ar use o seletor de análise meteorológica existente no Neural Ring.

## Limitações e controles

- Coleta *periódica*, não leitura de sensores a cada segundo nem cobertura simultânea de todo o planeta. Cada fonte tem frequência e resolução próprias.
- As previsões de rios não são avisos de inundação local; dados marítimos não substituem cartas e avisos náuticos.
- Alertas oficiais: integração pontual com INMET e NWS; países sem fonte ligada devem ser sinalizados como sem cobertura de alertas.
- O sistema não envia **notificações push, SMS ou mensagens automáticas**; o histórico fica disponível no painel. O resumo de despertar existente é independente desta lista.
- O histórico local D1 guarda snapshots curtos por até sete dias; dados ERA5 históricos são outra fonte e não se confundem com coletas recentes.
- Sem uso comercial, a Open-Meteo gratuita mantém limites de 10 mil requisições por dia, 5 mil/hora e 600/minuto. As consultas do sistema e de outros usuários/serviços também contam nesse orçamento.
- Os módulos e países não suportados devem produzir falha explicita, nunca um alerta inventado.

Referências: [Open-Meteo — termos](https://open-meteo.com/en/terms), [ERA5](https://open-meteo.com/en/docs/historical-weather-api), [CAMS](https://open-meteo.com/en/docs/air-quality-api), [marinha](https://open-meteo.com/en/docs/marine-weather-api), [GloFAS](https://open-meteo.com/en/docs/flood-api), [ensemble](https://open-meteo.com/en/docs/ensemble-api), [NWS](https://www.weather.gov/documentation/services-web-alerts).

## Testes

```sh
node tests/jarvis-weather-watchlist.mjs
node tests/jarvis-global-weather.mjs
node tests/jarvis-phase4.mjs
node tests/neural-answer-smoke.mjs
```

Validação em produção deve testar o cron e o histórico D1 com dados reais, separadamente dos testes automatizados com fonte simulada.
