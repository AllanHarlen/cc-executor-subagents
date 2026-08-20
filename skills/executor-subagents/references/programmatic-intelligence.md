# Programmatic intelligence

Regra operacional:

```text
>= 3 Greps/Reads, loop de arquivos ou comparacao mecanica
  -> script deterministico
  -> JSON compacto + evidenceId
```

Scripts disponiveis:

| Script | Funcao |
|---|---|
| `inspect-diff.mjs` | estatisticas e riscos mecanicos do diff (migration, dependency lock, segredo possivel, TODO novo, artefato de debug) |
| `validate-wire-format.mjs` | payload x JSON Schema ou exemplo de contrato |
| `validate-scope.mjs` | arquivos alterados x ownership declarado (`--own`/`--deny` ou task registrada em `state.json`) |
| `collect-test-results.mjs` | JUnit/TRX/JSON/texto em resumo unico |
| `check-agy-prompt.mjs` | tamanho do prompt AGY contra o limite de 28.000 chars antes de delegar |
| `executor-gates.mjs plan` | lista exata de gates a rodar nas Fases 6/6.5/6.6, dado risco/plano-predefinido/modo-conjunto |

## Baseline de `validate-scope.mjs`

O que conta como "arquivo alterado" depende do modo:

- **Com `--dir` e `--task`** (execucao ativa): working tree **mais** tudo commitado desde o `commitBefore` da task. O `commitBefore` e capturado sozinho no `task --status RUNNING` (nao precisa passar `--commit-before`). Isso e o que faz o gate pegar um agente que **commita** o proprio trabalho — sem esse baseline a working tree fica limpa e o gate reportaria `valid: true` com zero arquivos justamente no caso que ele existe para pegar.
- **Sem `--dir`** (modo stateless, so `--own`/`--deny`): apenas a working tree, a menos que voce passe `--since <sha>` explicitamente.

O `summary.sinceCommit` do resultado diz qual baseline foi usado (`null` = so working tree), entao da para auditar depois se o gate olhou o suficiente.

Todos os scripts de intelligence (nao `executor-gates.mjs`, que so planeja):

- recebem caminhos explicitos e recusam traversal fora do projeto (`PATH_OUTSIDE_PROJECT`);
- limitam arquivos/bytes/output (2 MB por arquivo de texto, 10 MB para resultado de teste, 20.000 arquivos por varredura);
- nao modificam codigo produtivo;
- emitem `{schemaVersion, kind, summary, details, evidenceId, generatedAt}`;
- podem persistir em `{artefatos_dir}/evidence/` quando `--dir` e passado, e anexar o `evidenceId` a uma task registrada via `--task`. Sem `--dir`, rodam em modo stateless (uso avulso, sem execucao ativa).

Exemplo:

```bash
node "${CLAUDE_SKILL_DIR}/scripts/inspect-diff.mjs" \
  --root . --dir .executor/<slug>/artefatos --task codex-1
```

O schema publico e `assets/intelligence-result.schema.json`. O LLM interpreta excecoes e decisoes novas; comparacoes repetiveis ficam no codigo.
