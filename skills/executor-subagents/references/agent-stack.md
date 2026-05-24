# Stack de Agentes

## Papeis

| Papel | Modelo | Subagent type | Quando usar |
|---|---|---|---|
| Executor principal | Claude | voce mesmo | triagem, split, integracao, verificacao, glue pequeno |
| Executor geral | Codex gpt-5.4 medium | `codex:codex-rescue` | codigo, testes, refactor localizado, bugfix |
| Review critico | Codex gpt-5.5 high | `codex:codex-rescue` | risco alto, auth, dados, concorrencia, review final |
| UI visual | Codex gpt-5.4 medium | `codex:codex-rescue` | UI/UX complexa com prompt especializado |
| Analise cross-file | AGY gemini-3.5-flash-medium | `cc-antigravity-plugin:antigravity-agent` | arquitetura, impacto de refactor, orientacao de codebase |
| Analise profunda | AGY gemini-3.1-pro-low | `cc-antigravity-plugin:antigravity-agent` | analise complexa com raciocinio profundo |

Codex e obrigatorio para esta skill. Antigravity (AGY) e opcional: se nao estiver disponivel, prossiga sem a fase de analise cross-file. UI e sempre feita com Codex.

## Heuristica Codex

Use `gpt-5.4-codex --effort medium` para:

- implementar patches;
- corrigir testes;
- atualizar docs tecnicas;
- refactors localizados;
- criar ou ajustar validacoes;
- investigar causa raiz quando a area e clara.

Use `gpt-5.5-codex --effort high` para:

- revisar diffs com risco;
- auth/autorizacao;
- migrations e integridade de dados;
- concorrencia/performance sensivel;
- refactor amplo;
- investigacao dificil quando medium falhou.

## Heuristica Antigravity (AGY)

Use Antigravity quando a analise pre-execucao acelerar a entrega:

- mapear arquitetura antes de refactor amplo;
- analisar impacto cross-file de uma mudanca;
- orientar-se em codebase desconhecido;
- review de seguranca cross-file;
- sintetizar documentacao de muitos arquivos.

Nao use Antigravity para:

- implementacao de codigo (use Codex);
- implementacao de UI (use Codex);
- edicao localizada;
- debugging interativo;
- testes quebrados;
- handoff de falha operacional.

## Context7

Se a task envolve biblioteca, framework, SDK, API, CLI ou cloud service:

- use Context7 se estiver disponivel no preflight;
- instrua os agentes a consultar docs atuais;
- se nao estiver disponivel, registre que seguiram pelos padroes locais.

## Escolha rapida

| Demanda | Melhor rota |
|---|---|
| bug simples em um modulo | 1 Codex medium |
| bug + testes em arquivos separados | 2 Codex medium em paralelo |
| UI polish isolado | Codex medium com prompt UI |
| Mapear impacto antes de refactor | 1 Antigravity + execucao com Codex |
| feature slice pequena full-stack | 1 Codex full-stack ou 2 agentes se ownership for disjunto |
| investigacao incerta | 1 agente read-only + executor principal inspecionando outra area |
| risco alto | Codex high review antes/depois |

## Regra de ownership

Sempre diga aos agentes que eles nao estao sozinhos no repositorio:

```text
Voce nao esta sozinho no codebase. Outros agentes podem editar outras areas em paralelo. Nao reverta mudancas que voce nao fez. Respeite seu ownership e adapte sua implementacao aos diffs existentes.
```
