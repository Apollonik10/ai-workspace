#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildIndex, search } from '../rag/rag.js';
import { listModels, testProvider, detectAvailableProviders, generateText, checkLocalOllama, pickLocalModel } from '../models/client.js';
import { runPipeline, listSessions, getSession } from '../multiagent/orchestrator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WORKSPACE_ROOT = path.resolve(__dirname, '..');

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

function readJsonFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    console.error(`${colors.red}Erro ao ler/parsear arquivo JSON em ${filePath}: ${error.message}${colors.reset}`);
    return null;
  }
}

function writeJsonFile(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error(`${colors.red}Erro ao escrever arquivo JSON em ${filePath}: ${error.message}${colors.reset}`);
    return false;
  }
}

function extractTitle(content) {
  const match = content.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : 'Sem Título';
}

function extractSection(content, sectionHeader) {
  const lines = content.split('\n');
  let inSection = false;
  let sectionLines = [];
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('##')) {
      if (trimmed.toLowerCase().includes(sectionHeader.toLowerCase())) {
        inSection = true;
        continue;
      } else if (inSection) {
        break;
      }
    }
    if (inSection) {
      if (trimmed.startsWith('#')) {
        break;
      }
      sectionLines.push(line);
    }
  }
  
  if (sectionLines.length > 0) {
    return sectionLines.join('\n').trim();
  }
  return null;
}

function extractResponsibility(content) {
  const resp = extractSection(content, 'Responsabilidade');
  if (resp) return resp;
  
  const lines = content.split('\n')
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('#') && !l.startsWith('---'));
  return lines.slice(0, 2).join(' ') || 'Nenhuma responsabilidade descrita.';
}

function colorizeStatus(status) {
  if (!status) return 'N/A';
  const s = status.toLowerCase();
  if (s === 'active' || s === 'ativo') return `${colors.green}${status}${colors.reset}`;
  if (s === 'planned' || s === 'planejado') return `${colors.yellow}${status}${colors.reset}`;
  if (s === 'completed' || s === 'concluido' || s === 'concluído') return `${colors.blue}${status}${colors.reset}`;
  return `${colors.cyan}${status}${colors.reset}`;
}

function colorizePriority(priority) {
  if (!priority) return 'N/A';
  const p = priority.toLowerCase();
  if (p === 'high' || p === 'alta' || p === 'alto') return `${colors.red}${priority}${colors.reset}`;
  if (p === 'medium' || p === 'média' || p === 'médio') return `${colors.yellow}${priority}${colors.reset}`;
  if (p === 'low' || p === 'baixa' || p === 'baixo') return `${colors.green}${priority}${colors.reset}`;
  return `${colors.cyan}${priority}${colors.reset}`;
}

function cmdStatus() {
  const config = readJsonFile(path.join(WORKSPACE_ROOT, 'configs', 'workspace.json'));
  const catalog = readJsonFile(path.join(WORKSPACE_ROOT, 'projects', 'catalog.json'));
  
  let skillsCount = 0;
  try {
    const files = fs.readdirSync(path.join(WORKSPACE_ROOT, 'skills'));
    skillsCount = files.filter(f => f.endsWith('.md')).length;
  } catch (e) {}

  const agentsCount = config && config.agents ? Object.keys(config.agents).length : 0;
  const loopsCount = config && config.loops ? Object.keys(config.loops).length : 0;
  const projectsCount = catalog && catalog.projects ? catalog.projects.length : 0;
  
  console.log(`\n${colors.bright}${colors.cyan}=========================================`);
  console.log(`          AI WORKSPACE - STATUS`);
  console.log(`=========================================${colors.reset}\n`);
  
  if (config) {
    console.log(`${colors.bright}Workspace:${colors.reset}  ${config.name || 'AI Workspace'}`);
    console.log(`${colors.bright}Versão:${colors.reset}     v${config.version || '0.1.0'}`);
    console.log(`${colors.bright}Descrição:${colors.reset}  ${config.description || ''}`);
    if (config.models) {
      console.log(`${colors.bright}Modelos:${colors.reset}    Padrão: ${colors.green}${config.models.default}${colors.reset} (Disponíveis: ${config.models.available?.join(', ') || ''})`);
    }
  } else {
    console.log(`${colors.red}Não foi possível carregar as configurações globais do workspace.${colors.reset}`);
  }
  
  console.log(`\n${colors.bright}Estatísticas do Ecossistema:${colors.reset}`);
  console.log(`  - Projetos:  ${colors.bright}${projectsCount}${colors.reset} cadastrados`);
  console.log(`  - Skills:    ${colors.bright}${skillsCount}${colors.reset} habilidades`);
  console.log(`  - Agentes:   ${colors.bright}${agentsCount}${colors.reset} agentes especializados`);
  console.log(`  - Loops:     ${colors.bright}${loopsCount}${colors.reset} processos automatizados`);
  
  if (catalog && catalog.projects && catalog.projects.length > 0) {
    const activeProjects = catalog.projects.filter(p => p.status === 'active');
    console.log(`\n${colors.bright}Projetos Ativos:${colors.reset}`);
    if (activeProjects.length > 0) {
      activeProjects.forEach(p => {
        console.log(`  - ${colors.bright}${colors.green}${p.name}${colors.reset} [${p.id}]`);
        console.log(`    ${colors.dim}Techs: ${p.technologies?.join(', ') || 'N/A'} | Prioridade: ${colorizePriority(p.priority)}${colors.reset}`);
      });
    } else {
      console.log(`  ${colors.dim}(Nenhum projeto ativo no momento)${colors.reset}`);
    }
  }
  console.log(`\n${colors.bright}${colors.cyan}=========================================${colors.reset}\n`);
}

function cmdRoadmap() {
  const filePath = path.join(WORKSPACE_ROOT, 'docs', 'roadmap.md');
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    
    console.log(`\n${colors.bright}${colors.magenta}=========================================`);
    console.log(`            AI WORKSPACE - ROADMAP`);
    console.log(`=========================================${colors.reset}\n`);
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('# ')) {
        console.log(`\n${colors.bright}${colors.cyan}${trimmed.substring(2).toUpperCase()}${colors.reset}`);
      } else if (trimmed.startsWith('## ')) {
        const title = trimmed.substring(3);
        if (title.includes('✅')) {
          console.log(`\n  ${colors.bright}${colors.green}✔ ${title.replace('✅', '').trim()}${colors.reset}`);
        } else {
          console.log(`\n  ${colors.bright}${colors.yellow}➔ ${title}${colors.reset}`);
        }
      } else if (trimmed.startsWith('- [x]')) {
        console.log(`    ${colors.green}✔ ${colors.dim}${trimmed.substring(5).trim()}${colors.reset}`);
      } else if (trimmed.startsWith('- [ ]')) {
        console.log(`    ${colors.yellow}☐ ${colors.bright}${trimmed.substring(5).trim()}${colors.reset}`);
      } else if (trimmed.startsWith('-')) {
        console.log(`    • ${trimmed.substring(1).trim()}`);
      } else if (trimmed && !trimmed.startsWith('```')) {
        console.log(`  ${colors.dim}${trimmed}${colors.reset}`);
      }
    }
    console.log(`\n${colors.bright}${colors.magenta}=========================================${colors.reset}\n`);
  } catch (error) {
    console.error(`${colors.red}Erro ao carregar roadmap.md: ${error.message}${colors.reset}`);
  }
}

function cmdProjects() {
  const filePath = path.join(WORKSPACE_ROOT, 'projects', 'catalog.json');
  const catalog = readJsonFile(filePath);
  
  console.log(`\n${colors.bright}${colors.green}=========================================`);
  console.log(`          CATÁLOGO DE PROJETOS`);
  console.log(`=========================================${colors.reset}\n`);
  
  if (!catalog || !catalog.projects || catalog.projects.length === 0) {
    console.log(`  ${colors.dim}Nenhum projeto cadastrado no catálogo.${colors.reset}\n`);
    return;
  }
  
  catalog.projects.forEach((p, idx) => {
    console.log(`${colors.bright}${idx + 1}. ${p.name} (${p.id})${colors.reset}`);
    console.log(`   ${colors.dim}Status:     ${colors.reset}${colorizeStatus(p.status)}`);
    console.log(`   ${colors.dim}Prioridade: ${colors.reset}${colorizePriority(p.priority)}`);
    console.log(`   ${colors.dim}Tipo:       ${colors.reset}${p.type || 'N/A'}`);
    console.log(`   ${colors.dim}Techs:      ${colors.reset}${p.technologies?.join(', ') || 'N/A'}`);
    console.log(`   ${colors.dim}Caminho:    ${colors.reset}${p.path || 'N/A'}`);
    if (p.repository) {
      console.log(`   ${colors.dim}Repo:       ${colors.reset}${colors.blue}${p.repository}${colors.reset}`);
    }
    console.log(`   ${colors.dim}Atualizado: ${colors.reset}${p.updated_at || 'N/A'}`);
    if (p.description) {
      console.log(`   ${colors.dim}Descrição:  ${colors.reset}${p.description}`);
    }
    console.log('');
  });
  console.log(`${colors.bright}${colors.green}=========================================${colors.reset}\n`);
}

function cmdSkills() {
  const skillsDir = path.join(WORKSPACE_ROOT, 'skills');
  console.log(`\n${colors.bright}${colors.blue}=========================================`);
  console.log(`          BIBLIOTECA DE SKILLS`);
  console.log(`=========================================${colors.reset}\n`);
  
  try {
    const files = fs.readdirSync(skillsDir);
    const skillFiles = files.filter(f => f.endsWith('.md'));
    
    if (skillFiles.length === 0) {
      console.log(`  ${colors.dim}Nenhuma skill encontrada em ${skillsDir}.${colors.reset}\n`);
      return;
    }
    
    skillFiles.forEach(file => {
      const filePath = path.join(skillsDir, file);
      const content = fs.readFileSync(filePath, 'utf8');
      const title = extractTitle(content);
      const resp = extractResponsibility(content);
      
      console.log(`• ${colors.bright}${colors.blue}${title}${colors.reset} (${colors.dim}${file}${colors.reset})`);
      console.log(`  ${colors.dim}Responsabilidade:${colors.reset} ${resp}`);
      console.log('');
    });
    
    console.log(`${colors.bright}${colors.blue}=========================================${colors.reset}\n`);
  } catch (error) {
    console.error(`${colors.red}Erro ao ler diretório de skills: ${error.message}${colors.reset}`);
  }
}

function cmdAgents() {
  const config = readJsonFile(path.join(WORKSPACE_ROOT, 'configs', 'workspace.json'));
  console.log(`\n${colors.bright}${colors.cyan}=========================================`);
  console.log(`          AGENTES ESPECIALIZADOS`);
  console.log(`=========================================${colors.reset}\n`);
  
  if (!config || !config.agents || Object.keys(config.agents).length === 0) {
    console.log(`  ${colors.dim}Nenhum agente configurado em configs/workspace.json.${colors.reset}\n`);
    return;
  }
  
  const agents = config.agents;
  Object.keys(agents).forEach(agentName => {
    const relativePath = agents[agentName];
    const agentMdPath = path.join(WORKSPACE_ROOT, relativePath, 'agent.md');
    let title = agentName.toUpperCase() + ' AGENT';
    let resp = 'Nenhuma descrição encontrada.';
    
    try {
      if (fs.existsSync(agentMdPath)) {
        const content = fs.readFileSync(agentMdPath, 'utf8');
        title = extractTitle(content);
        resp = extractResponsibility(content);
      }
    } catch (e) {
      resp = `Erro ao ler arquivo: ${e.message}`;
    }
    
    console.log(`• ${colors.bright}${colors.cyan}${title}${colors.reset} (${colors.dim}${relativePath}${colors.reset})`);
    console.log(`  ${colors.dim}Responsabilidade:${colors.reset} ${resp}`);
    console.log('');
  });
  console.log(`${colors.bright}${colors.cyan}=========================================${colors.reset}\n`);
}

function cmdLoops() {
  const config = readJsonFile(path.join(WORKSPACE_ROOT, 'configs', 'workspace.json'));
  console.log(`\n${colors.bright}${colors.yellow}=========================================`);
  console.log(`          LOOPS DE AUTOMAÇÃO`);
  console.log(`=========================================${colors.reset}\n`);
  
  if (!config || !config.loops || Object.keys(config.loops).length === 0) {
    console.log(`  ${colors.dim}Nenhum loop configurado em configs/workspace.json.${colors.reset}\n`);
    return;
  }
  
  const loops = config.loops;
  Object.keys(loops).forEach(loopName => {
    const relativePath = loops[loopName];
    const loopMdPath = path.join(WORKSPACE_ROOT, relativePath, 'loop.md');
    let title = loopName.toUpperCase() + ' LOOP';
    let resp = 'Nenhuma descrição encontrada.';
    
    try {
      if (fs.existsSync(loopMdPath)) {
        const content = fs.readFileSync(loopMdPath, 'utf8');
        title = extractTitle(content);
        resp = extractResponsibility(content);
      }
    } catch (e) {
      resp = `Erro ao ler arquivo: ${e.message}`;
    }
    
    console.log(`• ${colors.bright}${colors.yellow}${title}${colors.reset} (${colors.dim}${relativePath}${colors.reset})`);
    console.log(`  ${colors.dim}Responsabilidade:${colors.reset} ${resp}`);
    console.log('');
  });
  console.log(`${colors.bright}${colors.yellow}=========================================${colors.reset}\n`);
}

function cmdInit() {
  console.log(`\n${colors.bright}${colors.cyan}=========================================`);
  console.log(`        INICIALIZANDO WORKSPACE`);
  console.log(`=========================================${colors.reset}\n`);

  const dirs = ['docs', 'skills', 'agents', 'loops', 'projects', 'rag', 'mcp', 'models', 'configs', 'workspace-cli'];
  
  dirs.forEach(dir => {
    const dirPath = path.join(WORKSPACE_ROOT, dir);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
      console.log(`  ${colors.green}✔ Diretório criado:${colors.reset} ${dir}`);
    } else {
      console.log(`  ${colors.dim}➔ Diretório já existe:${colors.reset} ${dir}`);
    }
  });

  // Check workspace.json
  const configPath = path.join(WORKSPACE_ROOT, 'configs', 'workspace.json');
  if (!fs.existsSync(configPath)) {
    const defaultConfig = {
      name: "ai-workspace",
      version: "0.1.0",
      description: "Ambiente de desenvolvimento pessoal focado em IA e automação",
      models: {
        default: "gemini",
        available: ["gemini", "openrouter", "nvidia-nim"]
      },
      agents: {},
      loops: {}
    };
    writeJsonFile(configPath, defaultConfig);
    console.log(`  ${colors.green}✔ Configuração padrão criada:${colors.reset} configs/workspace.json`);
  }

  // Check catalog.json
  const catalogPath = path.join(WORKSPACE_ROOT, 'projects', 'catalog.json');
  if (!fs.existsSync(catalogPath)) {
    const defaultCatalog = {
      projects: []
    };
    writeJsonFile(catalogPath, defaultCatalog);
    console.log(`  ${colors.green}✔ Catálogo padrão criado:${colors.reset} projects/catalog.json`);
  }

  console.log(`\n${colors.bright}${colors.green}Workspace inicializado com sucesso!${colors.reset}\n`);
}

function cmdProject(args) {
  const subCommand = args[0]?.toLowerCase();
  
  if (!subCommand || subCommand === 'list') {
    cmdProjects();
    return;
  }
  
  const catalogPath = path.join(WORKSPACE_ROOT, 'projects', 'catalog.json');
  let catalog = readJsonFile(catalogPath);
  if (!catalog) {
    catalog = { projects: [] };
  }
  
  if (subCommand === 'add') {
    const id = args[1];
    const name = args[2];
    const pPath = args[3] || `/root/${id}`;
    
    if (!id || !name) {
      console.log(`\n${colors.red}Erro: Comando 'add' requer pelo menos 'id' e 'name'.${colors.reset}`);
      console.log(`Uso: workspace project add <id> <name> [caminho]\n`);
      return;
    }
    
    const exists = catalog.projects.some(p => p.id === id);
    if (exists) {
      console.log(`${colors.red}Erro: Projeto com ID "${id}" já cadastrado.${colors.reset}`);
      return;
    }
    
    const today = new Date().toISOString().split('T')[0];
    const newProj = {
      id,
      name,
      description: `Projeto ${name}`,
      status: "active",
      priority: "medium",
      type: "general",
      repository: "",
      technologies: [],
      dependencies: [],
      tags: [],
      path: pPath,
      created_at: today,
      updated_at: today
    };
    
    catalog.projects.push(newProj);
    if (writeJsonFile(catalogPath, catalog)) {
      console.log(`\n${colors.green}✔ Projeto "${name}" (${id}) adicionado com sucesso!${colors.reset}\n`);
    }
  } else if (subCommand === 'remove' || subCommand === 'rm') {
    const id = args[1];
    if (!id) {
      console.log(`\n${colors.red}Erro: Comando 'remove' requer o 'id' do projeto.${colors.reset}`);
      console.log(`Uso: workspace project remove <id>\n`);
      return;
    }
    
    const originalLength = catalog.projects.length;
    catalog.projects = catalog.projects.filter(p => p.id !== id);
    
    if (catalog.projects.length === originalLength) {
      console.log(`${colors.red}Erro: Projeto com ID "${id}" não encontrado no catálogo.${colors.reset}`);
      return;
    }
    
    if (writeJsonFile(catalogPath, catalog)) {
      console.log(`\n${colors.green}✔ Projeto com ID "${id}" removido com sucesso!${colors.reset}\n`);
    }
  } else {
    console.log(`${colors.red}Comando 'project ${subCommand}' não reconhecido.${colors.reset}`);
    console.log(`Subcomandos disponíveis: list, add, remove`);
  }
}

function cmdAgent(args) {
  const subCommand = args[0]?.toLowerCase();
  
  if (!subCommand || subCommand === 'list') {
    cmdAgents();
    return;
  }
  
  const configPath = path.join(WORKSPACE_ROOT, 'configs', 'workspace.json');
  const config = readJsonFile(configPath);
  if (!config) return;
  
  if (!config.agents) {
    config.agents = {};
  }
  
  if (subCommand === 'add') {
    const name = args[1];
    const relativePath = args[2] || `agents/${name}-agent`;
    
    if (!name) {
      console.log(`\n${colors.red}Erro: Comando 'add' requer o nome do agente.${colors.reset}`);
      console.log(`Uso: workspace agent add <nome> [caminho_relativo]\n`);
      return;
    }
    
    config.agents[name] = relativePath;
    
    const agentDir = path.join(WORKSPACE_ROOT, relativePath);
    if (!fs.existsSync(agentDir)) {
      fs.mkdirSync(agentDir, { recursive: true });
    }
    
    const agentMdPath = path.join(agentDir, 'agent.md');
    if (!fs.existsSync(agentMdPath)) {
      const defaultAgentMd = `# Agent ${name.toUpperCase()}

## Responsabilidade
Agente especializado em tarefas de ${name}.

## Instruções
Defina aqui as instruções específicas para o agente ${name}.
`;
      fs.writeFileSync(agentMdPath, defaultAgentMd, 'utf8');
      console.log(`  ${colors.green}✔ Criado arquivo agent.md em ${relativePath}${colors.reset}`);
    }
    
    if (writeJsonFile(configPath, config)) {
      console.log(`\n${colors.green}✔ Agente "${name}" adicionado às configurações!${colors.reset}\n`);
    }
  } else if (subCommand === 'remove' || subCommand === 'rm') {
    const name = args[1];
    if (!name) {
      console.log(`\n${colors.red}Erro: Comando 'remove' requer o nome do agente.${colors.reset}`);
      console.log(`Uso: workspace agent remove <nome>\n`);
      return;
    }
    
    if (!config.agents[name]) {
      console.log(`${colors.red}Erro: Agente "${name}" não cadastrado.${colors.reset}`);
      return;
    }
    
    delete config.agents[name];
    if (writeJsonFile(configPath, config)) {
      console.log(`\n${colors.green}✔ Agente "${name}" removido das configurações!${colors.reset}\n`);
    }
  } else {
    console.log(`${colors.red}Comando 'agent ${subCommand}' não reconhecido.${colors.reset}`);
    console.log(`Subcomandos disponíveis: list, add, remove`);
  }
}

function cmdLoop(args) {
  const subCommand = args[0]?.toLowerCase();
  
  if (!subCommand || subCommand === 'list') {
    cmdLoops();
    return;
  }
  
  const configPath = path.join(WORKSPACE_ROOT, 'configs', 'workspace.json');
  const config = readJsonFile(configPath);
  if (!config) return;
  
  if (!config.loops) {
    config.loops = {};
  }
  
  if (subCommand === 'add') {
    const name = args[1];
    const relativePath = args[2] || `loops/${name}-loop`;
    
    if (!name) {
      console.log(`\n${colors.red}Erro: Comando 'add' requer o nome do loop.${colors.reset}`);
      console.log(`Uso: workspace loop add <nome> [caminho_relativo]\n`);
      return;
    }
    
    config.loops[name] = relativePath;
    
    const loopDir = path.join(WORKSPACE_ROOT, relativePath);
    if (!fs.existsSync(loopDir)) {
      fs.mkdirSync(loopDir, { recursive: true });
    }
    
    const loopMdPath = path.join(loopDir, 'loop.md');
    if (!fs.existsSync(loopMdPath)) {
      const defaultLoopMd = `# Loop ${name.toUpperCase()}

## Responsabilidade
Processo cíclico para automação de ${name}.

## Passos
Defina aqui as etapas do loop ${name}.
`;
      fs.writeFileSync(loopMdPath, defaultLoopMd, 'utf8');
      console.log(`  ${colors.green}✔ Criado arquivo loop.md em ${relativePath}${colors.reset}`);
    }
    
    if (writeJsonFile(configPath, config)) {
      console.log(`\n${colors.green}✔ Loop "${name}" adicionado às configurações!${colors.reset}\n`);
    }
  } else if (subCommand === 'remove' || subCommand === 'rm') {
    const name = args[1];
    if (!name) {
      console.log(`\n${colors.red}Erro: Comando 'remove' requer o nome do loop.${colors.reset}`);
      console.log(`Uso: workspace loop remove <nome>\n`);
      return;
    }
    
    if (!config.loops[name]) {
      console.log(`${colors.red}Erro: Loop "${name}" não cadastrado.${colors.reset}`);
      return;
    }
    
    delete config.loops[name];
    if (writeJsonFile(configPath, config)) {
      console.log(`\n${colors.green}✔ Loop "${name}" removido das configurações!${colors.reset}\n`);
    }
  } else {
    console.log(`${colors.red}Comando 'loop ${subCommand}' não reconhecido.${colors.reset}`);
    console.log(`Subcomandos disponíveis: list, add, remove`);
  }
}

function cmdDocs(args) {
  const subCommand = args[0]?.toLowerCase();
  
  if (!subCommand || subCommand === 'list') {
    const docsDir = path.join(WORKSPACE_ROOT, 'docs');
    console.log(`\n${colors.bright}${colors.cyan}=========================================`);
    console.log(`            DOCUMENTOS DO WORKSPACE`);
    console.log(`=========================================${colors.reset}\n`);
    
    try {
      const files = fs.readdirSync(docsDir);
      const mdFiles = files.filter(f => f.endsWith('.md'));
      
      if (mdFiles.length === 0) {
        console.log(`  ${colors.dim}Nenhum documento encontrado em ${docsDir}.${colors.reset}\n`);
        return;
      }
      
      mdFiles.forEach(file => {
        const filePath = path.join(docsDir, file);
        const content = fs.readFileSync(filePath, 'utf8');
        const title = extractTitle(content);
        console.log(`• ${colors.bright}${colors.cyan}${title}${colors.reset} (${colors.dim}${file}${colors.reset})`);
      });
      console.log(`\n${colors.bright}${colors.cyan}=========================================${colors.reset}\n`);
    } catch (error) {
      console.error(`${colors.red}Erro ao ler diretório de documentos: ${error.message}${colors.reset}`);
    }
    return;
  }
  
  if (subCommand === 'add') {
    let filename = args[1];
    const title = args.slice(2).join(' ') || filename;
    
    if (!filename) {
      console.log(`\n${colors.red}Erro: Comando 'add' requer o nome do arquivo.${colors.reset}`);
      console.log(`Uso: workspace docs add <nome-do-arquivo.md> [Título do Documento]\n`);
      return;
    }
    
    if (!filename.endsWith('.md')) {
      filename += '.md';
    }
    
    const docsDir = path.join(WORKSPACE_ROOT, 'docs');
    const filePath = path.join(docsDir, filename);
    
    if (fs.existsSync(filePath)) {
      console.log(`${colors.red}Erro: Documento "${filename}" já existe.${colors.reset}`);
      return;
    }
    
    const defaultDocContent = `# ${title}

## Visão Geral
Descreva aqui o propósito do documento.
`;
    
    try {
      fs.writeFileSync(filePath, defaultDocContent, 'utf8');
      console.log(`\n${colors.green}✔ Documento "${filename}" criado com sucesso em docs/${colors.reset}\n`);
    } catch (error) {
      console.error(`${colors.red}Erro ao criar documento: ${error.message}${colors.reset}`);
    }
  } else {
    console.log(`${colors.red}Comando 'docs ${subCommand}' não reconhecido.${colors.reset}`);
    console.log(`Subcomandos disponíveis: list, add`);
  }
}

function cmdRag(args) {
  const subCommand = args[0]?.toLowerCase();
  
  if (subCommand === 'index') {
    buildIndex();
    return;
  }
  
  if (subCommand === 'query' || subCommand === 'search') {
    const query = args.slice(1).join(' ');
    if (!query) {
      console.log(`\n${colors.red}Erro: Comando 'query' requer um termo de busca.${colors.reset}`);
      console.log(`Uso: workspace rag query <termo-de-busca>\n`);
      return;
    }
    
    console.log(`\n${colors.bright}${colors.cyan}=========================================`);
    console.log(`         BUSCA RAG CONTEXTUAL`);
    console.log(`=========================================${colors.reset}\n`);
    console.log(`${colors.dim}Query:${colors.reset} "${query}"\n`);
    
    const results = search(query, 3);
    
    if (results.length === 0) {
      console.log(`  ${colors.yellow}Nenhum resultado relevante encontrado no workspace.${colors.reset}\n`);
    } else {
      results.forEach((r, idx) => {
        console.log(`${colors.bright}${idx + 1}. ${r.title}${colors.reset} (Score: ${r.score.toFixed(2)})`);
        console.log(`${colors.dim}Origem: ${r.file}${colors.reset}`);
        console.log(`-----------------------------------------`);
        const indentedContent = r.content
          .split('\n')
          .map(line => '  ' + line)
          .join('\n');
        console.log(indentedContent);
        console.log(`-----------------------------------------\n`);
      });
    }
    
    console.log(`${colors.bright}${colors.cyan}=========================================${colors.reset}\n`);
    return;
  }
  
  console.log(`${colors.red}Comando 'rag ${subCommand}' não reconhecido.${colors.reset}`);
  console.log(`Subcomandos disponíveis: index, query`);
}

function cmdMcp(args) {
  const subCommand = args[0]?.toLowerCase();
  
  if (subCommand === 'start') {
    const serverPath = path.join(WORKSPACE_ROOT, 'mcp', 'server.js');
    console.log(`${colors.green}Iniciando servidor MCP via stdio...${colors.reset}`);
    import(serverPath);
    return;
  }
  
  console.log(`${colors.red}Comando 'mcp ${subCommand}' não reconhecido.${colors.reset}`);
  console.log(`Subcomandos disponíveis: start`);
}

async function cmdModels(args) {
  const subCommand = args[0]?.toLowerCase();

  // ── workspace models available ──────────────────────────────────────────
  if (subCommand === 'available') {
    const available = detectAvailableProviders();
    console.log(`\n${colors.bright}${colors.magenta}=========================================`);
    console.log(`       PROVEDORES CONFIGURADOS (.env)`);
    console.log(`=========================================${colors.reset}\n`);
    if (available.length === 0) {
      console.log(`  ${colors.yellow}Nenhum provedor configurado. Adicione chaves de API ao .env${colors.reset}\n`);
    } else {
      available.forEach(p => {
        const tag = p === 'mimo' ? `${colors.cyan}[roteador]${colors.reset}` : `${colors.green}[ativo]${colors.reset}`;
        console.log(`  ${colors.bright}${p}${colors.reset}  ${tag}`);
      });
    }
    console.log(`\n${colors.bright}${colors.magenta}=========================================${colors.reset}\n`);
    return;
  }

  // ── workspace models test [provedor] ───────────────────────────────────
  if (subCommand === 'test') {
    const target = args[1]?.toLowerCase();
    const available = detectAvailableProviders().filter(p => p !== 'mimo');
    const toTest = target ? [target] : available;

    console.log(`\n${colors.bright}${colors.cyan}=========================================`);
    console.log(`           TESTE DE PROVEDORES`);
    console.log(`=========================================${colors.reset}\n`);

    if (toTest.length === 0) {
      console.log(`  ${colors.yellow}Nenhum provedor disponível para testar.${colors.reset}\n`);
      return;
    }

    for (const prov of toTest) {
      process.stdout.write(`  Testando ${colors.bright}${prov}${colors.reset}... `);
      const result = await testProvider(prov);
      if (result.ok) {
        console.log(`${colors.green}✔ OK${colors.reset} (${result.latencyMs}ms) — modelo: ${colors.dim}${result.model}${colors.reset}`);
      } else {
        console.log(`${colors.red}✘ FALHOU${colors.reset} — ${colors.dim}${result.error}${colors.reset}`);
      }
    }
    console.log(`\n${colors.bright}${colors.cyan}=========================================${colors.reset}\n`);
    return;
  }

  // ── workspace models (list) ────────────────────────────────────────────
  const catalogue = listModels();
  const providers = catalogue.providers || {};

  console.log(`\n${colors.bright}${colors.magenta}=========================================`);
  console.log(`        CATÁLOGO DE MODELOS DE IA`);
  console.log(`=========================================${colors.reset}\n`);

  const available = detectAvailableProviders();

  Object.entries(providers).forEach(([key, prov]) => {
    const isAvailable = available.includes(key);
    const statusBadge = isAvailable
      ? `${colors.green}● configurado${colors.reset}`
      : `${colors.dim}○ sem chave${colors.reset}`;

    console.log(`${colors.bright}${colors.magenta}${prov.name}${colors.reset}  (${colors.dim}${key}${colors.reset})  ${statusBadge}`);
    console.log(`  ${colors.dim}${prov.description}${colors.reset}`);
    if (prov.env_key) {
      console.log(`  Chave: ${colors.dim}${prov.env_key}${colors.reset}`);
    }
    if (Array.isArray(prov.models) && prov.models.length > 0 && typeof prov.models[0] === 'object') {
      console.log(`  Modelos:`);
      prov.models.forEach(m => {
        const rec = m.recommended ? ` ${colors.yellow}★${colors.reset}` : '';
        const cost = m.cost === 'free' ? ` ${colors.green}[FREE]${colors.reset}` : (m.cost === 'paid' ? ` ${colors.dim}[pago]${colors.reset}` : '');
        console.log(`    ${colors.dim}•${colors.reset} ${m.label}${rec}${cost}`);
      });
    }
    console.log('');
  });

  console.log(`${colors.dim}★ = modelo recomendado | ● = API configurada no .env${colors.reset}`);
  console.log(`\n${colors.bright}${colors.magenta}=========================================${colors.reset}\n`);
}

async function cmdLocal(args) {
  const subCommand = args[0]?.toLowerCase();

  // ── workspace local status ──────────────────────────────────────────────
  if (subCommand === 'status' || !subCommand) {
    console.log(`\n${colors.bright}${colors.cyan}=========================================`);
    console.log(`        OLLAMA LOCAL — STATUS`);
    console.log(`=========================================${colors.reset}\n`);
    process.stdout.write(`  Verificando conexão em http://127.0.0.1:11434... `);
    const status = await checkLocalOllama();
    if (!status.ok) {
      console.log(`${colors.red}✘ OFFLINE${colors.reset}`);
      console.log(`\n  ${colors.yellow}Rode "ollama serve" no Termux e tente de novo.${colors.reset}`);
      if (status.error) console.log(`  ${colors.dim}${status.error}${colors.reset}`);
    } else {
      console.log(`${colors.green}✔ ONLINE${colors.reset}\n`);
      console.log(`  ${colors.bright}Modelos instalados:${colors.reset}`);
      if (status.models.length === 0) {
        console.log(`    ${colors.yellow}Nenhum modelo encontrado. Rode: ollama pull qwen2.5-coder:1.5b-instruct-q4_K_M${colors.reset}`);
      } else {
        status.models.forEach(m => console.log(`    ${colors.dim}•${colors.reset} ${m}`));
      }
    }
    console.log(`\n${colors.dim}Uso: workspace local ask "<mensagem>" | workspace local router "<mensagem>"${colors.reset}`);
    console.log(`${colors.bright}${colors.cyan}=========================================${colors.reset}\n`);
    return;
  }

  // ── workspace local router "<mensagem>" (mostra qual modelo seria usado) ──
  if (subCommand === 'router') {
    const prompt = args.slice(1).join(' ').replace(/^"|"$/g, '').trim();
    if (!prompt) {
      console.log(`${colors.red}Uso: workspace local router "<mensagem>"${colors.reset}\n`);
      return;
    }
    const chosen = pickLocalModel(prompt);
    const isCoder = chosen.includes('coder');
    console.log(`\n${colors.bright}Modelo escolhido:${colors.reset} ${isCoder ? colors.yellow : colors.green}${chosen}${colors.reset}`);
    console.log(`${colors.dim}(${isCoder ? 'detectado termo/tamanho de tarefa de código' : 'tratado como triagem/pergunta simples'})${colors.reset}\n`);
    return;
  }

  // ── workspace local ask "<mensagem>" [--model <nome>] ─────────────────────
  if (subCommand === 'ask') {
    let model = null;
    const rawArgs = args.slice(1);
    const parts = [];
    for (let i = 0; i < rawArgs.length; i++) {
      if (rawArgs[i] === '--model' || rawArgs[i] === '-m') { model = rawArgs[++i]; }
      else parts.push(rawArgs[i]);
    }
    const prompt = parts.join(' ').replace(/^"|"$/g, '').trim();
    if (!prompt) {
      console.log(`${colors.red}Uso: workspace local ask "<mensagem>" [--model <nome>]${colors.reset}\n`);
      return;
    }

    const chosen = model || pickLocalModel(prompt);
    console.log(`\n${colors.dim}[local]${colors.reset} usando ${colors.bright}${chosen}${colors.reset}${colors.dim}...${colors.reset}\n`);

    const start = Date.now();
    try {
      const output = await generateText('local', prompt, { model: model || 'auto' });
      const elapsedS = ((Date.now() - start) / 1000).toFixed(1);
      console.log(output);
      console.log(`\n${colors.dim}(${elapsedS}s)${colors.reset}\n`);
    } catch (err) {
      console.log(`${colors.red}Erro: ${err.message}${colors.reset}\n`);
    }
    return;
  }

  // Fallback: help
  console.log(`\n${colors.bright}${colors.cyan}workspace local${colors.reset} — Modelos locais via Ollama (offline)\n`);
  console.log(`${colors.bright}Sub-comandos:${colors.reset}`);
  console.log(`  ${colors.green}status${colors.reset}              Verifica se o Ollama está de pé e lista modelos instalados`);
  console.log(`  ${colors.cyan}ask${colors.reset} "<mensagem>"      Envia uma mensagem (roteamento automático entre os 2 modelos)`);
  console.log(`  ${colors.yellow}router${colors.reset} "<mensagem>"   Mostra qual modelo seria escolhido, sem executar\n`);
}

async function cmdPipeline(args) {
  const subCommand = args[0]?.toLowerCase();

  // ── workspace pipeline sessions ───────────────────────────────────────
  if (subCommand === 'sessions') {
    const sessions = listSessions();
    console.log(`\n${colors.bright}${colors.magenta}=========================================`);
    console.log(`         SESSÕES DO PIPELINE`);
    console.log(`=========================================${colors.reset}\n`);
    if (sessions.length === 0) {
      console.log(`  ${colors.dim}Nenhuma sessão encontrada. Execute: workspace pipeline run "<tarefa>"${colors.reset}\n`);
      return;
    }
    sessions.slice(0, 20).forEach((s, i) => {
      const statusColor = s.status === 'completed' ? colors.green :
                          s.status === 'error'     ? colors.red   : colors.yellow;
      console.log(`${colors.bright}${i + 1}. ${colors.dim}[${s.id}]${colors.reset}`);
      console.log(`   ${colors.dim}Tarefa:${colors.reset}  ${s.task}`);
      console.log(`   ${colors.dim}Status:${colors.reset}  ${statusColor}${s.status}${colors.reset}`);
      console.log(`   ${colors.dim}Início:${colors.reset}  ${s.started_at}`);
      console.log(`   ${colors.dim}Etapas:${colors.reset}  ${s.steps}\n`);
    });
    console.log(`${colors.bright}${colors.magenta}=========================================${colors.reset}\n`);
    return;
  }

  // ── workspace pipeline session <id> ────────────────────────────────
  if (subCommand === 'session') {
    const id = args[1];
    if (!id) {
      console.log(`${colors.red}Erro: Informe o ID da sessão.${colors.reset}`);
      console.log(`Uso: workspace pipeline session <id>\n`);
      return;
    }
    const session = getSession(id);
    if (!session) {
      console.log(`${colors.red}Sessão "${id}" não encontrada.${colors.reset}\n`);
      return;
    }
    console.log(`\n${colors.bright}${colors.magenta}=========================================`);
    console.log(`         DETALHE DA SESSÃO`);
    console.log(`=========================================${colors.reset}\n`);
    console.log(`${colors.bright}ID:${colors.reset}       ${session.id}`);
    console.log(`${colors.bright}Tarefa:${colors.reset}   ${session.task}`);
    console.log(`${colors.bright}Provider:${colors.reset} ${session.provider} / ${session.model}`);
    console.log(`${colors.bright}Status:${colors.reset}   ${session.status}`);
    console.log(`${colors.bright}Início:${colors.reset}   ${session.started_at}`);
    console.log(`${colors.bright}Fim:${colors.reset}      ${session.finished_at || 'em andamento'}\n`);
    console.log(`${colors.bright}Etapas:${colors.reset}`);
    session.steps?.forEach(step => {
      const icon = step.status === 'ok' ? `${colors.green}✔` :
                   step.status === 'skipped' ? `${colors.yellow}⏭` : `${colors.red}✘`;
      console.log(`  ${icon}${colors.reset} ${colors.bright}${step.label}${colors.reset} ${colors.dim}(${step.elapsed})${colors.reset}`);
      if (step.status === 'error') {
        console.log(`    ${colors.red}Erro: ${step.error}${colors.reset}`);
      }
    });
    if (session.summary) {
      console.log(`\n${colors.bright}Resumo:${colors.reset} ${session.summary}`);
    }
    console.log(`\n${colors.dim}Para ver o output de um agente, abra o arquivo JSON da sessão.${colors.reset}`);
    console.log(`${colors.bright}${colors.magenta}=========================================${colors.reset}\n`);
    return;
  }

  // ── workspace pipeline run "<tarefa>" [...flags] ──────────────────────
  if (subCommand === 'run') {
    const taskParts = [];
    let provider = null;
    let model = null;
    let preset = null;
    let skipDeploy = false;
    let verbose = false;

    const rawArgs = args.slice(1);
    for (let i = 0; i < rawArgs.length; i++) {
      const a = rawArgs[i];
      if (a === '--provider' || a === '-p')  { provider = rawArgs[++i]; }
      else if (a === '--model' || a === '-m') { model    = rawArgs[++i]; }
      else if (a === '--preset')              { preset   = rawArgs[++i]; }
      else if (a === '--skip-deploy')         { skipDeploy = true; }
      else if (a === '--verbose' || a === '-v') { verbose = true; }
      else { taskParts.push(a); }
    }

    const task = taskParts.join(' ').replace(/^"|"$/g, '').trim();
    if (!task) {
      console.log(`\n${colors.red}Erro: Informe a tarefa para o pipeline.${colors.reset}`);
      console.log(`Uso: workspace pipeline run "<descrição da tarefa>" [--provider <p>] [--model <m>] [--preset fast|quality|full] [--skip-deploy] [--verbose]\n`);
      return;
    }

    // Aplica preset se fornecido
    if (preset) {
      const configPath = path.join(WORKSPACE_ROOT, 'multiagent', 'pipeline.json');
      try {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        const p = config.presets?.[preset];
        if (p) {
          provider   = provider   || p.provider;
          model      = model      || p.model;
          skipDeploy = skipDeploy || p.skipDeploy || false;
          console.log(`\n${colors.cyan}Preset "${preset}" aplicado:${colors.reset} ${p.description}`);
        } else {
          console.log(`${colors.yellow}Preset "${preset}" não encontrado. Presets disponíveis: fast, quality, full${colors.reset}`);
        }
      } catch (e) { /* ignora */ }
    }

    await runPipeline({ task, provider: provider || 'mimo', model, skipDeploy, verbose });
    return;
  }

  // Fallback: help
  console.log(`\n${colors.bright}${colors.magenta}workspace pipeline${colors.reset} — Pipeline Multiagente Autônomo\n`);
  console.log(`${colors.bright}Sub-comandos:${colors.reset}`);
  console.log(`  ${colors.green}run${colors.reset} "<tarefa>"   Executa o pipeline completo`);
  console.log(`    Flags: --provider <p>  --model <m>  --preset fast|quality|full`);
  console.log(`           --skip-deploy   --verbose`);
  console.log(`  ${colors.cyan}sessions${colors.reset}         Lista sessões anteriores`);
  console.log(`  ${colors.cyan}session${colors.reset} <id>    Detalhes de uma sessão\n`);
}

function showHelp() {
  console.log(`
${colors.bright}AI Workspace CLI${colors.reset} - Gerencie seu ecossistema modular de IA

${colors.bright}Uso:${colors.reset}
  workspace <comando> [argumentos]

${colors.bright}Comandos Disponíveis:${colors.reset}
  ${colors.green}status${colors.reset}     Exibe o status geral e estatísticas do workspace
  ${colors.magenta}roadmap${colors.reset}    Visualiza o progresso do roadmap oficial de forma interativa
  ${colors.green}projects${colors.reset}   Lista e detalha os projetos cadastrados no catálogo
  ${colors.blue}skills${colors.reset}     Lista as habilidades (skills) de IA prontas para uso
  ${colors.cyan}agents${colors.reset}     Lista os agentes de IA integrados e suas responsabilidades
  ${colors.yellow}loops${colors.reset}      Lista os processos de automação e workflows de IA
  
  ${colors.cyan}init${colors.reset}       Inicializa a estrutura do workspace e arquivos padrão
  ${colors.green}project${colors.reset}    Gerencia o catálogo de projetos (list, add, remove)
  ${colors.cyan}agent${colors.reset}      Gerencia os agentes do workspace (list, add, remove)
  ${colors.yellow}loop${colors.reset}       Gerencia os loops do workspace (list, add, remove)
  ${colors.blue}docs${colors.reset}       Gerencia os documentos da pasta docs/ (list, add)
  ${colors.magenta}rag${colors.reset}        Interface RAG de pesquisa contextual (index, query)
  ${colors.cyan}mcp${colors.reset}        Gerencia e inicia o servidor MCP do workspace (start)
  ${colors.magenta}models${colors.reset}     Lista provedores/modelos de IA (available, test, test <provedor>)
  ${colors.cyan}local${colors.reset}      🔌 Modelos locais via Ollama (status, ask "<msg>", router "<msg>")
  ${colors.bright}${colors.magenta}pipeline${colors.reset}   🤖 Executa pipeline multiagente (run, sessions, session <id>)

${colors.bright}Opções:${colors.reset}
  -h, --help Exibe esta mensagem de ajuda
  `);
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0]?.toLowerCase();
  
  if (!command || command === '-h' || command === '--help' || command === 'help') {
    showHelp();
    process.exit(0);
  }
  
  switch (command) {
    case 'status':
      cmdStatus();
      break;
    case 'roadmap':
      cmdRoadmap();
      break;
    case 'projects':
      cmdProjects();
      break;
    case 'skills':
      cmdSkills();
      break;
    case 'agents':
      cmdAgents();
      break;
    case 'loops':
      cmdLoops();
      break;
    case 'init':
      cmdInit();
      break;
    case 'project':
      cmdProject(args.slice(1));
      break;
    case 'agent':
      cmdAgent(args.slice(1));
      break;
    case 'loop':
      cmdLoop(args.slice(1));
      break;
    case 'docs':
      cmdDocs(args.slice(1));
      break;
    case 'rag':
      cmdRag(args.slice(1));
      break;
    case 'mcp':
      cmdMcp(args.slice(1));
      break;
    case 'models':
      await cmdModels(args.slice(1));
      break;
    case 'local':
      await cmdLocal(args.slice(1));
      break;
    case 'pipeline':
      await cmdPipeline(args.slice(1));
      break;
    default:
      console.log(`${colors.red}Erro: Comando "${command}" não reconhecido.${colors.reset}`);
      showHelp();
      process.exit(1);
  }
}

main().catch(err => {
  console.error(`${colors.red}Erro fatal: ${err.message}${colors.reset}`);
  process.exit(1);
});
