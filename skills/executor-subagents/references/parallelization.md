# Paralelizacao Rapida

Paralelizar e bom quando reduz tempo sem criar conflito. O objetivo nao e usar muitos agentes; e fazer trabalho independente acontecer ao mesmo tempo.

## Unidade de paralelismo

A unidade padrao e um **slice com ownership claro**:

- modulo ou pasta;
- arquivo/grupo de arquivos;
- camada isolada;
- conjunto de testes;
- investigacao read-only;
- review de risco.

Evite dividir por "back-end vs front-end" automaticamente. Divida pelo que pode ser terminado e verificado sem esperar outro agente.

## Pode paralelizar

- arquivos disjuntos;
- testes separados da implementacao;
- investigacao read-only em paralelo com patch;
- UI polish isolado enquanto Codex corrige logica;
- docs/reporte enquanto testes rodam;
- review independente depois que um patch existe.

## Nao paralelize

- mesmo arquivo central;
- mesma migration/schema;
- mesma configuracao global;
- auth/autorizacao compartilhada;
- refactor que muda assinaturas usadas por outros agentes;
- task que depende de decisao ainda aberta;
- dois agentes tentando "arrumar os testes" genericamente.

## Tamanho da wave

Use como padrao:

- 1 agente: patch medio em area unica;
- 2 agentes: melhor custo/beneficio para bug + teste, front + backend independente, investigacao + patch;
- 3 agentes: bom para repos medios com slices claros;
- 4-5 agentes: apenas se ownership for realmente disjunto;
- 6+ agentes: raramente vale, divida em waves.

## Padrao recomendado

```text
Wave 1:
- Agent A: investigar causa raiz e propor patch, read-only ou ownership modulo X
- Agent B: implementar correcao no modulo Y
- Agent C: ajustar testes especificos

Executor principal:
- acompanha diffs;
- integra glue;
- roda verificacoes;
- decide se precisa Wave 2.
```

## Sinais de que paralelizou demais

- dois agentes querem editar o mesmo arquivo;
- os retornos dizem "preciso esperar outro agente";
- ninguem tem criterio de aceite proprio;
- voce gastou mais tempo explicando ownership do que levaria para editar;
- a integracao virou um segundo projeto.

Quando isso acontecer, reduza a wave e centralize o arquivo compartilhado em um unico agente ou no executor principal.
