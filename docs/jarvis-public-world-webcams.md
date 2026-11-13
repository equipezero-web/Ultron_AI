# J.A.R.V.I.S. — Câmeras Públicas Mundiais

## Objetivo e fonte
Módulo de webcams públicas de pontos turísticos, aeroportos, praias, estradas, portos e natureza, integrado à área original do Neural Ring, sem criar páginas internas extras.

As referências são https://camerasdomundo.com/ (agregador de transmissões de terceiros) e https://africam.com/ (transmissões públicas próprias de fauna africana). Não copiar ou retransmitir streams diretamente, não descobrir webcams por IP, não tentar acessar CCTV restrito, não ativar câmeras do usuário/dispositivos.

## Implementação
- Índice inicial curado de 14 câmeras divulgadas publicamente por fontes reais em 11 países, 6 regiões continentais; ampliar apenas quando URLs e permissões puderem ser confirmadas.
- Cada entrada inclui página de origem, localização por cidade/país, categoria, atribuição do canal e, quando o agregador publicou um embed, identificador do player do YouTube.
- Vídeo só é carregado depois de uma ação explícita do usuário e via youtube-nocookie.com/embed. Não usa RTSP, proxies de streaming nem conteúdo que exija acesso privado.
- Player abre somente dentro do Neural Ring e é removido ao fechar, trocar câmera ou disparar P0 STOP.
- Quando não houver um player incorporável identificado, permite apenas abrir a página original; não inventa vídeo nem tenta embeber a página contra X-Frame-Options.
- Pesquisa por lugar, cidade, país e tipo; filtro por países/regiões/categorias; otimizado para desktop e mobile.
- Permite abrir o catálogo externo completo para localidades ainda não indexadas. Isso não equivale a incorporar todas as câmeras do site.

## Comandos
- "Jarvis, câmeras do mundo" ou "Jarvis, monitoramento visual mundial"
- "Jarvis, mostre a câmera de Recife"
- "Jarvis, buscar webcams em Tóquio"
- "Jarvis, status das câmeras mundiais"
- "Jarvis, fechar câmeras mundiais"

## Definições de estado
- Câmera catalogada: sua página de origem foi identificada.
- Player divulgado: o provedor apresentou um iframe incorporável em sua página; o usuário ainda precisa clicar para reproduzir.
- Reprodução solicitada: o J.A.R.V.I.S. carregou o iframe depois do clique, sujeito às políticas e disponibilidade do serviço externo.
- Sinal ao vivo confirmado: ainda não implementado. Não exibir badges ONLINE/LIVE próprios sem telemetria autorizada do provedor. Vídeo gravado ou falha não podem ser descritos como feed em tempo real.

## Limitações
- É um diretório inicial, não uma cópia das 600+ câmeras anunciadas pelo agregador. Ampliar catálogo exigirá dados autorizados, API ou indexação verificável de fontes publicadas.
- Algumas transmissões podem estar encerradas, bloqueadas por país, com erro 153 do YouTube, ou indisponíveis em iframe.
- Não há análise contínua de todos os vídeos, detecção de pessoas, gravação, vigilância de endereço privado ou percepção global automática. O navegador não monitora quando a aba está fechada.
- Nenhum marcador 3D é criado se a localização precisa da lente não estiver publicada por uma fonte. Cidade textual não é coordenada exata.
- O P0 impede novas solicitações e retira o player do DOM; não altera a câmera do provedor.

## Validação
node tests/jarvis-public-world-cameras-model.mjs
node tests/jarvis-public-world-cameras-browser.mjs

O CI verifica syntax check, parse de comandos, fontes e política de estado, layout mobile, seletor de vídeos e parada P0. Testes automatizados não comprovam que cada stream do provedor esteja ao vivo. Conferir manualmente antes de publicar.
