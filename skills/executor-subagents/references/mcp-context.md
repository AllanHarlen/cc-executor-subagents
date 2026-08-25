# Contexto de MCP

O Executor usa dois MCPs opcionais: **Codebase Memory** (grafo de codigo) e **Context7** (documentacao atual). Os dois seguem a mesma regra: ausencia nunca bloqueia — `checks.optional.mcp.<servidor>.ok` vira `warnings`, nunca `failed` — e, quando ausente, o Dependency_Installor da Fase 0 oferece a instalacao por `AskUserQuestion` antes de seguir (ver `references/project-config.md`, secao Dependency_Installer, e `references/workflow.md` Fase 0). Nenhum dos dois altera o `status` do preflight.

Regra universal: resultado de MCP e **evidencia corroborativa**, nunca prova isolada. Nao feche uma task `DONE` so porque o MCP "confirmou" algo — a evidencia real continua sendo arquivo produzido, teste passando ou delta de commit (ver `references/persistent-state.md`, invariante 4).

### `checks.optional.mcp` e agregado por arquivo; `checks.optional.mcpPerAgent` e por agente e ao vivo

`checks.optional.mcp.<servidor>.ok` vem de uma varredura de arquivo que nao distingue para qual CLI o MCP esta de fato registrado — `ok: true` pode significar so que o Claude Code local tem o servidor, sem que Codex ou AGY o tenham. Antes de prometer a ferramenta no prompt de uma task Codex/AGY (Fase 4), prefira `checks.optional.mcpPerAgent.<agent>.<servidor>`, obtido rodando `codex mcp list --json`/`agy mcp list` de verdade (ver `scripts/lib/mcp-agent-cli.mjs`). Esse bloco so existe no relatorio quando o preflight roda com `--check-agent-mcp` — e opt-in porque tem custo real de subprocesso.

```text
antes de incluir o placeholder de Codebase Memory/Context7 no prompt de uma task Codex/AGY:
  se checks.optional.mcpPerAgent existir:
    usar checks.optional.mcpPerAgent.<agent>.<servidor>.ok
      checked: true, ok: true  -> inclua a instrucao
      checked: true, ok: false -> NAO inclua (servidor nao registrado/desabilitado nesse agente)
      checked: false           -> nao e prova de ausencia -> caia para checks.optional.mcp.<servidor>.ok
  senao:
    usar checks.optional.mcp.<servidor>.ok (agregado, mais fraco, mas e o unico sinal disponivel)
```

### Oferta de instalacao por agente (mesmo padrao do Open Design)

Quando `checks.optional.mcpPerAgent.<agent>.<servidor>` chega com `checked: true, ok: false` — o CLI daquele agente respondeu de verdade e o servidor genuinamente nao esta registrado ali — o campo `install` traz o comando exato de registro (`mcp-agent-install.mjs`, confirmado ao vivo: `codex mcp add context7 --url https://mcp.context7.com/mcp`, `agy mcp add codebase-memory-mcp codebase-memory-mcp`, etc.). Isso **nunca** dispara sozinho. Mesmo padrao do Open Design (ver `references/open-design.md` do cc-pensador, secao Fallback): oferecer via `AskUserQuestion`.

```text
[Executor | Fase 0/4] O <servidor> nao esta registrado no <agent>.
Registrar agora deixa a task usar a ferramenta em vez do fallback deterministico.

Opcao A (recomendada): Registrar via `<comando de install>`
  O Executor roda o comando de registro no CLI do <agent> e confirma com um novo check.

Opcao B: Seguir sem registrar
  A task roda pelo caminho deterministico (grafo/documentacao ausente para esse agente).
```

Se o usuario aprovar a Opcao A: rode `installAgentMcp(agent, server)` de `mcp-agent-install.mjs` (nunca construa o comando a mao), depois **re-verifique** com `detectAgentMcpServers`/um novo `--check-agent-mcp` antes de prometer a ferramenta no prompt do subagente — nao assuma sucesso so porque o comando nao lancou erro. Registre a decisao e o resultado no relatorio de fechamento. Nunca chame `installAgentMcp` a partir do prompt de um subagente Codex/AGY: e o Executor principal quem roda o comando, sempre depois da confirmacao do usuario.

⚠️ `installAgentMcp` **sobrescreve** um registro existente do mesmo nome (`mcp add` e "add or update", confirmado ao vivo no AGY). So ofereca a Opcao A quando `checked: true, ok: false` — nunca quando `ok: true` ja, e nunca para "corrigir" uma configuracao existente sem o usuario pedir explicitamente, para nao substituir silenciosamente uma entrada que o usuario configurou com opcoes proprias (ex.: uma chave de API do Context7 ja embutida no comando).

## Parte 1 — Codebase Memory

`checks.optional.mcp["codebase-memory"].ok` no relatorio de preflight indica se esta disponivel.

O Orchestrador usa o grafo em quatro fases de um run longo (ingestao da spec, classificacao de tasks, contratos, integracao). O Executor e uma execucao curta e unica: usa o mesmo servidor, mas so nas duas fases onde o grafo paga o custo de consultar antes de varrer arquivos.

### Gate de indice antes de qualquer uso

Antes de qualquer consulta valer como evidencia, chame `index_status` para o projeto atual:

```text
index_status
  |- sem indice para este projeto
  |    -> a oferta de indexar ja aconteceu no Dependency_Installer da Fase 0 (instalar o servidor
  |       nao indexa o repositorio); se o usuario nao indexou ainda, pergunte por AskUserQuestion
  |       antes da Fase 1: "Indexar o repositorio agora?" -> index_repository na raiz do projeto -> segue
  |       seguir sem indexar -> Read/Glob/Grep na Fase 1, inspect-diff.mjs/rg na Fase 5
  |- indice existente e sem pendencia para os arquivos consultados (fresco)
  |    -> grafo liberado para as consultas abaixo
  \- indice existente com reindexacao pendente
       -> trate como nao-fresco: use o grafo so como pista e confirme por leitura de arquivo
```

Nunca dispare `index_repository` por conta propria: indexar varre o repositorio inteiro e e decisao do usuario.

### Onde usa, nas fases que ja existem

| Fase | Ferramentas | Uso |
|---|---|---|
| 1 - Triagem | `search_graph`, `trace_path`, `get_code_snippet` | localizar o simbolo citado na demanda, quem o chama e o que ele chama, antes de (ou em vez de) varrer arquivos com Read/Glob/Grep |
| 5 - Integracao | `detect_changes` | mapear o diff da execucao aos simbolos afetados e ao raio de impacto, antes de decidir o alcance da Fase 6/6.5/6.6 |

Sem equivalente as fases de "ingestao de spec"/"contratos" do Orchestrador (`get_architecture`/`get_graph_schema`, panorama do repo inteiro): o Executor nao ingere PRD/spec, e esse par de ferramentas e caro demais para uma resolucao rapida — fora de escopo aqui.

### Limite de 30s por consulta

Cada consulta ao Codebase Memory tem orcamento de **30 segundos**. Consulta que retorna erro ou estoura esse limite:

1. registre a falha (ferramenta, fase, motivo) — no `implementation-report.md` (Fase 9) quando a secao de preflight existir;
2. siga pela alternativa deterministica da fase (`Read`/`Glob`/`Grep` na Fase 1, `inspect-diff.mjs`/`rg` na Fase 5);
3. prossiga com o workflow.

Nao repita a mesma consulta em loop. Duas falhas seguidas do mesmo servidor: trate o Codebase Memory como ausente pelo resto desta execucao e registre isso uma unica vez.

### Lacuna de cobertura: leia o arquivo

Quando o grafo reporta lacuna de cobertura para um arquivo consultado — fora do indice, linguagem nao suportada, parse parcial, resultado vazio para caminho que existe no disco —, **leia esse arquivo diretamente antes de afirmar ausencia** de simbolo, chamada ou referencia. Grafo silencioso nao e prova de inexistencia.

### Prompt para subagente

Ao delegar uma task da Fase 4 com o Codebase Memory disponivel, e quando o Executor daquela task tem acesso ao servidor (herdado da sessao para `claude-code`; verifique a evidencia de configuracao do agente para `codex`/`agy` antes de prometer a ferramenta):

```text
Contexto de codigo por MCP (codebase-memory):
- Antes de varrer arquivos, use search_graph / trace_path / get_code_snippet para localizar
  o simbolo, quem o chama e o que ele chama.
- Grafo e pista, nao prova: confirme por leitura do arquivo antes de alterar comportamento.
- Se o grafo nao cobrir o arquivo, ou a consulta falhar, leia o arquivo diretamente.
- Fique dentro do escopo da task mesmo que o grafo aponte para fora dele.
```

## Parte 2 — Context7

`checks.optional.mcp.context7.ok` no relatorio de preflight indica se esta disponivel.

**Quando usar:** a task envolve biblioteca, framework, SDK, API, CLI ou cloud service — implementacao, debug ou migracao de versao.

**Protocolo, nesta ordem estrita — nunca pule o passo 1:**

1. `resolve-library-id` com o nome da biblioteca e a pergunta/tarefa concreta.
2. Escolha o melhor match por: nome exato, relevancia da descricao, contagem de snippets, reputacao da fonte (High/Medium preferida), score do benchmark.
3. `query-docs` com o ID resolvido e a pergunta completa (nao uma palavra isolada).
4. Implemente usando a doc retornada; cite no retorno do subagente quais docs foram consultadas.

Passe a versao fixada do projeto (`package.json`/`*.csproj`/lockfile) quando a biblioteca tiver breaking changes entre versoes — sem isso, o Context7 pode devolver docs de uma versao diferente da instalada.

**Prompt para subagente:**

```text
Se a task envolver biblioteca/framework/SDK/API/CLI/cloud service e Context7 estiver disponivel:
1. resolve-library-id com o nome da lib e a tarefa.
2. Escolha o melhor match (nome exato, relevancia, snippets, reputacao).
3. query-docs com o ID e a pergunta completa.
4. Implemente usando a doc retornada; cite as docs consultadas no retorno.
Se Context7 nao estiver disponivel, siga os padroes ja presentes no codigo e registre a limitacao no retorno.
```

**Erro de autenticacao:** oriente `npx ctx7 setup --claude`. **Chave de API:** nunca em prompt, artefato de execucao ou log — fica exclusivamente na configuracao do usuario.

## Registro

Quando `implementation-report.md` (Fase 9) tiver uma secao de preflight, registre se Codebase Memory e Context7 estavam disponiveis e se foram usados — inclua, para o Codebase Memory, qualquer consulta que falhou ou estourou os 30s e o caminho deterministico usado no lugar. Nao registre conteudo bruto de resposta de MCP nem conteudo de documentacao retornada, apenas que a consulta aconteceu.
