# Remote Camera v4.23.2

Fluxo principal: câmera do celular -> Ultron Bridge -> WebRTC -> Optical Sensor no computador.

A webcam local do Windows não é usada automaticamente neste modo.

## Regras
- `CÂMERA` e `MOSTRAR TELA` ativam o Ultron Bridge.
- O stream remoto é anexado diretamente ao vídeo do Optical Sensor.
- Perguntas sobre a câmera deixam de abrir a webcam local por engano.
- Visão computacional tenta o stream remoto primeiro e não cai automaticamente na VGA do notebook.
- A v4.23.1 de recuperação ICE continua ativa.
