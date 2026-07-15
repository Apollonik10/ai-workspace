# Roadmap AI Workspace

## Fase 0 — Fundação ✅
- [x] Criar estrutura de pastas
- [x] Git init
- [x] Documentação base

## Fase 1 — Documentação ✅
- [x] arquitetura.md
- [x] roadmap.md
- [x] workflow-solid.md
- [x] loops.md
- [x] agentes.md

## Fase 2 — Skills ✅
- [x] git.skill.md
- [x] frontend.skill.md
- [x] backend.skill.md
- [x] firebase.skill.md
- [x] vercel.skill.md
- [x] session-close.skill.md

## Fase 3 — Agentes ✅
- [x] planner-agent
- [x] frontend-agent
- [x] backend-agent
- [x] reviewer-agent
- [x] fix-agent
- [x] deploy-agent

## Fase 4 — Loops ✅
- [x] planning-loop
- [x] review-loop
- [x] fix-loop
- [x] git-loop
- [x] deploy-loop

## Fase 5 — Catálogo de Projetos ✅
- [x] Registro de projetos (catalog.json)
- [x] Schema de validação (registry.schema.json)
- [x] Metadados completos
- [x] Templates (web-app, api, mobile-app)
- [x] Histórico

## Fase 6 — CLI Workspace ✅
- [x] workspace init
- [x] workspace project
- [x] workspace agent
- [x] workspace loop
- [x] workspace docs

## Fase 7 — RAG ✅
- [x] Indexação de documentos
- [x] Busca semântica
- [x] Consulta contextual

## Fase 8 — MCP ✅
- [x] GitHub
- [x] Vercel
- [x] Firebase
- [x] APIs externas

## Fase 9 — Modelos ✅
- [x] Mimo (roteador inteligente multi-provedor)
- [x] Gemini (Google AI — gemini-2.0-flash, gemini-1.5-pro)
- [x] NVIDIA NIM (llama3-70b, mistral, codestral)
- [x] OpenRouter (100+ modelos, acesso unificado)
- [x] OpenAI (gpt-4o, gpt-4o-mini)
- [x] DeepSeek (deepseek-chat, deepseek-coder)
- [x] Grok (xAI — grok-beta)
- [x] providers.json (catálogo completo de modelos)
- [x] Comando CLI: workspace models
- [x] Local (Ollama/Termux) — roteamento automático entre modelo de triagem (0.5B) e coder (1.5B)
- [x] Mimo com fallback real para modelo local quando nenhuma API na nuvem está configurada
- [x] Comando CLI: workspace local (status, ask, router)

## Fase 10 — Multiagentes ✅
- [x] Pipeline autônomo Planner → Frontend → Backend → Review → Fix → Deploy
- [x] Contexto compartilhado entre agentes
- [x] System prompts especializados por agente
- [x] Roteamento inteligente (skip Fix se aprovado)
- [x] Retry automático por agente (2 tentativas)
- [x] Sessões persistidas em JSON (multiagent/sessions/)
- [x] Presets: fast, quality, full
- [x] Comando CLI: workspace pipeline run/sessions/session

## Fase 11 — Interface PWA
- [x] Chat Web local (integração Mimo/Ollama com streaming e controle de geração)
- [ ] Dashboard
- [ ] Projetos
- [ ] Agentes
- [ ] Loops
- [ ] Logs
- [ ] Configurações

## Fase 12 — Agente CLI com Function Calling ✅
- [x] core/tools.js (read_file, write_file, list_dir, run_command, sandboxing por safePath)
- [x] core/safety.js (confirmação [Y/n] para ações perigosas)
- [x] core/prompt-builder.js (system prompt + skills carregadas por contexto)
- [x] core/agent-loop.js (loop ReAct: pensar → agir → observar, MAX_STEPS=15)
- [x] Integração via `workspace agent run "<tarefa>"` (workspace-cli/index.js)
- [x] Fix: PROJECT_ROOT resolvido por .git/package.json em vez de cwd (evita falhas quando executado de subpasta)
- [x] Fix: provider padrão do agente é `local` (Ollama, offline) — nuvem (`mimo`) vira opt-in via AGENT_PROVIDER
- [x] Testado: sandboxing de path, list_dir/read_file/write_file, loop ReAct simulado (mock de modelo) ponta a ponta

## Fase 13 — Agente Coding avançado ✅
- [x] setProjectRoot / getProjectRoot — agente age em qualquer projeto (não só ai-workspace)
- [x] Nova ferramenta: edit_file (edição parcial sem reescrever o arquivo inteiro)
- [x] Nova ferramenta: search_files (grep nos arquivos do projeto)
- [x] Nova ferramenta: make_dir (cria diretórios)
- [x] run_command com spawnSync: timeout maior (60s), buffer 4MB, exit_code no retorno
- [x] System prompt focado em coding agent: workflow git completo, exemplos reais, regras
- [x] MAX_STEPS aumentado para 30 (permite tarefas mais complexas)
- [x] AGENT_PROVIDER padrão alterado para `local` (Ollama offline/offline por padrão, com mimo opcional)
- [x] Flag --auto / -y: aprovação automática sem confirmação (modo não-interativo)
- [x] Flag --project /caminho: age em qualquer projeto do sistema
- [x] Flag --provider gemini: sobrescreve modelo na chamada
- [x] Modo REPL: `workspace agent chat` — sessão contínua com múltiplas tarefas
- [x] safety.js: mostra detalhes legíveis da ação, suporta 's' para pular sem cancelar loop
- [x] model-router.js: histórico formatado legível, trunca contexto longo automaticamente
- [x] Parser JSON robusto: remove fences, comentários e texto fora do objeto JSON
- [x] DEBUG_AGENT=1 para logs detalhados de erros

## Fase 14 — Agente CLI Avançado, Resiliente e Integrado ✅
- [x] RAG inteligente no prompt-builder: busca BM25 automática de skills e documentação mais relevantes à tarefa (evita estourar limite de tokens)
- [x] Loop de Feedback por Testes no System Prompt: obrigatoriedade de rodar scripts de teste/linter (run_command) e auto-correção em caso de falha antes de concluir a tarefa
- [x] Persistência de Sessões: histórico de pensamentos/ações ReAct do agente CLI salvo em tempo real em `sessions/<sessionId>.json`
- [x] Retomada de Sessão: comando `workspace agent run --resume <sessionId>` para continuar loops interrompidos por erro ou cancelados
- [x] Gerenciamento de Sessão na CLI: subcomando `workspace agent sessions` para listar sessões e `workspace agent session <ID>` para detalhar histórico