# Correção da rolagem do J.A.R.V.I.S. — celulares e desktop

A interface tinha várias causas técnicas de rolagem irregular:
- Body e HTML usavam overflow-y:auto simultaneamente, permitindo contextos de rolagem sobrepostos em alguns navegadores.
- O WebGL do Neural Jarvis declarava touch-action:none, capturava toque e chamava window.scrollBy sem a inércia nativa quando detectava gesto vertical.
- O globo 3D também convertia o movimento do dedo em scrollBy, e a área 2D interceptava touchmove com preventDefault e stopImmediatePropagation.
- O centro inteiro capturava eventos de roda, até mesmo fora da visualização, impedindo scroll por mouse ou trackpad.
- Alguns painéis informacionais tinham overscroll-behavior:contain que podia prender a rolagem quando o conteúdo terminava.

A correção mantém um único scroller principal (documentElement), deixa o
body em fluxo normal, habilita touch-action:pan-y nas superfícies do
Neural Jarvis e globo/Mapbox em aparelhos touch e remove as conversões
manuais de um dedo em scroll. Os gestos de rotação horizontais, zoom de
dois dedos (controles existentes) e zoom com roda sobre a visualização
permanecem suportados. Fora da visualização, roda e trackpad descem a página.

O rail de rolagem no canto direito continua no desktop e é ocultado
no celular. O tema dourado metálico, botões e menus continuam iguais.
Painéis de resultado com rolagem própria deixam a rolagem continuar na
página quando chegam ao fim. A câmera modal mantém seu scroller interno.

## Validação
O teste tests/jarvis-mobile-native-scroll-browser.mjs usa gestos reais
de um dedo via Chrome DevTools Protocol sobre o canvas 3D e sobre área
comum da página em 320, 360, 390, 430, 540, 699 e 844×390 px, além
do mouse/trackpad no notebook. Verifica movimento do documentElement e
zoom real somente sobre o canvas. Testes antigos de 320px–TV4K, globo,
mapa e comandos também rodam na CI.

Isso é uma correção de comportamento do navegador, não certificação de
todos os telefones físicos. O teste deve ser complementado em Android
Chrome e iOS Safari reais; serviços externos permanecem dependentes da
rede e das permissões.
