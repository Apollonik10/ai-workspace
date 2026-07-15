import readline from 'readline';

/**
 * Pede confirmação interativa ao usuário antes de executar ação perigosa.
 * Se --auto estiver ativo (autoMode=true), aprovação é automática.
 *
 * @param {string} actionName nome da ação (write_file, run_command, etc.)
 * @param {string} details detalhes em string (normalmente os params em JSON)
 * @param {boolean} autoMode se true, aprova automaticamente sem perguntar
 * @returns {Promise<boolean>}
 */
export async function confirmAction(actionName, details, autoMode = false) {
  if (autoMode) {
    console.log(`\x1b[32m✅ Auto-aprovado:\x1b[0m ${actionName}`);
    return true;
  }

  console.log(`\n\x1b[33m⚠️  Agente quer executar: \x1b[1m${actionName}\x1b[0m`);
  
  // Exibe detalhes de forma legível
  try {
    const parsed = JSON.parse(details);
    if (parsed.command) {
      console.log(`\x1b[36m   Comando:\x1b[0m ${parsed.command}`);
    } else if (parsed.path) {
      console.log(`\x1b[36m   Arquivo:\x1b[0m ${parsed.path}`);
      if (parsed.content && parsed.content.length > 200) {
        console.log(`\x1b[36m   Conteúdo:\x1b[0m ${parsed.content.substring(0, 200)}...\x1b[2m [${parsed.content.length} chars no total]\x1b[0m`);
      } else if (parsed.content) {
        console.log(`\x1b[36m   Conteúdo:\x1b[0m ${parsed.content}`);
      }
      if (parsed.old_str) {
        console.log(`\x1b[31m   Remover:\x1b[0m ${parsed.old_str.substring(0, 100)}`);
        console.log(`\x1b[32m   Inserir:\x1b[0m ${(parsed.new_str || '').substring(0, 100)}`);
      }
    } else {
      console.log(`   ${details.substring(0, 300)}`);
    }
  } catch {
    console.log(`   ${details.substring(0, 300)}`);
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise(resolve => {
    rl.question('\x1b[33m   Aprovar? [Y/n/s(kip)] \x1b[0m', ans => {
      rl.close();
      resolve(ans.trim().toLowerCase());
    });
  });

  if (answer === 's' || answer === 'skip') {
    console.log('\x1b[33m⏭️  Ação pulada.\x1b[0m');
    return false;
  }
  return answer === '' || answer === 'y' || answer === 'yes';
}
