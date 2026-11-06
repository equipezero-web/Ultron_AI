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

## Explorador geográfico Mapbox (v4.40)

A aba de globo do J.A.R.V.I.S abre um explorador em tela cheia baseado no exemplo Mapbox fornecido pelo operador: projeção de globo, estilo `satellite-streets-v12`, relevo raster-DEM, busca de localidades, marcadores, clique para coordenadas e retorno suave à visão global.

A escolha de uma localização abre um **painel lateral** com fotos próximas obtidas dinamicamente da Wikimedia Commons, quando existem imagens georreferenciadas na região. Cada fotografia aponta para a página da fonte com autoria e licença. Imagens são independentes do satélite; podem não estar disponíveis para todos os locais.

**Ativação do Mapbox:** abra o globo, clique no campo **Ativar mapa por satélite** e cole seu token **público** (`pk.`). Ele é guardado apenas no `localStorage` do navegador em `jarvis_mapbox_pk_v1`. Para trocá-lo, clique em **⚙ Token** dentro do explorador. O GitHub bloqueou a inclusão do token fornecido no código do repositório; por isso, não o grave diretamente em arquivos versionados. Recomenda-se restringir esse token a `https://equipezero-web.github.io` no painel Mapbox e verificar suas cotas e custos de uso.

A biblioteca Mapbox GL JS é carregada sob demanda. Requer conexão com a Internet e suporte WebGL. O botão **✕ Sair** retorna ao painel do J.A.R.V.I.S; **◎ Global** e **Minimizar** recuam a câmera para o globo, mantendo a exploração aberta. O comportamento do mouse/rolagem no painel principal permanece separado do mapa.

