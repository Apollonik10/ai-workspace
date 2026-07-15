import fs from 'fs';
import path from 'path';
import { execSync, spawnSync } from 'child_process';

// ─── Raiz do projeto-alvo ──────────────────────────────────────────────────────
// Por padrão, sobe até achar .git a partir do cwd.
// Pode ser sobrescrito pelo chamador via setProjectRoot() para agir em
// qualquer projeto do sistema (não só o ai-workspace).

let PROJECT_ROOT = null;

function findProjectRoot(startDir) {
  let dir = startDir;
  let fallback = null;
  while (true) {
    if (fs.existsSync(path.join(dir, '.git'))) return dir;
    if (!fallback && fs.existsSync(path.join(dir, 'package.json'))) fallback = dir;
    const parent = path.dirname(dir);
    if (parent === dir) return fallback || startDir;
    dir = parent;
  }
}

/**
 * Define a raiz do projeto que o agente pode tocar.
 * Chamado pelo CLI quando o usuário especifica --project /caminho/do/projeto
 * @param {string} rootPath caminho absoluto
 */
export function setProjectRoot(rootPath) {
  PROJECT_ROOT = path.resolve(rootPath);
}

/**
 * Retorna a raiz do projeto atual.
 */
export function getProjectRoot() {
  if (!PROJECT_ROOT) {
    PROJECT_ROOT = findProjectRoot(process.cwd());
  }
  return PROJECT_ROOT;
}

// Impede o agente de acessar caminhos fora da raiz definida (sandboxing)
function safePath(relativePath) {
  const root = getProjectRoot();
  // Se já for absoluto, usa diretamente (mas ainda valida que está dentro do root)
  const resolved = path.isAbsolute(relativePath)
    ? path.resolve(relativePath)
    : path.resolve(root, relativePath);
  if (!resolved.startsWith(root)) {
    throw new Error(`Acesso negado fora do projeto (${root}): ${relativePath}`);
  }
  return resolved;
}

// ─── Ferramentas do agente ────────────────────────────────────────────────────

export const tools = {
  /**
   * Lê o conteúdo de um arquivo.
   * Params: { path: "caminho/relativo/ou/absoluto" }
   */
  read_file: ({ path: p }) => {
    try {
      const full = safePath(p);
      if (!fs.existsSync(full)) return { error: `Arquivo não encontrado: ${p}` };
      const content = fs.readFileSync(full, 'utf-8');
      // Limita a 8000 chars para não explodir o contexto do modelo
      if (content.length > 8000) {
        return {
          content: content.substring(0, 8000),
          truncated: true,
          total_chars: content.length,
          note: 'Arquivo truncado para 8000 chars. Use read_file com {start_line, end_line} para ler partes específicas.'
        };
      }
      return { content };
    } catch (err) {
      return { error: err.message };
    }
  },

  /**
   * Escreve (cria ou sobrescreve) um arquivo.
   * Params: { path: "...", content: "..." }
   */
  write_file: ({ path: p, content }) => {
    try {
      const full = safePath(p);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, content, 'utf-8');
      return { success: true, path: p, bytes_written: Buffer.byteLength(content, 'utf-8') };
    } catch (err) {
      return { error: err.message };
    }
  },

  /**
   * Edita partes de um arquivo existente sem reescrever tudo.
   * Params: { path: "...", old_str: "texto a substituir", new_str: "novo texto" }
   * Útil para pequenas correções sem precisar ler+reescrever o arquivo inteiro.
   */
  edit_file: ({ path: p, old_str, new_str }) => {
    try {
      const full = safePath(p);
      if (!fs.existsSync(full)) return { error: `Arquivo não encontrado: ${p}` };
      const original = fs.readFileSync(full, 'utf-8');
      if (!original.includes(old_str)) {
        return { error: `Trecho não encontrado no arquivo. Verifique se old_str está exatamente igual ao conteúdo do arquivo.` };
      }
      const updated = original.replace(old_str, new_str);
      fs.writeFileSync(full, updated, 'utf-8');
      return { success: true, path: p };
    } catch (err) {
      return { error: err.message };
    }
  },

  /**
   * Lista os arquivos de um diretório.
   * Params: { path: "." }
   */
  list_dir: ({ path: p = '.' }) => {
    try {
      const full = safePath(p);
      if (!fs.existsSync(full)) return { error: `Diretório não encontrado: ${p}` };
      const entries = fs.readdirSync(full, { withFileTypes: true });
      return {
        files: entries.map(e => ({
          name: e.name,
          type: e.isDirectory() ? 'dir' : 'file',
        }))
      };
    } catch (err) {
      return { error: err.message };
    }
  },

  /**
   * Cria um diretório (e pais, se necessário).
   * Params: { path: "pasta/subpasta" }
   */
  make_dir: ({ path: p }) => {
    try {
      const full = safePath(p);
      fs.mkdirSync(full, { recursive: true });
      return { success: true, path: p };
    } catch (err) {
      return { error: err.message };
    }
  },

  /**
   * Executa um comando shell na raiz do projeto.
   * Params: { command: "git add . && git commit -m 'feat: ...'", timeout_ms: 30000 }
   * Suporta git add, git commit, git push, npm install, etc.
   */
  run_command: ({ command, timeout_ms = 60000, cwd: customCwd }) => {
    try {
      const workdir = customCwd ? safePath(customCwd) : getProjectRoot();
      const result = spawnSync('bash', ['-c', command], {
        cwd: workdir,
        timeout: timeout_ms,
        encoding: 'utf-8',
        maxBuffer: 1024 * 1024 * 4, // 4MB
      });

      const stdout = result.stdout || '';
      const stderr = result.stderr || '';
      const exitCode = result.status ?? -1;

      if (result.error) {
        return { error: result.error.message, stdout, stderr, exit_code: exitCode };
      }

      return {
        stdout: stdout.substring(0, 3000) || '(sem output)',
        stderr: stderr.substring(0, 1000) || '',
        exit_code: exitCode,
        success: exitCode === 0,
      };
    } catch (err) {
      return { error: err.message };
    }
  },

  /**
   * Busca texto em arquivos do projeto (equivalente a grep).
   * Params: { pattern: "texto a buscar", path: ".", extension: ".js" }
   */
  search_files: ({ pattern, path: p = '.', extension }) => {
    try {
      const full = safePath(p);
      let cmd = `grep -r --include="*${extension || ''}" -l "${pattern}" "${full}" 2>/dev/null | head -20`;
      if (!extension) {
        cmd = `grep -r -l "${pattern}" "${full}" 2>/dev/null | head -20`;
      }
      const result = spawnSync('bash', ['-c', cmd], { encoding: 'utf-8', timeout: 10000 });
      const files = (result.stdout || '').trim().split('\n').filter(Boolean);
      return { matches: files, count: files.length };
    } catch (err) {
      return { error: err.message };
    }
  },
};

// Ações que pedem confirmação humana quando --auto NÃO está ativo
export const DANGEROUS_ACTIONS = new Set(['write_file', 'edit_file', 'run_command', 'make_dir']);
