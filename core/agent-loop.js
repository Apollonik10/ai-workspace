import { tools, DANGEROUS_ACTIONS } from './tools.js';
import { confirmAction } from './safety.js';
import { buildSystemPrompt } from './prompt-builder.js';
import { callModel } from './model-router.js';

const MAX_STEPS = 15; // trava de segurança contra loop infinito

/**
 * Loop ReAct principal do agente.
 * @param {string} taskDescription Descrição da tarefa a ser executada
 */
export async function runAgent(taskDescription) {
  const systemPrompt = buildSystemPrompt(taskDescription);
  const history = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: taskDescription },
  ];

  console.log(`\n\x1b[35m🧠 Inicializando Agente CLI com Loop ReAct...\x1b[0m`);
  console.log(`\x1b[36m📋 Tarefa:\x1b[0m "${taskDescription}"`);

  for (let step = 1; step <= MAX_STEPS; step++) {
    console.log(`\n\x1b[36m🔄 [Passo ${step}/${MAX_STEPS}]\x1b[0m Pensando...`);

    let raw;
    try {
      raw = await callModel(history);
    } catch (err) {
      console.error(`\x1b[31m❌ Erro crítico na chamada ao modelo:\x1b[0m ${err.message}`);
      return;
    }

    // Tenta limpar marcas de markdown de bloco de código JSON que o modelo possa ter gerado
    let cleanRaw = raw.trim();
    if (cleanRaw.includes('```')) {
      const match = cleanRaw.match(/```(?:json)?([\s\S]*?)```/);
      if (match) {
        cleanRaw = match[1].trim();
      } else {
        cleanRaw = cleanRaw.replace(/```json|```/g, '').trim();
      }
    }

    let parsed;
    try {
      parsed = JSON.parse(cleanRaw);
    } catch {
      console.log("\x1b[33m⚠️ Resposta do modelo não é JSON válido, enviando feedback de correção...\x1b[0m");
      console.log(`\x1b[2mResposta bruta recebida:\x1b[0m\n${raw}`);
      history.push({ 
        role: 'user', 
        content: "Sua resposta anterior não era um JSON válido. Por favor, retorne APENAS um objeto JSON válido, sem tags de markdown adicionais, contendo os campos 'thought', 'action' e 'params'." 
      });
      continue;
    }

    // Exibe pensamentos e planos do agente de forma formatada
    if (parsed.thought) {
      console.log(`\n\x1b[32m💭 Pensamento:\x1b[0m ${parsed.thought}`);
    }
    console.log(`\x1b[34m🚀 Ação sugerida:\x1b[0m ${parsed.action}`);
    if (parsed.params && Object.keys(parsed.params).length > 0) {
      console.log(`📦 Parâmetros:`, parsed.params);
    }

    // Caso de término
    if (parsed.action === 'done') {
      console.log(`\n\x1b[32;1m✅ Tarefa concluída com sucesso!\x1b[0m`);
      console.log(`\x1b[1mResumo final:\x1b[0m ${parsed.params?.summary || 'Nenhum resumo fornecido.'}\n`);
      return;
    }

    const toolFn = tools[parsed.action];
    if (!toolFn) {
      console.log(`\x1b[33m⚠️ Ação desconhecida: "${parsed.action}". Pedindo correção ao modelo...\x1b[0m`);
      history.push({ 
        role: 'user', 
        content: `Ação desconhecida: "${parsed.action}". As ferramentas válidas são: read_file, write_file, list_dir, run_command, done. Proponha uma ação válida.` 
      });
      continue;
    }

    // Confirmação de segurança humana se for ação perigosa (escrita ou execução de comandos)
    if (DANGEROUS_ACTIONS.has(parsed.action)) {
      const approved = await confirmAction(parsed.action, JSON.stringify(parsed.params, null, 2));
      if (!approved) {
        console.log("\x1b[31m❌ Ação rejeitada pelo usuário.\x1b[0m");
        history.push({ 
          role: 'user', 
          content: `Ação "${parsed.action}" foi REJEITADA pelo usuário. Proponha uma abordagem alternativa sem usar esta ação específica.` 
        });
        continue;
      }
    }

    // Execução da ação
    console.log(`\x1b[30;1m⚙️ Executando ${parsed.action}...\x1b[0m`);
    const result = toolFn(parsed.params);
    
    // Tratamento estético simples no resultado exibido no terminal
    if (result.content && result.content.length > 500) {
      console.log(`\x1b[30;1m🛠️ Resultado (truncado para visualização):\x1b[0m\n${result.content.substring(0, 500)}...\n[conteúdo restante omitido no terminal]`);
    } else {
      console.log(`\x1b[30;1m🛠️ Resultado:\x1b[0m`, result);
    }

    // Alimenta o histórico do loop
    history.push({ role: 'assistant', content: JSON.stringify(parsed) });
    history.push({ role: 'user', content: JSON.stringify(result) });
  }

  console.log(`\n\x1b[31;1m⏱️ Limite de ${MAX_STEPS} passos atingido. Loop abortado por segurança.\x1b[0m\n`);
}
