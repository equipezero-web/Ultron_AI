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

## XIX — Cenários matemáticos 2D/3D
Exige registro geográfico publicado e explicitamente selecionado (Fase XIII). No Neural Ring, apresenta uma curva gaussiana normalizada em gráfico 2D ou uma malha matemática projetada em 3D; controle de escala, alternância e fechamento. O painel indica a fonte do ponto e deixa claro que o gráfico é hipotético: não representa terremoto real, clima, alerta, intensidade, área afetada, risco, velocidade ou previsão. Não desenha falsas regiões de impacto sobre o Mapbox.

Comandos: "simulação 2D", "simulação 3D", "fechar simulação".

## Segurança operacional
- Entradas aceitas são instruções estritamente listadas. Linguagem livre não vira código.
- Ações externas e controle de dispositivos não fazem parte destas cinco fases.
- Verificação de fonte, data de publicação e evento contextual precede sugestões/simulações.
- STOP/P0 encerra rotina e visualização; tarefas externas já iniciadas podem terminar independentemente.
- O registro local de ações tem no máximo 20 itens genéricos e não guarda dados pessoais.
- O módulo é progressivo: falhas de coletores e Canvas não devem derrubar o núcleo principal.

## Testes e deploy
- node tests/jarvis-phases15-19-model.mjs
- node tests/jarvis-phase14-supervised-model.mjs
- node tests/jarvis-phase13-context-model.mjs
- node tests/jarvis-phases15-19-browser.mjs (Chrome + servidor local)

O workflow CI valida sintaxe, modelos, regressões e integração mobile. Merge e deploy no GitHub Pages dependem dos checks. Compatibilidade em celulares físicos e consistência das fontes devem ser verificadas em produção.

Delimitação: são MVPs funcionais e verificáveis das Fases XV–XIX, não uma IA geral autônoma, aprendizado de modelo sem supervisão ou previsão física meteorológica.
