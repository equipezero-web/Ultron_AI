# J.A.R.V.I.S — Fase VI: diagnósticos e dependências de missões

## Operação
- O J.A.R.V.I.S. inspeciona **antes** da primeira etapa de missões compostas as dependências reconhecidas de Desktop Bridge, Mobile Bridge e a disponibilidade da API de ativação do Optical Sensor.
- A verificação dos Bridges consulta inventário autenticado real e só considera **online** um dispositivo ativo com heartbeat recente informado pelo backend; erros, ausência de pareamento e timeouts **não são tratados como sucesso**.
- A disponibilidade da API de câmera **não** equivale a permissão do usuário ou transmissão ao vivo. O Mobile Bridge online **não** prova autorização da LG WebOS.
- Se alguma dependência obrigatória falhar, **nenhum passo da missão composta é iniciado**. Registra-se o bloqueio e códigos técnicos no histórico D1 quando disponível.
- Etapas subsequentes só podem iniciar quando a anterior terminar com estado **completed**. Estado **submitted**, **waiting-confirmation**, **failed** ou **cancelled** não libera a próxima etapa. O P0 STOP continua prioritário.
- O botão **MISSÕES** no terminal mostra última execução, pré-verificação, dependências e estados das etapas, sem abrir outra página. Também aceita “relatório das missões” e “status das missões” por texto ou voz.
- Um journal local mantém os **12 últimos** relatórios de metadados, sem armazenar o texto de comandos, nomes de arquivos ou segredos. Quando não existe relatório local, o sistema tenta consultar o histórico autenticado do backend.
- O backend também aceita **cancelled** como estado terminal de etapa (sem transformá-lo artificialmente em “running”).

## Limites conhecidos
- Só as dependências identificadas são testadas antecipadamente; o mapa 2D/3D e notícias são validados durante suas próprias ações. Sem inferir que todos os serviços do mundo estão prontos.
- Nenhum diagnóstico executa comandos físicos, solicita câmera ou usa pesquisa externa como ordem de execução.
- Histórico **local** é perdido ao recarregar a página; persistência no D1 depende de backend e identidade operacionais.
- Falha durante um efeito externo não pode desfazer ações já recebidas por um dispositivo.
- Testes locais/CI não substituem homologação física em Android, Windows, LG TV ou conferência de deploy de produção.

## Testes
```sh
node tests/jarvis-mission-diagnostics.mjs
node tests/jarvis-mission-safety.mjs
node tests/jarvis-device-receipts.mjs
```
