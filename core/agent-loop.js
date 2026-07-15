import { tools, DANGEROUS_ACTIONS, setProjectRoot, getProjectRoot } from './tools.js';
import { confirmAction } from './safety.js';
import { buildSystemPrompt } from './prompt-builder.js';
import { callModel } from './model-router.js';

const MAX_STEPS = 30; // permite tarefas mais complexas

// Cores ANSI
const C = {
  reset:   '\x1b[0m',
  bold:    '\x1b[1m',
  dim:     '\x1b[2m',
  red:     '\x1b[31m',
  green:   '\x1b[32m',
  yellow:  '\x1b[33m',
  blue:    '\x1b[34m',
  magenta: '\x1b[35m',
  cyan:    '\x1b[36m',
  gray:    '\x1b[90m',
};

/**
 * Loop ReAct principal do agente de programação.
 *
 * @param {string} taskDescription — Tarefa a executar
 * @param {object} opts
 * @param {boolean} opts.autoMode    — true: sem confirmações (todas ações aprovadas automaticamente)
 * @param {string}  opts.projectPath — Caminho do projeto-alvo (default: cwd → .git)
 * @param {string}  opts.provider    — Sobrescreve o provider do model-router (mimo, gemini, deepseek, local...)
 */
export async function runAgent(taskDescription, opts = {}) {
  const { autoMode = false, projectPath, provider } = opts;

  // Configura o projeto-alvo
  if (projectPath) {
    setProjectRoot(projectPath);
  }
  const root = getProjectRoot();

  // Sobrescreve provider se passado
  if (provider) {
    process.env.AGENT_PROVIDER = provider;
  }

  const agentProvider = process.env.AGENT_PROVIDER || 'mimo';

  console.log(`\n${C.magenta}${C.bold}╔══════════════════════════════════════════╗${C.reset}`);
  console.log(`${C.magenta}${C.bold}║       🤖 Agente de Programação CLI       ║${C.reset}`);
  console.log(`${C.magenta}${C.bold}╚══════════════════════════════════════════╝${C.reset}`);
  console.log(`${C.cyan}📁 Projeto:${C.reset}  ${root}`);
  console.log(`${C.cyan}🧠 Modelo:${C.reset}   ${agentProvider}`);
  console.log(`${C.cyan}🔐 Modo:${C.reset}     ${autoMode ? `${C.yellow}AUTO (sem confirmações)${C.reset}` : `${C.green}SEGURO (confirma ações)${C.reset}`}`);
  console.log(`${C.cyan}📋 Tarefa:${C.reset}   ${C.bold}"${taskDescription}"${C.reset}\n`);

  const systemPrompt = buildSystemPrompt(taskDescription);
  const history = [
    { role: 'system', content: systemPrompt },
    { role: 'user',   content: taskDescription },
  ];

  let consecutiveErrors = 0;
  const MAX_CONSECUTIVE_ERRORS = 3;

  for (let step = 1; step <= MAX_STEPS; step++) {
    console.log(`${C.blue}─────────────────────────────────────────${C.reset}`);
    console.log(`${C.cyan}🔄 Passo ${step}/${MAX_STEPS}${C.reset} ${C.dim}Consultando modelo...${C.reset}`);

    let raw;
    try {
      raw = await callModel(history);
    } catch (err) {
      console.error(`${C.red}❌ Erro na chamada ao modelo: ${err.message}${C.reset}`);
      consecutiveErrors++;
      if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
        console.error(`${C.red}${C.bold}Muitos erros consecutivos. Abortando.${C.reset}`);
        return { success: false, reason: 'model_error', error: err.message };
      }
      await sleep(2000);
      continue;
    }

    // Limpa markdown/blocos de código que o modelo possa ter adicionado
    let cleanRaw = raw.trim();
    // Remove blocos ```json ... ``` ou ``` ... ```
    const fenceMatch = cleanRaw.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) {
      cleanRaw = fenceMatch[1].trim();
    }
    // Remove linha de comentário antes do JSON se houver
    cleanRaw = cleanRaw.replace(/^\/\/.*\n/gm, '').trim();
    // Tenta pegar só o objeto JSON se houver texto antes/depois
    const jsonMatch = cleanRaw.match(/(\{[\s\S]*\})/);
    if (jsonMatch && !cleanRaw.startsWith('{')) {
      cleanRaw = jsonMatch[1];
    }

    let parsed;
    try {
      parsed = JSON.parse(cleanRaw);
    } catch {
      console.log(`${C.yellow}⚠️  Resposta não é JSON válido — pedindo correção...${C.reset}`);
      if (process.env.DEBUG_AGENT) {
        console.log(`${C.dim}Raw:${C.reset}\n${raw.substring(0, 500)}`);
      }
      consecutiveErrors++;
      if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
        console.error(`${C.red}Modelo não conseguiu responder em JSON após ${MAX_CONSECUTIVE_ERRORS} tentativas. Abortando.${C.reset}`);
        return { success: false, reason: 'json_parse_error' };
      }
      history.push({
        role: 'user',
        content: `ERRO: Sua resposta anterior não era JSON válido. Responda SOMENTE com um objeto JSON puro, sem markdown, sem texto fora do JSON. Formato exato: {"thought": "...", "action": "nome_da_ferramenta", "params": {...}}`
      });
      continue;
    }

    consecutiveErrors = 0; // reset ao receber resposta válida

    // Exibe pensamento e ação planejada
    if (parsed.thought) {
      console.log(`\n${C.green}💭 ${C.bold}Pensamento:${C.reset} ${parsed.thought}`);
    }
    console.log(`${C.blue}🚀 ${C.bold}Ação:${C.reset} ${C.bold}${parsed.action}${C.reset}`);
    if (parsed.params && Object.keys(parsed.params).length > 0) {
      const paramPreview = JSON.stringify(parsed.params);
      console.log(`${C.gray}   Params: ${paramPreview.substring(0, 200)}${paramPreview.length > 200 ? '...' : ''}${C.reset}`);
    }

    // ── Caso de término ────────────────────────────────────────────────────────
    if (parsed.action === 'done') {
      const summary = parsed.params?.summary || 'Nenhum resumo fornecido.';
      console.log(`\n${C.magenta}${C.bold}╔══════════════════════════════════════════╗${C.reset}`);
      console.log(`${C.magenta}${C.bold}║        ✅ Tarefa Concluída!              ║${C.reset}`);
      console.log(`${C.magenta}${C.bold}╚══════════════════════════════════════════╝${C.reset}`);
      console.log(`\n${C.green}${C.bold}Resumo:${C.reset}\n${summary}\n`);
      return { success: true, summary };
    }

    // ── Ferramenta desconhecida ────────────────────────────────────────────────
    const toolFn = tools[parsed.action];
    if (!toolFn) {
      const validTools = Object.keys(tools).join(', ');
      console.log(`${C.yellow}⚠️  Ação desconhecida: "${parsed.action}"${C.reset}`);
      history.push({
        role: 'user',
        content: `ERRO: Ação desconhecida "${parsed.action}". Ferramentas válidas: ${validTools}, done.`
      });
      continue;
    }

    // ── Confirmação de segurança ───────────────────────────────────────────────
    if (DANGEROUS_ACTIONS.has(parsed.action)) {
      const approved = await confirmAction(
        parsed.action,
        JSON.stringify(parsed.params, null, 2),
        autoMode
      );
      if (!approved) {
        console.log(`${C.red}❌ Ação rejeitada/pulada.${C.reset}`);
        history.push({
          role: 'user',
          content: `Ação "${parsed.action}" foi REJEITADA pelo usuário. Proponha uma abordagem alternativa.`
        });
        continue;
      }
    }

    // ── Executa a ação ─────────────────────────────────────────────────────────
    console.log(`${C.gray}⚙️  Executando ${parsed.action}...${C.reset}`);
    const result = toolFn(parsed.params || {});

    // Exibe resultado de forma legível
    const resultStr = JSON.stringify(result);
    if (result.error) {
      console.log(`${C.red}💥 Erro: ${result.error}${C.reset}`);
      if (result.stderr) console.log(`${C.red}   stderr: ${result.stderr.substring(0, 300)}${C.reset}`);
    } else if (result.output || result.stdout) {
      const out = (result.output || result.stdout || '').substring(0, 400);
      console.log(`${C.green}✓ Output:${C.reset} ${out}`);
      if (result.stderr) console.log(`${C.yellow}  stderr: ${result.stderr.substring(0, 200)}${C.reset}`);
    } else if (result.success) {
      console.log(`${C.green}✓ Sucesso${result.path ? `: ${result.path}` : ''}${C.reset}`);
    } else if (result.content) {
      const preview = result.content.substring(0, 200);
      console.log(`${C.green}✓ Arquivo lido${C.reset} (${result.content.length} chars): ${preview}${result.content.length > 200 ? '...' : ''}`);
    } else if (result.files) {
      console.log(`${C.green}✓ Listagem:${C.reset}`, result.files.map(f => `${f.name}${f.type === 'dir' ? '/' : ''}`).join('  '));
    } else {
      console.log(`${C.green}✓ Resultado:${C.reset} ${resultStr.substring(0, 300)}`);
    }

    // Alimenta o histórico para o próximo passo
    history.push({ role: 'assistant', content: JSON.stringify(parsed) });
    history.push({
      role: 'user',
      content: resultStr.length > 4000
        ? JSON.stringify({ ...result, content: result.content?.substring(0, 4000) + '\n...[truncado]', truncated: true })
        : resultStr
    });
  }

  console.log(`\n${C.red}${C.bold}⏱️  Limite de ${MAX_STEPS} passos atingido. Abortado por segurança.${C.reset}\n`);
  return { success: false, reason: 'max_steps' };
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}
