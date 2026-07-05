import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WORKSPACE_ROOT = path.resolve(__dirname, '..');

const INDEX_FILE = path.join(WORKSPACE_ROOT, 'rag', 'index.json');

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

function tokenize(text) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Remove acentos
    .replace(/[^\w\s-]/g, "") // Remove caracteres especiais
    .split(/[\s_]+/) // Divide por espaço ou underline (bom para código)
    .filter(token => token.length > 1);
}

function getFilesRecursively(dir, allowedExts) {
  let results = [];
  if (!fs.existsSync(dir)) return results;
  try {
    const list = fs.readdirSync(dir);
    list.forEach(file => {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);
      if (stat && stat.isDirectory()) {
        results = results.concat(getFilesRecursively(filePath, allowedExts));
      } else {
        const ext = path.extname(file).toLowerCase();
        if (allowedExts.includes(ext)) {
          results.push(filePath);
        }
      }
    });
  } catch (e) {}
  return results;
}

function chunkMarkdown(filePath, relativePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  const chunks = [];
  
  let currentHeader = 'Geral';
  let currentChunkLines = [];
  
  lines.forEach(line => {
    if (line.startsWith('#')) {
      if (currentChunkLines.length > 0) {
        const text = currentChunkLines.join('\n').trim();
        if (text) {
          chunks.push({
            id: `${relativePath}#${currentHeader.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
            file: relativePath,
            title: `${relativePath} > ${currentHeader}`,
            content: text,
          });
        }
        currentChunkLines = [];
      }
      const match = line.match(/^#+\s+(.+)$/);
      currentHeader = match ? match[1].trim() : line;
    }
    currentChunkLines.push(line);
  });
  
  if (currentChunkLines.length > 0) {
    const text = currentChunkLines.join('\n').trim();
    if (text) {
      chunks.push({
        id: `${relativePath}#${currentHeader.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
        file: relativePath,
        title: `${relativePath} > ${currentHeader}`,
        content: text,
      });
    }
  }
  
  return chunks;
}

function chunkJson(filePath, relativePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(content);
    
    if (relativePath === 'projects/catalog.json' && data.projects) {
      return data.projects.map(p => ({
        id: `projects/catalog.json#project-${p.id}`,
        file: relativePath,
        title: `Projeto: ${p.name}`,
        content: JSON.stringify(p, null, 2),
      }));
    }
    
    return [{
      id: `${relativePath}#all`,
      file: relativePath,
      title: relativePath,
      content: JSON.stringify(data, null, 2),
    }];
  } catch (e) {
    return [];
  }
}

export function buildIndex() {
  console.log(`\n${colors.bright}${colors.cyan}=========================================`);
  console.log(`        CONSTRUINDO ÍNDICE RAG`);
  console.log(`=========================================${colors.reset}\n`);

  const fileGroups = [
    { dir: 'docs', exts: ['.md'], chunker: chunkMarkdown },
    { dir: 'skills', exts: ['.md'], chunker: chunkMarkdown },
    { dir: 'agents', exts: ['.md'], chunker: chunkMarkdown },
    { dir: 'loops', exts: ['.md'], chunker: chunkMarkdown },
    { dir: 'configs', exts: ['.json'], chunker: chunkJson },
    { dir: 'projects', exts: ['.json'], chunker: chunkJson },
  ];

  let chunks = [];

  fileGroups.forEach(group => {
    const dirPath = path.join(WORKSPACE_ROOT, group.dir);
    const files = getFilesRecursively(dirPath, group.exts);
    
    files.forEach(file => {
      const relPath = path.relative(WORKSPACE_ROOT, file);
      const fileChunks = group.chunker(file, relPath);
      chunks = chunks.concat(fileChunks);
      console.log(`  ${colors.green}✔ Processado:${colors.reset} ${relPath} (${fileChunks.length} trechos)`);
    });
  });

  if (chunks.length === 0) {
    console.log(`${colors.red}Nenhum documento encontrado para indexação.${colors.reset}`);
    return;
  }

  const docs = chunks.map((c, idx) => {
    const tokens = tokenize(c.content);
    const tf = {};
    tokens.forEach(t => {
      tf[t] = (tf[t] || 0) + 1;
    });
    return {
      index: idx,
      id: c.id,
      file: c.file,
      title: c.title,
      content: c.content,
      tf,
      length: tokens.length
    };
  });

  const N = docs.length;
  const avgdl = docs.reduce((sum, d) => sum + d.length, 0) / N;

  const df = {};
  docs.forEach(d => {
    Object.keys(d.tf).forEach(term => {
      df[term] = (df[term] || 0) + 1;
    });
  });

  const idf = {};
  Object.keys(df).forEach(term => {
    idf[term] = Math.max(0.0001, Math.log((N - df[term] + 0.5) / (df[term] + 0.5) + 1));
  });

  const indexData = {
    docs: docs.map(d => ({
      id: d.id,
      file: d.file,
      title: d.title,
      content: d.content,
      tf: d.tf,
      length: d.length
    })),
    idf,
    avgdl,
    N,
    updated_at: new Date().toISOString()
  };

  try {
    fs.writeFileSync(INDEX_FILE, JSON.stringify(indexData, null, 2), 'utf8');
    console.log(`\n${colors.bright}${colors.green}Índice RAG gerado com sucesso! (${chunks.length} trechos salvos em rag/index.json)${colors.reset}\n`);
  } catch (error) {
    console.error(`${colors.red}Erro ao salvar índice RAG:${colors.reset} ${error.message}`);
  }
}

export function search(queryText, limit = 3) {
  if (!fs.existsSync(INDEX_FILE)) {
    console.log(`${colors.yellow}Aviso: Índice RAG não encontrado. Construindo índice automático...${colors.reset}`);
    buildIndex();
  }

  let indexData;
  try {
    indexData = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8'));
  } catch (e) {
    console.error(`${colors.red}Erro ao ler índice RAG:${colors.reset} ${e.message}`);
    return [];
  }

  const queryTokens = tokenize(queryText);
  if (queryTokens.length === 0) {
    return [];
  }

  const { docs, idf, avgdl } = indexData;
  const k1 = 1.2;
  const b = 0.75;

  const results = docs.map(doc => {
    let score = 0;
    queryTokens.forEach(token => {
      const termIdf = idf[token] || 0;
      const termTf = doc.tf[token] || 0;
      
      if (termTf > 0) {
        const numerator = termTf * (k1 + 1);
        const denominator = termTf + k1 * (1 - b + b * (doc.length / avgdl));
        score += termIdf * (numerator / denominator);
      }
    });

    return {
      id: doc.id,
      file: doc.file,
      title: doc.title,
      content: doc.content,
      score
    };
  });

  return results
    .filter(r => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
