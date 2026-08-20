# Paralelizacao Rapida

Paralelizar e bom quando reduz tempo sem criar conflito. O objetivo nao e usar muitos agentes; e fazer trabalho independente acontecer ao mesmo tempo.

## Duas camadas de paralelismo

O executor opera em duas camadas distintas. Escolha a certa para cada situacao.

### Camada Claude — waves

Lanca varios subagentes `antigravity-coder` (implementacao), `antigravity-agent` (analise read-only) e/ou `codex:codex-rescue` em paralelo no mesmo bloco de ferramentas.

Use quando:

- a wave mistura dominios (AGY + Codex);
- voce precisa de ownership, monitoramento e formato de retorno por fatia;
- cada slice tem criterio de aceite independente que voce quer rastrear.

### Fan-out nativo do AGY (`--parallel`)

Um unico `antigravity-coder` com `--parallel` (implementacao — o fan-out gera arquivos, entao usa o agente com poder de escrita). O AGY decompoe a tarefa em subtarefas Gemini nativas (`DefineSubagent`/`invoke_subagent`/`ManageSubagents`), executa em paralelo, agrega os resultados e reporta os Conversation IDs de cada subagente.

Use quando:

- todos os entregaveis sao de dominio AGY;
- os entregaveis sao independentes entre si (ex.: varios relatorios HTML, tres componentes React sem interface compartilhada);
- nao ha dependencia de estado ou arquivo entre os entregaveis;
- voce quer economizar spawns e potencialmente usar `--subagent-model` mais barato.

Nao use quando:

- a wave mistura AGY e Codex — use waves na camada Claude;
- os entregaveis compartilham estado ou dependem uns dos outros;
- voce precisa de monitoramento ou formato de retorno por fatia (o relatorio vira do AGY agregado).

`--parallel` e mutuamente exclusivo com `--generate-image` (o bridge ignora `--parallel` nesse caso, com log).

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

Nao ha limite fixo de agentes por wave. O limite e o ownership: lance tantos agentes quantas forem as fatias verdadeiramente independentes.

Orientacoes praticas:

- 1 agente: patch medio em area unica;
- 2 agentes: melhor custo/beneficio para bug + teste, front + backend independente, investigacao + patch;
- 3-5 agentes: bom para repos com slices claros em multiplos modulos;
- 6-10 agentes: adequado para repos grandes com dominios disjuntos bem definidos (ex.: microservicos, monorepos com pacotes separados);
- 10+ agentes: use waves sequenciais quando houver dependencia entre grupos de slices, ou lance tudo em paralelo se ownership for totalmente disjunto;
- sem teto: se a tarefa tiver N slices independentes, lance N agentes. O criterio e ausencia de conflito de arquivo, nao um numero maximo.

## Padrao recomendado

```text
Wave 1 (todos os agentes independentes em paralelo):
- Agent A: investigar causa raiz e propor patch, read-only ou ownership modulo X
- Agent B: implementar correcao no modulo Y
- Agent C: ajustar testes especificos
- Agent D: atualizar documentacao tecnica afetada
- Agent E: revisar impacto cross-file em modulo Z
- ... (quantos slices disjuntos existirem)

Executor principal:
- acompanha diffs;
- integra glue;
- roda verificacoes;
- decide se precisa Wave 2 para slices dependentes da Wave 1.
```

Para tarefas grandes, o padrao e: identificar todos os slices independentes → lancar todos na Wave 1 → apos integracao, identificar slices que dependiam dos resultados da Wave 1 → lancar Wave 2 → repetir.

## Sinais de que paralelizou demais

- dois agentes querem editar o mesmo arquivo;
- os retornos dizem "preciso esperar outro agente";
- ninguem tem criterio de aceite proprio;
- voce gastou mais tempo explicando ownership do que levaria para editar;
- a integracao virou um segundo projeto.

Quando isso acontecer, reduza a wave e centralize o arquivo compartilhado em um unico agente ou no executor principal.
