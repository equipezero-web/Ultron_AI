ULTRON AI — Gemini + ElevenLabs
Estrutura principal: `index.html` + `script.js` + `config.js` + módulos locais + backend Node.js.
Projeto web do ULTRON AI com frontend estático e backend Node.js.
Endereço público
https://equipezero-web.github.io/Ultron_AI/
Backend local
Entre em `backend/`.
Copie `.env.example` para `.env`.
Preencha `GEMINI_API_KEY`.
Preencha `ELEVENLABS_API_KEY` e `ELEVENLABS_VOICE_ID` para ativar a voz.
Execute `npm install` e depois `npm start`.
Abra `http://127.0.0.1:3000`.
Configuração do frontend
O arquivo `config.js` contém somente o endereço público do backend. Para desenvolvimento local, use `http://localhost:3000`. Em produção, substitua por `https://...` do seu backend. Nunca coloque chaves de API em `config.js` ou no `index.html`.
As chaves ficam somente no backend. Não publique o `.env` no Git.
Visualização
A câmera não aparece automaticamente. O botão MOSTRAR TELA abre a visualização; DESLIGAR encerra a câmera.
Estado emocional
O painel apresenta uma estimativa heurística baseada nos sinais locais disponíveis, principalmente atividade/movimento e tempo de inatividade. Não é uma medição clínica.
Pressão e batimentos
O navegador/celular não cria uma medição real de pressão ou batimentos. O painel aceita integração futura com dispositivo/API compatível por `DEVICE_BRIDGE_URL`.
