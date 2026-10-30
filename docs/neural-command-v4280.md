# Neural Command v4.28.0

## Comportamento principal

- A esfera holográfica continua controlável em 360° por mouse e Optical Sensor.
- Arquivos não ficam visíveis enquanto o núcleo está fechado.
- Zoom profundo (>= 1.34x), duplo clique ou o botão **ENTRAR NO NÚCLEO** inicia a entrada.
- A esfera fragmenta visualmente e o File Mesh interno aparece com arquivos flutuantes.
- Clicar em um arquivo abre seu conteúdo **dentro do próprio Neural Command**.
- Arquivos do Ultron Core são somente leitura.
- Arquivos da `Ultron_Data` são abertos em componentes editáveis.
- Componentes podem ser arrastados para outro arquivo local.
- Transferências só são aplicadas após confirmação explícita.
- Ao aplicar, o Local Core gera novas versões em `_exports`; os originais permanecem intactos.

## Controles

- Arrastar esfera: rotação 360°.
- Roda do mouse / profundidade da mão: zoom.
- Zoom profundo / duplo clique: entrar no filespace.
- `Esc`: fechar arquivo aberto ou sair do filespace.
- Arrastar componente para um arquivo no painel direito: preparar transferência.
- **APLICAR TRANSFERÊNCIAS**: gerar novas versões seguras.

## Visual

A referência visual oficial está em `assets/neural-command-concept.webp`. O asset é usado como camada ambiental do Neural Command, enquanto a esfera real continua sendo construída e animada em CSS/DOM para preservar a interação 3D.
