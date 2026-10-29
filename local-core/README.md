# ULTRON LOCAL CORE v2

O Local Core conecta a interface web do Ultron à pasta privada `Ultron_Data` do computador e transforma os arquivos em uma base local pesquisável pelo Neural Command.

## O que ele faz agora

- indexa documentos, planilhas, apresentações, códigos e metadados de mídia localmente;
- cria embeddings multilíngues e mantém o índice vetorial em `Ultron_Data/.ultron_index`;
- usa busca **híbrida**: semântica + nome/caminho/conteúdo;
- sincroniza alterações da pasta automaticamente enquanto `start.bat` estiver rodando;
- remove do índice arquivos que deixaram de existir;
- permite reindexação por arquivo ou da base inteira;
- abre arquivos encontrados no sistema operacional;
- desmembra arquivos em componentes editáveis no HUD/File Lab;
- mantém contexto do **arquivo ativo**, permitindo comandos como `analise isso` ou `melhore essa parte`;
- passa o contexto RAG para a IA separadamente da mensagem original, mantendo memória/histórico limpos;
- remonta versões novas em `Ultron_Data/_exports` somente após confirmação;
- exporta formatos válidos para texto/código, DOCX, XLSX, PDF e PPTX;
- indexa a versão exportada novamente para ela aparecer no RAG e no File Mesh;
- nunca sobrescreve o arquivo de origem automaticamente.

## Formatos

Leitura de conteúdo:

- texto/código: TXT, MD, HTML, CSS, JS/TS, JSON, YAML, SQL, Python, Java, C/C++, C#, Go, Rust, PHP, shell e outros formatos textuais;
- documentos: PDF e DOCX;
- planilhas: XLSX, XLSM, CSV e TSV;
- apresentações: PPTX;
- imagens: PNG, JPG/JPEG, WEBP, GIF, BMP, TIFF e SVG;
- áudio/vídeo: metadados seguros; quando `ffprobe` estiver instalado, duração, dimensões e codec também podem ser coletados.

A camada Local RAG não inventa interpretação visual ou transcrição de áudio/vídeo. Nesses formatos, sem um analisador multimodal adicional, o índice usa metadados reais do arquivo.

## Windows

1. Baixe ou clone o repositório no computador.
2. Coloque os arquivos dentro de `Ultron_Data`.
3. Execute `local-core/start.bat`.
4. Na primeira execução, as dependências e o modelo de embeddings serão instalados.
5. Abra o Ultron e entre no nó `ARQUIVOS`.
6. Autorize o acesso à rede local/loopback caso o Chrome solicite.

O serviço fica disponível somente no computador em:

`http://127.0.0.1:8765`

Depois de conectado, o watcher local verifica mudanças periodicamente. O botão `INDEXAR BASE` continua disponível para sincronização manual imediata e `REINDEXAR TUDO` força reconstrução completa.

## Exemplos

- `Ultron, encontre o relatório que fala sobre consumo de energia.`
- `Ultron, abra o código onde configurei o webhook.`
- `Ultron, desmembre o arquivo do projeto da barbearia.`
- `Ultron, mostre onde está a configuração do banco de dados.`
- Abra um arquivo no File Lab e diga: `Ultron, analise isso.`
- Com um componente ativo: `Ultron, melhore essa parte sem alterar o original.`

## Segurança

A raiz do serviço é restrita à pasta `Ultron_Data`. Caminhos fora dela são rejeitados. Arquivos pessoais em `Ultron_Data` permanecem fora do Git pelo `.gitignore` da pasta.

Edições e remontagens geram **novas versões** em `_exports`; o arquivo de origem não é sobrescrito pelo Local Core.

## APIs principais

- `GET /health` — estado e capacidades;
- `GET /stats` — arquivos, vetores e sincronização;
- `POST /index` — índice incremental ou completo;
- `POST /index/file/{file_id}` — reindexa um arquivo;
- `POST /index/remove/{file_id}` — remove somente do índice;
- `POST /search` — busca híbrida, inclusive restrita ao arquivo ativo;
- `POST /command` — interpreta ações locais;
- `GET /file/{file_id}` — preview;
- `GET /file/{file_id}/split` — componentes editáveis;
- `GET /file/{file_id}/versions` — versões exportadas;
- `POST /file/{file_id}/open` — abre no sistema;
- `POST /compose/export` — gera nova versão segura.
