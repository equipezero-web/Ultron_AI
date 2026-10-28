# ULTRON LOCAL CORE

O Local Core conecta a interface web do Ultron à pasta privada `Ultron_Data` do seu computador.

## O que ele faz

- indexa documentos e códigos localmente;
- cria embeddings multilíngues;
- grava o índice vetorial em `Ultron_Data/.ultron_index`;
- permite busca semântica;
- abre arquivos encontrados;
- desmembra arquivos em componentes editáveis no HUD;
- remonta uma nova versão em `Ultron_Data/_exports` somente após confirmação;
- nunca sobrescreve o arquivo de origem automaticamente.

## Windows

1. Baixe/clone o repositório no computador.
2. Coloque seus arquivos dentro de `Ultron_Data`.
3. Execute `local-core/start.bat`.
4. Na primeira execução, as dependências e o modelo de embeddings serão instalados.
5. Abra o Ultron e entre no nó `ARQUIVOS`.
6. Use `INDEXAR BASE`.

O serviço fica disponível apenas no próprio computador em:

`http://127.0.0.1:8765`

## Comandos de exemplo

- `Ultron, encontre o relatório que fala sobre consumo de energia.`
- `Ultron, abra o código onde configurei o webhook.`
- `Ultron, desmembre o arquivo do projeto da barbearia.`
- `Ultron, mostre onde está a configuração do banco de dados.`

## Segurança

A raiz é limitada à pasta `Ultron_Data`. Caminhos fora dela são rejeitados pelo serviço. Arquivos pessoais dentro de `Ultron_Data` são ignorados pelo Git através do `.gitignore` da pasta.

A versão inicial extrai texto de PDF, DOCX, XLSX e arquivos de texto/código. Mídias são indexadas inicialmente pelos metadados; análise semântica do conteúdo visual/áudio pode ser adicionada como uma segunda camada.
