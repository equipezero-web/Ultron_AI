# J.A.R.V.I.S. — Backend Node local endurecido

Data da revisão: 23/11/2026.

O sistema publicado usa **Cloudflare Worker** (`backend/worker.js`). O processo `backend/server.js` é a alternativa **Node para desenvolvimento local** e não deve ser confundido com o Worker.

## Problemas encontrados

- `app.use(cors())` permitia que qualquer página de origem diferente consumisse o backend Node, caso a rede o alcançasse.
- `POST /api/ai` e `POST /api/vision/analyze` não possuíam limite de requisições. Quando expostos na LAN, poderiam consumir cotas de provedores.
- `app.listen(PORT)` usava o bind padrão, potencialmente acessível na rede. O log dizia `localhost` mesmo quando o processo podia aceitar conexões externas.
- O endpoint `/api/voice` já negava todas as chamadas, mas mantinha código de geração de áudio inacessível; o health ainda anunciava ElevenLabs como configurado, dando impressão errada.

## Mudanças aplicadas

- Bind padrão: `ULTRON_LOCAL_HOST=127.0.0.1`. Dispositivos externos continuam utilizando o Cloudflare Worker de produção, sem alteração.
- Origens CORS aceitas por padrão: `http://localhost:<porta>`, `http://127.0.0.1:<porta>`, `http://[::1]:<porta>` e `https://equipezero-web.github.io`. Origens adicionais são autorizadas explicitamente por `ULTRON_LOCAL_ALLOWED_ORIGINS`, sem `*` geral.
- **Limites por IP e endpoint**: até 20 requisições/minuto para IA local e 10/minuto para visão local; retorno HTTP 429 com `Retry-After` se exceder.
- `X-Forwarded-For` não pode ser usado para simular clientes diferentes, pois o processo local confia apenas no endereço do socket.
- A escuta e a saída de voz continuam desligadas; removido o código inalcançável de TTS no servidor local. `GET /api/health` comunica `voiceEnabled:false`.
- Se o administrador optar por `ULTRON_LOCAL_HOST=0.0.0.0` ou IP da LAN, deverá configurar `ULTRON_LOCAL_API_TOKEN` com **pelo menos 32 caracteres** e enviar `Authorization: Bearer <token>` aos endpoints privados. A rota de saúde permanece pública. Não publicar esse segredo em HTML/JavaScript ou compartilhar pela conversa.

## Limitações e aceitação

A proteção por IP é local ao processo Node e não implementa cota distribuída entre réplicas. O backend Cloudflare Worker possui arquitetura e limites próprios; esta mudança não resolve a sessão Cloudflare Access nem o redirecionamento HTTP 302 do operador. A política de Access no painel Cloudflare deve ser verificada separadamente.

Os testes automatizados simulam acessos permitidos e negados, limite de chamadas e token de LAN. A publicação na rede e os testes reais no Windows/Android permanecem pendentes.
