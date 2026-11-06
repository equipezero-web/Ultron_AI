# J.A.R.V.I.S — Holographic Neural Command

Sistema multimodal com interface holográfica 3D, Voice Match, Optical Sensor, memória persistente, RAG local, automações, controle de dispositivos e gateway multi-IA.

> O repositório mantém o nome técnico `Ultron_AI` e alguns identificadores internos `ULTRON_*` por compatibilidade com versões anteriores, mas a marca e a interface oficial do sistema são **J.A.R.V.I.S** a partir da v4.31.0.

## Endereço público

https://equipezero-web.github.io/Ultron_AI/

## Núcleo holográfico v4.31

O Neural Command utiliza Three.js/WebGL como camada de renderização do núcleo central:

- esfera holográfica tridimensional;
- rotação 360° em Yaw/Pitch;
- amortecimento suave por LERP;
- controle por mouse, toque e Optical Sensor;
- anéis concêntricos orbitais;
- partículas neurais e poeira holográfica;
- pulso visual durante fala;
- fragmentação do núcleo ao entrar no Filespace;
- arquivos internos ocultos até a entrada/zoom profundo.

O estado espacial continua sendo fornecido pelo motor Neural 3D existente, preservando os gestos, profundidade, pinça e integração mobile.

## Voice Match / Wake

A frase oficial de ativação é **“Jarvis”**. O runtime mantém compatibilidade interna com a antiga chave de wake para não quebrar o motor de voz estabilizado, mas a experiência apresentada ao operador é J.A.R.V.I.S.

O Voice Match permanece local no dispositivo do navegador.

## Backend canônico

O backend de produção possui um único entrypoint:

`backend/worker.js`

O `backend/wrangler.jsonc` aponta diretamente para `worker.js`.

O contrato esperado de `/api/health` inclui:

- `workerEntrypoint: "worker.js"`
- `singleEntrypoint: true`
- `legacyWorkerChain: false`

Qualquer tentativa do frontend de abrir referências históricas `worker-v2.js` até `worker-v6.js` é redirecionada para `backend/worker.js`.

## Gateway Multi-IA

O backend possui failover entre provedores configurados. As chaves ficam exclusivamente em secrets/variáveis de ambiente; nunca em `index.html`, `config.js` ou no repositório.

Rotas principais:

- `GET /api/health`
- `POST /api/ai`
- `POST /api/voice`
- rotas de memória, pesquisa, visão, Bridge, dispositivos, automações e orquestração.

## Filespace / Ultron_Data

A pasta `Ultron_Data` mantém o nome técnico para compatibilidade com o Local Core e índices existentes. Na interface, ela faz parte do Filespace do J.A.R.V.I.S.

O Filespace permite abrir arquivos, visualizar componentes, mover conteúdo entre arquivos e exportar novas versões sem sobrescrever os originais.

## Segurança operacional

A hierarquia P0→P5 permanece ativa. `STOP`, `PARAR`, `CONGELAR` e `CANCELAR` têm prioridade P0 e interrompem novas etapas operacionais imediatamente.

Ações destrutivas em dispositivos continuam exigindo a política de confirmação apropriada.

## Desenvolvimento local

O frontend usa o backend definido em `config.js`.

Para o backend Node/local, entre em `backend/`, copie `.env.example` para `.env`, configure somente as chaves necessárias e execute:

`npm install`

`npm start`

Nunca publique o arquivo `.env`.

## Globo detalhado no Neural Ring (v4.45)

O J.A.R.V.I.S. mantém uma única visualização central. A esfera Globe.gl/WebGL mostra a Terra no zoom global; ao aproximar e com um token Mapbox público configurado, ela passa a mostrar os tiles oficiais **Mapbox `satellite-streets-v12`** no mesmo elemento do Neural Ring. O mapa detalhado permite aproximar países, estados, cidades, avenidas e ruas (conforme disponibilidade de imagens e dados da região). Ao afastar o zoom novamente, retorna ao globo 3D, sem popup, campo de pesquisa adicional ou página separada.

**Controles do mouse:** passar o cursor sobre o globo não gira nem desloca a Terra. Para girar a esfera, é necessário **clicar com o botão esquerdo, segurar e arrastar**. Ao soltar, a rotação manual cessa. A roda do mouse aproxima/afasta. No modo Mapbox, clicar e arrastar move o mapa, e a roda aproxima até o nível de rua. Os comandos nativos do Jarvis também funcionam, por exemplo: `Jarvis, no globo ache a China`, `Jarvis localize Recife no globo`.

**Token Mapbox sem nova interface:** o token público `pk.` previamente informado não pode ser incluído no GitHub porque o secret scanning bloqueia sua publicação. Em cada navegador, é possível instalá-lo uma vez abrindo `https://equipezero-web.github.io/Ultron_AI/#mapbox_pk=SEU_TOKEN_PUBLICO`. O código salva o token no `localStorage` (`jarvis_mapbox_pk_v1`) e remove o fragmento da barra de endereços imediatamente; o token permanece no navegador. Sem token, o globo 3D continua funcional, mas não pode entregar ruas com os tiles Mapbox. Recomenda-se restringir o token às URLs do site em Mapbox e acompanhar as cotas e os custos.

Apenas um botão **×** para desfazer a seleção de um local aparece após clicar no planeta ou no mapa. No modo Mapbox são mantidos o logotipo e os créditos exigidos pelo fornecedor, sem botões adicionais. Há testes de integração e de navegador para zoom, mouse pressionado, troca de renderizador e volta ao Neural Ring.
