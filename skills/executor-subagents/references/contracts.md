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

## Template curto

```markdown
# Interface Contract - <demanda>

## Endpoint / fluxo
- Metodo e rota:
- Request:
- Response:
- Erros esperados:
- Permissoes:

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

## Regra

Se a nota mudou, avise todos os agentes afetados. Nao deixe um agente alterar payload unilateralmente e seguir como se nada tivesse acontecido.
