# Plano de Refatoracao: cc-gemini-plugin -> cc-antigravity-plugin

> **Data:** 2025-05-24
> **Projeto:** cc-executor-subagents
> **Motivacao:** O `cc-gemini-plugin` esta sendo descontinuado. O Google deprecou o Gemini CLI em favor do Antigravity CLI (`agy`). O plugin sucessor e o `cc-antigravity-plugin` (v3.2.0), ja presente em `C:\Users\allan\Desktop\Projetos Pessoais\cc-antigravity-plugin`.

---

## 1. Contexto e Decisao Arquitetural

### Como o Gemini e usado hoje

O `cc-executor-subagents` usa o Gemini exclusivamente como **subagente opcional para UI/visual**:

- Subagent type: `cc-gemini-plugin:gemini-agent`
- Modelos: `gemini-3-pro` (UI complexa), `gemini-3-flash` (polish simples)
- Invocacao: via `Agent()` com `subagent_type="cc-gemini-plugin:gemini-agent"`
- Fallback: se Gemini nao esta disponivel ou bate cota, Codex assume

### O que o Antigravity oferece

O `cc-antigravity-plugin` tem um perfil diferente do antigo Gemini plugin:

| Capacidade | cc-gemini-plugin (antigo) | cc-antigravity-plugin (novo) |
|---|---|---|
| Foco principal | Subagente generico (usado para UI) | Analise de codebase em contexto largo |
| CLI | `gemini` | `agy` |
| Agent type | `cc-gemini-plugin:gemini-agent` | `cc-antigravity-plugin:antigravity-agent` |
| Skill name | `gemini-integration` | `antigravity-integration` |
| Modelos | `gemini-3-pro`, `gemini-3-flash` | `gemini-3.5-flash-medium`, `gemini-3.5-flash-high`, `gemini-3.1-pro-low`, `claude-4.6-sonnet-thinking`, `claude-4.6-opus-thinking` |
| Edicao de arquivos | Via agent tools | Via `--agent --add-dir` (modo workspace) |
| Continuidade de conversa | Nao | `--continue`, `--conversation <id>` |
| Sandbox | Nao | `--sandbox` |
| Streaming | Nao (acumulado) | Sim (ConPTY) |

### Decisao: Uso Dual (Opcao C)

**Recomendacao:** Nao forcar o Antigravity no papel de "subagente de UI" que era do Gemini. Em vez disso:

1. **Codex continua como executor primario para tudo** (incluindo UI) — ja era o fallback, agora vira a rota principal.
2. **Antigravity entra como ferramenta opcional de analise** — arquitetura, impacto de refactor, orientacao de codebase, review de seguranca cross-file.
3. **O prompt de UI (Secao 3 do subagent-prompts.md) migra para Codex**, eliminando a dependencia de um agente externo para implementacao visual.

**Justificativa:** O Antigravity e otimizado para analise em contexto largo, nao para implementacao de UI. Forcar ele nesse papel seria usar a ferramenta errada. A heuristica "se Gemini disponivel, use para UI" nao faz sentido com AGY — mas "se AGY disponivel, use para analise pre-execucao" agrega valor real.

---

## 2. Inventario de Mudancas

### 2.1 Arquivos que precisam ser alterados

| # | Arquivo | Tipo de mudanca | Prioridade |
|---|---|---|---|
| 1 | `.claude-plugin/plugin.json` | Substituir keyword `"gemini"` por `"antigravity"` | Alta |
| 2 | `.claude-plugin/marketplace.json` | Substituir `"cc-gemini-plugin"` por `"cc-antigravity-plugin"` em `allowCrossMarketplaceDependenciesOn` e keywords | Alta |
| 3 | `skills/executor-subagents/SKILL.md` | Reescrever referencias Gemini → Antigravity; ajustar papel de "UI visual" para "analise"; atualizar tabelas e politica de cota | Alta |
| 4 | `skills/executor-subagents/references/agent-stack.md` | Substituir papeis Gemini por Antigravity com novo proposito; atualizar modelos e heuristica | Alta |
| 5 | `skills/executor-subagents/references/subagent-prompts.md` | Reescrever Secao 3 (Gemini UI → Antigravity Analise); migrar prompt de UI para Codex | Alta |
| 6 | `skills/executor-subagents/references/preflight-check.md` | Substituir `gemini` CLI e `cc-gemini-plugin` por `agy` e `cc-antigravity-plugin`; atualizar remediacao | Alta |
| 7 | `skills/executor-subagents/scripts/preflight.mjs` | Alterar checks opcionais: `checkCli("gemini")` → `checkCli("agy")` e `checkPlugin("cc-gemini-plugin", ...)` → `checkPlugin("cc-antigravity-plugin", ...)` | Alta |
| 8 | `skills/executor-subagents/references/workflow.md` | Substituir "Gemini" por "Antigravity/AGY" | Media |
| 9 | `skills/executor-subagents/assets/subagents-context-template.md` | Substituir modelos Gemini por modelos AGY | Media |
| 10 | `skills/executor-subagents/assets/monitoring-template.md` | Substituir modelo de exemplo | Media |
| 11 | `commands/executor.md` | Atualizar descricao e exemplo de comunicacao | Media |
| 12 | `README.md` | Atualizar toda a secao de pre-requisitos opcionais e descricao | Media |

### 2.2 Arquivos que NAO precisam ser alterados

- `references/contracts.md` — sem referencias a Gemini
- `references/parallelization.md` — referencia implicita a UI, mas nao nomeia Gemini
- `assets/plan-template.md` — generico
- `assets/implementation-report-template.md` — generico
- `assets/contract-template.md` — generico
- `scripts/preflight.mjs` (raiz) — copia do skill, verificar se existe; se for symlink ou copia, tratar junto

---

## 3. Detalhamento por Arquivo

### 3.1 `.claude-plugin/plugin.json`

**Mudanca:** Substituicao simples de keywords.

```diff
  "keywords": [
    "executor",
    "multi-agent",
    "codex",
-   "gemini",
+   "antigravity",
+   "agy",
    "subagents",
    "fast-fix",
    "parallel-execution",
    "goal",
    "autonomous"
  ]
```

### 3.2 `.claude-plugin/marketplace.json`

**Mudancas:**

1. `allowCrossMarketplaceDependenciesOn`: `"cc-gemini-plugin"` → `"cc-antigravity-plugin"`
2. `description`: remover "Gemini", adicionar "Antigravity/AGY"
3. `keywords` no array de plugins: `"gemini"` → `"antigravity"`, `"agy"`

```diff
  "allowCrossMarketplaceDependenciesOn": [
-   "cc-gemini-plugin",
+   "cc-antigravity-plugin",
    "openai-codex"
  ],
```

```diff
  "description": "Executor skill + /executor slash command for quick multi-agent
- implementation. Runs a light preflight, splits work by ownership, launches
- independent Codex/Gemini agents when useful, integrates results and verifies
- without OpenSpec ceremony.",
+ implementation. Runs a light preflight, splits work by ownership, launches
+ independent Codex agents with optional Antigravity (AGY) analysis, integrates
+ results and verifies without OpenSpec ceremony.",
```

```diff
  "keywords": [
    "executor",
    "multi-agent",
    "subagents",
    "codex",
-   "gemini",
+   "antigravity",
+   "agy",
    "fast-fix",
    "parallel-execution",
    "workflow",
    "claude-code"
  ],
```

### 3.3 `skills/executor-subagents/SKILL.md`

**Mudancas significativas — reescrever varias secoes:**

#### Linha 54 — Tabela de preflight

```diff
- | `gemini` CLI + plugin | Opcional | agentes UI/visual quando disponiveis |
+ | `agy` CLI + plugin | Opcional | analise de codebase com Antigravity quando disponivel |
```

#### Linha 57 — Fallback

```diff
- Se Gemini falhar, continue com Codex para tudo e registre que UI
- especializada nao esta disponivel.
+ Se AGY falhar, continue sem analise Antigravity e registre a limitacao.
```

#### Linha 99 — Tabela de decisao (Fase 3)

```diff
- | UI visual complexa e Gemini disponivel | 1 agente Gemini para a parte visual |
+ | Analise cross-file pre-execucao e AGY disponivel | 1 agente Antigravity para analise de impacto/arquitetura |
+ | UI visual complexa | 1 agente Codex com prompt UI especializado |
```

#### Linhas 180-185 — Politica de cota Gemini

Reescrever toda a secao:

```markdown
**Antigravity (AGY) bate a cota:**

1. Registra a evidencia no `.executor/monitoring.md`.
2. Como AGY e apenas analise (nao implementacao), a task prossegue normalmente
   sem a analise — registre que a fase analitica foi pulada por cota.
3. Nao redelegue analise para Codex; Codex implementa, nao analisa em
   contexto largo.
```

#### Linha 205 — Instrucoes de skills

```diff
- Todo subagente (Codex ou Gemini) deve, como **primeiro passo...
+ Todo subagente (Codex ou Antigravity) deve, como **primeiro passo...
```

#### Linha 259 — Regras de seguranca

```diff
- Nao use Gemini para recuperacao de falha operacional, testes quebrados ou
- handoff de codigo critico; use Codex.
+ Nao use Antigravity para recuperacao de falha operacional, testes quebrados,
+ handoff de codigo critico ou implementacao de UI; use Codex. Antigravity e
+ exclusivo para analise em contexto largo.
```

### 3.4 `skills/executor-subagents/references/agent-stack.md`

**Reescrever a tabela de papeis e a heuristica:**

#### Tabela de papeis

```diff
  | Papel | Modelo | Subagent type | Quando usar |
  |---|---|---|---|
  | Executor principal | Claude | voce mesmo | triagem, split, integracao, verificacao, glue pequeno |
  | Executor geral | Codex gpt-5.4 medium | `codex:codex-rescue` | codigo, testes, refactor localizado, bugfix |
  | Review critico | Codex gpt-5.5 high | `codex:codex-rescue` | risco alto, auth, dados, concorrencia, review final |
- | UI visual | Gemini 3 Pro | `cc-gemini-plugin:gemini-agent` | UI/UX complexa quando Gemini estiver disponivel |
- | UI simples | Gemini 3 Flash | `cc-gemini-plugin:gemini-agent` | polish visual pequeno quando Gemini estiver disponivel |
+ | UI visual | Codex gpt-5.4 medium | `codex:codex-rescue` | UI/UX complexa com prompt especializado |
+ | Analise cross-file | AGY gemini-3.5-flash-medium | `cc-antigravity-plugin:antigravity-agent` | arquitetura, impacto de refactor, orientacao de codebase |
+ | Analise profunda | AGY gemini-3.1-pro-low | `cc-antigravity-plugin:antigravity-agent` | analise complexa com raciocinio profundo |
```

```diff
- Codex e obrigatorio para esta skill. Gemini e opcional: se nao estiver
- disponivel, use Codex tambem para UI.
+ Codex e obrigatorio para esta skill. Antigravity (AGY) e opcional: se nao
+ estiver disponivel, prossiga sem a fase de analise cross-file. UI e sempre
+ feita com Codex.
```

#### Heuristica Gemini → Heuristica Antigravity

```diff
- ## Heuristica Gemini
-
- Use Gemini so quando ele acelerar UI:
- - layout visual complexo;
- - responsividade;
- - estados visuais;
- - acessibilidade de tela;
- - polish com design system.
-
- Nao use Gemini para:
- - handoff de falha operacional;
- - testes quebrados;
- - migrations;
- - auth;
- - refactor de negocio;
- - investigacao de build quebrado.
+ ## Heuristica Antigravity (AGY)
+
+ Use Antigravity quando a analise pre-execucao acelerar a entrega:
+ - mapear arquitetura antes de refactor amplo;
+ - analisar impacto cross-file de uma mudanca;
+ - orientar-se em codebase desconhecido;
+ - review de seguranca cross-file;
+ - sintetizar documentacao de muitos arquivos.
+
+ Nao use Antigravity para:
+ - implementacao de codigo (use Codex);
+ - implementacao de UI (use Codex);
+ - edicao localizada;
+ - debugging interativo;
+ - testes quebrados;
+ - handoff de falha operacional.
```

#### Escolha rapida

```diff
- | UI polish isolado | Gemini Flash ou Codex medium |
+ | UI polish isolado | Codex medium com prompt UI |
+ | Mapear impacto antes de refactor | 1 Antigravity + execucao com Codex |
```

### 3.5 `skills/executor-subagents/references/subagent-prompts.md`

**Mudanca principal: Secao 3 "Gemini UI" vira duas secoes:**

#### Nova Secao 3: Codex UI (substitui Gemini UI)

```markdown
## 3. Codex UI

**Subagent type:** `codex:codex-rescue`

Use `gpt-5.4-codex --effort medium` para UI geral e `gpt-5.5-codex --effort high` para UI complexa com risco.

\```text
--model gpt-5.4-codex --effort medium

Voce e um agente UI em uma execucao rapida multiagente.

Demanda:
<DESCREVER A DEMANDA>

Sua fatia visual:
<DESCREVER UI/UX>

Ownership:
- Pode editar: <ARQUIVOS/PASTAS>
- Nao edite: <ARQUIVOS/PASTAS>

Design system/padroes:
<TOKENS, COMPONENTES, CONVENCOES>

Estados obrigatorios:
- loading:
- error:
- empty:
- success:

Context7:
<SE DISPONIVEL E A TASK ENVOLVE LIB/API/FRAMEWORK: consulte Context7 antes de alterar uso de APIs/libs/frameworks. Use resolve-library-id -> query-docs. No retorno, cite docs consultadas. SENAO: siga padroes locais.>

Regras:
- Voce nao esta sozinho no codebase. Nao reverta mudancas que voce nao fez.
- Preserve design system existente.
- Mantenha responsividade e acessibilidade.
- Nao altere payload/API sem avisar.

Retorne:
0. Status: DONE | BLOCKED | FAILED | QUOTA_EXHAUSTED
1. Resumo visual
2. Arquivos alterados
3. Decisoes UI/UX
4. Estados tratados
5. Validacoes feitas
6. Pendencias
7. Riscos
\```
```

#### Nova Secao 6: Antigravity Analise (novo papel)

```markdown
## 6. Antigravity analise cross-file

**Subagent type:** `cc-antigravity-plugin:antigravity-agent`

Use `gemini-3.5-flash-medium` (padrao) para analise geral e `gemini-3.1-pro-low` para raciocinio profundo. Omita `--model` para usar o padrao.

\```text
--dirs <DIRS>

Voce e um agente de analise em uma execucao rapida multiagente.

Objetivo da analise:
<O QUE PRECISAMOS ENTENDER ANTES DE IMPLEMENTAR>

Escopo:
<MODULOS, PASTAS, ARQUIVOS RELEVANTES>

Foco:
<ARQUITETURA | IMPACTO_REFACTOR | SEGURANCA | ORIENTACAO | DOCUMENTACAO>

Perguntas especificas:
<LISTA DE PERGUNTAS CONCRETAS>

Regras:
- NAO modifique arquivos. Apenas analise.
- Retorne achados com arquivo/linha quando possivel.
- Priorize informacoes que impactam decisoes de implementacao.

Retorne:
0. Status: DONE | BLOCKED | FAILED | QUOTA_EXHAUSTED
1. Resumo da analise
2. Achados principais com arquivo/linha
3. Riscos identificados
4. Recomendacoes para implementacao
5. Dependencias ou impactos cross-file
\```
```

**Nota:** A numeracao original das secoes 4 (Investigacao read-only) e 5 (Check-in leve) permanece intacta — a secao Antigravity e adicionada como 6.

### 3.6 `skills/executor-subagents/references/preflight-check.md`

**Substituir toda a secao "Opcional" e "Gemini opcional":**

#### Tabela opcional

```diff
  | Item | Uso |
  |---|---|
- | `gemini` CLI | agente UI visual |
- | plugin `cc-gemini-plugin` | expoe `cc-gemini-plugin:gemini-agent` |
+ | `agy` CLI | analise de codebase com Antigravity |
+ | plugin `cc-antigravity-plugin` | expoe `cc-antigravity-plugin:antigravity-agent` |
  | `/goal` hooks | autonomia entre turnos |
  | Context7 MCP | docs atuais para libs/frameworks/APIs |
```

#### Fallback

```diff
- - sem Gemini: use Codex para UI;
+ - sem AGY: prossiga sem analise cross-file;
```

#### Remediacao

```diff
- ### Gemini opcional
-
- ```bash
- npm install -g @google/gemini-cli
- gemini auth
- ```
-
- ```text
- /plugin marketplace add thepushkarp/cc-gemini-plugin
- /plugin install cc-gemini-plugin@cc-gemini-plugin
- ```
+ ### Antigravity (AGY) opcional
+
+ **macOS/Linux:**
+
+ ```bash
+ curl -fsSL https://antigravity.google/cli/install.sh | bash
+ ```
+
+ **Windows:**
+
+ ```powershell
+ irm https://antigravity.google/cli/install.ps1 | iex
+ ```
+
+ **Autenticacao:** abra `agy` uma vez interativamente e faca login.
+
+ **Plugin:**
+
+ ```text
+ /plugin marketplace add AllanHarlen/cc-antigravity-plugin
+ /plugin install cc-antigravity-plugin@cc-antigravity-plugin
+ ```
```

### 3.7 `skills/executor-subagents/scripts/preflight.mjs`

**Mudancas nos checks opcionais (linhas 208-222):**

```diff
  optional: {
    cli: {
-     gemini: checkCli("gemini"),
+     agy: checkCli("agy"),
    },
    plugins: {
-     "cc-gemini-plugin": checkPlugin("cc-gemini-plugin", "cc-gemini-plugin"),
+     "cc-antigravity-plugin": checkPlugin("cc-antigravity-plugin", "cc-antigravity-plugin"),
    },
    permissions: {
      "goal-hooks-enabled": checkGoalHookSettings(),
    },
    mcp: {
      context7: checkContext7Mcp(),
    },
  },
```

**Tambem remover references ao Gemini no `checkContext7Mcp`** (linhas 165-166):

```diff
  const configCandidates = [
    join(process.cwd(), ".mcp.json"),
    join(HOME, ".claude.json"),
    join(HOME, ".claude", "mcp.json"),
    join(HOME, ".config", "claude", "mcp.json"),
    join(HOME, ".codex", "config.toml"),
-   join(HOME, ".gemini", "settings.json"),
-   join(HOME, ".gemini", "mcp.json"),
  ];
```

### 3.8 `skills/executor-subagents/references/workflow.md`

**Linha 13:**

```diff
- Gemini, `/goal` e Context7 sao opcionais.
+ Antigravity (AGY), `/goal` e Context7 sao opcionais.
```

### 3.9 `skills/executor-subagents/assets/subagents-context-template.md`

**Linha 32:**

```diff
- | Modelo | <codex gpt-5.4 medium | codex gpt-5.5 high | gemini 3 pro | gemini 3 flash> |
+ | Modelo | <codex gpt-5.4 medium | codex gpt-5.5 high | agy gemini-3.5-flash-medium | agy gemini-3.1-pro-low> |
```

### 3.10 `skills/executor-subagents/assets/monitoring-template.md`

**Linha 31:**

```diff
- | B | <slice> | gemini 3 pro | RUNNING | <arquivos> | <HH:MM> |
+ | B | <slice> | agy gemini-3.5-flash-medium | RUNNING | <arquivos> | <HH:MM> |
```

### 3.11 `commands/executor.md`

**Linha 2 — descricao:**

```diff
- description: Executar uma resolucao rapida multiagente sem OpenSpec, dividindo a
- demanda em fatias independentes, delegando para Codex/Gemini quando acelerar,
- integrando e verificando.
+ description: Executar uma resolucao rapida multiagente sem OpenSpec, dividindo a
+ demanda em fatias independentes, delegando para Codex com analise opcional via
+ Antigravity (AGY), integrando e verificando.
```

**Linha 90 — comunicacao:**

```diff
- - "preflight OK; Gemini opcional indisponivel, vou usar Codex para UI tambem";
+ - "preflight OK; AGY opcional indisponivel, prosseguindo sem analise cross-file";
```

### 3.12 `README.md`

**Linha 12:**

```diff
- - com Gemini opcional para UI visual;
+ - com Antigravity (AGY) opcional para analise cross-file;
```

**Linhas 69-71 — Tabela de opcionais:**

```diff
  | Item | Uso |
  |---|---|
- | Gemini CLI + `cc-gemini-plugin` | UI visual especializada |
+ | Antigravity CLI (`agy`) + `cc-antigravity-plugin` | Analise de codebase em contexto largo |
  | Context7 MCP | docs atuais de libs/frameworks/APIs |
  | `/goal` hooks | autonomia entre turnos |
```

**Linhas 101-111 — Instrucoes de instalacao:**

```diff
- Gemini opcional:
+ Antigravity (AGY) opcional:
+
+ macOS/Linux:
+
+ ```bash
+ curl -fsSL https://antigravity.google/cli/install.sh | bash
+ ```
+
+ Windows:
  
- ```bash
- npm install -g @google/gemini-cli
- gemini auth
+ ```powershell
+ irm https://antigravity.google/cli/install.ps1 | iex
  ```
  
+ Autenticacao: abra `agy` interativamente e faca login.
+
  ```text
- /plugin marketplace add thepushkarp/cc-gemini-plugin
- /plugin install cc-gemini-plugin@cc-gemini-plugin
+ /plugin marketplace add AllanHarlen/cc-antigravity-plugin
+ /plugin install cc-antigravity-plugin@cc-antigravity-plugin
  ```
```

---

## 4. Ordem de Execucao

A refatoracao pode ser feita em um unico commit, pois todas as mudancas sao consistentes entre si. Ordem sugerida para minimizar erros:

### Wave 1 — Infraestrutura (sem impacto funcional)

1. `preflight.mjs` — troca os checks opcionais
2. `.claude-plugin/plugin.json` — keywords
3. `.claude-plugin/marketplace.json` — dependencias e keywords

### Wave 2 — Documentacao de referencia

4. `references/agent-stack.md` — papeis, modelos, heuristica
5. `references/subagent-prompts.md` — nova Secao 3 (Codex UI), nova Secao 6 (Antigravity Analise)
6. `references/preflight-check.md` — tabelas e remediacao
7. `references/workflow.md` — mencao simples

### Wave 3 — Skill principal e templates

8. `SKILL.md` — tabelas, politica de cota, regras de seguranca
9. `assets/subagents-context-template.md` — modelos
10. `assets/monitoring-template.md` — modelo de exemplo

### Wave 4 — Interface publica

11. `commands/executor.md` — descricao e comunicacao
12. `README.md` — pre-requisitos e instalacao

---

## 5. Riscos e Mitigacoes

| Risco | Probabilidade | Impacto | Mitigacao |
|---|---|---|---|
| Usuarios com Gemini instalado perdem subagente de UI | Media | Baixo | UI ja era fallback para Codex; na pratica nada muda para quem nao tinha Gemini |
| Antigravity CLI (`agy`) ainda nao disponivel para todos os usuarios | Media | Baixo | AGY continua opcional; preflight reporta warning e execucao segue sem ele |
| Prompts de UI migrados para Codex perdem qualidade visual | Baixa | Baixo | O prompt de UI e preservado integralmente, so muda o executor; Codex gpt-5.4 e capaz |
| Modelos AGY mudam de nome em versoes futuras | Baixa | Medio | O bridge do antigravity-plugin centraliza selecao de modelo; mudancas futuras ficam nele |
| Quebra de preflight por nome de CLI/plugin errado | Media | Medio | Testar preflight antes e depois com os dois cenarios: AGY instalado e nao instalado |

---

## 6. Teste de Validacao

Apos aplicar todas as mudancas:

### 6.1 Preflight

```bash
node skills/executor-subagents/scripts/preflight.mjs
```

**Esperado:**
- `status: "ok"` (Codex presente)
- `warnings` deve listar `agy` e `cc-antigravity-plugin` se nao estiverem instalados
- Nenhuma referencia a `gemini` na saida

### 6.2 Grep por residuos

```bash
rg -i "gemini" --glob "!REFACTOR-PLAN*" --glob "!.git/**"
```

**Esperado:** zero resultados (nenhuma referencia residual ao Gemini).

**Excecoes aceitaveis:** nomes de modelo AGY que contem "gemini" (ex: `gemini-3.5-flash-medium`) sao esperados e corretos — o Antigravity CLI usa modelos Gemini internamente.

### 6.3 Funcional

1. Rodar `/executor preflight` em um projeto com AGY instalado — deve reportar AGY como disponivel.
2. Rodar `/executor preflight` em um projeto sem AGY — deve reportar warning sem bloquear.
3. Rodar `/executor <demanda simples>` — deve funcionar normalmente com Codex, sem tentar invocar Gemini.

---

## 7. Checklist Final

- [ ] Todas as 12 alteracoes de arquivo aplicadas
- [ ] Zero referencias residuais a `gemini` CLI, `cc-gemini-plugin`, ou `gemini-agent` (exceto nomes de modelo AGY)
- [ ] Preflight passa com e sem AGY instalado
- [ ] Nova Secao 3 (Codex UI) nos subagent-prompts funcional
- [ ] Nova Secao 6 (Antigravity Analise) nos subagent-prompts funcional
- [ ] README atualizado com instrucoes de instalacao do AGY
- [ ] Commit unico com mensagem descritiva
