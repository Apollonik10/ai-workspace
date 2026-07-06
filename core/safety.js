import readline from 'readline';

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase());
    });
  });
}

export async function confirmAction(actionName, details) {
  console.log(`\n⚠️  O agente quer executar: \x1b[33m${actionName}\x1b[0m`);
  console.log(details);
  const answer = await ask("Aprovar? [Y/n] ");
  return answer === "" || answer === "y" || answer === "yes";
}
