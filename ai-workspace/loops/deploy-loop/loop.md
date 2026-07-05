# Deploy Loop

## Responsabilidade
Orquestrar processo de deploy.

## Fluxo

```
Input (Código Pronto)
    ↓
Verificação Pré-Deploy
    ↓
Build
    ↓
Deploy
    ↓
Verificação Pós-Deploy
    ↓
Output (Deploy Concluído)
```

## Agentes Envolvidos
- Deploy Agent (principal)
- Reviewer Agent (pré-deploy)

## Inputs
- Código para deploy
- Configurações de ambiente
- Target (preview/production)

## Outputs
- URL do deploy
- Status do build
- Logs
- Notificação

## Trigger
- Merge para main
- Deploy manual
- Release