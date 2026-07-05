# Git Loop

## Responsabilidade
Orquestrar operações Git.

## Fluxo

```
Input (Operação)
    ↓
Verificação de Estado
    ↓
Execução (add/commit/push/PR)
    ↓
Validação
    ↓
Output (Status)
```

## Agentes Envolvidos
- Deploy Agent (support)

## Inputs
- Operação desejada
- Mensagem de commit
- Branch target

## Outputs
- Status da operação
- URL do PR (se aplicável)
- Histórico de commits

## Trigger
- Feature completa
- Bug corrigido
- Deploy necessário
- Merge request