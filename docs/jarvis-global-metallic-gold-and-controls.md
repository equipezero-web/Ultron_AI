# J.A.R.V.I.S. — Sistema inteiro dourado metálico e integridade dos botões

## Aparência
Camada de tema carregada ao final das folhas de estilo: modules/jarvis-global-metallic-gold.css. Aplica acabamento metálico dourado com reflexos quentes, bevels escuros, vidro preto fumê e halos discretos ao Command Center, entradas, console, painéis de dispositivos, câmera, telemetria, avisos, mensagens, opções, janelas de arquivos, painéis do globo, câmeras mundiais e ferramentas meteorológicas.

Inclui celular (320px+), tablet, notebook/PC e TV Full HD/4K. Controles continuam navegáveis por teclado/controle remoto com foco dourado visível e área de toque confortável. Reduz efeitos quando o navegador declara preferência por movimento reduzido.

Cores instrumentais e semânticas NÃO são recoloridas: mapas Mapbox e satélite, radar observado, intensidade de chuvas, escalas científicas, feeds de câmera e estados de erro/sucesso preservam interpretação original.

## Funcionalidade e confiabilidade
- Botões de terminal, status, agenda local, arquivos, dispositivos, câmera e globo usam as ações reais existentes. Nenhum clique gera status de serviço online fictício.
- Ações do globo e da câmera apresentam erros no terminal se os provedores não respondem. O comando centralizar informa falha se o motor não estiver acessível.
- Audio visual, síntese de voz e renderização tática informam indisponibilidade quando não houver recurso suportado, em vez de ignorar o clique.
- O botão Status distingue interface ativa, backend verificado, imagem óptica realmente visível e motor WebGL. "NAVEGADOR ONLINE" significa conectividade do navegador, não confirmação de backend.
- Teste de voz nunca diz que câmera ou backend estão operacionais sem verificação.
- INFRA inicia em "VERIFICANDO" e só exibe "ONLINE" após resposta bem-sucedida do endpoint de health. Memory local verifica de fato escrita/leitura.
- Controles que dependem de microfone, câmera, Ultron Bridge, gateway, internet, dispositivo LG ou permissões exigem origem real. Testes utilizam mocks apenas para verificar fluxos de erro e interfaces, não representam disponibilidade real.

## Testes automatizados
- tests/jarvis-global-gold-controls-browser.mjs: Chrome com dimensões telefone, notebook e 4K TV. Verifica design metálico nos principais componentes e clique real nos sete controles do Command Center, incluindo feedback de falha da câmera, Arquivos, Dispositivos, Agenda, Globo, Painel Mundial, P0, Sobrecarrega e Arquivos Neurais.
- tests/jarvis-neural-responsive-gold-browser.mjs: 320x568 até 3840x2160, testa WebGL/estágios/toque/TV e comportamento legado.
- testes de estrutura, dados com fontes oficiais e segurança P0.

## Limitações
O código não pode afirmar sucesso de recursos externos sem que esses serviços estejam conectados e concedam permissão. Browser UI test não substitui verificação física do controle remoto de uma Smart TV nem prova que câmeras internacionais estão ao vivo. Se o teste real detecta falhas, o painel exibe orientação, não dados sintéticos.
