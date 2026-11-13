# J.A.R.V.I.S. — Fase IX: Inteligência Contextual e Prioridades Verificadas

## Escopo e fontes
- Consolida informações **já observadas** pelo monitor de eventos mundiais (USGS, NASA EONET, GDACS), os avisos **INMET** e manchetes arquivadas do boletim das últimas 24 horas. Não inicia navegação autônoma, coleta privada ou ações em dispositivos.
- Usa apenas **links HTTPS verificáveis** para eventos e avisos oficiais. As notícias precisam de URL pública HTTPS, data de publicação e histórico de coleta atualizado.
- Prioridade de exibição considera proximidade geográfica aproximada do Brasil, temática Brasil/Santa Catarina, validade do aviso INMET, data e novidade desde a revisão. **Não é gravidade, risco previsto, alerta para o usuário ou projeção meteorológica.**
- O nível GDACS aparece explicitamente **como nível publicado pelo GDACS**, sem deduzir vítimas, extensão do risco ou efeito em Pernambuco.
- Avisos INMET vencidos, registros futuros, eventos vindos de fonte não confirmada, links inseguros e dados antigos não entram na lista de prioridades atuais.
- Historico de notícias precisa de coleta e última consulta bem-sucedida com até duas horas. Monitor mundial precisa de coleta recente com fontes confirmadas; caso contrário é exibido como desatualizado/indisponível.

## Interface e interação
- O Neural Ring ganha uma lista compacta de até 3 prioridades com **links para fontes**, dentro do widget de ativação existente. O celular mantém rolagem limitada para não cobrir o globo.
- Botão **PRIORIDADES** e comandos **alertas prioritários**, **prioridades verificadas**, **resumo contextual**, **relatório contextual** consultam as fontes existentes (sem novas ações externas).
- No despertar, aguarda as duas consultas independentes (histórico e continuidade), com fallback limitado se alguma fonte falhar. Mostra o resumo e não interrompe a narração já existente.
- Atualizações silenciosas recalculam as prioridades. Só se anuncia como **NOVO NO RESUMO** um item ainda não apresentado, quando já existe uma revisão anterior válida.
- A revisão inicial estabelece uma linha de base sem anunciar que eventos antigos acabaram de ocorrer. O armazenamento local guarda no máximo 120 **identificadores públicos e datas** por até sete dias; não armazena comandos, conversas ou informações privadas.

## Limitações
- Eventos próximos ao Brasil não significam impacto no Brasil. Avisos INMET só abrangem regiões explicitamente publicadas.
- Não há monitoramento independente extra quando o navegador está fechado: os Crons existentes continuam sendo a fonte de coleta persistida.
- Dados atuais dependem de fornecedores externos e da implantação do Worker/Cloudflare D1. Validação de dispositivos e publicação em produção são testes separados.
