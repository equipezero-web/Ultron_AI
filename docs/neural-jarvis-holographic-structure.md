# Neural Jarvis — Matriz holográfica 3D (estrutura oficial)

## Origem do projeto
Esta matriz substitui a forma visual do antigo **Neural Ring** com base no HTML de referência enviado pelo operador em 13/11/2026. A identidade pública atual é **Neural Jarvis**. IDs e APIs legadas com "ring" foram preservados apenas como aliases técnicos para não quebrar outros módulos.

A referência é uma aplicação Three.js com núcleo orgânico GLSL, três camadas segmentadas, cinco giroscópios, rede sináptica, partículas, telemetria, arquivos e interação audiovisual. A integração transpõe sua estrutura visual para **WebGL nativo**, aproveitando o canvas já usado pelo Command Center e sem duplicar a interface nem importar Tailwind, GSAP, Tone.js ou outra instância WebGL.

## Geometria reproduzida
- Núcleo reativo: esfera GLSL deformável por graves/médios.
- Redoma protetora: 18 + 22 + 24 placas = 64 setores em três camadas.
- Cinco arcos giroscópicos orientados em eixos diferentes.
- Rede de 180 nós e ligações geométricas de proximidade.
- 1.400 partículas luminosas no espaço do centro neural.
- Arrastar com botão pressionado para rotacionar; roda para zoom; pinça para zoom no celular; movimento reduzido respeitado.
- Expansão visual de placas e arcos via "REDOMA & ARQUIVOS". Controles e arquivos ficam no Command Center existente, nunca em outra página.
- FALAR usa a síntese realmente suportada pelo navegador.
- ÁUDIO VISUAL solicita permissão de microfone **somente após clique**; analisa FFT 256, separa graves/médios/agudos sem gravar ou transmitir áudio, para ao fechar ou P0. O Voice Match original segue independente.
- SOBRECARGA TÁTICA acelera animação do visualizador somente; não altera CPU/GPU do usuário.

## Interfaces e compatibilidade
- A interface principal mantém os modos "ring" e "globe" como chaves internas, mas a denominação pública passa a Neural Jarvis.
- Novo motor: modules/jarvis-neural-jarvis-3d.js; modelo: modules/jarvis-neural-jarvis-model.js; controles: modules/jarvis-neural-jarvis-hud.js.
- Janela.ULTRON_NEURAL_JARVIS é API nova. Janela.ULTRON_NEURAL_RING_3D continua como alias para módulos existentes, sem duplicar GPU.
- Globo, mapas, meteorologia, notícias, diretores visuais e webcams mundiais preservam suas próprias camadas no mesmo stage.
- Fallback: caso novo renderizador não inicie, tenta engine WebGL anterior e informa no terminal. Recursos próprios da matriz ficam indisponíveis no fallback.

## Dados reais e limites
Os números 64, 5, 180 e 1.400 são **quantidades gráficas do código**, não sensores externos. Não se apresenta "84.6 TFLOPS", "100% conectado" ou outros marcadores artificiais da referência HTML como telemetria real. Áudio é fonte local de entrada autorizada; a estrutura não representa conexão cerebral nem consciência real. Se o motor falhar, a interface deve sinalizar indisponibilidade.

## Testes
node tests/jarvis-neural-jarvis-model.mjs
node tests/jarvis-neural-jarvis-browser.mjs

A CI valida sintaxe, contagens da referência, navegador mobile, interação, troca para globo, permissões de áudio e P0. Publicação em GitHub Pages e teste em aparelhos físicos devem ser observados após merge.
