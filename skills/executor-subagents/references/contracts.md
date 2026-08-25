# Contrato de Interface

Em tasks full-stack onde um agente produz dados/API e outro os consome, o risco de divergencia de contrato e real. O executor cria `{artefatos_dir}/interface-contract.md` **antes de delegar** nesse caso. Todos os agentes recebem o contrato no prompt e nao podem alterar os campos acordados unilateralmente.

## Quando criar o contrato (obrigatorio)

Crie `{artefatos_dir}/interface-contract.md` quando **todas** as condicoes abaixo forem verdadeiras:

- dois ou mais agentes participam da wave;
- ao menos um deles produz dados (endpoint, payload, tipo) que outro consome;
- o shape da interface nao esta inteiramente pre-existente no codigo.

## Quando nao criar

Nao crie se a task e puramente visual, teste-only, docs-only, ou consome API ja existente sem mudar shape.

## Regra de alteracao durante execucao

Se um agente precisar divergir do contrato, ele deve:

1. registrar a divergencia com justificativa no retorno;
2. **nao implementar** a mudanca de contrato sem aprovacao do executor;
3. aguardar o executor decidir se atualiza o contrato e notifica os outros agentes afetados.

## Regra de wire format

Todo contrato com payload cruzando a fronteira front-back precisa declarar:

- convencao de casing do JSON exposto (`camelCase`, `PascalCase` ou `snake_case`) — nao presuma que bate com o casing interno do backend;
- DTO/modelo interno vs JSON exposto, quando forem diferentes;
- exemplos completos de request/response com o payload real, nao so os tipos;
- como validar a serializacao real contra o consumidor TypeScript (nao basta o nome do tipo bater, o shape serializado precisa bater).

Use `node "${CLAUDE_SKILL_DIR}/scripts/validate-wire-format.mjs" --payload <payload.json> --contract {artefatos_dir}/interface-contract.md` (ou `--schema <schema.json>` quando houver um JSON Schema) para provar isso em vez de so descrever — ver `references/programmatic-intelligence.md`.

## Regra especial para C# + TypeScript

Quando o backend e C#/.NET e o front-end e TypeScript, o risco concreto e casing divergente entre o DTO interno (`PascalCase` por convencao do C#) e o payload que o TypeScript espera (`camelCase` por convencao do JS/TS). O contrato precisa declarar, explicitamente:

- se ha configuracao global de serializacao (`JsonNamingPolicy.CamelCase` ou equivalente) ou se o casing e por atributo (`[JsonPropertyName("...")]`) campo a campo;
- se o TypeScript consumidor foi validado contra o payload **real** serializado pela rede, nao so contra o nome do tipo/interface.

## Validacao cruzada obrigatoria

Antes de fechar a task, confirme:

- [ ] endpoint e metodo HTTP concretos (nao "TBD");
- [ ] request fechado (todos os campos, tipos e obrigatoriedade);
- [ ] response fechado (todos os campos, tipos e obrigatoriedade);
- [ ] wire format documentado (secao acima);
- [ ] casing JSON documentado;
- [ ] exemplos completos de request/response;
- [ ] validacao da serializacao real registrada (nao so o nome do tipo bate — o payload bate);
- [ ] status codes de erro mapeados;
- [ ] permissoes/autorizacao definidas;
- [ ] estados de UI cobertos (loading/empty/error/success);
- [ ] validacoes de front-end e back-end alinhadas (mesma regra dos dois lados, sem duplicidade divergente).

## Template curto

```markdown
# Interface Contract - <demanda>

## Endpoint / fluxo
- Metodo e rota:
- Request:
- Response:
- Erros esperados:
- Status codes:
- Permissoes:

## Wire format
- Casing do JSON:
- DTO interno vs JSON exposto:
- Validacao da serializacao real:

## UI states
- Loading:
- Empty:
- Error:
- Success:

## Decisoes fechadas
- Campo X chama `...`, nao `...`.

## Pendencias
- Nenhuma.
```

## Regra de alteracao

Se a nota mudou, avise todos os agentes afetados. Nao deixe um agente alterar payload unilateralmente e seguir como se nada tivesse acontecido.
