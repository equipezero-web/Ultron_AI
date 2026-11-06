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

## Neural Command Center integrado (v4.46)

A região central do J.A.R.V.I.S. é dedicada exclusivamente à visualização **Neural Ring 3D e Globo 3D/Mapbox**, com troca no mesmo espaço e sem popup. O anel usa geometria toroidal tridimensional desenhada por WebGL real (quatro malhas com profundidade), suspende o render quando o globo está ativo e é restaurado ao sair do globo.

O terminal de respostas/comandos fica lado a lado com quatro módulos operacionais **Optical Sensor, AI Gateway, Computador ↔ Celular e Infra**, reaproveitando os elementos originais com IDs, estados e ações reais, sem duplicar nem simular conexões. A câmera via celular usa a prévia dentro do módulo e não abre mais a janela de câmera quando acionada pelos comandos e botões principais. Respostas de status, agenda, dispositivos e arquivos aparecem somente no terminal existente, sem gerar seções adicionais. A interface é responsiva e, em celulares, organiza o terminal e os módulos abaixo da área 3D sem encobrir o globo.

Os testes verificam WebGL do anel, ativação/retorno ao globo, renderização dos quatro módulos, modo integrado da câmera e largura de tela desktop/mobile. Caso WebGL não esteja disponível, o sistema indica o erro no terminal e apresenta um anel de contingência, sem alegar renderização 3D.

## v4.47 — Globo em camada Mapbox e Neural Ring 3D manipulável

O seletor do Globo agora abre **uma camada de visualização sobre a área central do Neural Command**, sem navegar para outra página. A camada segue a referência HTML enviada pelo operador: mapa Mapbox em projeção `globe`, estilo `satellite-streets-v12`, neblina espacial/iluminação solar, painel informativo no alto à esquerda, painel de coordenadas deslizante à direita somente após clicar numa localização e botão para minimizar/resetar a visão completa. Dois pequenos seletores embaixo permitem voltar ao Neural Ring e reabrir o Globo sem perder os módulos do terminal. A busca geográfica feita por texto/voz do Jarvis continua controlando a câmera do mapa.

O token público Mapbox deve estar previamente gravado neste navegador na chave `jarvis_mapbox_pk_v1` (ou ativado pelo link que acrescenta `#mapbox_pk=...` ao URL). Nunca é colocado no GitHub. Se não houver token ou o Mapbox estiver indisponível, a mesma camada apresenta o globo Globe.gl alternativo e indica a falta de configuração, mantendo os controles de rotação e zoom.

O **Neural Ring original** preserva a paleta holográfica rosa-avermelhada, azul, branco e roxo, mas suas quatro malhas 3D WebGL agora respondem diretamente ao mouse ou toque: **clique/segure e arraste para inclinar e girar**, soltando para encerrar o gesto, com zoom pela roda do mouse. Os anéis internos continuam com suas animações independentes, sem girar sozinhos ao apenas aproximar o cursor. O botão de centralizar restaura ângulos e zoom. É o mesmo Command Center, sem nova aba, com módulos de apoio e terminal existentes abaixo.

## v4.48 — Correções mobile (360–430 px)

Na interface de celular, o **globo Mapbox** suporta pinça de dois dedos para aproximar e afastar (com rotação acidental desabilitada), arraste com um dedo, toque duplo e dois pequenos controles **+ / −** sobre a própria visualização. Esses botões também funcionam no globo Globe.gl alternativo quando não há token Mapbox. No globo alternativo foi implementado rastreamento de dois toques por `pointerId`, calculando o zoom pela distância entre os dedos. O gesto só é capturado sobre o globo, permitindo rolar o restante da página normalmente.

O **painel de digitação** recebe um campo de texto mais baixo com fonte 16px, botão Executar ao lado e atalhos compactos. O terminal de respostas mantém rolagem interna, e os módulos Optical Sensor, AI Gateway, Computador/Celular e Infra passam a formar quatro cartões menores em **duas colunas** inclusive nos celulares estreitos. O Neural Ring 3D mantém seu tamanho e suas animações originais; a reorganização aplica-se ao terminal e aos módulos abaixo dele. Os controles permanecem acessíveis com áreas de toque adequadas.

Testes específicos de navegador móvel verificam zoom com dois dedos, botões de zoom no Globe.gl e no Mapbox, handlers de toque, tipografia do editor, alinhamento em 360px, 390px e 430px e ausência de rolagem horizontal.

## Mobile completo v4.49 — telas estreitas, toque, bateria e teclado

O Neural Ring continua em 3D real e agora responde a pinça de dois dedos (zoom), além de arraste individual. Em celulares, WebGL limita a densidade de pixels do canvas e a taxa de quadros (aproximadamente 30 FPS; 20 FPS em dispositivos de pouca memória), sem recalcular o tamanho do canvas a cada desenho. O Globo.gl também limita a resolução 3D no celular; o Mapbox reduz antialias e elimina fades de tiles em hardware móvel para evitar trabalho gráfico desnecessário. As animações em background são suspensas.

O layout mobile adota as áreas seguras de tela (bordas e recortes), status legível, campo de texto com teclado mostrando **Enviar**, proteção contra envios acidentais durante composição IME, e atalhos em uma faixa horizontal rolável com áreas de toque adequadas. Os painéis Optical Sensor, AI Gateway, computador/celular e Infra preservam status e botões, mas têm textos que quebram naturalmente em cartões compactos. Os controles de zoom do Mapbox permanecem acessíveis. As informações do topo do mapa não interceptam a pinça nem o arraste; a rolagem geral do site permanece habilitada fora do globo. Reduzimos o desfoque pesado em overlays mobile e respeitamos a preferência de movimento reduzido.

A bateria e os tamanhos de buffer variam por dispositivo; os testes usam navegadores simulando celular para verificar pinça no Neural Ring e globo, orientação retrato/paisagem, larguras de 320 a 430 px, teclado, atalhos e limite da densidade de buffer da GPU. Nenhuma chave Mapbox privada ou pública foi adicionada ao código-fonte.
