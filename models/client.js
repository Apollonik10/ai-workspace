/**
 * models/client.js — Cliente unificado de modelos de IA
 * Fase 9 do AI Workspace
 *
 * Provedores suportados:
 *  - mimo       → roteador inteligente (escolhe automaticamente)
 *  - gemini     → Google Gemini API
 *  - openrouter → OpenRouter (100+ modelos)
 *  - openai     → OpenAI GPT
 *  - deepseek   → DeepSeek API
 *  - grok       → Grok xAI API
 *  - nvidia-nim → NVIDIA NIM API
 *  - local      → Ollama local (Termux) — roteamento automático entre
 *                 um modelo de triagem (rápido) e um modelo coder
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WORKSPACE_ROOT = path.resolve(__dirname, '..');

// ─── Utilitários ──────────────────────────────────────────────────────────────

function loadEnv() {
  const envPath = path.join(WORKSPACE_ROOT, '.env');
  if (!fs.existsSync(envPath)) return;
  try {
    const content = fs.readFileSync(envPath, 'utf8');
    content.split('\n').forEach(line => {
      const match = line.trim().match(/^([^#=\s][^=]*)=(.*)$/);
      if (match) {
        const key = match[1].trim();
        let val = match[2].trim();
        if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
        if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1);
        if (key && val) process.env[key] = val;
      }
    });
  } catch (e) { /* silencioso */ }
}

function loadProviders() {
  const filePath = path.join(__dirname, 'providers.json');
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (e) {
    return { providers: {} };
  }
}

loadEnv();

// ─── Mime de helper HTTP ───────────────────────────────────────────────────────

async function postJSON(url, headers, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`HTTP ${res.status} ${res.statusText}: ${errText}`);
  }
  return res.json();
}

function buildMessages(prompt, systemInstruction) {
  const messages = [];
  if (systemInstruction) messages.push({ role: 'system', content: systemInstruction });
  messages.push({ role: 'user', content: prompt });
  return messages;
}

// ─── Provedores individuais ────────────────────────────────────────────────────

async function callGemini(prompt, options = {}) {
  const apiKey = process.env.gemini_api;
  if (!apiKey) throw new Error('gemini_api não configurada no .env');

  const model = options.model || 'gemini-2.0-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const body = { contents: [{ parts: [{ text: prompt }] }] };
  if (options.systemInstruction) {
    body.systemInstruction = { parts: [{ text: options.systemInstruction }] };
  }

  const data = await postJSON(url, {}, body);
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

async function callOpenRouter(prompt, options = {}) {
  const apiKey = process.env.aider_key;
  if (!apiKey) throw new Error('aider_key (OpenRouter) não configurada no .env');

  const model = options.model || 'meta-llama/llama-3.1-8b-instruct:free';
  const data = await postJSON(
    'https://openrouter.ai/api/v1/chat/completions',
    {
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://github.com/Apollonik10/ai-workspace',
      'X-Title': 'AI Workspace'
    },
    { model, messages: buildMessages(prompt, options.systemInstruction) }
  );
  return data.choices?.[0]?.message?.content || '';
}

async function callOpenAI(prompt, options = {}) {
  const apiKey = process.env.gpt_api;
  if (!apiKey) throw new Error('gpt_api (OpenAI) não configurada no .env');

  const model = options.model || 'gpt-4o-mini';
  const data = await postJSON(
    'https://api.openai.com/v1/chat/completions',
    { 'Authorization': `Bearer ${apiKey}` },
    { model, messages: buildMessages(prompt, options.systemInstruction) }
  );
  return data.choices?.[0]?.message?.content || '';
}

async function callDeepSeek(prompt, options = {}) {
  const apiKey = process.env.deepseek_api_key;
  if (!apiKey) throw new Error('deepseek_api_key não configurada no .env');

  const model = options.model || 'deepseek-chat';
  const data = await postJSON(
    'https://api.deepseek.com/chat/completions',
    { 'Authorization': `Bearer ${apiKey}` },
    { model, messages: buildMessages(prompt, options.systemInstruction) }
  );
  return data.choices?.[0]?.message?.content || '';
}

async function callGrok(prompt, options = {}) {
  const apiKey = process.env.grok_api;
  if (!apiKey) throw new Error('grok_api (xAI) não configurada no .env');

  const model = options.model || 'grok-beta';
  const data = await postJSON(
    'https://api.x.ai/v1/chat/completions',
    { 'Authorization': `Bearer ${apiKey}` },
    { model, messages: buildMessages(prompt, options.systemInstruction) }
  );
  return data.choices?.[0]?.message?.content || '';
}

// ─── Ollama Local (Termux) ─────────────────────────────────────────────────────

const OLLAMA_BASE_URL   = process.env.ollama_base_url   || 'http://127.0.0.1:11434';
const OLLAMA_ROUTER_MODEL = process.env.ollama_router_model || 'qwen2.5:0.5b-instruct-q4_K_M';
const OLLAMA_CODER_MODEL  = process.env.ollama_coder_model  || 'qwen2.5-coder:1.5b-instruct-q4_K_M';

// Palavras-chave que indicam tarefa de geração/edição de código real.
// Se nenhuma bater e o prompt for curto, usa o modelo de triagem (mais rápido).
const CODE_KEYWORDS = [
  'função', 'function', 'componente', 'component', 'bug', 'código', 'code',
  'refatorar', 'refactor', 'implementar', 'implement', 'classe', 'class',
  'api', 'endpoint', 'css', 'html', 'javascript', 'typescript', 'json',
  'sql', 'query', 'script', 'debug', 'erro', 'error', 'arquivo', 'file'
];

/**
 * Decide qual modelo local usar com base no conteúdo do prompt.
 * Curto e sem termos de código → modelo de triagem (0.5B, mais rápido).
 * Longo ou com termos de código → modelo coder (1.5B, mais capaz).
 * @param {string} prompt
 * @returns {string} nome do modelo Ollama a usar
 */
export function pickLocalModel(prompt = '') {
  const text = String(prompt).toLowerCase();
  const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
  const hasCodeKeyword = CODE_KEYWORDS.some(k => text.includes(k));
  return (hasCodeKeyword || wordCount > 30) ? OLLAMA_CODER_MODEL : OLLAMA_ROUTER_MODEL;
}

async function callOllamaLocal(prompt, options = {}) {
  const model = (options.model && options.model !== 'auto') ? options.model : pickLocalModel(prompt);
  const messages = buildMessages(prompt, options.systemInstruction);

  let res;
  try {
    res = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages,
        stream: false,
        options: { num_ctx: options.numCtx || 2048 }
      })
    });
  } catch (e) {
    throw new Error(`Não foi possível conectar ao Ollama em ${OLLAMA_BASE_URL}. Rode "ollama serve" no Termux. (${e.message})`);
  }

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Ollama local HTTP ${res.status}: ${errText}`);
  }
  const data = await res.json();
  return data.message?.content || '';
}

/**
 * Verifica se o Ollama local está de pé e quais modelos estão instalados.
 * @returns {Promise<{ok: boolean, models: string[], error?: string}>}
 */
export async function checkLocalOllama() {
  try {
    const res = await fetch(`${OLLAMA_BASE_URL}/api/tags`, { signal: AbortSignal.timeout(2500) });
    if (!res.ok) return { ok: false, models: [] };
    const data = await res.json();
    return { ok: true, models: (data.models || []).map(m => m.name) };
  } catch (e) {
    return { ok: false, models: [], error: e.message };
  }
}

/**
 * Garante que o "ollama serve" está rodando; se não estiver, sobe em background
 * e aguarda até responder (ou até estourar o timeout).
 * @param {number} timeoutMs
 * @returns {Promise<{started: boolean, alreadyRunning: boolean}>}
 */
export async function ensureOllamaRunning(timeoutMs = 8000) {
  const initial = await checkLocalOllama();
  if (initial.ok) return { started: false, alreadyRunning: true };

  const { spawn } = await import('child_process');
  const child = spawn('ollama', ['serve'], { detached: true, stdio: 'ignore' });
  child.unref();

  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    await new Promise(r => setTimeout(r, 500));
    const status = await checkLocalOllama();
    if (status.ok) return { started: true, alreadyRunning: false };
  }
  return { started: false, alreadyRunning: false };
}

async function callNvidiaNim(prompt, options = {}) {
  const apiKey = process.env.nvidia_api_key || process.env.gpt_api;
  if (!apiKey) throw new Error('nvidia_api_key não configurada no .env');

  const model = options.model || 'meta/llama3-70b-instruct';
  const data = await postJSON(
    'https://integrate.api.nvidia.com/v1/chat/completions',
    { 'Authorization': `Bearer ${apiKey}` },
    { model, messages: buildMessages(prompt, options.systemInstruction) }
  );
  return data.choices?.[0]?.message?.content || '';
}

// ─── Roteador Mimo ─────────────────────────────────────────────────────────────

const MIMO_PRIORITY = [
  { key: 'aider_key',        provider: 'openrouter', model: 'meta-llama/llama-3.3-70b-instruct:free' },
  { key: 'gemini_api',       provider: 'gemini',     model: 'gemini-2.0-flash' },
  { key: 'deepseek_api_key', provider: 'deepseek',   model: 'deepseek-chat' },
  { key: 'grok_api',         provider: 'grok',       model: 'grok-beta' },
  { key: 'gpt_api',          provider: 'openai',     model: 'gpt-4o-mini' },
  { key: 'nvidia_api_key',   provider: 'nvidia-nim', model: 'meta/llama3-70b-instruct' },
];

async function callMimo(prompt, options = {}) {
  for (const candidate of MIMO_PRIORITY) {
    if (process.env[candidate.key]) {
      console.error(`[Mimo] Roteando para: ${candidate.provider} (${candidate.model})`);
      return generateText(candidate.provider, prompt, {
        ...options,
        model: options.model || candidate.model
      });
    }
  }
  // Fallback real: nenhuma API na nuvem configurada → usa Ollama local (Termux)
  console.error('[Mimo] Nenhuma API na nuvem configurada — usando modelo local (Ollama) como fallback.');
  return callOllamaLocal(prompt, options);
}

// ─── Funções públicas ──────────────────────────────────────────────────────────

/**
 * Gera texto com o provedor especificado.
 * @param {string} provider  — gemini | openrouter | openai | deepseek | grok | nvidia-nim | mimo
 * @param {string} prompt    — texto de entrada
 * @param {object} options   — { model, systemInstruction }
 * @returns {Promise<string>}
 */
export async function generateText(provider, prompt, options = {}) {
  const prov = (provider || 'mimo').toLowerCase().replace('_', '-');

  switch (prov) {
    case 'mimo':        return callMimo(prompt, options);
    case 'local':
    case 'ollama':      return callOllamaLocal(prompt, options);
    case 'gemini':      return callGemini(prompt, options);
    case 'openrouter':  return callOpenRouter(prompt, options);
    case 'openai':      return callOpenAI(prompt, options);
    case 'deepseek':    return callDeepSeek(prompt, options);
    case 'grok':        return callGrok(prompt, options);
    case 'nvidia':
    case 'nvidia-nim':  return callNvidiaNim(prompt, options);
    default:
      throw new Error(`Provedor desconhecido: "${provider}". Use: mimo, local, gemini, openrouter, openai, deepseek, grok, nvidia-nim`);
  }
}

/**
 * Retorna a lista de provedores e modelos disponíveis (do providers.json).
 * @returns {object} catálogo de provedores
 */
export function listModels() {
  return loadProviders();
}

/**
 * Testa a conectividade de um provedor com um prompt simples.
 * @param {string} provider
 * @returns {Promise<{ok: boolean, provider: string, model: string, latencyMs: number, error?: string}>}
 */
export async function testProvider(provider) {
  const prov = (provider || 'mimo').toLowerCase();
  const catalogue = loadProviders();
  const info = catalogue.providers?.[prov];
  const model = info?.default_model || 'auto';
  const start = Date.now();

  try {
    const response = await generateText(prov, 'Responda apenas: OK', {
      model: prov === 'mimo' ? undefined : model,
      systemInstruction: 'Responda com uma única palavra: OK'
    });
    const latencyMs = Date.now() - start;
    return { ok: true, provider: prov, model, latencyMs, response: response.trim().substring(0, 100) };
  } catch (err) {
    return { ok: false, provider: prov, model, latencyMs: Date.now() - start, error: err.message };
  }
}

/**
 * Detecta quais provedores estão configurados (têm chave no .env).
 * @returns {string[]} lista de provedores prontos para uso
 */
export function detectAvailableProviders() {
  const checks = [
    { key: 'gemini_api',       provider: 'gemini'      },
    { key: 'aider_key',        provider: 'openrouter'  },
    { key: 'gpt_api',          provider: 'openai'      },
    { key: 'deepseek_api_key', provider: 'deepseek'    },
    { key: 'grok_api',         provider: 'grok'        },
    { key: 'nvidia_api_key',   provider: 'nvidia-nim'  },
  ];
  const available = checks.filter(c => !!process.env[c.key]).map(c => c.provider);
  if (available.length > 0) available.unshift('mimo');
  return available;
}
