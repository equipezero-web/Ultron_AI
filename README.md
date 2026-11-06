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

## Globo terrestre dentro do Neural Ring (v4.44)

O J.A.R.V.I.S. utiliza uma única visualização central no Command Center. O globo terrestre 3D real (Globe.gl/WebGL) **substitui a esfera neural no mesmo lugar**, sem abrir uma página, popup, painel lateral, pesquisa própria, controles de rotação, redoma, fundo espacial ou campos de token. A biblioteca só é carregada quando o globo é solicitado.

O globo é acionado pelos comandos nativos de texto ou voz do Jarvis, como **“Jarvis, no globo ache a China”**, **“Jarvis encontre Recife no globo”** e **“Jarvis mostre o globo”**, ou pelos botões existentes de alternância Anel/Globo. O sistema gira a esfera em direção às coordenadas encontradas, aproxima suavemente e interrompe a rotação quando a localidade fica no centro. **“Jarvis volte ao neural ring”** devolve a esfera original.

Um comando de zoom mais profundo expande a própria visualização central, podendo ocupar a área do Command Center sem mudar de página. Ao afastar novamente, retorna ao espaço original. Arrastar e usar a roda do mouse sobre a esfera continuam habilitados. Apenas clicar em um ponto terrestre ativa um marcador e um pequeno **×** que serve exclusivamente para desmarcá-lo; não abre fichas, fotos ou detalhes fora da esfera.

A textura terrestre básica vem do exemplo público de Three Globe. A busca geográfica consulta as coordenadas pré-configuradas de localidades frequentes, pode usar o token público Mapbox salvo anteriormente em `localStorage` (chave `jarvis_mapbox_pk_v1`) e usa OpenStreetMap Nominatim como alternativa. **O token não é gravado no GitHub** porque sua proteção contra segredos bloqueou esse conteúdo. A imagem do globo é uma textura global e não equivale a imagens de ruas em alta resolução; o token Mapbox ajuda a localizar localidades, mas não converte a textura em um mapa de ruas. Para obter autorização geográfica, mantenha o domínio público autorizado no Mapbox e observe as cotas.

O módulo possui testes DOM e de navegador headless específicos para botão Anel/Globo, pesquisa por comando, centralização da China, zoom expandido e botão × após seleção.
