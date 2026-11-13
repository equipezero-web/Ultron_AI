# J.A.R.V.I.S. — Fase VII: Recuperação Inteligente

## Funcionalidades implementadas
- Alertas de telemetria conhecidos de degradação da memória D1 e gateway acionam **somente GET /api/health** no endereço fixo do Worker configurado. Não há repetição automática de controle de dispositivos, automações, compras, envios ou operações em arquivos.
- A verificação **confirma a resposta real** do backend, ao contrário de contar o acionamento da função de diagnóstico como recuperação.
- **Duas tentativas totais no máximo** (uma tentativa inicial + um retry) por verificação, e retry somente para falhas temporárias de rede e HTTP 408/502/503/504. HTTP 429, respostas inválidas, falhas de autorização e serviços degradados não geram retries.
- O cooldown padrão é de **90 segundos**, com aumento gradual em caso de falhas. Após três verificações malsucedidas consecutivas, o disjuntor pausa novas consultas por **10 minutos**.
- O comando **PARE / STOP** cancela verificações ainda pendentes; navegador offline não consulta a rede. Ao reconectar, as verificações seguras podem ser retomadas respeitando os limites.
- O botão **RECUPERAÇÃO**, “status da recuperação”, “diagnóstico de recuperação” e “verifique conexões” consultam o estado no terminal existente, sem abrir novas páginas.
- O relatório informa serviço, código técnico não sensível, estado, quantidade de tentativas e próxima janela. A telemetria registra apenas o resultado e o código permitido.
- Chamadas concorrentes de alerta ao mesmo serviço compartilham uma única verificação, sem tempestade de requisições.

## Limites
- **Gateway saudável não significa celular, PC ou LG TV conectados**. Estado físico, pareamento, permissões de câmera e ACK ainda são verificações específicas.
- Uma consulta GET não conserta sozinha um backend ou aplicativo físico indisponível; só constata a volta do serviço e limita novas tentativas.
- A recuperação funciona quando a página está em uso. O monitoramento 24 horas por cron no backend é uma funcionalidade distinta e não foi ampliada nesta fase.
- Testes de CI não substituem homologação com dispositivos físicos ou publicação em produção.

## Testes
    node tests/jarvis-phase7-recovery.mjs
    node tests/jarvis-mission-diagnostics.mjs
    node tests/jarvis-mission-safety.mjs
    node tests/jarvis-device-receipts.mjs
