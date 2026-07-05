# Fix Loop

## Responsabilidade
Orquestrar correção de erros.

## Fluxo

```
Input (Erro/Log)
    ↓
Diagnóstico
    ↓
Identificação de Causa Raiz
    ↓
Implementação de Correção
    ↓
Teste
    ↓
Output (Correção Aplicada)
```

## Agentes Envolvidos
- Fix Agent (principal)

## Inputs
- Descrição do erro
- Logs/Stack trace
- Contexto do problema

## Outputs
- Código corrigido
- Explicação da causa
- Testes (quando aplicável)

## Trigger
- Bug reportado
- Build falhou
- Lint error
- Teste falhou