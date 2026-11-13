# Neural Jarvis: layout responsivo dourado (mobile, notebook, TV)

Ajuste aplicado ao mesmo sistema WebGL Neural Jarvis já publicado, sem inserir outra tela, novo motor externo nem duplicar controles.

## Identidade visual
- Dourado metalizado, núcleo em ouro quente, anéis em âmbar, partículas dourado claro.
- HUD, telemetria, arquivos e botões de Neural Jarvis dourados sobre fundo escuro.
- Não altera as legendas de cores meteorológicas ou os dados dos mapas (são científicos).
- Texto dourado não é um indicador de sensores conectados.

## Breakpoints efetivos
- **320–359 px**: telefones pequenos, controle por toque e layout de dois botões por linha, 44 px de alvo mínimo.
- **360–699 px**: celulares de vários tamanhos, área 3D ajustada à largura e à altura do viewport, arquivos dentro do centro e câmera local fora do centro do holograma.
- **700–1099 px**: tablets, formatos intermediários, barras de instrumentos compactas e controles em linhas ajustáveis.
- **1100–1919 px**: notebooks e monitores desktop; holograma ajustado à altura, preservando terminal e módulos.
- **1920+ px**: TVs e painéis Full HD/4K; tipografia, controles, holograma e arquivo ampliados de forma proporcional.
- **Landscape abaixo de 490 px de altura**: especialização para celular girado.

A barra inferior da central, anteriormente suprimida por CSS legado, volta a exibir os comandos reais, inclusive FALAR, ÁUDIO VISUAL, SOBRECARGA TÁTICA e REDOMA & ARQUIVOS. Os botões mantêm os eventos JS originais e as funções do globo/arquivos/dispositivos.

## Responsividade do motor
- ResizeObserver do canvas continua definindo resolução real do WebGL quando o dispositivo muda de tamanho.
- Pixel ratio mobile limitado a 1.25 (ou 1 para memória baixa), notebook até 1.5, tela >=1920px até 1.15.
- Renderização adaptada: aproximadamente 26 FPS em celular comum, 16 FPS se pouca memória, 35 FPS em notebook e 30 FPS em TV. São limites planejados; FPS real depende do dispositivo.
- Controles por arrastar/segurar e gesto de pinça preservados.
- Os módulos de mapas, câmeras públicas, notícias e meteorologia mantêm suas interfaces/cores e permissões. O núcleo do Neural Jarvis não aciona câmera ou microfone sem autorização.

## Validação
Execute:
- node tests/jarvis-neural-responsive-gold-browser.mjs (servidor HTTP localhost:8770 e Chrome instalado)
- node tests/jarvis-neural-jarvis-browser.mjs

O CI verifica viewport 320x568, 390x844, 844x390, 768x1024, 1366x768, 1920x1080 e 3840x2160, incluindo presença do núcleo WebGL, barra de comandos visível, controles tocáveis, ausência de scroll horizontal, arquivos no painel, alternância do globo e P0.

A verificação física em aparelhos reais deve complementar os testes do navegador, especialmente GPUs e controles remotos de TVs; Smart TV só terá interação por controle remoto se o navegador da TV implementar corretamente a navegação de foco e os eventos da página.
