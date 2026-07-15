import { generateText, ensureOllamaRunning } from '../models/client.js';

// Provedor padrão: 'mimo' usa Gemini/OpenRouter/DeepSeek/Grok automaticamente.
// Modelos de nuvem são MUITO mais capazes para agir como coding agent.
// Setar AGENT_PROVIDER=local no .env força o Ollama offline.
const AGENT_PROVIDER = process.env.AGENT_PROVIDER || 'mimo';

/**
 * Chama o modelo com o histórico completo da conversa.
 * Usa o formato de chat nativo (messages) para provedores que suportam,
 * ou monta um prompt estruturado como fallback.
 * @param {Array<{role: string, content: string}>} history
 * @returns {Promise<string>}
 */
export async function callModel(history) {
  // Para o modelo local, garante que o Ollama está rodando
  if (AGENT_PROVIDER === 'local' || AGENT_PROVIDER === 'ollama') {
    try {
      await ensureOllamaRunning();
    } catch (err) {
      // silencioso
    }
  }

  const systemMsg = history.find(h => h.role === 'system');
  const systemInstruction = systemMsg ? systemMsg.content : undefined;
  const chatHistory = history.filter(h => h.role !== 'system');

  // Primeiro turno: passa o prompt diretamente
  if (chatHistory.length === 1) {
    return await generateText(AGENT_PROVIDER, chatHistory[0].content, { systemInstruction });
  }

  // Turnos subsequentes: monta histórico estruturado para o modelo entender o contexto
  // Formato que funciona bem com modelos de chat (inclui resultados de ferramentas)
  let prompt = 'Histórico do loop ReAct (pense, aja, observe):\n\n';

  for (let i = 0; i < chatHistory.length; i++) {
    const msg = chatHistory[i];
    const isLast = i === chatHistory.length - 1;

    if (msg.role === 'assistant') {
      let parsed;
      try { parsed = JSON.parse(msg.content); } catch { parsed = null; }
      if (parsed) {
        prompt += `[Passo ${Math.floor(i/2)+1}]\n`;
        prompt += `Pensamento: ${parsed.thought || ''}\n`;
        prompt += `Ação: ${parsed.action} ${JSON.stringify(parsed.params || {})}\n`;
      } else {
        prompt += `Assistente: ${msg.content}\n`;
      }
    } else if (msg.role === 'user') {
      if (i === 0) {
        prompt += `Tarefa: ${msg.content}\n\n`;
      } else if (isLast) {
        prompt += `Resultado da ação anterior: ${msg.content}\n\n`;
        prompt += `Analise o resultado acima e responda com a próxima ação em JSON puro:`;
      } else {
        let result;
        try { result = JSON.parse(msg.content); } catch { result = { raw: msg.content }; }
        const resultStr = JSON.stringify(result);
        const truncated = resultStr.length > 600 ? resultStr.substring(0, 600) + '...[truncado]' : resultStr;
        prompt += `Resultado: ${truncated}\n\n`;
      }
    }
  }

  return await generateText(AGENT_PROVIDER, prompt, { systemInstruction });
}
