# Stack de Agentes

## Papeis

| Papel | Modelo | Subagent type | Quando usar |
|---|---|---|---|
| Executor principal | Claude | voce mesmo | triagem, split, integracao, verificacao, glue pequeno e alinhamento com o usuario |
| Executor geral | Codex gpt-5.4 medium | `codex:codex-rescue` | backend, testes, refactor localizado, bugfix, integracao tecnica |
| Review critico | Codex gpt-5.5 high | `codex:codex-rescue` | risco alto, auth, dados, concorrencia, review final |
| UI/front-end | AGY gemini-3.5-flash-medium | `cc-antigravity-plugin:antigravity-agent` | tarefas front-end do dia a dia, componentes, layouts, estados e polish visual |
| UI/front-end complexa | AGY gemini-3.1-pro-high | `cc-antigravity-plugin:antigravity-agent` | redesign mais complexo, fluxos visuais grandes, UX com mais ambiguidade |
| Analise cross-file | AGY read-only | `cc-antigravity-plugin:antigravity-agent` | arquitetura, impacto de refactor, orientacao de codebase |
| Imagem/asset | AGY nano-banana | `cc-antigravity-plugin:antigravity-agent` | mockups, assets, ilustracoes e pedidos explicitos de imagem |

Codex e AGY sao obrigatorios para esta skill. O executor depende de Codex para backend, testes e review, e depende de AGY 3.5.4+ para front-end, imagem e contexto largo.

## Heuristica Codex

Use `gpt-5.4-codex --effort medium` para:

- implementar backend e glue code;
- corrigir testes;
- atualizar docs tecnicas;
- refactors localizados;
- investigar causa raiz quando a area e clara.

Use `gpt-5.5-codex --effort high` para:

- revisar diffs com risco;
- auth/autorizacao;
- migrations e integridade de dados;
- concorrencia/performance sensivel;
- refactor amplo em areas criticas;
- investigacao dificil quando medium falhou.

## Heuristica Antigravity (AGY)

Use `--model gemini-3.5-flash-medium` para:

- UI/front-end do dia a dia;
- componentes e estados comuns;
- ajustes visuais e responsividade;
- tarefas multi-arquivo que pedem contexto largo, mas sem profundidade maxima.

Use `--model gemini-3.1-pro-high` para:

- UI/front-end complexa;
- fluxos visuais com muitas dependencias;
- decisoes de UX com mais incerteza;
- tarefas com contexto amplo e raciocinio mais pesado.

Use `--read-only` para:

- mapear arquitetura antes de refactor;
- analisar impacto cross-file;
- orientar-se em codebase desconhecido;
- review de seguranca cross-file;
- sintetizar documentacao de muitos arquivos.

Use `--generate-imagem` para:

- mockups ou assets pedidos explicitamente pelo usuario;
- imagens guiadas por arquivos de referencia via `--files`;
- saida em diretorio especifico via `--output-dir` quando houver destino claro.

## Falhas do AGY

O bridge do `cc-antigravity-plugin` pode emitir sinais brutos `QUOTA_EXAUSTED`, `AUTH_REQUIRED`, `TIMEOUT` e `AGY_MISSING`. No contexto do executor:

- normalize `QUOTA_EXAUSTED` para `QUOTA_EXHAUSTED`;
- registre o sinal bruto como evidencia;
- pause antes de fallback e pergunte ao usuario se quer remediar, seguir so com Codex, ou cancelar.

## Context7

Se a task envolve biblioteca, framework, SDK, API, CLI ou cloud service:

- use Context7 se estiver disponivel no preflight;
- instrua os agentes a consultar docs atuais;
- se nao estiver disponivel, registre que seguiram pelos padroes locais.

## Escolha rapida

| Demanda | Melhor rota |
|---|---|
| bug simples em um modulo backend | 1 Codex medium |
| bug + testes em arquivos separados | 2 Codex medium em paralelo |
| UI/front-end isolado | 1 AGY flash-medium |
| UI/front-end complexa | 1 AGY pro-high |
| Mapear impacto antes de refactor | 1 AGY read-only + execucao com Codex |
| asset visual pedido explicitamente | 1 AGY `--generate-imagem` |
| feature slice pequena full-stack | AGY no front + Codex no backend se ownership for disjunto |
| risco alto | Codex high review antes/depois |

## Regra de ownership

Sempre diga aos agentes que eles nao estao sozinhos no repositorio:

```text
Voce nao esta sozinho no codebase. Outros agentes podem editar outras areas em paralelo. Nao reverta mudancas que voce nao fez. Respeite seu ownership e adapte sua implementacao aos diffs existentes.
```
