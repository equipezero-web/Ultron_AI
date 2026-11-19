# J.A.R.V.I.S. — Homologação progressiva e observação de produção

## Por que o painel exibia 0/60?
O relatório contava **capacidades integralmente homologadas**, não capacidade de código. O CI anterior também continha uma asserção que obrigava o número de aprovadas a permanecer em zero. Essa trava foi removida. O contrato de aceitação agora é o mesmo no navegador e nos testes.

**Progresso de código ≠ testes unitários ≠ publicação ≠ testes reais ≠ homologação integral**. Os seis registros com evidências parciais não representam as únicas funções implementadas.

## Contrato de aceitação
O arquivo canônico continua em `data/jarvis-100-acceptance-manifest.json`, com 60 capacidades, 5 áreas e a sequência de 6 etapas estabelecida pelo operador.

Uma capacidade pode receber `acceptance: "accepted"` somente quando `checks.code`, `checks.ci`, `checks.production` e `checks.physical` possuem evidências válidas. Cada comprovante requer:

- `state: "verified"` (ou `"not-applicable"` **somente em physical**);
- URL HTTPS do resultado/auditoria, escopo específico, data UTC verificável e identificador do revisor;
- prova não mais antiga que 90 dias;
- justificativa explícita para `physical: "not-applicable"` quando uma capacidade não depende de aparelho físico.

Exemplo de **formato, com valores demonstrativos que não devem ser copiados como provas reais**:

```json
{
  "state": "verified",
  "url": "https://github.com/EXEMPLO/REPOSITORIO/actions/runs/123",
  "verifiedAt": "2026-11-19T14:00:00Z",
  "reviewer": "revisor-tecnico",
  "scope": "Teste de cenário operacional da capacidade realizado integralmente."
}
```

**A validação do formato da evidência não autentica o conteúdo da URL.** Um revisor deve inspecionar a execução original e confirmar o escopo antes de aprovar. Nenhuma PR recebe automaticamente aceitação integral.

## Verificação pública automatizada

O workflow `.github/workflows/jarvis-production-observation.yml` executa após alterações relevantes na `main`, manualmente ou a cada seis horas:

- compara os hashes SHA-256 do HTML, manifest e módulos publicados via GitHub Pages com os arquivos atuais no repositório;
- verifica o contrato público `GET /api/health` do Cloudflare Worker e sua política de áudio desligado;
- envia **somente um POST anônimo inofensivo** para a rota de execução de inteligência e exige rejeição 401 com `account-login-required`;
- registra, mesmo em falha, `jarvis-production-proof.json` como artefato do GitHub Actions e resumo por verificação.

Uma falha de DNS, versão publicada diferente, configuração incompleta do Cloudflare Access (503), saída de voz ativa ou endpoint sem negação de acesso **deve reprovar** a observação, em vez de produzir uma declaração de sucesso.

### O que a observação não consegue confirmar
A observação pública não dispõe de credenciais Cloudflare Access e não testa respostas com JWT válido, D1, painel WebGL, câmera ao vivo, arquivos, dispositivos físicos, assinaturas ou autorizações destrutivas. Ela **não eleva automaticamente o número de capacidades homologadas**. O aparelho Android, PC e TV requerem testes consentidos e evidências próprias.

## Comando no painel
`Jarvis, progresso das 60 capacidades`

A mensagem passa a explicar que **zero homologadas não significa zero implementadas**, e apresenta somente as evidências atualmente registradas.

O modo **texto somente** continua aplicado. Não modificar nem reativar voz, microfone, escuta ou Voice Match.
