# Ultron_Data

Esta pasta é a base local de conhecimento do Ultron.

Coloque aqui, no seu computador, os arquivos que o Ultron poderá indexar e pesquisar semanticamente: documentos, PDFs, códigos, planilhas e mídias suportadas.

## Privacidade

O `.gitignore` desta pasta impede que os seus arquivos pessoais sejam enviados ao repositório público por padrão. Não remova essa proteção sem saber exatamente o que está fazendo.

## Estrutura sugerida

```text
Ultron_Data/
├── projetos/
├── documentos/
├── codigo/
├── planilhas/
├── imagens/
├── videos/
└── _exports/
```

O serviço `local-core` usa esta pasta como raiz segura. Ele não deve varrer caminhos fora dela.
