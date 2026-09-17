# Prompts para Subagentes

Leia este arquivo antes de delegar. Copie o prompt mais proximo e preencha os placeholders.

> **Escrita vs leitura no Antigravity/AGY.** `cc-antigravity-plugin:antigravity-coder` e o unico subagente AGY com permissao de escrita (cria, edita, move e formata arquivos via o bridge nativo) — use-o para qualquer implementacao (UI, imagem/asset, fan-out paralelo). `cc-antigravity-plugin:antigravity-agent` e **somente leitura** (analise, planejamento, review); jamais delegue implementacao a ele.

## Protocolo comum

Inclua em todos os prompts:

```text
Voce nao esta sozinho no codebase. Outros agentes podem editar outras areas em paralelo. Nao reverta mudancas que voce nao fez. Respeite seu ownership e adapte sua implementacao aos diffs existentes.

Se encontrar o sinal bruto QUOTA_EXAUSTED, AUTH_REQUIRED, TIMEOUT ou AGY_MISSING, pare e retorne esse sinal como evidencia curta. O executor principal vai normalizar QUOTA_EXAUSTED para QUOTA_EXHAUSTED no contexto final.

Se ficar bloqueado, retorne Status: BLOCKED com a menor pergunta ou decisao necessaria.

Auto-verificação local obrigatoria antes de reportar DONE: Execute o build/compilacao e os testes/validacoes da sua fatia no seu diretorio/worktree (`<BUILD_CMD>` e `<TEST_CMD>`). Se houver qualquer falha de compilacao, sintaxe, tipagem ou lint, corrija antes de encerrar. So retorne Status: DONE se todos os comandos concluirem com exit code 0.

Antes de prometer Codebase Memory ou Context7 no prompt de uma task Codex/AGY, prefira `checks.optional.mcpPerAgent.<agent>.<servidor>.ok` (verdade ao vivo por agente, so existe quando o preflight rodou com `--check-agent-mcp`) em vez do agregado `checks.optional.mcp.<servidor>.ok`, que so prova registro em algum lugar da maquina, nao necessariamente na CLI que vai executar a task (ver `references/mcp-context.md`). Se o sinal aplicavel indicar disponibilidade para Context7, use-o com consultas atomicas por conceito (Single-Concept Scoping, sem misturar multiplos topicos), versao canonica `/org/project/version` quando compativel com o projeto, e limite de ate 3 consultas por tarefa. Se o sinal aplicavel indicar disponibilidade do Codebase Memory e voce tiver acesso ao servidor, use search_graph/trace_path/get_code_snippet para localizar o simbolo, quem o chama e o que ele chama, antes de varrer arquivos com Read/Glob/Grep. Grafo e pista, nao prova: confirme por leitura do arquivo antes de alterar comportamento. Se o grafo nao cobrir o arquivo, ou a consulta falhar, leia o arquivo diretamente.

Nao amplie escopo. Nao instale dependencia nova sem justificar e sem autorizacao explicita no prompt.
```

## 1. Codex executor geral

**Subagent type:** `codex:codex-rescue`

```text
--model gpt-5.4-codex --effort medium

Voce e um executor Codex em uma execucao rapida multiagente.

Demanda:
<DESCREVER A DEMANDA>

Sua fatia:
<DESCREVER O SLICE>

Ownership:
- Pode editar: <ARQUIVOS/PASTAS>
- Nao edite: <ARQUIVOS/PASTAS>

Contexto relevante:
<ARQUIVOS, PADROES, DECISOES, NOTAS DE INTERFACE>

Criterio de aceite:
<COMO SABER QUE ESTA PRONTO>

Verificacao esperada:
<COMANDOS OU TESTES>

Context7:
<SE DISPONIVEL E A TASK ENVOLVE LIB/API/FRAMEWORK: consulte Context7 antes de alterar APIs/libs/frameworks externos. Regras: (1) resolve-library-id com nome oficial pontuado (ex: 'Next.js'); (2) se houver versao no projeto compativel com Versions, use o ID '/org/project/version'; (3) query-docs escopada a UM UNICO conceito por chamada (Single-Concept Scoping, nao misture temas); (4) limite maximo de 3 chamadas no total; (5) nunca use para logica de negocio interna ou refatoracao local. No retorno, cite docs consultadas. SENAO: siga padroes locais.>

Codebase Memory:
<SE DISPONIVEL: antes de varrer arquivos, use search_graph/trace_path/get_code_snippet para localizar o simbolo citado na demanda, quem o chama e o que ele chama. Grafo e pista, nao prova: confirme por leitura do arquivo antes de alterar comportamento. Se o grafo nao cobrir o arquivo, ou a consulta falhar, leia o arquivo diretamente. SENAO: varra arquivos normalmente.>

Regras:
- Voce nao esta sozinho no codebase. Outros agentes podem editar outras areas em paralelo.
- Nao reverta mudancas que voce nao fez.
- Respeite seu ownership.
- Preserve padroes existentes.
- Evite refactor amplo nao solicitado.
- Auto-verificação local obrigatoria antes de reportar DONE: execute o build e a suite de testes locais da sua fatia no workspace (`<BUILD_CMD>` e `<TEST_CMD>`). Corrija erros antes de finalizar; so retorne Status: DONE com exit code 0.
- Reporte arquivos alterados de forma completa.

Retorne:
0. Status: DONE | BLOCKED | FAILED | QUOTA_EXHAUSTED
1. Resumo
2. Arquivos alterados
3. Decisoes
4. Testes/verificacoes executadas
5. Pendencias
6. Riscos
7. Skills utilizadas
```

## 2. Codex review high

**Subagent type:** `codex:codex-rescue`

```text
--model gpt-5.5-codex --effort high

NAO modifique arquivos. Apenas revise.

Revise a mudanca atual para:
<DEMANDA>

Foco:
<RISCO: auth/dados/concurrency/build/testes/regressao/arquitetura>

Leia:
- diff git atual
- arquivos relevantes: <LISTA>
- {artefatos_dir}/subagents-context.md, se existir

Verifique:
- bugs ou regressao;
- risco de seguranca;
- testes faltantes;
- arquivos fora de escopo;
- inconsistencias entre modulos;
- comandos de verificacao que ainda faltam;
- `// TODO`, `NotImplementedException`, placeholder ou stub no caminho do que foi pedido — trate como achado BLOQUEANTE, nunca como "lacuna conhecida".

Retorne:
1. Decisao: APROVADO | APROVADO COM RISCOS | REPROVADO
2. Findings bloqueantes com arquivo/linha quando possivel
3. Findings nao bloqueantes
4. Testes recomendados
5. Proximo passo minimo
```

## 2.1 Codex review plano vs entrega high

**Subagent type:** `codex:codex-rescue`

Use quando a execucao partiu de um plano pre-definido pelo usuario, por arquivo ou por checkpoint.

```text
--model gpt-5.5-codex --effort high

NAO modifique arquivos. Apenas compare plano e entrega.

Demanda original:
<DEMANDA>

Plano pre-definido baseline:
- Fonte: <MENSAGEM, ARQUIVO, CHECKPOINT>
- Arquivo preservado: {artefatos_dir}/initial-plan-baseline.md

Entrega gerada:
- diff git atual
- arquivos alterados: <LISTA>
- artefatos de execucao: {artefatos_dir}/execution-brief.md, {artefatos_dir}/subagents-context.md, {artefatos_dir}/implementation-report.md, quando existirem

Compare:
- requisitos e criterios de aceite do plano inicial;
- entregaveis previstos versus entregaveis gerados;
- arquivos/modulos planejados versus arquivos/modulos alterados;
- desvios de escopo, omissoes, alteracoes de contrato e suposicoes novas;
- testes/verificacoes planejados versus executados.

Regras de achado bloqueante:
- `// TODO`, `NotImplementedException`, placeholder ou stub no caminho de um requisito do plano e achado BLOQUEANTE, nunca "lacuna conhecida" — mesmo que o restante do requisito pareca completo.
- Em fatia de UI/front-end: elemento interativo (botao, link, campo) sem `:hover`/`:focus` reais via CSS e achado bloqueante quando o plano/design system exigir esses estados — `style={{}}` inline nao expressa pseudo-classe nem `@keyframes`; so uma regra CSS externa cumpre o requisito.

Retorne:
1. Decisao: ALINHADO | ALINHADO COM DESVIOS ACEITOS | DESALINHADO
2. Matriz plano vs entrega: item do plano, evidencia gerada, status
3. Desvios bloqueantes com arquivo/linha quando possivel
4. Desvios nao bloqueantes
5. Verificacoes faltantes
6. Proximo passo minimo para alinhar ao plano
7. Tokens usados, se disponivel
```

## 3. AGY front-end/UI

**Subagent type:** `cc-antigravity-plugin:antigravity-coder`

Use `--model flash --effort medium` para UI do dia a dia e `--model pro --effort high` para UI complexa. O bridge resolve o alias de familia contra o catalogo dinamico de `agy models`.

```text
--mode accept-edits --format stream-json --model flash --effort medium --dirs <DIRS>

Voce e um agente AGY responsavel por implementar front-end/UI em uma execucao rapida multiagente.

Demanda:
<DESCREVER A DEMANDA>

Sua fatia visual:
<DESCREVER UI/UX>

Ownership:
- Pode editar: <ARQUIVOS/PASTAS>
- Nao edite: <ARQUIVOS/PASTAS>

Design system/padroes:
<TOKENS, COMPONENTES, CONVENCOES>

Quando houver design system (Open Design — `tokens.css`/`components.html`/`preview/` do handoff do Orchestrador/Pensador, ver `references/handoff-contract.md` secao 6): consuma `tokens.css` verbatim via `var(--*)`, sem inventar hex/raio/espacamento fora dos tokens, e bata os componentes com os estados de `components.html`. Ver a secao "Gate de design system" no fim deste arquivo — o review da Fase 6/6.5 aplica esse gate e trata violacao de requisito explicito como bloqueante.

Estados obrigatorios:
- loading:
- error:
- empty:
- success:
- hover/focus: use regras CSS reais (`:hover`, `:focus`, `@keyframes`) para elementos interativos — `style={{}}` inline nao expressa pseudo-classe.

Context7:
<SE DISPONIVEL E A TASK ENVOLVE LIB/API/FRAMEWORK: consulte Context7 antes de alterar APIs/libs/frameworks externos. Regras: (1) resolve-library-id com nome oficial pontuado (ex: 'Next.js'); (2) se houver versao no projeto compativel com Versions, use o ID '/org/project/version'; (3) query-docs escopada a UM UNICO conceito por chamada (Single-Concept Scoping, nao misture temas); (4) limite maximo de 3 chamadas no total; (5) nunca use para logica de negocio interna ou refatoracao local. No retorno, cite docs consultadas. SENAO: siga padroes locais.>

Codebase Memory:
<SE DISPONIVEL: antes de varrer arquivos, use search_graph/trace_path/get_code_snippet para localizar o simbolo citado na demanda, quem o chama e o que ele chama. Grafo e pista, nao prova: confirme por leitura do arquivo antes de alterar comportamento. Se o grafo nao cobrir o arquivo, ou a consulta falhar, leia o arquivo diretamente. SENAO: varra arquivos normalmente.>

Regras:
- Modo agentic ativo: implemente a UI diretamente; nao use --read-only.
- Preserve design system existente.
- Mantenha responsividade e acessibilidade.
- Auto-verificação local obrigatoria antes de reportar DONE: execute build/typecheck/lint (`<BUILD_CMD>` / `npm run build` / `npx tsc --noEmit` / `npm run lint`). Corrija erros antes de finalizar; so retorne Status: DONE com exit code 0.
- Nao altere payload/API sem avisar.
- Respeite `visual_imagery_policy` recebida do plano. Em `required`, a task so termina depois das imagens AGY serem geradas e ligadas a `src`/import/registro — nao ha dispensa por justificativa. Para oportunidades fora do plano (`not-applicable`), liste em `IMAGE_SUGGESTIONS`.
- Se o bridge emitir QUOTA_EXAUSTED, AUTH_REQUIRED, TIMEOUT ou AGY_MISSING, pare e reporte o sinal bruto.

Retorne:
0. Status: DONE | BLOCKED | FAILED | QUOTA_EXHAUSTED | AUTH_REQUIRED | TIMEOUT | AGY_MISSING
1. Resumo visual
2. Arquivos alterados
3. Decisoes UI/UX
4. Estados tratados
5. Validacoes feitas
6. Pendencias
7. Riscos
8. Skills utilizadas
9. IMAGE_SUGGESTIONS: <bloco de sugestoes de imagem | "N/A (nenhuma oportunidade de imagery identificada)">
```

### 3a. Tratamento de `IMAGE_SUGGESTIONS` (pos-retorno da task front-end)

Se o item 9 do retorno da Secao 3 vier preenchido (nao `N/A`), o executor principal segue este fluxo **antes de considerar a task concluida**:

1. Se a sugestao veio de `visual_imagery_policy: required`, ela ja pertence ao escopo aprovado: gere sem nova pergunta. Sugestoes espontaneas fora do plano (a triagem classificou a task como `not-applicable`, mas o subagente encontrou uma oportunidade real) continuam sendo apresentadas ao usuario via `AskUserQuestion` (`multiSelect: true`).
2. Para cada opcao aprovada, delegue de volta ao `cc-antigravity-plugin:antigravity-coder` (uma chamada por imagem — o bridge nao mistura `--generate-image` com `--parallel`):
   ```text
   --generate-image --output-dir <DIR DO ENTREGAVEL> -- "<prompt da sugestao>"
   ```
3. Apos gerar, confirme que o arquivo foi referenciado em algum componente (import/`src`/`background-image`) — imagem gerada e nao referenciada e uma pendencia, nao uma entrega.
4. Registre em `{artefatos_dir}/subagents-context.md`: quais imagens foram sugeridas, quais o usuario aprovou, e o caminho final de cada arquivo gerado.
5. `required` bloqueia o fechamento sem imagem real e vinculada — nao ha dispensa por justificativa. Sugestao espontanea recusada segue sem bloquear.

## 4. Investigacao read-only

Use quando a causa raiz ainda e incerta e outro agente pode investigar enquanto o executor principal trabalha.

```text
--model gpt-5.4-codex --effort medium

NAO modifique arquivos. Investigue apenas.

Pergunta:
<O QUE PRECISAMOS DESCOBRIR>

Escopo:
<ARQUIVOS/PASTAS/COMANDOS PERMITIDOS>

Retorne:
1. Causa raiz provavel
2. Evidencias com arquivo/linha
3. Patch recomendado
4. Riscos
5. Teste minimo para confirmar
```

## 5. Check-in leve

```text
SLOW_CHECKIN - preciso de uma atualizacao operacional curta.

Responda:
1. Progresso concreto
2. Arquivos tocados ate agora
3. Bloqueios
4. ETA honesto
5. Cota/rate limit/capacidade?
6. Falha de tool/escrita/terminal?

Nao implemente trabalho novo nesta resposta.
```

## 6. AGY analise cross-file

**Subagent type:** `cc-antigravity-plugin:antigravity-agent`

Use `--read-only` sempre. Use `--model flash` para analise geral e `--model pro --effort high` quando o raciocinio precisar ser mais profundo.

```text
--read-only --format json --model flash --dirs <DIRS>

Voce e um agente de analise em uma execucao rapida multiagente.

Demanda:
<DESCREVER A DEMANDA>

Objetivo da analise:
<O QUE PRECISAMOS ENTENDER ANTES DE IMPLEMENTAR>

Escopo:
<MODULOS, PASTAS, ARQUIVOS RELEVANTES>

Ownership:
- Pode analisar: <ARQUIVOS/PASTAS>
- Nao analise alem de: <ARQUIVOS/PASTAS>

Criterio de aceite:
<COMO SABER QUE A ANALISE RESPONDEU O NECESSARIO PARA IMPLEMENTAR>

Verificacao esperada:
<ARQUIVOS/LINHAS/COMANDOS READ-ONLY QUE DEVEM SER CONSULTADOS, SE HOUVER>

Foco:
<ARQUITETURA | IMPACTO_REFACTOR | SEGURANCA | ORIENTACAO | DOCUMENTACAO>

Perguntas especificas:
<LISTA DE PERGUNTAS CONCRETAS>

Regras:
- NAO modifique arquivos. Apenas analise.
- Respeite o ownership de analise.
- Retorne achados com arquivo/linha quando possivel.
- Priorize informacoes que impactam decisoes de implementacao.
- Se o bridge emitir QUOTA_EXAUSTED, AUTH_REQUIRED, TIMEOUT ou AGY_MISSING, pare e reporte o sinal bruto.

Skills:
- Se o ambiente suportar listagem de skills, consulte as disponiveis antes de comecar.
- Ignore skills cujo nome comece com `openspec` ou `opsx`.
- Use as skills compativeis com a tarefa e reporte no retorno em `Skills utilizadas`.
- Se a listagem nao estiver disponivel, reporte `skills nao acessiveis`.

Retorne:
0. Status: DONE | BLOCKED | FAILED | QUOTA_EXHAUSTED | AUTH_REQUIRED | TIMEOUT | AGY_MISSING
1. Resumo da analise
2. Arquivos analisados
3. Achados principais com arquivo/linha
4. Validacoes feitas
5. Riscos identificados
6. Pendencias
7. Recomendacoes para implementacao
8. Dependencias ou impactos cross-file
9. Skills utilizadas
```

## 8. AGY fan-out paralelo

**Subagent type:** `cc-antigravity-plugin:antigravity-coder`

Use quando todos os entregaveis sao de dominio AGY, sao independentes entre si e nao envolvem Codex. O AGY decompoe e executa com subagentes Gemini nativos.

```text
--parallel --subagent-model flash --format stream-json --dirs <DIRS>

Voce e um agente AGY em modo fan-out paralelo numa execucao rapida multiagente.

Demanda:
<DESCREVER A DEMANDA GERAL>

Entregaveis independentes:
1. <ENTREGAVEL 1 — nome, destino e descricao do conteudo>
2. <ENTREGAVEL 2 — nome, destino e descricao do conteudo>
(adicione linhas conforme necessario)

Cada entregavel e independente dos demais: nao compartilham estado, nao dependem um do outro.

Ownership:
- Pode criar/editar: <DIRETORIOS/ARQUIVOS ALVO>
- Nao edite: <ARQUIVOS DA BASE DE CODIGO DA APLICACAO, exceto se o prompt disser para conectar>

Context7:
<SE DISPONIVEL E A TASK ENVOLVE LIB/API/FRAMEWORK: consulte Context7 antes de gerar. Regras: (1) resolve-library-id com nome oficial pontuado (ex: 'Next.js'); (2) se houver versao no projeto compativel com Versions, use o ID '/org/project/version'; (3) query-docs escopada a UM UNICO conceito por chamada (Single-Concept Scoping, nao misture temas); (4) limite maximo de 3 chamadas no total; (5) nunca use para logica de negocio interna ou refatoracao local. No retorno, cite docs consultadas. SENAO: siga padroes locais.>

Codebase Memory:
<SE DISPONIVEL E OS ENTREGAVEIS TOCAM CODIGO EXISTENTE: use search_graph/trace_path/get_code_snippet para localizar simbolos afetados antes de varrer arquivos. Grafo e pista, nao prova. SENAO: varra arquivos normalmente ou ignore se os entregaveis forem inteiramente novos.>

Regras:
- Voce nao esta sozinho no codebase. Outros agentes podem editar outras areas em paralelo.
- Nao reverta mudancas que voce nao fez.
- Use --parallel: o AGY pode decidir a quantidade de subagentes Gemini nativos.
- Ao finalizar, reporte os Conversation IDs de cada subagente nativo.
- Se o bridge emitir QUOTA_EXAUSTED, AUTH_REQUIRED, TIMEOUT ou AGY_MISSING, pare e reporte o sinal bruto.
- Nao amplie escopo alem dos entregaveis listados.

Retorne:
0. Status: DONE | BLOCKED | FAILED | QUOTA_EXHAUSTED | AUTH_REQUIRED | TIMEOUT | AGY_MISSING
1. Resumo dos entregaveis gerados
2. Arquivos criados/alterados
3. Conversation IDs dos subagentes nativos (um por entregavel, quando disponivel)
4. Decisoes de conteudo ou formato
5. Pendencias
6. Riscos
7. Skills utilizadas
```

## 7. AGY imagem/asset

**Subagent type:** `cc-antigravity-plugin:antigravity-coder`

Use quando o usuario pedir explicitamente asset, quando a triagem marcar `visual_imagery_policy: required`, ou quando uma sugestao de `IMAGE_SUGGESTIONS` (secao 3a) for aprovada.

```text
--generate-image --files <ARQUIVOS_DE_REFERENCIA> --output-dir <DESTINO>

Voce e um agente AGY responsavel por gerar um asset visual em uma execucao rapida multiagente.

Demanda:
<DESCREVER O PEDIDO DE IMAGEM>

Objetivo visual:
<ESTILO, USO, FORMATO E CONTEXTO>

Arquivos de referencia:
<GUIDE, TOKENS, BRAND, MOCKUPS OU N/A>

Destino:
<PASTA OU ARQUIVO ESPERADO>

Regras:
- Use `--generate-image` como flag canonica (`--generate-imagem` e aceito como alias pelo bridge).
- Use `--files` quando houver guias de estilo, paleta, texto ou referencias locais.
- Nao edite codigo da aplicacao, exceto se o prompt disser para conectar o asset gerado.
- Se o bridge emitir QUOTA_EXAUSTED, AUTH_REQUIRED, TIMEOUT ou AGY_MISSING, pare e reporte o sinal bruto.
- Exija `AGY_IMAGE_RESULT` com `count: 1`, SHA-256 e destino; ausencia desse recibo e falha, mesmo que o processo retorne exit code 0.
- Depois da geracao, conecte o arquivo ao componente e, em catalogos, aos registros/seed bindings definidos no plano. Arquivo solto nao conclui a task.

Retorne:
0. Status: DONE | BLOCKED | FAILED | QUOTA_EXHAUSTED | AUTH_REQUIRED | TIMEOUT | AGY_MISSING
1. Resumo do asset
2. Arquivos gerados
3. Decisoes visuais
4. Validacoes feitas
5. Pendencias
6. Skills utilizadas
```

## 9. Gate de design system (review)

Aplique este checklist na Fase 6 (verificacao) e na Fase 6.5 (review plano vs entrega) sempre que a task consumir um design system (Open Design). Sem design system, ignore esta secao.

- o estilo consome `tokens.css` via custom properties (`var(--*)`); SEM hex/raio/espacamento inventado fora dos tokens;
- componentes batem com seletores/estados de `components.html` (default/hover/focus/active/disabled/loading/empty/error);
- **elementos interativos (botoes, links, cards clicaveis) tem estado `:hover`/`:focus` real, implementado como regra CSS/CSS-Modules/styled/Tailwind — NAO como `style={{}}` inline.** Inline style e estruturalmente incapaz de expressar `:hover`/`:focus`/`@keyframes`; se `components.html` especifica hover (ex.: `.btn-primary:hover { background: var(--accent-hover); transform: translateY(-1px); }`), o componente entregue precisa do equivalente real, nao so o estado default. Grep rapido de sanidade: proporcao alta de `style={{` sem nenhuma regra `:hover`/`:focus` no CSS do projeto e sinal de gate falho;
- accent usado no maximo 2x por pagina (hero + CTA) alem de links; sem flood; sem emoji como icone; sem sombra se Depth & Elevation = minimal;
- telas-chave conferidas contra o diretorio `preview/` (diferenca de layout/hierarquia/contraste; abrir `colors.html`, `spacing.html` ou `typography.html` conforme os arquivos disponiveis no system);
- anti-padroes da secao 9 do `DESIGN.md` ausentes do codigo final.

Trate violacao de design system como problema **BLOQUEANTE** quando contrariar requisito explicito (override sem justificativa, token inventado, accent flood, elemento interativo sem hover/focus real). Registre o achado em `{artefatos_dir}/plan-vs-output-review.md` (plano pre-definido) ou no fechamento da Fase 6 (execucao avulsa).

