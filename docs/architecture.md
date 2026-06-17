# Arquitetura do AI Workspace

## Visão Geral

O AI Workspace é um ecossistema modular para desenvolvimento assistido por IA, organizado em camadas independentes e reutilizáveis.

## Componentes

```
┌─────────────────────────────────────────────┐
│                  CLI (workspace-cli)        │
├─────────────────────────────────────────────┤
│  Agents  │  Loops  │  RAG  │  MCP  │ Models│
├─────────────────────────────────────────────┤
│              Skills (conhecimento)          │
├─────────────────────────────────────────────┤
│              Docs (documentação)            │
├─────────────────────────────────────────────┤
│              Projects (código)              │
└─────────────────────────────────────────────┘
```

## Fluxo de Dados

1. CLI recebe comando do usuário
2. Agentes são instanciados conforme a tarefa
3. Agentes consultam Skills via RAG
4. Loops orquestram sequências de agentes
5. MCP conecta ferramentas externas
6. Models escolhe o modelo ideal para a tarefa

## Princípios

- **Modularidade**: cada componente é independente
- **Reutilização**: Skills e agentes são reutilizáveis entre projetos
- **Extensibilidade**: novo agente/skill/loop pode ser adicionado sem alterar o core
- **Separation of Concerns**: cada componente tem responsabilidade única