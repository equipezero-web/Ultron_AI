# ULTRON AI — Gemini + ElevenLabs

Projeto web do ULTRON AI com frontend estático e backend Node.js.

## Endereço público
https://equipezero-web.github.io/Ultron_AI/

## Backend local
1. Entre em `backend/`.
2. Copie `.env.example` para `.env`.
3. Preencha `GEMINI_API_KEY`.
4. Preencha `ELEVENLABS_API_KEY` e `ELEVENLABS_VOICE_ID` para ativar a voz.
5. Execute `npm install` e depois `npm start`.
6. Abra `http://127.0.0.1:3000`.

As chaves ficam somente no backend. Não publique o `.env` no Git.

## Visualização
A câmera não aparece automaticamente. O botão **MOSTRAR TELA** abre a visualização; **DESLIGAR** encerra a câmera.

## Estado emocional
O painel apresenta uma estimativa heurística baseada nos sinais locais disponíveis, principalmente atividade/movimento e tempo de inatividade. Não é uma medição clínica.

## Pressão e batimentos
O navegador/celular não cria uma medição real de pressão ou batimentos. O painel aceita integração futura com dispositivo/API compatível por `DEVICE_BRIDGE_URL`.
