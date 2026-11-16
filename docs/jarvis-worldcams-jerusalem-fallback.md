# J.A.R.V.I.S. — câmera pública alternativa de Jerusalém

Fonte adicionada ao catálogo **CÂMERAS MUNDIAIS**:
- Local: Jerusalém, Israel — Muro Ocidental (Western Wall / Kotel)
- Publicador: SkylineWebcams
- Página pública: https://www.skylinewebcams.com/en/webcam/israel/jerusalem-district/jerusalem/western-wall.html
- Categoria: Cidades · região: Ásia
- Status do sinal: **não verificado automaticamente**.

## Quando outra câmera falhar
Ao selecionar uma câmera do catálogo, o painel do Neural Jarvis mantém um link
**ALTERNATIVA · JERUSALÉM / MURO OCIDENTAL**. Esse link aponta para uma
**localidade diferente**; nunca substituímos silenciosamente um lugar por outro.

Para players YouTube já catalogados, o usuário também encontra o controle
**VÍDEO FALHOU / INDISPONÍVEL**. Clicar encerra o iframe e registra o aviso
de falha como relato do **usuário**, sem afirmar que um provedor foi detectado
offline ou que a câmera alternativa está online.

Jerusalém aparece nos filtros por cidade e país e pode ser encontrada por
comando, por exemplo: "Jarvis, mostre a câmera de Jerusalém".

## Política de incorporação
As perguntas frequentes da SkylineWebcams informam que apenas o proprietário/
hospedador da câmera pode incorporar seu **vídeo ao vivo** em sites externos.
É permitido compartilhar o link da câmera. A página oferece opções próprias
de compartilhamento e de incorporação de imagem estática atualizada, sujeitas
às condições do provedor.

Portanto, no J.A.R.V.I.S. esta câmera foi incluída **somente como link para a
página original**. Não copiamos streams, não contornamos proteção CORS/iframe,
não presumimos uma URL de YouTube e não tentamos abrir o vídeo ao vivo no iframe.

O acesso ao link e a disponibilidade real dependem do provedor e da conexão.
Não existe detecção contínua de status, nem monitoramento de câmeras privadas.

## Verificações
- tests/jarvis-public-world-cameras-model.mjs:
  catálogo, whitelist HTTPS exata do link Skyline, comando natural,
  não incorporação, proteção contra URLs arbitrárias.
- tests/jarvis-public-world-cameras-browser.mjs:
  smartphone, player opt-in, indicação manual de falha, acesso à fonte
  original/alternativa, escolha de Jerusalém e parada de emergência.

Fontes públicas de política e página:
https://www.skylinewebcams.com/en/support/faq.html
https://www.skylinewebcams.com/en/webcam/israel/jerusalem-district/jerusalem/western-wall.html
