/**
 * multiagent/orchestrator.js
 * Fase 10 — Orquestrador do Pipeline Multiagente Autônomo
 *
 * Pipeline: Planner → Frontend → Backend → Reviewer → Fix → Deploy
 *
 * Cada agente:
 *  - Recebe o contexto acumulado das etapas anteriores
 *  - Gera sua contribuição via LLM (models/client.js)
 *  - Adiciona resultado ao contexto compartilhado
 *  - Pode sinalizar SKIP (etapa não aplicável) ou ABORT (falha crítica)
 *
 * Uso:
 *   import { runPipeline } from './multiagent/orchestrator.js';
 *   const result = await runPipeline({ task: 'Criar landing page...', provider: 'mimo' });
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateText } from '../models/client.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const WORKSPACE_ROOT = path.resolve(__dirname, '..');

// ─── Cores para terminal ───────────────────────────────────────────────────────
const C = {
  reset:   '\x1b[0m',
  bright:  '\x1b[1m',
  dim:     '\x1b[2m',
  red:     '\x1b[31m',
  green:   '\x1b[32m',
  yellow:  '\x1b[33m',
  blue:    '\x1b[34m',
  magenta: '\x1b[35m',
  cyan:    '\x1b[36m',
  gray:    '\x1b[90m',
};

// ─── Utilidades ────────────────────────────────────────────────────────────────

function now() {
  return new Date().toISOString();
}

function elapsed(startMs) {
  const ms = Date.now() - startMs;
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

function log(icon, label, msg, color = C.reset) {
  const ts = new Date().toLocaleTimeString('pt-BR');
  console.log(`${C.dim}[${ts}]${C.reset} ${color}${icon} ${C.bright}${label}${C.reset}${color}: ${msg}${C.reset}`);
}

function logSection(title, color = C.cyan) {
  const bar = '─'.repeat(45);
  console.log(`\n${color}${C.bright}${bar}`);
  console.log(`  ${title}`);
  console.log(`${bar}${C.reset}\n`);
}

function saveSession(session) {
  const sessionsDir = path.join(__dirname, 'sessions');
  if (!fs.existsSync(sessionsDir)) fs.mkdirSync(sessionsDir, { recursive: true });

  const filename = `session-${session.id}.json`;
  const filePath = path.join(sessionsDir, filename);
  fs.writeFileSync(filePath, JSON.stringify(session, null, 2), 'utf8');
  return filePath;
}

function loadPipelineConfig() {
  const configPath = path.join(__dirname, 'pipeline.json');
  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (e) {
    return null;
  }
}

// ─── System prompts por agente ─────────────────────────────────────────────────

const AGENT_PROMPTS = {
  planner: `Você é o Planner Agent de um pipeline de desenvolvimento de software autônomo.

Sua função: analisar o requisito do usuário e criar um plano de execução estruturado.

REGRAS:
- Seja específico e acionável
- Divida em subtarefas claras para Frontend, Backend e Deploy
- Identifique dependências entre tarefas
- Estime complexidade (baixa/média/alta)
- Formato de saída: markdown estruturado com seções

FORMATO DE SAÍDA OBRIGATÓRIO:
## Objetivo
[descrição clara do que será construído]

## Subtarefas Frontend
- [tarefa 1]
- [tarefa 2]

## Subtarefas Backend
- [tarefa 1]
- [tarefa 2]

## Subtarefas Deploy
- [tarefa 1]

## Stack Sugerida
[tecnologias recomendadas]

## Complexidade Estimada
[baixa/média/alta] — [justificativa em 1 linha]`,

  frontend: `Você é o Frontend Agent de um pipeline de desenvolvimento autônomo.

Sua função: com base no plano do Planner, gerar o código frontend completo e funcional.

REGRAS:
- Use HTML5 semântico + CSS moderno + JavaScript vanilla (sem frameworks, a menos que o plano especifique)
- Inclua design responsivo e acessível
- Comente seções importantes do código
- Se for uma tela/componente, gere o código completo, não apenas esboços
- Use variáveis CSS para tokens de design

FORMATO DE SAÍDA:
## Componentes Gerados
[lista do que foi criado]

## Código
[código frontend completo com comentários]

## Decisões de Design
[justificativas das escolhas]`,

  backend: `Você é o Backend Agent de um pipeline de desenvolvimento autônomo.

Sua função: com base no plano e no frontend, gerar o código backend (APIs, services, models).

REGRAS:
- Prefira Node.js/Express ou Firebase Functions (conforme stack do plano)
- Inclua validação de input, tratamento de erros e logging
- Documente cada endpoint com método, rota, body e response
- Siga princípios SOLID e Clean Architecture
- Não exponha secrets ou dados sensíveis

FORMATO DE SAÍDA:
## Endpoints Gerados
[lista de rotas e métodos]

## Código
[código backend completo]

## Modelos de Dados
[schemas/interfaces definidos]`,

  reviewer: `Você é o Reviewer Agent de um pipeline de desenvolvimento autônomo.

Sua função: revisar criticamente todo o código gerado pelas etapas anteriores.

REGRAS:
- Avalie segurança, performance, manutenibilidade e boas práticas
- Seja específico: aponte arquivo/trecho problemático
- Classifique issues: CRÍTICO / IMPORTANTE / SUGESTÃO
- Se tudo estiver OK, diga explicitamente "APROVADO"
- Se houver problemas críticos, liste exatamente o que o Fix Agent deve corrigir

FORMATO DE SAÍDA:
## Status Geral
[APROVADO | REQUER CORREÇÃO]

## Issues Encontradas
### 🔴 Críticas
- [issue]

### 🟡 Importantes
- [issue]

### 🔵 Sugestões
- [sugestão]

## Score de Qualidade
[0-10] — [justificativa]`,

  fix: `Você é o Fix Agent de um pipeline de desenvolvimento autônomo.

Sua função: corrigir todos os problemas CRÍTICOS e IMPORTANTES apontados pelo Reviewer.

REGRAS:
- Leia com atenção o relatório de revisão
- Corrija apenas o que foi apontado — não refatore o que não foi pedido
- Para cada correção, explique brevemente o que mudou e por quê
- Se não houver críticos/importantes, responda: "Nenhuma correção necessária."
- Gere o código corrigido completo

FORMATO DE SAÍDA:
## Correções Aplicadas
[lista numerada de correções]

## Código Corrigido
[somente os trechos alterados, com contexto suficiente]

## Validação
[como verificar que as correções funcionam]`,

  deploy: `Você é o Deploy Agent de um pipeline de desenvolvimento autônomo.

Sua função: criar o plano de deploy e os arquivos de configuração necessários.

REGRAS:
- Baseie-se na stack definida pelo Planner
- Gere arquivos de config reais (Dockerfile, vercel.json, firebase.json, etc.)
- Liste todos os passos para deploy em ordem
- Inclua checklist de verificação pós-deploy
- Se aplicável, gere scripts de CI/CD (GitHub Actions)

FORMATO DE SAÍDA:
## Estratégia de Deploy
[plataforma e abordagem escolhida]

## Arquivos de Configuração
[configs geradas]

## Passos para Deploy
1. [passo]
2. [passo]

## Checklist Pós-Deploy
- [ ] [item]

## Rollback
[plano de rollback em caso de falha]`,
};

// ─── Execução de um agente ──────────────────────────────────────────────────────

async function runAgent(agentName, task, context, options = {}) {
  const { provider = 'mimo', model, retries = 2 } = options;
  const systemPrompt = AGENT_PROMPTS[agentName];

  // Monta prompt com contexto acumulado
  const contextBlock = Object.entries(context)
    .filter(([key]) => key !== agentName)
    .map(([key, val]) => `### Saída do ${key.charAt(0).toUpperCase() + key.slice(1)} Agent\n${val}`)
    .join('\n\n');

  const userPrompt = `## Tarefa Original do Usuário\n${task}\n\n${contextBlock ? `## Contexto das Etapas Anteriores\n${contextBlock}\n\n` : ''}Agora execute sua responsabilidade como ${agentName.toUpperCase()} AGENT.`;

  let lastError;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const output = await generateText(provider, userPrompt, {
        model,
        systemInstruction: systemPrompt,
      });
      return { success: true, output, attempt };
    } catch (err) {
      lastError = err;
      if (attempt < retries) {
        log('⟳', agentName, `Tentativa ${attempt} falhou, retentando... (${err.message})`, C.yellow);
        await new Promise(r => setTimeout(r, 1500 * attempt));
      }
    }
  }
  return { success: false, output: null, error: lastError?.message, attempt: retries };
}

// ─── Pipeline principal ────────────────────────────────────────────────────────

/**
 * Executa o pipeline completo: Planner → Frontend → Backend → Reviewer → Fix → Deploy
 *
 * @param {object} opts
 * @param {string} opts.task        — requisito em linguagem natural
 * @param {string} [opts.provider]  — provedor de LLM (padrão: mimo)
 * @param {string} [opts.model]     — modelo específico (opcional)
 * @param {boolean} [opts.skipDeploy] — pula etapa de deploy
 * @param {boolean} [opts.verbose]  — exibe outputs completos no terminal
 * @returns {Promise<PipelineSession>}
 */
export async function runPipeline(opts = {}) {
  const {
    task,
    provider = 'mimo',
    model,
    skipDeploy = false,
    verbose = false,
  } = opts;

  if (!task?.trim()) throw new Error('A tarefa (task) é obrigatória para executar o pipeline.');

  const sessionId = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const startTime = Date.now();

  const session = {
    id: sessionId,
    task,
    provider,
    model: model || 'auto',
    started_at: now(),
    finished_at: null,
    status: 'running',
    steps: [],
    context: {},
    summary: null,
  };

  const config = loadPipelineConfig();
  // Resolução de provider: usuário > config por agente > padrão do pipeline
  const userOverridesProvider = provider && provider !== 'mimo';
  const agentOptions = (name) => ({
    provider: userOverridesProvider
      ? provider
      : (config?.agents?.[name]?.provider !== 'mimo' ? config?.agents?.[name]?.provider : null) || provider,
    model:    model || config?.agents?.[name]?.model || null,
    retries:  config?.agents?.[name]?.retries  || 2,
  });

  // Pipeline steps definition
  const PIPELINE = [
    { name: 'planner',  icon: '🧠', color: C.magenta, label: 'Planejamento'       },
    { name: 'frontend', icon: '🎨', color: C.blue,    label: 'Frontend'           },
    { name: 'backend',  icon: '⚙️ ', color: C.yellow,  label: 'Backend'            },
    { name: 'reviewer', icon: '🔍', color: C.cyan,    label: 'Revisão de Código'  },
    { name: 'fix',      icon: '🔧', color: C.red,     label: 'Correções'          },
    { name: 'deploy',   icon: '🚀', color: C.green,   label: 'Deploy'             },
  ].filter(step => !(step.name === 'deploy' && skipDeploy));

  logSection(`🤖 PIPELINE MULTIAGENTE  —  sessão ${sessionId}`, C.magenta);
  log('📋', 'Tarefa', task.substring(0, 120) + (task.length > 120 ? '...' : ''), C.cyan);
  log('🔌', 'Provedor', provider + (model ? ` / ${model}` : ' (auto)'), C.gray);
  console.log('');

  for (const step of PIPELINE) {
    const stepStart = Date.now();
    logSection(`${step.icon}  Etapa: ${step.label}`, step.color);

    const result = await runAgent(step.name, task, session.context, agentOptions(step.name));

    const stepRecord = {
      agent: step.name,
      label: step.label,
      status: result.success ? 'ok' : 'error',
      attempts: result.attempt,
      elapsed: elapsed(stepStart),
      output: result.output,
      error: result.error || null,
    };

    session.steps.push(stepRecord);

    if (result.success) {
      log('✔', step.name, `concluído em ${elapsed(stepStart)}`, step.color);
      session.context[step.name] = result.output;

      if (verbose && result.output) {
        console.log(`\n${C.dim}${result.output}${C.reset}\n`);
      } else if (result.output) {
        // Exibe apenas primeiras 3 linhas como preview
        const preview = result.output.split('\n').slice(0, 3).join('\n');
        console.log(`${C.dim}  ↳ ${preview}${C.reset}`);
      }

      // Se reviewer diz "APROVADO", marca fix como skip
      if (step.name === 'reviewer') {
        const approved = result.output?.toLowerCase().includes('aprovado');
        if (approved) {
          log('⏭', 'fix', 'Código aprovado pelo Reviewer — etapa Fix pulada', C.green);
          session.steps.push({
            agent: 'fix',
            label: 'Correções',
            status: 'skipped',
            attempts: 0,
            elapsed: '0ms',
            output: 'Pulado — código aprovado pelo Reviewer',
            error: null,
          });
          session.context['fix'] = 'Nenhuma correção necessária — código aprovado.';
          // Remove 'fix' do restante do pipeline se ainda não foi processado
          const fixIdx = PIPELINE.findIndex(s => s.name === 'fix');
          if (fixIdx > PIPELINE.indexOf(step)) PIPELINE.splice(fixIdx, 1);
        }
      }

    } else {
      log('✘', step.name, `FALHOU após ${result.attempt} tentativas: ${result.error}`, C.red);
      session.status = 'error';
      session.finished_at = now();
      session.summary = `Pipeline abortado na etapa "${step.label}": ${result.error}`;
      const savedPath = saveSession(session);
      logSection('❌ PIPELINE ABORTADO', C.red);
      log('💾', 'Sessão salva', savedPath, C.gray);
      return session;
    }
  }

  // ─── Relatório Final ──────────────────────────────────────────────────────────
  session.status = 'completed';
  session.finished_at = now();
  session.summary = buildSummary(session);

  const savedPath = saveSession(session);

  logSection('✅  PIPELINE CONCLUÍDO', C.green);
  printFinalReport(session, savedPath);

  return session;
}

// ─── Relatório ─────────────────────────────────────────────────────────────────

function buildSummary(session) {
  const total = session.steps.filter(s => s.status !== 'skipped').length;
  const ok    = session.steps.filter(s => s.status === 'ok').length;
  const skip  = session.steps.filter(s => s.status === 'skipped').length;
  return `Pipeline concluído: ${ok}/${total} etapas OK, ${skip} puladas.`;
}

function printFinalReport(session, savedPath) {
  console.log(`\n${C.bright}${C.cyan}╔${'═'.repeat(47)}╗${C.reset}`);
  console.log(`${C.bright}${C.cyan}║  📊  RELATÓRIO DO PIPELINE${' '.repeat(21)}║${C.reset}`);
  console.log(`${C.bright}${C.cyan}╚${'═'.repeat(47)}╝${C.reset}\n`);

  console.log(`${C.bright}Sessão:${C.reset}  ${session.id}`);
  console.log(`${C.bright}Início:${C.reset}  ${session.started_at}`);
  console.log(`${C.bright}Fim:${C.reset}     ${session.finished_at}`);
  console.log(`${C.bright}Status:${C.reset}  ${C.green}${session.status.toUpperCase()}${C.reset}\n`);

  console.log(`${C.bright}Etapas:${C.reset}`);
  session.steps.forEach(step => {
    const icon  = step.status === 'ok'      ? `${C.green}✔${C.reset}` :
                  step.status === 'skipped' ? `${C.yellow}⏭${C.reset}` :
                                              `${C.red}✘${C.reset}`;
    const time  = step.elapsed !== '0ms' ? ` ${C.dim}(${step.elapsed})${C.reset}` : '';
    console.log(`  ${icon} ${C.bright}${step.label}${C.reset}${time}`);
  });

  console.log(`\n${C.bright}Resumo:${C.reset} ${session.summary}`);
  console.log(`${C.bright}Salvo:${C.reset}  ${C.dim}${savedPath}${C.reset}\n`);
  console.log(`${C.dim}Use "workspace pipeline session <id>" para ver detalhes da sessão.${C.reset}\n`);
}

// ─── Listar / ver sessões ──────────────────────────────────────────────────────

export function listSessions() {
  const sessionsDir = path.join(__dirname, 'sessions');
  if (!fs.existsSync(sessionsDir)) return [];
  return fs.readdirSync(sessionsDir)
    .filter(f => f.endsWith('.json'))
    .map(f => {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(sessionsDir, f), 'utf8'));
        return {
          id: data.id,
          task: data.task?.substring(0, 60) + (data.task?.length > 60 ? '...' : ''),
          status: data.status,
          started_at: data.started_at,
          steps: data.steps?.length || 0,
        };
      } catch { return null; }
    })
    .filter(Boolean)
    .sort((a, b) => b.started_at.localeCompare(a.started_at));
}

export function getSession(id) {
  const sessionsDir = path.join(__dirname, 'sessions');
  const files = fs.existsSync(sessionsDir)
    ? fs.readdirSync(sessionsDir).filter(f => f.includes(id))
    : [];
  if (files.length === 0) return null;
  try {
    return JSON.parse(fs.readFileSync(path.join(sessionsDir, files[0]), 'utf8'));
  } catch { return null; }
}
