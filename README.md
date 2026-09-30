# ULTRON AI v3.1 — Gemini Backend

## O que foi adicionado

O terminal do ULTRON agora envia comandos para `/api/ai`, e o backend consulta o Gemini usando o SDK oficial `@google/genai`.

A chave fica somente em `backend/.env`.

## 1. Instale o Node.js

Instale uma versão LTS atual do Node.js no computador/ambiente onde o backend será executado.

## 2. Entre na pasta backend

```bash
cd ULTRON_AI_GEMINI_v3_1/backend
```

## 3. Instale as dependências

```bash
npm install
```

## 4. Crie o .env

Copie `.env.example` para `.env`:

```text
GEMINI_API_KEY=SUA_CHAVE_REAL
PORT=3000
```

NÃO publique o `.env` nem envie a chave para ninguém.

## 5. Inicie

```bash
npm start
```

Abra:

http://localhost:3000

O próprio backend entrega o frontend.

## 6. Teste

Abra o painel e digite no terminal:

```text
Explique o que você consegue fazer neste sistema.
```

Depois:

```text
Crie um plano para transformar este painel em um agente com ferramentas.
```

## Importante

A câmera e o detector de movimento continuam locais no navegador.

O Gemini, neste estágio, é o núcleo conversacional. Ele ainda não possui permissão para controlar dispositivos físicos, executar comandos do sistema operacional ou fazer automações externas.

Para isso, a próxima camada será Function Calling + ferramentas permitidas no backend.

## Segurança

- `.env` não deve ser publicado.
- Nunca coloque GEMINI_API_KEY no HTML ou JavaScript do frontend.
- Em produção, use HTTPS.
- Adicione autenticação e rate limiting antes de disponibilizar o backend publicamente.
