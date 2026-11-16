# J.A.R.V.I.S. — Fases XV a XIX (implementação integrada)

Este conjunto amplia a Fase XIV sem criar uma página paralela. Todos os comandos passam pelo terminal/voz existentes, e somente a visualização hipotética abre um cartão compacto dentro do Neural Ring.

## XV — Inteligência proativa verificável
O sistema aproveita o resumo público já coletado (Fase IX) e pode propor a leitura de um evento com fonte HTTPS e data atual. Prioriza registros novos e a preferência visual consentida. Ao despertar ou detectar um novo registro, a sugestão é somente texto com link. Respeita intervalos de 20 minutos e não modifica mapa, contas ou dispositivos. Sem registro verificado, não cria notícias nem alertas.

Comandos: "Jarvis, sugestões proativas", "Jarvis, status proativo".

## XVI — Memória operacional com consentimento
Armazena apenas uma preferência de apresentação (notícias, mapas ou prioridades) e contagens limitadas de avaliações explícitas (+/−). Não armazena transcrições, perfis privados, dados de clientes ou inferências sensíveis. A preferência é local ao navegador, expira em 30 dias e pode ser apagada pelo usuário. Não substitui o motor de memória geral.

Comandos: "memorizar preferência notícias primeiro", "memorizar preferência mapas primeiro", "memorizar preferência prioridades primeiro", "memória operacional", "gostei da sugestão", "não gostei da sugestão", "esquecer preferência visual".

## XVII — Especialistas locais com fonte
Três funções determinísticas examinam o mesmo conjunto público validado: notícias, geolocalização e avisos oficiais. Entregam contagem e fonte quando disponíveis. Não são três modelos de IA externos nem executam pesquisas arbitrárias ou intervenções; essa limitação é exibida no resultado. Sem dados verificados, declaram indisponibilidade.

Comandos: "Jarvis, consultar agentes", "status dos agentes".

## XVIII — Rotina consentida de consulta pública
Com autorização expressa, verifica os coletores públicos já instalados a cada 15 minutos, somente com a aba aberta e visível; não monitora com a página fechada, não usa push nem promete tempo real. Reutiliza APIs de leitura existentes, não usa controle de dispositivo, câmera, mensagens, finanças ou arquivos. Guarda apenas a opção local de monitoramento. STOP/P0 desativa rotina e invalida o resultado pendente. Limita chamadas concorrentes.

Comandos: "ativar rotina de monitoramento", "verificar rotina agora", "status da rotina", "desativar rotina de monitoramento".

## XIX — Visualização geográfica 2D/3D de dados reais

Exige registro geográfico público e explicitamente selecionado, com coordenadas válidas, fonte publicada e data verificada pelas Fases IX–XIII. Ao solicitar a visualização, reutiliza o mapa contextual real existente, sem outra tela nem gráfico sintético. A origem e a data aparecem no terminal e a visualização só é confirmada após o controlador de mapas retornar sucesso, modo 2D ou 3D e ponto selecionado. Se o 3D não estiver disponível, informa o fallback real para 2D.

Não cria curvas, valores de risco, previsões, intensidade, áreas afetadas, mapas de calor, animações que simulem propagação física, ou informações não publicadas na fonte. Ausência de dados = visualização recusada. A navegação da câmera no globo não deve ser confundida com mudança do fenômeno real.

Comandos: "mostrar dados reais em 2D", "mostrar dados reais em 3D", "visualização real 2D", "visualização real 3D". Comandos antigos de "simulação 2D/3D" são recusados com explicação.

## Segurança operacional
- Entradas aceitas são instruções estritamente listadas. Linguagem livre não vira código.
- Ações externas e controle de dispositivos não fazem parte destas cinco fases.
- Verificação de fonte, data de publicação e evento contextual precede sugestões/simulações.
- STOP/P0 encerra rotina e visualização; tarefas externas já iniciadas podem terminar independentemente.
- O registro local de ações tem no máximo 20 itens genéricos e não guarda dados pessoais.
- O módulo é progressivo: falhas de coletores ou renderizador de mapa não devem derrubar o núcleo principal.

## Testes e deploy
- node tests/jarvis-phases15-19-model.mjs
- node tests/jarvis-phase14-supervised-model.mjs
- node tests/jarvis-phase13-context-model.mjs
- node tests/jarvis-phases15-19-browser.mjs (Chrome + servidor local)

O workflow CI valida sintaxe, modelos, regressões e integração mobile. Merge e deploy no GitHub Pages dependem dos checks. Compatibilidade em celulares físicos e consistência das fontes devem ser verificadas em produção.

Delimitação: são MVPs verificáveis das Fases XV–XIX, não uma IA geral autônoma, treinamento de modelos sem supervisão nem previsão física meteorológica. Dados de testes podem ser sintéticos, mas a aplicação em produção nunca deve mostrá-los como notícias ou observações reais.
