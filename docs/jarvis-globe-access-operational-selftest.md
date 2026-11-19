# J.A.R.V.I.S. — Teste explícito de globo e Cloudflare Access

Data: 2026-11-19. Requisitos de manutenção: **texto somente, microfone/voz/Voice Match desligados**.

## Por que o diagnóstico mostrava 4/6?

O motor `window.ULTRON_EARTH` é registrado na página, mas a inicialização WebGL/Mapbox acontece **sob demanda**. Antes de abrir o globo, `state.available=true`, `state.ready=false` não comprova falha. Agora o diagnóstico exibe **EM ESPERA** nessa situação, sem elevar a contagem artificialmente.

O Worker anuncia que o Cloudflare Access foi configurado, mas `GET /api/health` é público. Isso não significa que uma sessão autenticada tenha sido validada.

## Novo comando digitado

```text
Jarvis, testar globo e acesso
```

Apenas após esse comando explícito, o orquestrador:

1. Abre o globo existente no **mesmo Neural Ring** usando `ULTRON_EARTH.open()`.
2. Verifica `result.ok`, modo (`globe-3d` ou `mapbox-globe`), motor pronto, painel visível, coordenadas/câmera válidas e canvas com dimensões positivas.
3. Faz `GET /api/account/session/verify` com `credentials:include`, no único host HTTPS autorizado do Worker.
4. O Worker valida `Cf-Access-Jwt-Assertion` usando as chaves públicas confiáveis do Cloudflare Access, exige conta allowlisted e retorna **apenas** `authenticated:true` / `verifiedBy:cloudflare-access-jwt`. Não devolve identificador, e-mail, JWT, cookie ou segredo.
5. Mostra diagnóstico no terminal; somente se o globo falhou mostra o texto em overlay, para não encobrir a visualização que acabou de abrir.
6. O P0 bloqueia retorno tardio e interrompe a apresentação. Se o teste abriu o globo e foi cancelado antes da verificação, ele o fecha.

O teste **não realiza comandos privados, escrita em D1, consulta meteorológica, ativação de câmeras, voz nem ações em Android/TV/PC**.

### Resultados possíveis

| Item | Confirmação | Limite |
| --- | --- | --- |
| Globo | Aberto, estado e canvas visível | Não certifica pixels, velocidade, toque ou dispositivo real |
| Cloudflare Access | JWT validado pelo Worker | Não certifica o executor de agentes, banco de dados ou outras permissões |
| 60 capacidades | Nenhuma aprovação automática | Requer evidências de código, CI, produção e teste físico quando aplicável |

Se a chamada retornar 401, a sessão Access não foi reconhecida pelo Worker. Se retornar 403, a conta ou origem pode não estar autorizada. Se ocorrer 503, a configuração de Access/certificados pode estar incompleta. A resposta nunca deve ser convertida artificialmente em sucesso.

**Observação:** o navegador não pode fabricar o cabeçalho `Cf-Access-Jwt-Assertion`. O Cloudflare Access deve proteger o domínio/rota e injetar o JWT verificado. Estar conectado em outra aplicação, ou enviar somente `credentials:include`, não garante esse cabeçalho.

## Critérios posteriores

Para homologar as capacidades correspondentes, ainda serão necessários testes completos de globo com toque, zoom e validação visual no dispositivo real, execução de agente autenticado com recibo e revisão da evidência. O novo endpoint sozinho não aprova 1/60.
