# Stack de Agentes

## Papeis

| Papel | Modelo | Subagent type | Quando usar |
|---|---|---|---|
| Executor principal | Claude | voce mesmo | triagem, split, integracao, verificacao, glue pequeno e alinhamento com o usuario |
| Executor geral | Codex gpt-5.4 medium | `codex:codex-rescue` | backend, testes, refactor localizado, bugfix, integracao tecnica |
| Review critico | Codex gpt-5.5 high | `codex:codex-rescue` | risco alto, auth, dados, concorrencia, review final |
| UI/front-end | AGY `--model flash --effort medium` | `cc-antigravity-plugin:antigravity-coder` | tarefas front-end do dia a dia, componentes, layouts, estados e polish visual |
| UI/front-end complexa | AGY `--model pro --effort high` | `cc-antigravity-plugin:antigravity-coder` | redesign mais complexo, fluxos visuais grandes, UX com mais ambiguidade |
| Analise cross-file | AGY read-only | `cc-antigravity-plugin:antigravity-agent` | arquitetura, impacto de refactor, orientacao de codebase |
| Imagem/asset | AGY (tool nativa `generate_imagem`) | `cc-antigravity-plugin:antigravity-coder` | mockups, assets, ilustracoes e pedidos explicitos de imagem |

**`antigravity-agent` e somente leitura.** Delegar implementacao (front-end, imagem, fan-out) a ele
e erro de roteamento — a task nao escreve nada. Toda implementacao AGY vai para `antigravity-coder`;
`antigravity-agent` fica reservado para analise, mapeamento e review sem escrita.

Codex e obrigatorio para tasks de backend, testes e review. Para tasks puramente front-end (`UI_FRONTEND`, `IMAGE_ASSET`), somente AGY e necessario — Codex nao participa dessas tasks. `cc-antigravity-plugin` 4.0.0+ (AGY 1.1.8+, 1.1.16 recomendado) e obrigatorio para front-end, imagem, contexto largo e fan-out nativo de subagentes Gemini (`--parallel`).

Excecao: quando a execucao partir de um plano pre-definido, Codex high entra como review read-only de plano-vs-entrega, inclusive para UI/front-end puro. Ele nao implementa UI/asset nem faz fallback dessas tasks; apenas compara o baseline inicial com o resultado gerado.

## Heuristica Codex

Use `gpt-5.4-codex --effort medium` para:

- implementar backend e glue code;
- corrigir testes;
- atualizar docs tecnicas;
- refactors localizados;
- investigar causa raiz quando a area e clara.

Use `gpt-5.5-codex --effort high` para:

- revisar diffs com risco;
- comparar plano pre-definido com entrega gerada;
- auth/autorizacao;
- migrations e integridade de dados;
- concorrencia/performance sensivel;
- refactor amplo em areas criticas;
- investigacao dificil quando medium falhou.

## Heuristica Antigravity (AGY)

O bridge resolve `--model` dinamicamente contra o catalogo de `agy models` (cache de 24h, fallback
de emergencia se a descoberta falhar). Use aliases de familia em vez de slugs fixos — o bridge
resolve para o membro mais novo daquela familia, entao a prosa nao envelhece a cada release do AGY.

Use `--model flash --effort medium` para:

- UI/front-end do dia a dia;
- componentes e estados comuns;
- ajustes visuais e responsividade;
- tarefas multi-arquivo que pedem contexto largo, mas sem profundidade maxima.

Use `--model pro --effort high` para:

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

`--read-only` ja implica `--mode plan` e desliga `--dangerously-skip-permissions`/auto `--add-dir`.
Nao combine com `--disable-slash-commands`.

Use `--generate-image` para:

- mockups ou assets pedidos explicitamente pelo usuario;
- imagens guiadas por arquivos de referencia via `--files`;
- saida em diretorio especifico via `--output-dir` quando houver destino claro;
- a tool nativa `generate_imagem` do AGY gera a imagem sem trocar o modelo da sessao.

Use `--parallel` para:

- varios entregaveis AGY independentes (relatorios, componentes, arquivos) sem dependencia entre si e sem Codex na wave;
- o AGY decide a contagem de subagentes Gemini nativos, executa em paralelo e agrega os resultados;
- combine com `--subagent-model flash` para usar subagentes mais baratos sob um planejador mais capaz (`--subagent-model` implica `--parallel`);
- combine com `--format stream-json` para acompanhar progresso incremental em `stderr` sem misturar com a resposta final em `stdout`;
- ao final o AGY reporta os Conversation IDs de cada subagente nativo.

Nao use `--parallel` quando:

- a wave mistura AGY e Codex (use waves na camada Claude);
- os entregaveis dependem uns dos outros ou compartilham estado;
- o task precisar de monitoramento ou formato de retorno por fatia.

Nao combine `--parallel` com `--generate-image` (o bridge ignora `--parallel` nesse caso).

`--agent <nome>` seleciona um agente customizado do AGY e exige valor; o Executor e headless e nunca
usa `--interactive` (sessao humana em PTY).

## Fallback gradual de modelo

Antes de pausar para o usuario, percorra a escada automaticamente e registre cada degrau em `fallbacks_acionados` no checkpoint.

**AGY:**

| Degrau | Modelo/modo | Condicao de ativacao |
|---|---|---|
| 1 | `--model pro --effort high` | tentativa inicial |
| 2 | `--model flash --effort medium` | pro falhou por cota/timeout |
| 3 | Executor (Claude) direto | flash tambem falhou |
| — | Pausa para usuario | task e de imagem/asset (sem fallback possivel) |

**Codex:**

| Degrau | Modelo/modo | Condicao de ativacao |
|---|---|---|
| 1 | `gpt-5.5-codex high` | tentativa inicial (risco alto) |
| 2 | `gpt-5.4-codex medium` | high falhou por cota |
| 3 | Executor (Claude) direto | medium tambem falhou em implementacao |
| — | Review interno pelo executor | medium falhou em revisao (nao delega) |

**Executor (Claude) direto:** o executor le os arquivos, implementa as mudancas, verifica e reporta como `FALLBACK_EXECUTOR`. E a ultima opcao antes de parar e perguntar ao usuario. Nao aplica a tasks de imagem/asset (sem substituto viavel).

## Falhas do AGY

O bridge do `cc-antigravity-plugin` pode emitir sinais brutos `QUOTA_EXAUSTED`, `AUTH_REQUIRED`, `TIMEOUT` e `AGY_MISSING`. No contexto do executor:

- normalize `QUOTA_EXAUSTED` para `QUOTA_EXHAUSTED`;
- registre o sinal bruto como evidencia;
- aplique a escada de fallback antes de pausar para o usuario;
- ao retomar apos `QUOTA_EXHAUSTED`, prefira `--conversation <id>` quando o envelope de erro trouxer
  um `conversation_id` exato; use `--continue` somente quando nao houver ID disponivel — isso evita
  perder a conversa original ao retomar depois da renovacao de quota.

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
| UI/front-end isolado | 1 AGY `--model flash --effort medium` (sem Codex) |
| UI/front-end complexa | 1 AGY `--model pro --effort high` (sem Codex) |
| Mapear impacto antes de refactor | 1 AGY read-only + execucao com Codex |
| asset visual pedido explicitamente | 1 AGY `--generate-image` (sem Codex) |
| varios relatorios/componentes AGY independentes | 1 AGY `--parallel` (fan-out nativo); `--subagent-model flash` para subagentes baratos |
| feature slice pequena full-stack | AGY no front + Codex no backend se ownership for disjunto; criar `interface-contract.md` antes de delegar |
| N modulos/dominios independentes | N agentes em paralelo; sem teto — cada slice disjunto vira um agente |
| risco alto | Codex high review antes/depois |
| plano pre-definido | executar sobre o baseline + Codex high read-only em `{artefatos_dir}/plan-vs-output-review.md` |
| AGY indisponivel, task de UI | executor (Claude) direto apos escada de fallback |

## Regra de ownership

Sempre diga aos agentes que eles nao estao sozinhos no repositorio:

```text
Voce nao esta sozinho no codebase. Outros agentes podem editar outras areas em paralelo. Nao reverta mudancas que voce nao fez. Respeite seu ownership e adapte sua implementacao aos diffs existentes.
```
