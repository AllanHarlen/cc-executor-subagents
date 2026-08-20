# Contexto de MCP

O Executor usa um MCP opcional: **Context7**. Diferente do Orchestrador, ele nao usa Codebase Memory MCP nesta fase do port — o Executor e uma execucao curta, e o custo de indexar/consultar um grafo do repositorio nao se paga no tempo de uma resolucao rapida. Para impacto de diff e busca cross-file, use os scripts deterministicos de `references/programmatic-intelligence.md` (`inspect-diff.mjs`, `rg`/`grep` diretos).

Regra universal: resultado de MCP e **evidencia corroborativa**, nunca prova isolada. Nao feche uma task `DONE` so porque o MCP "confirmou" algo — a evidencia real continua sendo arquivo produzido, teste passando ou delta de commit (ver `references/persistent-state.md`, invariante 4).

## Context7

`checks.optional.mcp.context7.ok` no relatorio de preflight indica se esta disponivel. Ausencia nunca bloqueia (`warnings`, nao `failed`).

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

Quando `implementation-report.md` (Fase 9) tiver uma secao de preflight, registre se Context7 estava disponivel e se foi usado. Nao registre conteudo de documentacao retornada, apenas que a consulta aconteceu.
