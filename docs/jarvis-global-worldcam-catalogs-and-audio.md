# J.A.R.V.I.S. · Catálogos mundiais de webcams e áudio opcional

## Integrações

- **SkylineWebcams** — todos os países e categorias são acessíveis pelo diretório público https://www.skylinewebcams.com/en/webcam.html e https://www.skylinewebcams.com/en/categories.html.
- **Webcamera24** — todas as câmeras catalogadas pelo provedor, navegação por países e categorias via https://webcamera24.com/pt/all-webcams/, https://webcamera24.com/pt/countries/ e https://webcamera24.com/pt/categories/.

No Neural Jarvis > CÂMERAS MUNDIAIS há a seção recolhível **EXPLORAR TODOS OS CATÁLOGOS**. Os links permitem acesso à listagem completa e às páginas individuais dos próprios provedores. A busca local e o filtro por provedor funcionam sobre as **entradas curadas e verificadas** no índice J.A.R.V.I.S.; **não alegam incluir todas as milhares de transmissões dos provedores em um banco próprio**. Não há raspagem não autorizada, retransmissão de vídeos ou varredura de câmeras IP.

O índice inclui amostras públicas da Webcamera24 nos Estados Unidos, Japão, Tailândia, Quênia, Ucrânia e Noruega, além de fontes adicionais da SkylineWebcams em China, EUA e Jerusalém. Uma página publicada é apenas evidência de catalogação — não prova que a transmissão esteja disponível neste momento.

## Controle de áudio da Webcamera24

Algumas páginas da Webcamera24 divulgam um **player YouTube** legítimo e incorporável. Quando uma dessas câmeras é selecionada e o usuário clica em **REPRODUZIR**, o J.A.R.V.I.S.:

1. Abre **somente** o player YouTube divulgado pela página de origem com `mute=1`, `autoplay=1`, `playsinline=1`, `enablejsapi=1`; por padrão o vídeo fica sem áudio;
2. Mostra o botão **ATIVAR ÁUDIO**, que no clique do usuário envia `unMute` pelo protocolo do YouTube IFrame API;
3. Troca o rótulo para **DESATIVAR ÁUDIO** e envia `mute` se o usuário clicar novamente;
4. Quando a câmera é trocada, o painel é fechado ou a parada de emergência é acionada, envia `mute`, remove o iframe e **reinicia o estado sem áudio**;
5. Não afirma que o áudio efetivamente foi ativado: o comando pode ser rejeitado se o player estiver bloqueado, não carregar ou não oferecer trilha sonora.

Para páginas Webcamera24 **sem player autorizado e controlável**, somente o link da fonte é oferecido; o J.A.R.V.I.S. não tem permissão técnica para silenciar outras abas ou controlar o áudio do site externo. O usuário ativa o som no próprio site, caso exista. O botão de áudio pertence só ao player incorporado e não representa controle do site de terceiros.

Para a **SkylineWebcams**, o vídeo ao vivo não pode ser incorporado por não proprietários da câmera (FAQ do provedor). São fornecidos links para as páginas originais, nunca acesso não autorizado, reconstrução de stream ou falso botão de player.

## Privacidade e segurança

- Nunca abre webcam do dispositivo, não grava imagens/áudio, não exige login e não realiza varredura de câmeras privadas.
- Som do player Webcamera24 desligado inicialmente, em todos os dispositivos e a cada nova câmera.
- Não carrega iframes antes de uma ação explícita do usuário.
- Status externo sempre **não confirmado**; botão de falha indica **relato do usuário**, não diagnóstico de disponibilidade.
- Controles de volume e catálogo acessíveis em celular/notebook/TV; a central continua no Neural Ring.

Fontes oficiais consultadas:
- https://www.skylinewebcams.com/en/support/faq.html
- https://webcamera24.com/pt/terms/
- https://webcamera24.com/pt/all-webcams/

## Testes

`tests/jarvis-public-world-cameras-model.mjs`: valida URLs reais, origens, limite de incorporação, diretórios e `mute=1`/IFrame API.

`tests/jarvis-public-world-cameras-browser.mjs`: reprodução opt-in, áudio inicialmente mudo e acionado manualmente, reinicialização ao trocar câmeras, não incorporação Skyline, parada de emergência e layout mobile.

A disponibilidade de vídeo e som em provedores externos requer verificação prática do provedor e do dispositivo; testes automatizados verificam integração e lógica, não o funcionamento real da transmissão em cada webcam.
