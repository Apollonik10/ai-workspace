#!/usr/bin/env node
// cli/agent.js
import { runAgent } from '../core/agent-loop.js';

const task = process.argv.slice(2).join(" ");

if (!task) {
  console.log('Uso: node cli/agent.js "descrição da tarefa"');
  process.exit(1);
}

runAgent(task).catch((err) => {
  console.error("Erro no agente:", err.message);
  process.exit(1);
});
