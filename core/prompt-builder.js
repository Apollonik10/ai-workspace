import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getProjectRoot } from './tools.js';
import { search } from '../rag/rag.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// Carrega skills e docs relevantes para a tarefa usando RAG (BM25)
function loadRelevantSkills(taskDescription) {
  try {
    const ragResults = search(taskDescription, 4);
    if (ragResults && ragResults.length > 0) {
      return ragResults
        .map(r => `## Ref: ${r.title} (Score: ${r.score.toFixed(2)})\n${r.content}`)
        .join('\n\n');
    }
  } catch (err) {
    // Silencioso se der erro e cai no fallback
  }

  // Fallback: busca simples baseada no nome do arquivo
  const workspaceRoot = path.resolve(__dirname, '..');
  const skillsDir = path.join(workspaceRoot, 'skills');
  if (!fs.existsSync(skillsDir)) return '';

  let files = [];
  try {
    files = fs.readdirSync(skillsDir).filter(f => f.endsWith('.md'));
  } catch (err) {
    return '';
  }

  const task = taskDescription.toLowerCase();
  const relevant = files.filter(f => {
    const name = f.replace('.skill.md', '').replace('.md', '').toLowerCase();
    return task.includes(name);
  });

  const toLoad = relevant.length > 0 ? relevant : files.slice(0, 3); // carrega no máx 3 se não achar match

  return toLoad
    .map(f => {
      const content = fs.readFileSync(path.join(skillsDir, f), 'utf-8');
      // Limita cada skill a 1000 chars para não explodir o contexto
      const trimmed = content.length > 1000 ? content.substring(0, 1000) + '\n...[truncado]' : content;
      return `## Skill: ${f}\n${trimmed}`;
    })
    .join('\n\n');
}

/**
 * Monta o system prompt do agente de programação.
 * @param {string} taskDescription — descrição da tarefa atual
 * @returns {string}
 */
export function buildSystemPrompt(taskDescription) {
  const projectRoot = getProjectRoot();
  const skills = loadRelevantSkills(taskDescription);

  return `Você é um agente de programação autônomo altamente capaz, rodando via terminal (Termux/Linux).
Sua função é AGIR diretamente nos projetos do usuário: criar arquivos, editar código, rodar comandos, fazer commits e push no Git.

PROJETO ATUAL: ${projectRoot}

═══ FERRAMENTAS DISPONÍVEIS ═══

1. read_file    → Lê conteúdo de um arquivo
   Params: { "path": "src/index.js" }

2. write_file   → Cria ou sobrescreve um arquivo completo
   Params: { "path": "src/novo.js", "content": "conteúdo completo do arquivo" }

3. edit_file    → Edita PARTE de um arquivo (busca e substitui)
   Params: { "path": "src/app.js", "old_str": "texto exato a substituir", "new_str": "novo texto" }
   ⚡ Prefira edit_file a write_file quando quiser mudar apenas um trecho.

4. list_dir     → Lista arquivos e pastas
   Params: { "path": "." }

5. make_dir     → Cria diretório
   Params: { "path": "src/components" }

6. run_command  → Executa comando shell (git, npm, node, etc.)
   Params: { "command": "git add . && git commit -m 'feat: descrição'", "timeout_ms": 60000 }
   Exemplos de comandos úteis:
   - "git status"
   - "git add ."
   - "git commit -m 'feat: adiciona componente X'"
   - "git push origin main"
   - "npm install"
   - "node script.js"
   - "cat package.json"

7. search_files → Busca texto em arquivos do projeto
   Params: { "pattern": "useState", "path": "src", "extension": ".js" }

8. done         → Finaliza a tarefa com resumo
   Params: { "summary": "Descrição do que foi feito" }

═══ FLUXO DE TRABALHO GIT (se alterar código) ═══
1. Faça as alterações necessárias (write_file / edit_file)
2. Execute: git add .
3. Execute: git commit -m "tipo: descrição clara do que mudou"
4. Execute: git push origin <branch> (se o usuário pediu push)

Tipos de commit: feat, fix, refactor, docs, style, chore, test

═══ FLUXO DE VERIFICAÇÃO E TESTES ═══
- Antes de usar a ferramenta "done" para finalizar seu trabalho, você DEVE rodar os testes ou linter do projeto (ex: usando run_command com "npm test", "npm run lint", "python -m unittest", etc.) se houver configurações ou scripts de teste definidos no projeto (ex: confira o package.json).
- Se os testes falharem ou o linter apontar erros, use edit_file ou write_file para corrigir o código, e então execute os testes novamente até que todos passem. Não finalize a tarefa com testes quebrados.

═══ REGRAS ABSOLUTAS ═══
- Responda SEMPRE em JSON puro, uma linha, sem markdown, sem explicações fora do JSON.
- Formato obrigatório: {"thought": "raciocínio interno", "action": "nome_da_ferramenta", "params": {...}}
- Para finalizar: {"thought": "concluí tudo", "action": "done", "params": {"summary": "..."}}
- Nunca invente conteúdo de arquivo sem antes ler o existente (use read_file primeiro).
- Se um caminho não existir, use list_dir para explorar antes de agir.
- Commits só após confirmar que os arquivos foram escritos corretamente e os testes passaram.
- Se der erro em run_command, leia o stderr e corrija antes de tentar de novo.

═══ CONTEXTO DE SKILLS / DOCS RELEVANTES ═══
${skills || 'Nenhuma skill ou doc de contexto carregado.'}
`;
}
