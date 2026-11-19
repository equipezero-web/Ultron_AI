# J.A.R.V.I.S. — Programa de conclusão comprovada (60 capacidades)

Data: 2026-11-19. Escopo do operador: **100% funcional**, não 100% nominal.

## Inventário e critérios

A fonte canônica é `data/jarvis-100-acceptance-manifest.json`: 60 IDs únicos, 5 áreas e 6 fases na sequência determinada pelo operador. O percentual inicial é apenas histórico. **Nenhuma capacidade pode receber aceitação 100% sem evidência de código, CI, ambiente publicado e teste físico quando aplicável.** Requerer comprovação em dispositivo físico não significa que toda capacidade dependa de hardware; registrar `physical` com uma evidência explícita de "não se aplica" quando apropriado e aprovado.

A CI `tests/jarvis-100-acceptance.mjs` impede:
- excluir silenciosamente capacidades ou alterar as quantidades 7+8+20+17+8;
- reordenar as seis fases;
- marcar `accepted` sem URL e data verificável para todas as dimensões;
- reabilitar acidentalmente a política de escuta e fala no código de manutenção.

## Ordem de execução aprovada

1. **Inteligência (20)**: completar agentes realmente conectados, memória e recuperação contextual, failover auditado, verificações de origem, mecanismo de feedback supervisionado e autorização verificável.
2. **Funcionalidades (17)**: homologar Neural Ring, globo/Mapbox, mapas 2D/3D, previsão, radares, controles, câmera pública, multimídia e navegação em todos os tamanhos.
3. **Comunicação (7)**: comandos digitados, continuidade de diálogo, notícias, mídias e notificações com feedback. **Escuta, Voice Match, microfone remoto e síntese de fala permanecem desativados por ordem do operador.**
4. **Integridade (8)**: autorização, controle P0, testes negativos, CI, recuperação, idempotência, limites de requisições, auditoria e prova do deployment.
5. **Dispositivos (8)**: consentimento, Android Bridge com APK instalado, TV, PC e celular reais; recibos de execução, permissões revogáveis, ausência de escuta involuntária.
6. **Inteligência novamente (20)**: reexecutar cenários reais completos atravessando as áreas anteriores, monitorar regressões e validar a autonomia supervisionada.

## Entrega operacional deste incremento

- Novo serviço autenticado `POST /api/account/intelligence/execute` no backend canônico `worker.js`. **Falha fechado quando Cloudflare Access não estiver provisionado**. Autorização via JWT assinado e allowlist já existentes; memóriaKey não é autenticação.
- Aceita objeto JSON com `message` (até 500 caracteres), `city` (obrigatória para previsão) e `days` (3, 7 ou 16).
- Reutiliza as integrações existentes: Open-Meteo/GeoNames para previsão modelada e Google News/GDELT para notícias públicas.
- Executa somente os perfis de leitura `meteorology` e `news`, em paralelo quando independentes. Rejeita solicitação de arquivos, controle de dispositivos, código, memórias privadas e qualquer outro perfil não registrado.
- Respostas mostram resultado de fontes, erro e `rendered:false`. Quando o usuário solicita também visualização no globo, o passo visual retorna `unavailable` até a interface renderizar efetivamente. Nenhuma cena é declarada concluída sem prova do cliente.
- Fonte de notícias deve estar em HTTPS e datada nos últimos 72h. Alertas meteorológicos **não** são deduzidos de previsões de modelo.
- Estado de manutenção informado também em `GET /api/health` para evitar falso anúncio de voz ativa.
- Testes automatizados verificam autenticação no roteamento, ações não permitidas, negadores, datas antigas, fontes inseguras, falha de provedor e não simulação de visual.

## Bloqueadores para atingir 100% comprovado

- **Ambiente real**: validar deploy GitHub Pages e Cloudflare Worker, D1, Cloudflare Access, limites e rede externa. Testes unitários isolados não fazem essa prova.
- **Dados e modelos**: fontes oficiais e cobertura geográfica por país; El Niño requer projeções climatológicas adequadas, não extrapolações de previsão diária.
- **Dispositivos**: testes com Android físico/PC/TV e consentimento de cada ação; nenhum APK antigo pode reativar o microfone.
- **Câmeras de terceiros**: player publicamente divulgado não comprova sinal ao vivo e não autoriza incorporação irrestrita.
- **Agentes**: outros cinco perfis do Hub continuam sem execução autorizada de ponta a ponta; a consulta de notícias/previsão não os substitui.
- **Áudio**: intencionalmente desligado; não alegar essa capacidade ativa nem reabilitá-la sem solicitação explícita posterior.

### Exemplos do novo contrato

Consulta de previsão sem renderização simulada:

```json
{"message":"Jarvis, consulte a previsão do tempo para mostrar no globo","city":"Recife","days":7}
```

Uma resposta parcialmente bem-sucedida tem `ok:false`, `partial:true`, as consultas concluídas e `visual` como indisponível. O browser deverá executar e comprovar a cena no Neural Ring antes de relatar conclusão total. A chamada exige identidade Cloudflare Access válida e não armazena novos dados pessoais.
