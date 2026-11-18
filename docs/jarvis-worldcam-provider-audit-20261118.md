# J.A.R.V.I.S. — Auditoria de cobertura das câmeras mundiais (18/11/2026)

## Definições que NÃO devem ser confundidas

- **Anunciadas pelo provedor:** total próprio publicado pelo site, sem verificação independente de transmissão ativa.
- **Cadastradas/indexadas:** páginas individuais com identificação e URL oficial, disponíveis na lista dentro do Neural Ring.
- **Player divulgado:** URL de vídeo YouTube embutível segundo o link publicado pela fonte; não significa sinal ao vivo verificado.
- **Fonte externa:** página sem player externo aprovado/verificado. É listada, mas o J.A.R.V.I.S. não rehosteia nem finge transmitir o vídeo.

## Contagem do catálogo depois da expansão

| Métrica | Antes | Depois |
|---|---:|---:|
| Câmeras individuais catalogadas | 25 | **48** |
| Entradas com link de player YouTube (inicialmente mudo) | 15 | **29** |
| Entradas cadastradas somente como fonte (sem player aprovado) | 10 | **19** |
| Catálogos oficiais externos acessíveis | 4 | **6** |
| Feeds com sinal ao vivo confirmado automaticamente | 0 | **0** |

## Cobertura por provedor solicitado

| Provedor | Número do próprio site | Cadastradas após este PR | Com player divulgado | Catalogadas, sem vídeo incorporado | Não cadastradas | Motivo |
|---|---|---:|---:|---:|---|---|
| **Câmeras do Mundo** | **Mais de 600**; limite inferior conservador **601** | **29** (13 anteriores + 16 novas) | **23** | **6** | **Pelo menos 572** (601 - 29) | Volume acima da seleção individual verificada, canais que não publicam player externo aprovado, riscos de duplicação e de fontes removidas |
| **Janelas TV** | **7 listadas na página principal**; total completo do site não confirmado | **7** | **0** | **7** | **0 dentre as 7 identificadas**, total adicional desconhecido | Player proprietário com vídeo H.265 e recursos VR; nenhuma autorização ou URL oficial de incorporação por terceiros foi confirmada |
| **Tabi.cam** | **61 países no índice**, sem total exato publicado de webcams | **0 câmeras; diretório oficial adicionado** | **0** | **0** | **Desconhecido** | Seus Termos (§1 e §7) proíbem redistribuição não autorizada e uso de crawlers/scrapers; importação em massa não autorizada |
| **Outros provedores existentes** (Africam, SkylineWebcams, Webcamera24 e EarthCam) | Não auditados neste lote | **12** | **6** | **6** | Não auditado | Conteúdo anterior preservado |

**IMPORTANTE:** os números dos provedores não são somáveis sem deduplicar as mesmas câmeras em diferentes diretórios. A existência de um player anunciado pelo site não garante que possa ser reproduzido no dispositivo, nem que esteja ao vivo.

## Novas fontes cadastradas (23)

### Câmeras do Mundo — 16 páginas publicamente verificadas

1. Afonso Pena — YouTube `PtaHi82kFEc`
2. Congonhas (Cam 1) — YouTube `MfnqZBrjFNI`
3. Guarulhos (Cam 10L) — YouTube `3rYEB7ukoWE`
4. Viracopos — YouTube `iVvJf8YlC6Y`
5. Goioerê — YouTube `X8LarnTkEac`
6. Cristo Redentor — YouTube `O08y0UiwNEc`
7. Praia dos Milionários — YouTube `dwhDd7j73ic`
8. São Conrado — YouTube `J5uNN0_CO1M`
9. Meia Praia, Itapema — YouTube `Zas6UA88x8Y`
10. Praia Retiro dos Padres, Bombinhas — YouTube `UT7AgfRD4Lc`
11. Praia da Barra, Salvador — **sem player aprovado**, fonte Clima ao Vivo
12. Provetá, Ilha Grande — YouTube `zJl5_2l0vfE`
13. Morro das Pedras, Florianópolis — YouTube `fb6Re2yDFio`
14. Itacoatiara, Niterói — **sem player aprovado**, fonte LCJ
15. São José dos Campos — YouTube `JpF_xTgo6KU`
16. Galeão — YouTube `wmAArqW6GnY`

As URLs das páginas oficiais, os nomes, cidades e IDs constam em `modules/jarvis-public-world-cameras-model.js`.

### Janelas TV — 7 páginas verificadas

- Canto do Forte (Praia Grande)
- Ponta da Praia (Santos)
- Quebra-Mar (Santos)
- Canal 3 (Santos)
- Monte Serrat (Santos)
- Praia das Pitangueiras (Guarujá)
- Ilha Porchat (São Vicente)

**NÃO afirmar que o player H.265/VR pode ser incorporado.** A catalogação não cria direitos sobre a transmissão.

### Tabi.cam — diretório, sem cópia do catálogo de vídeos

- Diretório oficial: https://tabi.cam/pt/explore/
- Termos: https://tabi.cam/terms/
- A obtenção de autorização explícita do provedor é necessária para um importador automatizado e reutilização dos vídeos. Não implementar scraping ou proxy para contornar esses termos.

## Referências verificadas

- Câmeras do Mundo, declaração de mais de 600 webcams: https://camerasdomundo.com/
- Janelas TV, 7 opções principais e requisitos H.265: https://www.janelas.tv.br/camera-ao-vivo/
- Tabi.cam, 61 países: https://tabi.cam/explore/
- Tabi.cam, proibição de bots/crawlers/scrapers e de reprodução não autorizada: https://tabi.cam/terms/

## Próximas condições para cobertura integral

1. Autorização ou API de cada provedor para enumeração/comercialização/uso externo de seu catálogo completo.
2. Conferência de URLs únicas, câmera versus página com múltiplos ângulos e duplicações entre fornecedores.
3. Player oficialmente incorporável, com permissão do detentor do vídeo, áudio mudo por padrão.
4. Rotina lícita de atualização para fontes removidas, expiradas ou offline e relatório transparente sobre sinal não verificado.
5. Teste real de reprodução em navegador e celular (CI é apenas simulação de interface, não prova imagem em tempo real).

