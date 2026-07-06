# Workspace CLI

CLI global do `ai-workspace`. Um único binário (`workspace`) para gerenciar
projetos, skills, agentes, loops, RAG, MCP, modelos de IA e o pipeline
multiagente — tudo rodando 100% no Termux, sem PC.

## Setup (uma vez só)

```bash
cd ~/projects/ai-workspace/workspace-cli
npm link
```

Isso registra o comando `workspace` globalmente no seu Termux (usa o campo
`bin` do `package.json` deste pacote — não precisa criar scripts extras em
`bin/` nem mexer no `PATH` manualmente).

Testar:
```bash
workspace --help
```

## Comandos

- `workspace status` — status geral do workspace
- `workspace roadmap` — visualiza o roadmap
- `workspace projects` / `workspace project <add|remove>` — catálogo de projetos
- `workspace skills` — lista skills disponíveis
- `workspace agents` / `workspace agent <add|remove>` — agentes cadastrados
- `workspace agent run "<tarefa>"` — **agente CLI autônomo** (ReAct: lê/escreve
  arquivos, roda comandos, com confirmação `[Y/n]` para ações perigosas).
  Usa `core/agent-loop.js` por baixo — provider padrão é **local (Ollama,
  offline)**; para usar nuvem numa chamada específica: `AGENT_PROVIDER=mimo workspace agent run "..."`
- `workspace loop` / `workspace loops` — loops de automação
- `workspace docs` — documentos em `docs/`
- `workspace rag <index|query>` — busca contextual
- `workspace mcp start` — servidor MCP via stdio
- `workspace models <available|test>` — provedores de IA em nuvem configurados
- `workspace local <status|ask|router>` — interage direto com o Ollama local
- `workspace pipeline <run|sessions|session>` — pipeline multiagente completo

## Notas

- Sempre rode a partir da raiz do `ai-workspace` (ou de qualquer subpasta —
  `core/tools.js` acha a raiz sozinho procurando `.git`).
- `agent run` é a via rápida para tarefas pontuais; `pipeline run` é o fluxo
  completo Planner → Frontend → Backend → Review → Fix → Deploy.
