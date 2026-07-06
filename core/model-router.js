import { generateText, ensureOllamaRunning } from '../models/client.js';

/**
 * Interface simplificada para chamar o modelo unificado de IA do workspace.
 * Aceita o histórico completo no formato { role, content } e monta o prompt apropriado.
 * @param {Array<{role: string, content: string}>} history
 * @returns {Promise<string>} Resposta gerada pelo modelo
 */
export async function callModel(history) {
  // Garante que o Ollama local esteja ativo caso seja usado de fallback
  try {
    await ensureOllamaRunning();
  } catch (err) {
    // Silencioso se der erro no spawn
  }
  // O models/client.js unificado lida com roteamento e fallback automático via Mimo
  // Extraímos a instrução de sistema global
  const systemMsg = history.find(h => h.role === 'system');
  const systemInstruction = systemMsg ? systemMsg.content : undefined;

  // Filtramos e formatamos a conversação para o modelo
  const chatHistory = history.filter(h => h.role !== 'system');

  // Se for apenas o primeiro turno de conversa
  if (chatHistory.length === 1) {
    const prompt = chatHistory[0].content;
    return await generateText('mimo', prompt, { systemInstruction });
  }

  // Se houver turnos anteriores, formatamos de forma estruturada para o modelo
  let prompt = "Você está em um loop interativo ReAct. Aqui está o histórico da conversa e resultados anteriores:\n\n";
  
  chatHistory.forEach((msg, idx) => {
    if (idx === chatHistory.length - 1) {
      // Último turno (a instrução/resultado mais recente)
      prompt += `\nResultado Atual/Comando Recente:\n${msg.content}\n\nAnalise o resultado e responda com a próxima ação em JSON puro:`;
    } else {
      if (msg.role === 'user') {
        prompt += `Resultado da ferramenta: ${msg.content}\n`;
      } else {
        prompt += `Ação decidida: ${msg.content}\n`;
      }
    }
  });

  return await generateText('mimo', prompt, { systemInstruction });
}
