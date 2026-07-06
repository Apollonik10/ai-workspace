import fs from 'fs';
import path from 'path';

function loadRelevantSkills(taskDescription, skillsDir = 'skills') {
  if (!fs.existsSync(skillsDir)) return "";
  
  let files = [];
  try {
    files = fs.readdirSync(skillsDir).filter((f) => f.endsWith('.md'));
  } catch (err) {
    console.error(`Erro ao carregar skills de ${skillsDir}:`, err.message);
    return "";
  }

  // Filtro simples por palavra-chave no nome do arquivo/tarefa
  const relevant = files.filter((f) => {
    const cleanName = f.replace('.skill.md', '').replace('.md', '').toLowerCase();
    return taskDescription.toLowerCase().includes(cleanName);
  });

  const toLoad = relevant.length > 0 ? relevant : files; // fallback: carrega tudo se não achar match específico

  return toLoad
    .map((f) => `## Skill: ${f}\n${fs.readFileSync(path.join(skillsDir, f), 'utf-8')}`)
    .join('\n\n');
}

export function buildSystemPrompt(taskDescription) {
  const skills = loadRelevantSkills(taskDescription);
  return `Você é um agente de programação autônomo rodando localmente via Termux.
Você tem acesso às ferramentas: read_file, write_file, list_dir, run_command.

REGRAS OBRIGATÓRIAS:
- Responda SEMPRE em JSON puro. Nunca envolva o JSON com blocos de código markdown adicionais (como \`\`\`json ... \`\`\`), e não coloque nenhuma explicação, texto ou nota antes/depois do objeto JSON.
- Formato do JSON: {"thought": "seu raciocínio explicativo", "action": "nome_da_ferramenta", "params": {...}}
- Quando a tarefa estiver concluída, responda obrigatoriamente com a ação "done": {"thought": "resumo final do raciocínio", "action": "done", "params": {"summary": "resumo detalhado de tudo o que foi feito"}}

EXEMPLOS DE RESPOSTAS VÁLIDAS EM JSON PURO:

Exemplo 1 (Ação list_dir):
{"thought": "Preciso listar os arquivos da pasta ui para entender a estrutura.", "action": "list_dir", "params": {"path": "ui"}}

Exemplo 2 (Ação read_file):
{"thought": "Vou ler o conteúdo do app.js para ver como o chat está configurado.", "action": "read_file", "params": {"path": "ui/app.js"}}

Exemplo 3 (Ação done):
{"thought": "Concluí a listagem dos arquivos conforme solicitado.", "action": "done", "params": {"summary": "Listei os arquivos da pasta ui com sucesso."}}

CONTEXTO DO PROJETO (skills relevantes):
${skills}
`;
}
