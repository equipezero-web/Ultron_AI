# J.A.R.V.I.S. — Fase XI: Experiência Imersiva e Inteligência Visual

## Implementação
- **EXPLORAR VISUAL** inicia um roteiro **manual** dos eventos com geolocalização publicada por USGS, NASA EONET ou GDACS, já validados nas Fases IX/X.
- **Neural Ring existente:** HUD compacta com categoria do evento, título, fonte oficial, data de publicação, coordenada, contexto explicativo e indicação de ponto representativo.
- **Navegação:** anterior/próximo, alternância 2D/3D, setas esquerda/direita com o foco no painel, gesto horizontal deliberado no celular. Escape ou X fecham a exploração.
- **Sem reabrir o mapa a cada evento:** quando o cenário permanece atual, o JARVIS usa a operação de foco do módulo geoespacial para navegar. Se a coleta mudar, revalida todos os pontos e reconstrói apenas o cenário correspondente.
- **Fallback seguro:** quando o globo não consegue iniciar, tenta o mapa 2D e informa o modo efetivamente confirmado.
- **Movimento de câmera somente sob comando:** ativar o JARVIS ou receber uma notícia não move automaticamente o globo.
- Botão **EXPLORAR** junto dos acontecimentos georreferenciados na lista de prioridades, botão rápido **EXPLORAR VISUAL** e comandos de voz/texto:
  - "Jarvis, explorar eventos" / "Jarvis, iniciar exploração visual"
  - "Jarvis, próximo evento" / "Jarvis, evento anterior"
  - "Jarvis, mudar exploração para 3D" / "Jarvis, mudar exploração para 2D"
  - "Jarvis, fechar exploração visual"
- **P0 STOP** encerra a exploração visual pendente, além das missões já protegidas.

## Evidência, limites e segurança
- Notícias genéricas, manchetes e avisos estaduais sem coordenadas continuam **sem pinos fictícios**.
- A explicação é um texto editorial estático por categoria que delimita o significado do registro. **Não** estima magnitude, vítimas, trajetórias, extensão afetada, probabilidade ou previsão de perigos futuros.
- Fonte HTTPS oficial e horário de publicação são preservados; o movimento da câmera é apenas navegação visual e não representa a evolução real dos acontecimentos.
- Os dados são revalidados em cada seleção; quando a origem não estiver atual, o foco não é confirmado.
- Não executa comandos de TV, PC, celular, câmera, pagamentos ou arquivos.

## Testes
- node tests/jarvis-phase11-immersive.mjs
- node tests/jarvis-phase10-contextual-map.mjs
- node tests/jarvis-phase9-priorities.mjs
- node tests/jarvis-phase8-continuity.mjs

## Limitações
- A experiência mostra somente os eventos georreferenciados presentes no resumo contextual (até seis), não uma varredura de todos os eventos do planeta.
- A aprovação do CI não substitui homologação de WebGL/Mapbox no telefone real, nem comprova deploy em produção. A disponibilidade dos dados depende das fontes públicas e da infraestrutura já configurada.
