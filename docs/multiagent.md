# Multiagentes — AI Workspace

## Visão Geral

A Fase 10 introduz o **Pipeline Multiagente Autônomo**: um sistema que encadeia 6 agentes especializados para desenvolver software de ponta a ponta a partir de um simples requisito em linguagem natural.

## Como Funciona

O usuário fornece uma descrição da tarefa. O pipeline executa automaticamente:

1. **🧠 Planner** — Analisa o requisito e cria plano estruturado com subtarefas, stack e estimativas
2. **🎨 Frontend Agent** — Gera HTML, CSS e JavaScript completos
3. **⚙️ Backend Agent** — Gera APIs REST, services e models
4. **🔍 Reviewer Agent** — Revisa todo o código, emite score e lista issues
5. **🔧 Fix Agent** — Corrige issues críticos e importantes (pulado se aprovado)
6. **🚀 Deploy Agent** — Gera configs de deploy e checklist

## Contexto Compartilhado

Cada agente vê as saídas de **todos os agentes anteriores**, garantindo coerência ao longo do pipeline. O contexto é acumulado e passado via prompt estruturado.

## Sessões

Cada execução gera uma sessão persistida em `multiagent/sessions/` com:
- ID único para rastreamento
- Output completo de cada agente
- Tempo de execução por etapa
- Status de cada agente (ok / skipped / error)

## CLI

```bash
workspace pipeline run "<tarefa>"
workspace pipeline sessions
workspace pipeline session <id>
```

## Referência Técnica

Veja `multiagent/README.md` para detalhes de arquitetura, presets e configuração por agente.
