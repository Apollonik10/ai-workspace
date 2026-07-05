# Multiagente — Fase 10

Pipeline autônomo de desenvolvimento de software com 6 agentes especializados.

## Arquitetura

```
Usuário
   │
   ▼
 Tarefa (linguagem natural)
   │
   ▼
┌─────────────┐
│  🧠 Planner  │  → Plano estruturado (objetivo, subtarefas, stack)
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ 🎨 Frontend  │  → Código HTML/CSS/JS completo
└──────┬──────┘
       │
       ▼
┌─────────────┐
│  ⚙️ Backend  │  → APIs, Services, Models
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ 🔍 Reviewer  │  → Score de qualidade + lista de issues
└──────┬──────┘
       │ issues críticos?
      YES                    NO
       │                      │
       ▼                      │
┌─────────────┐               │
│   🔧 Fix    │  → Código     │  [etapa pulada]
└──────┬──────┘   corrigido   │
       │                      │
       └──────────┬───────────┘
                  ▼
         ┌─────────────┐
         │  🚀 Deploy  │  → Config + Passos de deploy
         └─────────────┘
                  │
                  ▼
        Sessão salva em JSON
        Relatório no terminal
```

## Contexto Compartilhado

Cada agente recebe **todo o contexto acumulado** das etapas anteriores. Isso garante que:
- O Frontend Agent sabe o que o Planner definiu
- O Backend Agent sabe o que o Frontend gerou
- O Reviewer vê frontend + backend juntos
- O Fix corrige com base no relatório do Reviewer
- O Deploy sabe toda a stack

## Uso via CLI

```bash
# Executar pipeline com uma tarefa
workspace pipeline run "Criar uma landing page para produto SaaS com form de contato"

# Pipeline rápido (sem deploy, modelo menor)
workspace pipeline run "Criar API REST de usuários" --preset fast

# Pipeline com provedor específico
workspace pipeline run "Criar dashboard de analytics" --provider gemini

# Pipeline sem etapa de deploy
workspace pipeline run "Criar componente de tabela" --skip-deploy

# Pipeline com output verboso (exibe saída completa de cada agente)
workspace pipeline run "Criar sistema de login" --verbose

# Listar sessões anteriores
workspace pipeline sessions

# Ver detalhes de uma sessão
workspace pipeline session <id>
```

## Arquivos

```
multiagent/
├── orchestrator.js   # Motor do pipeline
├── pipeline.json     # Configuração e presets
├── sessions/         # Histórico de execuções (auto-gerado)
│   └── session-*.json
└── README.md         # Este arquivo
```

## Sessões

Cada execução gera um arquivo `sessions/session-<id>.json` com:
- `id` — identificador único
- `task` — tarefa original
- `provider` / `model` — LLM usado
- `started_at` / `finished_at` — timestamps
- `status` — `running` | `completed` | `error`
- `steps` — array com resultado de cada etapa (output, tempo, tentativas)
- `context` — contexto acumulado completo
- `summary` — resumo textual

## Presets

| Preset    | Provedor     | Modelo                      | Deploy | Uso                       |
|-----------|--------------|-----------------------------|--------|---------------------------|
| `fast`    | openrouter   | llama-3.1-8b-instruct:free  | Não    | Iterações rápidas         |
| `quality` | gemini       | gemini-2.0-flash            | Sim    | Desenvolvimento sério     |
| `full`    | grok         | grok-beta                   | Sim    | Pipeline completo premium |

## Configuração por Agente

No `pipeline.json`, você pode definir provedor e modelo por agente:

```json
{
  "agents": {
    "planner": { "provider": "gemini", "model": "gemini-1.5-pro" },
    "reviewer": { "provider": "deepseek", "model": "deepseek-reasoner" }
  }
}
```
