# ULTRON AI — Multi-IA + ElevenLabs

Estrutura principal: `index.html` + `script.js` + `config.js` + módulos locais + backend Node.js/Cloudflare Worker.

O ULTRON AI usa um gateway de IA com failover automático. A ordem padrão é:

1. Gemini
2. Groq
3. OpenRouter
4. Cloudflare Workers AI
5. Cohere

Se um provedor estiver indisponível, sem cota ou retornar erro, o backend tenta automaticamente o próximo. A ElevenLabs continua responsável pela voz e não participa do failover de texto.

## Endereço público

https://equipezero-web.github.io/Ultron_AI/

O frontend usa o backend configurado em `config.js`.

## Backend local

Entre em `backend/`.

Copie `.env.example` para `.env` e preencha somente as chaves dos provedores que deseja ativar. Nunca publique o `.env` no Git.

Variáveis principais:

- `GEMINI_API_KEY`
- `GROQ_API_KEY`
- `OPENROUTER_API_KEY`
- `CLOUDFLARE_ACCOUNT_ID` e `CLOUDFLARE_AI_API_TOKEN` para Workers AI via REST no backend Node
- `COHERE_API_KEY`
- `ELEVENLABS_API_KEY` e `ELEVENLABS_VOICE_ID`

A ordem pode ser alterada com:

`AI_PROVIDER_ORDER=gemini,groq,openrouter,cloudflare,cohere`

Modelos padrão atuais:

- Gemini: `gemini-3.8-flash`
- Groq: `openai/gpt-oss-20b`
- OpenRouter: `openrouter/free`
- Cloudflare: `@cf/meta/llama-3.1-8b-instruct-fp8-fast`
- Cohere: `command-a-plus-05-2026`

Todos podem ser substituídos pelas respectivas variáveis `*_MODEL`.

Execute `npm install` e depois `npm start`. Abra `http://127.0.0.1:3000`.

## Cloudflare Worker

O arquivo `backend/wrangler.jsonc` inclui o binding `AI` para Workers AI. No Worker, configure as chaves de API como secrets/variáveis do ambiente, nunca dentro do código-fonte.

Rotas do backend:

- `GET /api/health` — mostra os provedores configurados e seus modelos
- `POST /api/ai` — consulta os provedores com failover automático
- `POST /api/voice` — gera voz com ElevenLabs

A resposta de `/api/ai` também informa `provider`, `providerLabel`, `model` e `attempts`, permitindo saber qual IA respondeu e quais fallbacks foram utilizados.

## Configuração do frontend

O arquivo `config.js` contém somente o endereço público do backend. Para desenvolvimento local, use `http://localhost:3000`. Em produção, use o endereço HTTPS do Worker. Nunca coloque chaves de API em `config.js` ou no `index.html`.

## Visualização

A câmera não aparece automaticamente. O botão MOSTRAR TELA abre a visualização; DESLIGAR encerra a câmera.

## Estado emocional

O painel apresenta uma estimativa heurística baseada nos sinais locais disponíveis, principalmente atividade/movimento e tempo de inatividade. Não é uma medição clínica.

## Pressão e batimentos

O navegador/celular não cria uma medição real de pressão ou batimentos. O painel aceita integração futura com dispositivo/API compatível por `DEVICE_BRIDGE_URL`.
