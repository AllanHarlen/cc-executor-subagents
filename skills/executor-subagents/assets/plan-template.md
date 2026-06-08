# Execution Brief

## Demanda
<uma frase sobre o objetivo>

## Risco
LOW | MEDIUM | HIGH

## Suposicoes
- <suposicao feita para evitar pergunta desnecessaria>

## Plano pre-definido
- Existe: sim | nao
- Fonte: <arquivo, mensagem do usuario, checkpoint ou N/A>
- Baseline preservado em: `{artefatos_dir}/initial-plan-baseline.md` | N/A
- Review final obrigatorio: sim | nao

## Slices
| Slice | Owner | Pode editar | Nao editar | Criterio de aceite |
|---|---|---|---|---|
| A | <executor/agente> | <arquivos> | <arquivos> | <resultado> |

## Waves
| Wave | Slices | Por que podem rodar juntas |
|---|---|---|
| 1 | A, B | ownership disjunto |

## Verificacao
- <comando/teste>

## Contrato de interface
- Necessario: sim | nao
- Arquivo: `{artefatos_dir}/interface-contract.md` (se necessario)

## Riscos e rollback
- Risco:
- Rollback:
