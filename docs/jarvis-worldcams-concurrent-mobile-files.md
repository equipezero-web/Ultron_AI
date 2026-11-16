# J.A.R.V.I.S. — câmeras mundiais, multitarefas e arquivos do celular (etapa segura)

## 1. Catálogos mundiais completos vs. indexação de transmissões
- SkylineWebcams: https://www.skylinewebcams.com/en/webcam.html
- Webcamera24: https://webcamera24.com/pt/all-webcams/

A seção **EXPLORAR TODOS OS CATÁLOGOS** do painel CÂMERAS MUNDIAIS
permite percorrer o catálogo integral **nas páginas originais** dos
provedores, com país e categoria. Isso dá acesso a todas as páginas públicas
oferecidas pelos diretórios, mas **não importa automaticamente todas as
câmeras para o índice do J.A.R.V.I.S.**. As entradas exibidas no filtro local
são apenas um conjunto curado; os provedores não foram integrados via API de
índice global licenciada e monitorada. A disponibilidade muda a qualquer
momento e o J.A.R.V.I.S. não verifica o status de milhares de sinais.

A SkylineWebcams não autoriza terceiros a incorporar vídeo ao vivo de suas
câmeras. Como alternativa **específica ao mesmo local** em Jerusalém, a
EarthCam publicou no YouTube o vídeo do Muro Ocidental
https://www.youtube.com/watch?v=77akujLn4k8. Ao selecionar a
entrada Skyline de Jerusalém, o J.A.R.V.I.S. oferece o botão explícito
**ASSISTIR AO MURO OCIDENTAL NO NEURAL · EARTHCAM**. A transmissão da
EarthCam é de **outro operador e outra câmera**, e pode falhar ou ter
a incorporação bloqueada. O iframe nunca é aberto sem clique. A página da
Skyline e as câmeras da Fundação do Muro Ocidental continuam disponíveis
como links de suas fontes respectivas.

## 2. Multitarefas dentro do Neural Jarvis
Botão **MULTITAREFAS**, ou comando "Jarvis, abrir multitarefas".
Um núcleo **read-only** limitado a três verificações independentes
simultâneas oferece:
- Catálogos mundiais (contagem de entradas locais e catálogos oficiais);
- Dispositivos pareados (consulta do gateway, sob identidade existente);
- Situação do módulo meteorológico (dados do estado carregado, não coleta nova);
- Relatórios locais de origem dos dados.

São leituras concorrentes com estado individual de sucesso/falha. Parada de
emergência P0 interrompe o agendamento e sinaliza cancelamento. **Não** são
automações persistentes, edição de arquivos em segundo plano, execução
arbitrária de IA ou agentes que continuam quando o navegador está fechado.
Os mecanismos de automação e pareamento já existentes seguem separados.

## 3. Celular Android: pareamento e documentos selecionados
O J.A.R.V.I.S. já dispõe de pareamento com o aplicativo Android **Mobile
Bridge** via código de seis dígitos, com serviço e dispositivos registrados
no backend. A atualização v0.5.0 adiciona **ARQUIVOS DO CELULAR (ACESSO
AUTORIZADO)** à tela do aplicativo. Ao clicar:
- O seletor Android ACTION_OPEN_DOCUMENT permite ao **usuário selecionar
  individualmente** um documento.
- O aplicativo aceita somente documentos textuais UTF-8 até 512 KiB; não
  solicita MANAGE_EXTERNAL_STORAGE, READ_EXTERNAL_STORAGE nem varredura.
- A leitura e o editor acontecem **dentro do próprio celular**. Não
  transmitem o conteúdo para a IA, o servidor, Cloudflare ou outros pares.
- A substituição requer **confirmação a cada salvamento** e verifica se o
  conteúdo original mudou após a abertura. Faça cópia antes de sobrescrever.
- Fechar o arquivo encerra a seleção.
- Não há capacidade de o J.A.R.V.I.S. em outro aparelho ler ou modificar
  remotamente os documentos. Para permitir ações remotas futuras, ainda
  será necessário implementar autenticação de operador forte,
  autorização vinculada ao URI e à operação, consentimento do usuário
  do celular, trilha de auditoria e proteção contra reexecução.

Na web, o botão **EDITAR ARQUIVOS** ou comando "Jarvis, abra o editor de
arquivos" oferece editor de texto para arquivos **selecionados no dispositivo
onde o navegador J.A.R.V.I.S. está aberto**. Navegadores com API File System
Access podem pedir permissão de escrita direta e exigem confirmação de
sobrescrita; navegadores sem suporte ficam limitados a
**EXPORTAR CÓPIA REVISADA**. A seleção e o conteúdo não são enviados para
backend nem IA automaticamente. O botão **PAREAR CELULAR** reutiliza o
pareamento já existente sem conceder acesso a arquivos.

**Não confunda parear o telefone com autorização de acesso aos seus
arquivos.** Pareamento e armazenamento são permissões independentes.

Fontes oficiais:
- Android Storage Access Framework:
  https://developer.android.com/training/data-storage/shared/documents-files
- File System Access API:
  https://developer.mozilla.org/en-US/docs/Web/API/Window/showOpenFilePicker
- Política Skyline de incorporação:
  https://www.skylinewebcams.com/en/support/faq.html

## Testes
- tests/jarvis-public-world-cameras-model.mjs: EarthCam e Skyline são feeds
  diferentes, mesmo local, Youtube embed apenas para fonte curada.
- tests/jarvis-public-world-cameras-browser.mjs: botão EarthCam, reprodução
  manual e mudo por padrão, preservação da fonte Skyline.
- tests/jarvis-scoped-multitask-model.mjs: limites, concorrência e P0.
- tests/jarvis-scoped-multitask-browser.mjs: Android-viewport e desktop,
  arquivo selecionado, não sobrescrita sem handle, visual e parada P0.
- tests/jarvis-mobile-saf-security.mjs: ausência de privilégios de
  armazenamento e de comandos remotos de leitura/gravação.
- .github/workflows/jarvis-parallel-scoped-android.yml: compilação de
  aplicativo Android de teste e verificações automatizadas.

O APK debug, se o workflow concluir, é um artefato de teste, não
uma distribuição de produção. Instalação ou atualização não acontece
automaticamente no celular do usuário.
