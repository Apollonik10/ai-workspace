// AI Workspace Chat — server.js (Node.js, zero dependencies, ES modules)

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  checkLocalOllama,
  ensureOllamaRunning,
  detectAvailableProviders,
  pickLocalModel,
  generateText,
} from '../models/client.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3333;
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434';

// ── MIME types ─────────────────────────────────────────────────────────────────
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

// ── Active generation state ────────────────────────────────────────────────────
let activeAbort = null;

// ── Server ─────────────────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = parsedUrl.pathname;

  try {
    // ── API routes ───────────────────────────────────────────────────────────
    if (pathname === '/api/status' && req.method === 'GET') {
      return await handleStatus(req, res);
    }
    if (pathname === '/api/send' && req.method === 'POST') {
      return await handleSend(req, res);
    }
    if (pathname === '/api/stop' && req.method === 'POST') {
      return handleStop(req, res);
    }

    // ── Static files ─────────────────────────────────────────────────────────
    let filePath = pathname === '/' ? '/index.html' : pathname;
    filePath = path.join(__dirname, filePath);

    // Prevent directory traversal
    if (!filePath.startsWith(__dirname)) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('Forbidden');
      return;
    }

    const ext = path.extname(filePath);
    const contentType = MIME[ext] || 'application/octet-stream';

    try {
      const data = await fs.promises.readFile(filePath);
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(data);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
    }
  } catch (err) {
    console.error('Server error:', err);
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Internal Server Error');
  }
});

// ── GET /api/status ────────────────────────────────────────────────────────────
async function handleStatus(_req, res) {
  try {
    await ensureOllamaRunning();
    const ollama = await checkLocalOllama();
    const providers = detectAvailableProviders();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ollama, providers }));
  } catch (err) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ollama: { ok: false, error: err.message }, providers: [] }));
  }
}

// ── POST /api/send ─────────────────────────────────────────────────────────────
async function handleSend(req, res) {
  const body = await readBody(req);
  let { prompt, provider, model, history } = JSON.parse(body);

  provider = provider || 'local';
  history = history || [];

  // SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  const sendSSE = (obj) => {
    res.write(`data: ${JSON.stringify(obj)}\n\n`);
  };

  try {
    if (provider === 'local' || provider === 'auto') {
      await ensureOllamaRunning();

      // Pick model
      const resolvedModel =
        !model || model === 'auto' ? pickLocalModel(prompt) : model;

      // Build messages for Ollama
      const ollamaMessages = [
        ...history.map((m) => ({ role: m.role, content: m.content })),
        { role: 'user', content: prompt },
      ];

      // Create abort controller
      const controller = new AbortController();
      activeAbort = controller;

      // Stream from Ollama
      const ollamaRes = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: resolvedModel,
          messages: ollamaMessages,
          stream: true,
        }),
        signal: controller.signal,
      });

      if (!ollamaRes.ok) {
        const errText = await ollamaRes.text();
        sendSSE({ error: `Ollama error ${ollamaRes.status}: ${errText}` });
        res.end();
        return;
      }

      const reader = ollamaRes.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop(); // keep incomplete last line

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          let chunk;
          try {
            chunk = JSON.parse(trimmed);
          } catch {
            continue;
          }

          if (chunk.done) {
            // Final chunk
            const evalRate =
              chunk.eval_count && chunk.eval_duration
                ? chunk.eval_count / (chunk.eval_duration / 1e9)
                : null;

            sendSSE({
              token: '',
              model: resolvedModel,
              provider: 'local',
              done: true,
              eval_rate: evalRate,
            });
          } else if (chunk.message && chunk.message.content) {
            sendSSE({
              token: chunk.message.content,
              model: resolvedModel,
              provider: 'local',
              done: false,
            });
          }
        }
      }

      activeAbort = null;
      res.end();
    } else {
      // Cloud / mimo provider
      const resolvedModel = model && model !== 'auto' ? model : undefined;
      const result = await generateText(provider, prompt, {
        model: resolvedModel,
        systemInstruction: undefined,
      });

      sendSSE({
        token: result,
        model: resolvedModel || provider,
        provider,
        done: true,
      });
      res.end();
    }
  } catch (err) {
    if (err.name === 'AbortError') {
      // Generation was stopped by user
      sendSSE({ token: '', done: true, model: model || 'unknown', provider });
      res.end();
      return;
    }
    console.error('Send error:', err);
    sendSSE({ error: err.message });
    res.end();
  }
}

// ── POST /api/stop ─────────────────────────────────────────────────────────────
function handleStop(_req, res) {
  if (activeAbort) {
    activeAbort.abort();
    activeAbort = null;
  }
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: true }));
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => (data += chunk));
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

// ── Start ──────────────────────────────────────────────────────────────────────
server.listen(PORT, () => {
  console.log(`🚀 AI Workspace Chat rodando em http://localhost:${PORT}`);
});
