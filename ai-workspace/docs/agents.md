# Agentes Especializados

## Visão Geral

Cada agente possui uma responsabilidade única e skills específicas.

## Agentes

### Planner Agent
- **Responsabilidade**: Planejamento e orquestração
- **Skills**: workflow-solid, git
- **Entrada**: Requisitos do usuário
- **Saída**: Plano de execução estruturado

### Frontend Agent
- **Responsabilidade**: Interface do usuário
- **Skills**: frontend, react
- **Entrada**: Design/Requisitos de UI
- **Saída**: Componentes, estilos, layouts

### Backend Agent
- **Responsabilidade**: APIs e lógica de servidor
- **Skills**: backend, firebase
- **Entrada**: Requisitos de API
- **Saída**: Endpoints, services, models

### Reviewer Agent
- **Responsabilidade**: Revisão de código
- **Skills**: workflow-solid
- **Entrada**: Código para revisar
- **Saída**: Relatório de revisão com sugestões

### Fix Agent
- **Responsabilidade**: Correção de bugs e erros
- **Skills**: backend, frontend
- **Entrada**: Erros/falhas reportados
- **Saída**: Código corrigido

### Deploy Agent
- **Responsabilidade**: Deploy e publicação
- **Skills**: git, vercel
- **Entrada**: Código pronto para deploy
- **Saída**: Deploy concluído com status

## Comunicação entre Agentes

Agentes se comunicam via mensagens estruturadas:
- Input: JSON com contexto e tarefa
- Output: JSON com resultado e metadata