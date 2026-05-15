# Notas de Interface

Este executor nao exige contrato API/UI formal. Para resolucoes rapidas, use **notas de interface** somente quando houver risco real de back-end e UI divergirem.

## Quando escrever notas

Escreva uma nota curta em `.executor/interface-notes.md` quando:

- uma mudanca full-stack define endpoint, payload ou status code novo;
- dois agentes vao tocar produtor e consumidor de dados;
- ha risco de divergencia de nome de campo;
- permissoes, erros ou loading states importam para o aceite.

Nao escreva se a task e puramente visual, teste-only, docs-only, ou consome API ja existente sem mudar shape.

## Template curto

```markdown
# Interface Notes - <demanda>

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
