# Stack de Agentes

## Papeis

| Papel | Modelo | Subagent type | Quando usar |
|---|---|---|---|
| Executor principal | Claude | voce mesmo | triagem, split, integracao, verificacao, glue pequeno |
| Executor geral | Codex gpt-5.4 medium | `codex:codex-rescue` | codigo, testes, refactor localizado, bugfix |
| Review critico | Codex gpt-5.5 high | `codex:codex-rescue` | risco alto, auth, dados, concorrencia, review final |
| UI visual | Gemini 3 Pro | `cc-gemini-plugin:gemini-agent` | UI/UX complexa quando Gemini estiver disponivel |
| UI simples | Gemini 3 Flash | `cc-gemini-plugin:gemini-agent` | polish visual pequeno quando Gemini estiver disponivel |

Codex e obrigatorio para esta skill. Gemini e opcional: se nao estiver disponivel, use Codex tambem para UI.

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

## Heuristica Gemini

Use Gemini so quando ele acelerar UI:

- layout visual complexo;
- responsividade;
- estados visuais;
- acessibilidade de tela;
- polish com design system.

Nao use Gemini para:

- handoff de falha operacional;
- testes quebrados;
- migrations;
- auth;
- refactor de negocio;
- investigacao de build quebrado.

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
| UI polish isolado | Gemini Flash ou Codex medium |
| feature slice pequena full-stack | 1 Codex full-stack ou 2 agentes se ownership for disjunto |
| investigacao incerta | 1 agente read-only + executor principal inspecionando outra area |
| risco alto | Codex high review antes/depois |

## Regra de ownership

Sempre diga aos agentes que eles nao estao sozinhos no repositorio:

```text
Voce nao esta sozinho no codebase. Outros agentes podem editar outras areas em paralelo. Nao reverta mudancas que voce nao fez. Respeite seu ownership e adapte sua implementacao aos diffs existentes.
```
