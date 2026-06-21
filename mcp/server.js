import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { search } from '../rag/rag.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WORKSPACE_ROOT = path.resolve(__dirname, '..');

// Log errors to a file so it doesn't pollute stdout (JSON-RPC stdio channel)
const logFile = path.join(WORKSPACE_ROOT, 'mcp', 'mcp-server.log');
function log(msg) {
  try {
    fs.appendFileSync(logFile, `[${new Date().toISOString()}] ${msg}\n`, 'utf8');
  } catch (e) {}
}

function loadEnv() {
  const envPath = path.join(WORKSPACE_ROOT, '.env');
  if (fs.existsSync(envPath)) {
    try {
      const content = fs.readFileSync(envPath, 'utf8');
      content.split('\n').forEach(line => {
        const match = line.trim().match(/^([^#=]+)=(.*)$/);
        if (match) {
          const key = match[1].trim();
          let val = match[2].trim();
          if (val.startsWith('"') && val.endsWith('"')) val = val.substring(1, val.length - 1);
          if (val.startsWith("'") && val.endsWith("'")) val = val.substring(1, val.length - 1);
          process.env[key] = val;
        }
      });
      log('Environment loaded from .env');
    } catch (e) {
      log(`Error loading .env: ${e.message}`);
    }
  }
}

// Load environment variables
loadEnv();

// Stdio buffer reader
let buffer = '';
process.stdin.on('data', chunk => {
  buffer += chunk.toString();
  let lineEnd;
  while ((lineEnd = buffer.indexOf('\n')) !== -1) {
    const line = buffer.substring(0, lineEnd).trim();
    buffer = buffer.substring(lineEnd + 1);
    if (line) {
      handleMessage(line);
    }
  }
});

function sendResponse(id, result, error = null) {
  const response = { jsonrpc: '2.0', id };
  if (error) {
    response.error = error;
  } else {
    response.result = result;
  }
  const jsonStr = JSON.stringify(response);
  log(`Sent: ${jsonStr}`);
  process.stdout.write(jsonStr + '\n');
}

async function handleMessage(line) {
  log(`Received: ${line}`);
  let msg;
  try {
    msg = JSON.parse(line);
  } catch (e) {
    sendResponse(null, null, { code: -32700, message: 'Parse error' });
    return;
  }

  const { method, params, id } = msg;

  if (method === 'initialize') {
    sendResponse(id, {
      protocolVersion: '2024-11-05',
      capabilities: {
        tools: {}
      },
      serverInfo: {
        name: 'ai-workspace-mcp',
        version: '0.1.0'
      }
    });
    return;
  }

  if (method === 'notifications/initialized') {
    return;
  }

  if (method === 'ping') {
    sendResponse(id, {});
    return;
  }

  if (method === 'tools/list') {
    sendResponse(id, {
      tools: [
        {
          name: 'workspace_status',
          description: 'Retorna estatísticas gerais e status dos projetos do AI Workspace.',
          inputSchema: { type: 'object', properties: {} }
        },
        {
          name: 'workspace_search_rag',
          description: 'Busca documentação e conhecimento no AI Workspace usando RAG (BM25).',
          inputSchema: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'Termo de busca ou dúvida sobre o workspace' }
            },
            required: ['query']
          }
        },
        {
          name: 'github_get_user',
          description: 'Retorna informações do usuário autenticado no GitHub.',
          inputSchema: { type: 'object', properties: {} }
        },
        {
          name: 'github_list_repos',
          description: 'Lista os repositórios do usuário no GitHub.',
          inputSchema: { type: 'object', properties: {} }
        },
        {
          name: 'vercel_list_projects',
          description: 'Lista os projetos da Vercel para a conta configurada.',
          inputSchema: { type: 'object', properties: {} }
        },
        {
          name: 'vercel_list_deployments',
          description: 'Lista os deploys recentes da Vercel.',
          inputSchema: { type: 'object', properties: {} }
        },
        {
          name: 'firebase_status_mock',
          description: 'Verifica configurações locais do Firebase (Firestore, Hosting, etc).',
          inputSchema: { type: 'object', properties: {} }
        }
      ]
    });
    return;
  }

  if (method === 'tools/call') {
    const { name, arguments: args } = params;
    try {
      const result = await callTool(name, args || {});
      sendResponse(id, { content: [{ type: 'text', text: result }] });
    } catch (err) {
      log(`Error calling tool: ${err.message}`);
      sendResponse(id, null, { code: -32603, message: err.message });
    }
    return;
  }

  if (id !== undefined) {
    sendResponse(id, null, { code: -32601, message: `Method not found: ${method}` });
  }
}

async function callTool(name, args) {
  log(`Call tool: ${name} with ${JSON.stringify(args)}`);

  if (name === 'workspace_status') {
    const configPath = path.join(WORKSPACE_ROOT, 'configs', 'workspace.json');
    const catalogPath = path.join(WORKSPACE_ROOT, 'projects', 'catalog.json');
    const config = fs.existsSync(configPath) ? JSON.parse(fs.readFileSync(configPath, 'utf8')) : null;
    const catalog = fs.existsSync(catalogPath) ? JSON.parse(fs.readFileSync(catalogPath, 'utf8')) : null;
    
    return JSON.stringify({
      workspace: config?.name || 'ai-workspace',
      version: config?.version || '0.1.0',
      description: config?.description || '',
      projects_count: catalog?.projects?.length || 0,
      active_projects: catalog?.projects?.filter(p => p.status === 'active').map(p => p.name) || []
    }, null, 2);
  }

  if (name === 'workspace_search_rag') {
    if (!args.query) throw new Error('Argumento "query" é obrigatório.');
    const results = search(args.query, 3);
    if (results.length === 0) {
      return 'Nenhum resultado relevante encontrado no workspace.';
    }
    return results.map((r, idx) => `[${idx+1}] ${r.title} (origem: ${r.file})\n${r.content}`).join('\n\n');
  }

  if (name === 'github_get_user') {
    const token = process.env.GITHUB_TOKEN;
    if (!token) throw new Error('GITHUB_TOKEN não configurado no arquivo .env');
    const res = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'User-Agent': 'ai-workspace-mcp'
      }
    });
    if (!res.ok) throw new Error(`Erro na API do GitHub: ${res.statusText}`);
    const data = await res.json();
    return JSON.stringify(data, null, 2);
  }

  if (name === 'github_list_repos') {
    const token = process.env.GITHUB_TOKEN;
    if (!token) throw new Error('GITHUB_TOKEN não configurado no arquivo .env');
    const res = await fetch('https://api.github.com/user/repos?per_page=10&sort=updated', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'User-Agent': 'ai-workspace-mcp'
      }
    });
    if (!res.ok) throw new Error(`Erro na API do GitHub: ${res.statusText}`);
    const data = await res.json();
    const repos = data.map(r => ({ name: r.name, url: r.html_url, description: r.description, updated_at: r.updated_at }));
    return JSON.stringify(repos, null, 2);
  }

  if (name === 'vercel_list_projects') {
    const token = process.env.VERCEL_TOKEN;
    if (!token) throw new Error('VERCEL_TOKEN não configurado no arquivo .env');
    const res = await fetch('https://api.vercel.com/v9/projects', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) throw new Error(`Erro na API da Vercel: ${res.statusText}`);
    const data = await res.json();
    const projects = data.projects?.map(p => ({ name: p.name, id: p.id, link: p.link, updated: p.updatedAt })) || [];
    return JSON.stringify(projects, null, 2);
  }

  if (name === 'vercel_list_deployments') {
    const token = process.env.VERCEL_TOKEN;
    if (!token) throw new Error('VERCEL_TOKEN não configurado no arquivo .env');
    const res = await fetch('https://api.vercel.com/v6/deployments?limit=10', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) throw new Error(`Erro na API da Vercel: ${res.statusText}`);
    const data = await res.json();
    const deployments = data.deployments?.map(d => ({ url: d.url, name: d.name, state: d.state, created: d.createdAt })) || [];
    return JSON.stringify(deployments, null, 2);
  }

  if (name === 'firebase_status_mock') {
    const firebaseJson = path.join(WORKSPACE_ROOT, 'firebase.json');
    const firebaserc = path.join(WORKSPACE_ROOT, '.firebaserc');
    const existsJson = fs.existsSync(firebaseJson);
    const existsRc = fs.existsSync(firebaserc);
    
    return JSON.stringify({
      firebase_cli_detected: true,
      has_firebase_json: existsJson,
      has_firebaserc: existsRc,
      status: (existsJson || existsRc) ? 'Configurado localmente' : 'Não configurado localmente',
      info: 'Integração Firebase hosting/firestore configurável usando comandos padrão de infraestrutura no terminal.'
    }, null, 2);
  }

  throw new Error(`Tool not found: ${name}`);
}

log('MCP Server started');
