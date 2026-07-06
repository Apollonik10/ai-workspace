import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const PROJECT_ROOT = process.cwd();

// Impede o agente de sair da pasta do projeto (segurança básica)
function safePath(relativePath) {
  const resolved = path.resolve(PROJECT_ROOT, relativePath);
  if (!resolved.startsWith(PROJECT_ROOT)) {
    throw new Error(`Acesso negado fora do projeto: ${relativePath}`);
  }
  return resolved;
}

export const tools = {
  read_file: ({ path: p }) => {
    try {
      const full = safePath(p);
      if (!fs.existsSync(full)) return { error: `Arquivo não encontrado: ${p}` };
      return { content: fs.readFileSync(full, 'utf-8') };
    } catch (err) {
      return { error: err.message };
    }
  },

  write_file: ({ path: p, content }) => {
    try {
      const full = safePath(p);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, content, 'utf-8');
      return { success: true, path: p };
    } catch (err) {
      return { error: err.message };
    }
  },

  list_dir: ({ path: p = '.' }) => {
    try {
      const full = safePath(p);
      if (!fs.existsSync(full)) return { error: `Diretório não encontrado: ${p}` };
      return { files: fs.readdirSync(full) };
    } catch (err) {
      return { error: err.message };
    }
  },

  run_command: ({ command }) => {
    try {
      const output = execSync(command, { cwd: PROJECT_ROOT, timeout: 30000 }).toString();
      return { output };
    } catch (err) {
      return { error: err.message, output: err.stdout?.toString() || "" };
    }
  },
};

// Ações que exigem confirmação humana antes de executar
export const DANGEROUS_ACTIONS = new Set(['write_file', 'run_command']);
